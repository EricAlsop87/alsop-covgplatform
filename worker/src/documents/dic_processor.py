"""
DIC carrier declaration page processor.

Handles DP-3 declaration pages from DIC carriers (PSIC, Bamboo, Aegis).
These are structurally similar to FAIR Plan dec pages but with different
coverage structures and DIC endorsements.

DIC data does NOT overwrite main policy data. Instead:
- Coverage data is stored in doc_data_dic only (display-only)
- DIC endorsement flags are recorded for policy status tracking
- Embedded 360Value data is used for cross-referencing, not writeback
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from openai import OpenAI

from ..supabase_client import get_supabase
from .base import DocumentProcessor
from .prompts.dic_prompt import DIC_SYSTEM_PROMPT

logger = logging.getLogger("worker.documents.dic_processor")

MAX_TEXT_CHARS = 12000


class DICProcessor(DocumentProcessor):

    @property
    def doc_type(self) -> str:
        return "dic_dec_page"

    def extract_fields(self, raw_text: str) -> dict[str, Any]:
        """Extract DIC carrier dec page fields using GPT-4o-mini."""
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY not set — cannot extract DIC fields")

        client = OpenAI(api_key=api_key)
        trimmed = raw_text[:MAX_TEXT_CHARS]

        logger.info("Sending %d chars to GPT-4o-mini for DIC extraction", len(trimmed))

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": DIC_SYSTEM_PROMPT},
                {"role": "user", "content": trimmed},
            ],
            temperature=0.0,
            max_tokens=3000,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content
        if not content:
            raise RuntimeError("LLM returned empty content for DIC extraction")

        extracted = json.loads(content)

        # Normalize empty strings to None
        for key in extracted:
            if isinstance(extracted[key], str) and (
                extracted[key] == "" or extracted[key].lower() == "null"
            ):
                extracted[key] = None

        logger.info(
            "DIC extraction: carrier=%s, policy=%s, insured=%s, property=%s, dic=%s",
            extracted.get("carrier_name"),
            extracted.get("policy_number"),
            extracted.get("insured_name"),
            extracted.get("property_address"),
            extracted.get("has_dic_endorsement"),
        )

        # Map insured_name → owner_name for the matching engine
        extracted["owner_name"] = extracted.get("insured_name")

        return extracted

    def persist_extracted_data(self, extracted: dict[str, Any]) -> str:
        """Save to doc_data_dic table."""
        sb = get_supabase()

        def _parse_date(date_str: str | None) -> str | None:
            """Convert various date formats to YYYY-MM-DD."""
            if not date_str:
                return None
            # Already in YYYY-MM-DD format
            if len(date_str) == 10 and date_str[4] == "-":
                return date_str
            try:
                parts = date_str.split("/")
                if len(parts) == 3:
                    return f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"
            except Exception:
                pass
            return None

        payload = {
            "document_id": self.document_id,
            "carrier_name": extracted.get("carrier_name"),
            "policy_number": extracted.get("policy_number"),
            "policy_form": extracted.get("policy_form"),
            "effective_date": _parse_date(extracted.get("effective_date")),
            "expiration_date": _parse_date(extracted.get("expiration_date")),
            "notice_date": _parse_date(extracted.get("notice_date")),
            "document_type": extracted.get("document_type"),
            "insured_name": extracted.get("insured_name"),
            "secondary_insured": extracted.get("secondary_insured"),
            "mailing_address": extracted.get("mailing_address"),
            "property_address": extracted.get("property_address"),
            "broker_name": extracted.get("broker_name"),
            "broker_address": extracted.get("broker_address"),
            "broker_phone": extracted.get("broker_phone"),
            "has_mortgagee": extracted.get("has_mortgagee", False),
            "deductible": extracted.get("deductible"),
            "cov_a_dwelling": extracted.get("cov_a_dwelling"),
            "cov_b_other_struct": extracted.get("cov_b_other_struct"),
            "cov_c_personal_prop": extracted.get("cov_c_personal_prop"),
            "cov_e_add_living": extracted.get("cov_e_add_living"),
            "cov_l_liability": extracted.get("cov_l_liability"),
            "cov_m_medical": extracted.get("cov_m_medical"),
            "ordinance_or_law": extracted.get("ordinance_or_law"),
            "extended_repl_cost": extracted.get("extended_repl_cost"),
            "sewer_backup": extracted.get("sewer_backup"),
            "has_dic_endorsement": extracted.get("has_dic_endorsement", False),
            "dic_form_number": extracted.get("dic_form_number"),
            "dic_eliminates_fire": extracted.get("dic_eliminates_fire", False),
            "requires_fair_plan": extracted.get("requires_fair_plan", False),
            "basic_premium": extracted.get("basic_premium"),
            "optional_premium": extracted.get("optional_premium"),
            "credits": extracted.get("credits"),
            "surcharges": extracted.get("surcharges"),
            "total_charge": extracted.get("total_charge"),
            "rce_estimate_number": extracted.get("rce_estimate_number"),
            "rce_replacement_cost": extracted.get("rce_replacement_cost"),
            "rce_insured_value": extracted.get("rce_insured_value"),
            "rce_year_built": extracted.get("rce_year_built"),
            "rce_living_area": extracted.get("rce_living_area"),
            "rce_quality_grade": extracted.get("rce_quality_grade"),
            "forms_endorsements": extracted.get("forms_endorsements"),
            "extracted_json": extracted,
        }

        # Remove None values
        payload = {k: v for k, v in payload.items() if v is not None}

        result = sb.table("doc_data_dic").upsert(payload, on_conflict="document_id").execute()
        if not result.data:
            raise RuntimeError("Failed to upsert doc_data_dic row")

        return result.data[0]["id"]

    def writeback_to_policy(
        self,
        extracted: dict[str, Any],
        policy_id: str,
        policy_term_id: str | None,
    ) -> list[dict]:
        """
        DIC data writeback — writes to SEPARATE dic_limit_* columns.
        
        DIC carrier dec page data does NOT overwrite main CFP policy fields.
        Writebacks:
        1. Set dic_exists = True on the policy term
        2. Write DIC coverages to dedicated dic_limit_* columns on policy_terms
        3. Write DIC policy number to policy_terms
        4. Store embedded 360Value data as enrichments (if present and no
           existing RCE data exists)
        """
        sb = get_supabase()
        now_iso = datetime.now(timezone.utc).isoformat()
        log: list[dict] = []

        # Update policy_terms with DIC flag + DIC coverages (separate columns)
        # Resolve policy_term_id if missing (e.g., older manual assignments)
        resolved_term_id = policy_term_id
        if not resolved_term_id:
            try:
                term_row = sb.table("policy_terms").select("id").eq(
                    "policy_id", policy_id
                ).order("effective_date", desc=True).limit(1).execute()
                if term_row.data:
                    resolved_term_id = term_row.data[0]["id"]
                    logger.info("DIC writeback: resolved policy_term_id=%s for policy=%s", resolved_term_id, policy_id)
            except Exception as e:
                logger.warning("DIC writeback: failed to resolve policy_term_id: %s", e)

        if resolved_term_id:
            # Build the update payload — dic_exists + all DIC coverage fields
            dic_update: dict[str, Any] = {
                "dic_exists": True,
                "updated_at": now_iso,
            }

            # Map extracted DIC fields → policy_terms dic_limit_* columns
            dic_field_map = {
                "cov_a_dwelling": "dic_limit_dwelling",
                "cov_b_other_struct": "dic_limit_other_structures",
                "cov_c_personal_prop": "dic_limit_personal_property",
                "cov_e_add_living": "dic_limit_loss_of_use",
                "deductible": "dic_deductible",
                "total_charge": "dic_annual_premium_raw",
                "policy_number": "dic_policy_number",
            }

            for src_key, dest_col in dic_field_map.items():
                val = extracted.get(src_key)
                if val is not None:
                    dic_update[dest_col] = val

            try:
                sb.table("policy_terms").update(dic_update).eq("id", resolved_term_id).execute()

                log.append({
                    "action": "written",
                    "target": "policy_terms.dic_exists",
                    "value": "True",
                    "reason": "DIC document attached",
                    "timestamp": now_iso,
                })

                # Log each DIC coverage field that was written
                written_covg = [
                    col for src, col in dic_field_map.items()
                    if extracted.get(src) is not None
                ]
                if written_covg:
                    log.append({
                        "action": "written",
                        "target": "policy_terms.dic_coverages",
                        "fields": written_covg,
                        "reason": "DIC coverages stored in separate dic_limit_* columns (CFP data untouched)",
                        "timestamp": now_iso,
                    })

            except Exception as e:
                log.append({
                    "action": "error",
                    "target": "policy_terms.dic_update",
                    "error": str(e),
                    "timestamp": now_iso,
                })
        # If the DIC dec page has embedded 360Value data, write as enrichments
        # but ONLY if no existing RCE enrichments exist for this policy
        rce_replacement = extracted.get("rce_replacement_cost")
        rce_living_area = extracted.get("rce_living_area")

        if rce_replacement or rce_living_area:
            # Check if standalone RCE enrichments already exist
            try:
                existing = (
                    sb.table("property_enrichments")
                    .select("id")
                    .eq("policy_id", policy_id)
                    .eq("source_name", "rce_360value")
                    .limit(1)
                    .execute()
                )

                if existing.data:
                    log.append({
                        "action": "skipped",
                        "target": "property_enrichments (embedded RCE)",
                        "reason": "Standalone RCE enrichments already exist. DIC embedded values not written to avoid duplication.",
                        "timestamp": now_iso,
                    })
                else:
                    # Write embedded 360Value data as enrichments
                    source = "dic_embedded_360value"
                    enrichments = [
                        ("replacement_cost_rce", rce_replacement),
                        ("square_footage", rce_living_area),
                    ]
                    rce_year = extracted.get("rce_year_built")
                    if rce_year:
                        enrichments.append(("year_built_rce", rce_year))
                    rce_quality = extracted.get("rce_quality_grade")
                    if rce_quality:
                        enrichments.append(("quality_grade_rce", rce_quality))

                    for field_key, value in enrichments:
                        if value is None:
                            continue
                        try:
                            sb.table("property_enrichments").insert({
                                "policy_id": policy_id,
                                "field_key": field_key,
                                "field_value": str(value),
                                "source_name": source,
                                "source_tier": "document",
                                "created_at": now_iso,
                            }).execute()
                            log.append({
                                "action": "written",
                                "target": f"property_enrichments.{field_key}",
                                "value": str(value),
                                "source": source,
                                "timestamp": now_iso,
                            })
                        except Exception as e:
                            log.append({
                                "action": "error",
                                "target": f"property_enrichments.{field_key}",
                                "error": str(e)[:200],
                                "timestamp": now_iso,
                            })

            except Exception as e:
                logger.warning("Failed to check existing enrichments: %s", e)
                log.append({
                    "action": "error",
                    "target": "property_enrichments",
                    "error": str(e)[:200],
                    "timestamp": now_iso,
                })

        return log
