"""
Abstract base class for document processors.

Each document type (RCE, DIC, etc.) implements this interface to provide
type-specific extraction, matching, and writeback logic.
"""

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any

from ..supabase_client import get_supabase
from ..db.flags import insert_activity_event
from .ocr import extract_text_from_pdf_bytes, ExtractionResult
from .matcher import match_document_to_policy, match_candidates_for_review, MatchResult

logger = logging.getLogger("worker.documents.base")

DOC_TYPE_DISPLAY = {
    "rce": "RCE (Replacement Cost Estimate)",
    "dic_dec_page": "DIC Carrier Declaration Page",
    "invoice": "Invoice",
    "inspection": "Inspection Report",
    "endorsement": "Endorsement",
    "questionnaire": "Questionnaire",
}


class DocumentProcessor(ABC):
    """
    Base class for all document type processors.
    
    Subclasses must implement:
    - doc_type: str property returning the document type key
    - extract_fields(): LLM-powered field extraction
    - persist_extracted_data(): save to type-specific table (doc_data_rce, etc.)
    - writeback_to_policy(): safely promote data to policy records
    """

    def __init__(self, document_id: str, account_id: str):
        self.document_id = document_id
        self.account_id = account_id
        self.sb = get_supabase()
        self._log_prefix = f"doc={document_id}"

    @property
    @abstractmethod
    def doc_type(self) -> str:
        """Return the document type key (e.g., 'rce', 'dic_dec_page')."""
        ...

    @abstractmethod
    def extract_fields(self, raw_text: str) -> dict[str, Any]:
        """
        Extract structured fields from raw text using LLM.
        Must return a dict with at least 'owner_name' and 'address' for matching.
        """
        ...

    @abstractmethod
    def persist_extracted_data(self, extracted: dict[str, Any]) -> str:
        """
        Save extracted data to the type-specific table (doc_data_rce, etc.).
        Returns the row ID of the created record.
        """
        ...

    @abstractmethod
    def writeback_to_policy(
        self,
        extracted: dict[str, Any],
        policy_id: str,
        policy_term_id: str | None,
    ) -> list[dict]:
        """
        Safely promote extracted values to policy/enrichment records.
        
        Returns a list of writeback log entries describing what was written,
        skipped, or flagged as conflict.
        """
        ...

    # ── Orchestration (shared logic) ─────────────────────────────────────

    def update_document(self, updates: dict) -> None:
        """Update the platform_documents row."""
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        self.sb.table("platform_documents").update(updates).eq("id", self.document_id).execute()

    def update_step(self, step: str) -> None:
        """Update processing_step for live UI progress."""
        self.update_document({"processing_step": step})

    def process(self, pdf_bytes: bytes) -> dict:
        """
        Full processing pipeline for this document.
        
        Steps:
        1. Extract text (pdfplumber + OCR fallback)
        2. Parse fields via LLM
        3. Match to policy (owner name + address)
        4. Persist extracted data
        5. Writeback to policy (if matched)
        6. Return summary
        
        Every step updates the document status for live UI tracking.
        Errors at any step are recorded and surfaced to the agent.
        """
        result = {
            "document_id": self.document_id,
            "doc_type": self.doc_type,
            "steps_completed": [],
            "match_result": None,
            "writeback_log": [],
            "errors": [],
        }

        try:
            # Step 1: Extract text
            self.update_step("extracting_text")
            self.update_document({"parse_status": "processing"})
            logger.info("%s step=extract_text", self._log_prefix)

            extraction: ExtractionResult = extract_text_from_pdf_bytes(pdf_bytes)
            raw_text = extraction["raw_text"]

            self.update_document({
                "raw_text": raw_text,
            })
            result["steps_completed"].append("extract_text")
            logger.info(
                "%s extracted %d chars via %s",
                self._log_prefix, extraction["raw_text_length"], extraction["method"],
            )

            # Step 2: Parse fields via LLM
            self.update_step("parsing_fields")
            logger.info("%s step=parse_fields", self._log_prefix)

            extracted = self.extract_fields(raw_text)
            if not extracted:
                raise RuntimeError("Field extraction returned empty result")

            # Store identity fields for matching
            owner_name = extracted.get("owner_name") or extracted.get("insured_name")
            address_raw = extracted.get("property_address") or extracted.get("address")
            
            # For DIC, the address parts may be separate
            if not address_raw and extracted.get("property_street"):
                parts = [
                    extracted.get("property_street", ""),
                    extracted.get("property_city", ""),
                ]
                state_zip = " ".join(filter(None, [
                    extracted.get("property_state", ""),
                    extracted.get("property_zip", ""),
                ]))
                if state_zip:
                    parts.append(state_zip)
                address_raw = ", ".join(filter(None, parts))

            from .matcher import normalize_address
            self.update_document({
                "extracted_owner_name": owner_name,
                "extracted_address": address_raw,
                "extracted_address_norm": normalize_address(address_raw),
            })
            result["steps_completed"].append("parse_fields")

            # Step 3: Match to policy
            # If uploaded from a policy page (match_status='manual'), skip auto-matching
            doc_row = self.sb.table("platform_documents").select(
                "match_status, policy_id, client_id, policy_term_id"
            ).eq("id", self.document_id).limit(1).execute()

            pre_linked = doc_row.data[0] if doc_row.data else {}
            is_pre_linked = pre_linked.get("match_status") == "manual" and pre_linked.get("policy_id")

            if is_pre_linked:
                # Validate pre-linked policy against extracted document details (Policy Mismatch Guard)
                pol_res = self.sb.table("policies").select(
                    "id, policy_number, property_address_raw, property_address_norm, clients(id, named_insured)"
                ).eq("id", pre_linked["policy_id"]).limit(1).execute()

                pol_row = pol_res.data[0] if pol_res.data else {}
                pol_addr = pol_row.get("property_address_raw") or ""
                pol_client = pol_row.get("clients") or {}
                pol_insured = pol_client.get("named_insured") or ""

                has_extracted_data = bool(address_raw or owner_name)
                is_mismatch = False
                mismatch_reason = None

                if has_extracted_data and (pol_addr or pol_insured):
                    import re

                    def clean_tokens(s):
                        return set(re.findall(r'[A-Z0-9]{3,}', s.upper())) if s else set()

                    doc_addr_tokens = clean_tokens(address_raw)
                    pol_addr_tokens = clean_tokens(pol_addr)

                    doc_name_tokens = clean_tokens(owner_name)
                    pol_name_tokens = clean_tokens(pol_insured)

                    doc_st_num = re.findall(r'^\d+', address_raw.strip()) if address_raw else []
                    pol_st_num = re.findall(r'^\d+', pol_addr.strip()) if pol_addr else []
                    street_num_match = (doc_st_num and pol_st_num and doc_st_num[0] == pol_st_num[0])

                    addr_match = street_num_match or (len(doc_addr_tokens.intersection(pol_addr_tokens)) >= 2)
                    name_match = bool(doc_name_tokens.intersection(pol_name_tokens))

                    if pol_addr and not addr_match and not name_match:
                        is_mismatch = True
                        mismatch_reason = f"Document address '{address_raw}' and name '{owner_name}' do not match policy #{pol_row.get('policy_number')} ({pol_insured}, {pol_addr})"
                    elif not pol_addr and pol_insured and not name_match:
                        is_mismatch = True
                        mismatch_reason = f"Document name '{owner_name}' does not match policy insured '{pol_insured}'"

                if is_mismatch:
                    logger.warning("%s Policy Mismatch Guard triggered: %s", self._log_prefix, mismatch_reason)
                    match: MatchResult = {
                        "status": "needs_review",
                        "policy_id": pre_linked["policy_id"],
                        "client_id": pol_client.get("id"),
                        "policy_term_id": pre_linked.get("policy_term_id"),
                        "confidence": 0.0,
                        "review_reason": mismatch_reason,
                        "action_items": [
                            f"Uploaded under {pol_insured or 'policy'} (#{pol_row.get('policy_number')}), but document is for {owner_name or 'different insured'}.",
                            f"Document address: {address_raw or 'Unknown'}",
                            "Click 'Review & Reassign' to assign to the correct policy.",
                        ],
                        "match_log": [{
                            "step": "mismatch_guard",
                            "result": mismatch_reason,
                            "is_mismatch": True,
                            "target_policy": pol_row.get("policy_number"),
                            "target_insured": pol_insured,
                            "target_address": pol_addr,
                            "doc_insured": owner_name,
                            "doc_address": address_raw,
                        }],
                    }
                    self.update_document({
                        "match_status": "needs_review",
                        "match_confidence": 0.0,
                        "match_log": match["match_log"],
                        "error_message": f"Policy Mismatch: {mismatch_reason}",
                    })
                else:
                    logger.info("%s step=match_policy SKIPPED (pre-linked to %s, verified)", self._log_prefix, pre_linked["policy_id"])
                    match: MatchResult = {
                        "status": "matched",
                        "policy_id": pre_linked["policy_id"],
                        "client_id": pol_client.get("id") or pre_linked.get("client_id"),
                        "policy_term_id": pre_linked.get("policy_term_id"),
                        "confidence": 1.0,
                        "review_reason": None,
                        "action_items": [],
                        "match_log": [{"step": "pre_linked", "result": "Uploaded directly to policy page (verified)"}],
                    }
                    self.update_document({
                        "match_confidence": 1.0,
                        "match_log": match["match_log"],
                    })
            else:
                self.update_step("matching_policy")
                logger.info("%s step=match_policy owner=%s addr=%s doc_type=%s", self._log_prefix, owner_name, address_raw, self.doc_type)

                # DIC/RCE have different policy numbers — never auto-link.
                # Gather candidates for agent review instead.
                if self.doc_type in ("dic_dec_page", "rce"):
                    match = match_candidates_for_review(
                        owner_name, address_raw, self.account_id,
                        doc_type=self.doc_type,
                    )
                else:
                    match = match_document_to_policy(owner_name, address_raw, self.account_id)

                self.update_document({
                    "match_status": match["status"],
                    "match_log": match["match_log"],
                    "match_confidence": match["confidence"],
                    "policy_id": match["policy_id"],
                    "client_id": match["client_id"],
                    "policy_term_id": match["policy_term_id"],
                })

            result["match_result"] = match
            result["steps_completed"].append("match_policy")

            # Step 4: Persist extracted data to type-specific table
            self.update_step("saving_data")
            logger.info("%s step=persist_data", self._log_prefix)

            data_row_id = self.persist_extracted_data(extracted)
            result["steps_completed"].append("persist_data")
            logger.info("%s persisted data row %s", self._log_prefix, data_row_id)

            # Step 5: Writeback to policy (only if auto-matched)
            if match["status"] == "matched" and match["policy_id"]:
                self.update_step("writing_policy_data")
                logger.info("%s step=writeback policy=%s", self._log_prefix, match["policy_id"])

                writeback_log = self.writeback_to_policy(
                    extracted,
                    match["policy_id"],
                    match["policy_term_id"],
                )
                result["writeback_log"] = writeback_log

                # Determine writeback status from log
                has_conflicts = any(e.get("action") == "conflict" for e in writeback_log)
                wb_status = "conflict" if has_conflicts else "written"
                self.update_document({
                    "writeback_status": wb_status,
                    "writeback_log": writeback_log,
                })
                result["steps_completed"].append("writeback")
            else:
                self.update_document({"writeback_status": "skipped"})
                logger.info(
                    "%s writeback skipped (match_status=%s)",
                    self._log_prefix, match["status"],
                )

            # Step 6: Mark as complete
            parse_status = "parsed" if match["status"] == "matched" else "needs_review"
            self.update_step("complete")
            self.update_document({
                "parse_status": parse_status,
                "error_message": match.get("review_reason") if match["status"] != "matched" else None,
            })
            result["steps_completed"].append("complete")

            logger.info(
                "%s processing complete. match=%s confidence=%.2f",
                self._log_prefix, match["status"], match["confidence"],
            )

            # Step 7: Activity event (mirrors dec page pattern)
            doc_label = DOC_TYPE_DISPLAY.get(self.doc_type, self.doc_type.upper())
            if match["status"] == "matched" and match["policy_id"]:
                insert_activity_event(
                    event_type="document.processed",
                    title=f"{doc_label} Processed",
                    detail=f"A {doc_label} was successfully uploaded and applied.",
                    policy_id=match["policy_id"],
                    client_id=match.get("client_id"),
                    actor_user_id=self.account_id,
                    meta={
                        "document_id": self.document_id,
                        "doc_type": self.doc_type,
                        "owner_name": owner_name,
                        "address": address_raw,
                        "confidence": match["confidence"],
                        "writeback_status": result.get("writeback_log", []),
                    },
                )
            elif match["status"] == "needs_review":
                is_mismatch_event = bool(match.get("review_reason") and "Mismatch" in match.get("review_reason"))
                insert_activity_event(
                    event_type="document.mismatch" if is_mismatch_event else "document.needs_review",
                    title=f"{doc_label} Mismatch Detected" if is_mismatch_event else f"{doc_label} Needs Review",
                    detail=match.get("review_reason") or "Policy match requires confirmation.",
                    policy_id=match.get("policy_id"),
                    client_id=match.get("client_id"),
                    actor_user_id=self.account_id,
                    meta={
                        "document_id": self.document_id,
                        "doc_type": self.doc_type,
                        "owner_name": owner_name,
                        "address": address_raw,
                        "is_mismatch": is_mismatch_event,
                        "review_reason": match.get("review_reason"),
                        "action_items": match.get("action_items", []),
                    },
                )
            elif match["status"] == "no_match":
                insert_activity_event(
                    event_type="document.no_match",
                    title=f"{doc_label} — No Matching Policy",
                    detail="No matching policy found. Manual assignment required.",
                    actor_user_id=self.account_id,
                    meta={
                        "document_id": self.document_id,
                        "doc_type": self.doc_type,
                        "owner_name": owner_name,
                        "address": address_raw,
                        "action_items": match.get("action_items", []),
                    },
                )

        except Exception as exc:
            error_msg = str(exc)[:2000]
            logger.error("%s processing failed: %s", self._log_prefix, error_msg)
            result["errors"].append(error_msg)
            self.update_document({
                "parse_status": "failed",
                "error_message": error_msg,
                "processing_step": "failed",
            })

            # Activity event for failures
            doc_label = DOC_TYPE_DISPLAY.get(self.doc_type, self.doc_type.upper())
            insert_activity_event(
                event_type="document.failed",
                title=f"{doc_label} Processing Failed",
                detail=error_msg[:500],
                actor_user_id=self.account_id,
                meta={
                    "document_id": self.document_id,
                    "doc_type": self.doc_type,
                    "error": error_msg[:500],
                },
            )

        return result
