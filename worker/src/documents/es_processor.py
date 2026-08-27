"""
Excess & Surplus (E&S) carrier document processor.

Handles E&S Homeowner (HO-3, HO-6, DP-3) quotes, policies, and endorsements
from E&S carriers (Aegis/Lloyd's, TAPCO, Burns & Wilcox, RT Specialty, Monarch, etc.).

Operations:
- Extracts structured E&S data via GPT-4o-mini
- Stores extracted data in doc_data_es table
- Performs policy matching using Named Insured + Risk Address
- Updates policy_terms with es_exists = True and E&S details
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from openai import OpenAI

from ..supabase_client import get_supabase
from .base import DocumentProcessor
from .prompts.es_prompt import ES_SYSTEM_PROMPT

logger = logging.getLogger("worker.documents.es_processor")

MAX_TEXT_CHARS = 12000


class ESProcessor(DocumentProcessor):

    @property
    def doc_type(self) -> str:
        return "es_doc"

    def extract_fields(self, raw_text: str) -> dict[str, Any]:
        """Extract E&S document fields using GPT-4o-mini."""
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY not set — cannot extract E&S fields")

        client = OpenAI(api_key=api_key)
        trimmed = raw_text[:MAX_TEXT_CHARS]

        logger.info("Sending %d chars to GPT-4o-mini for E&S extraction", len(trimmed))

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": ES_SYSTEM_PROMPT},
                {"role": "user", "content": trimmed},
            ],
            temperature=0.0,
            max_tokens=3000,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content
        if not content:
            raise RuntimeError("LLM returned empty content for E&S extraction")

        extracted = json.loads(content)

        # Normalize empty strings to None
        for key in extracted:
            if isinstance(extracted[key], str) and (
                extracted[key] == "" or extracted[key].lower() == "null"
            ):
                extracted[key] = None

        logger.info(
            "E&S extraction: carrier=%s, quote/policy=%s, insured=%s, risk_address=%s, total_premium=%s",
            extracted.get("carrier_name"),
            extracted.get("quote_number") or extracted.get("policy_number"),
            extracted.get("named_insured"),
            extracted.get("risk_address"),
            extracted.get("total_policy_premium"),
        )

        # Map named_insured → owner_name for the matching engine
        extracted["owner_name"] = extracted.get("named_insured")

        # Construct full property_address for matching engine
        risk_addr = extracted.get("risk_address") or ""
        city = extracted.get("risk_city") or ""
        state = extracted.get("risk_state") or ""
        zip_code = extracted.get("risk_zip") or ""

        city_state_zip = f"{city}, {state} {zip_code}".strip(" ,")
        full_address = f"{risk_addr}, {city_state_zip}".strip(" ,") if risk_addr else city_state_zip

        extracted["property_address"] = full_address if full_address else None

        return extracted

    def persist_extracted_data(self, extracted: dict[str, Any]) -> str:
        """Save to doc_data_es table."""
        sb = get_supabase()

        def _parse_date(date_str: str | None) -> str | None:
            """Convert various date formats to YYYY-MM-DD."""
            if not date_str:
                return None
            if len(date_str) == 10 and date_str[4] == "-":
                return date_str
            try:
                parts = date_str.split("/")
                if len(parts) == 3:
                    return f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"
            except Exception:
                pass
            return None

        def _parse_num(val: Any) -> float | None:
            """Clean numeric strings (e.g. '$6,806.78' -> 6806.78)."""
            if val is None:
                return None
            if isinstance(val, (int, float)):
                return float(val)
            if isinstance(val, str):
                cleaned = val.replace("$", "").replace(",", "").replace("(", "-").replace(")", "").strip()
                try:
                    return float(cleaned)
                except ValueError:
                    return None
            return None

        payload = {
            "document_id": self.document_id,
            "carrier_name": extracted.get("carrier_name"),
            "producer_name": extracted.get("producer_name"),
            "producer_code": extracted.get("producer_code"),
            "producer_phone": extracted.get("producer_phone"),
            "document_type": extracted.get("document_type"),
            "quote_number": extracted.get("quote_number"),
            "policy_number": extracted.get("policy_number"),
            "quote_date": _parse_date(extracted.get("quote_date")),
            "effective_date": _parse_date(extracted.get("effective_date")),
            "expiration_date": _parse_date(extracted.get("expiration_date")),
            "named_insured": extracted.get("named_insured"),
            "risk_address": extracted.get("risk_address"),
            "risk_city": extracted.get("risk_city"),
            "risk_state": extracted.get("risk_state"),
            "risk_zip": extracted.get("risk_zip"),
            "cov_a_dwelling": _parse_num(extracted.get("cov_a_dwelling")),
            "cov_b_other_structures": _parse_num(extracted.get("cov_b_other_structures")),
            "cov_c_personal_property": _parse_num(extracted.get("cov_c_personal_property")),
            "cov_d_loss_of_use": _parse_num(extracted.get("cov_d_loss_of_use")),
            "cov_e_personal_liability": _parse_num(extracted.get("cov_e_personal_liability")),
            "cov_f_medical_payments": _parse_num(extracted.get("cov_f_medical_payments")),
            "deductible": _parse_num(extracted.get("deductible")),
            "base_premium": _parse_num(extracted.get("base_premium")),
            "inspection_fee": _parse_num(extracted.get("inspection_fee")),
            "policy_fee": _parse_num(extracted.get("policy_fee")),
            "surplus_lines_tax": _parse_num(extracted.get("surplus_lines_tax")),
            "stamping_fee": _parse_num(extracted.get("stamping_fee")),
            "total_policy_premium": _parse_num(extracted.get("total_policy_premium")),
            "additional_coverages": extracted.get("additional_coverages"),
            "extracted_json": extracted,
        }

        # Remove None values
        payload = {k: v for k, v in payload.items() if v is not None}

        result = sb.table("doc_data_es").upsert(payload, on_conflict="document_id").execute()
        if not result.data:
            raise RuntimeError("Failed to upsert doc_data_es row")

        return result.data[0]["id"]

    def writeback_to_policy(
        self,
        extracted: dict[str, Any],
        policy_id: str,
        policy_term_id: str | None,
    ) -> list[dict]:
        """
        E&S data writeback — updates policy_terms with E&S existence & tracking info.
        """
        sb = get_supabase()
        now_iso = datetime.now(timezone.utc).isoformat()
        log: list[dict] = []

        resolved_term_id = policy_term_id
        if not resolved_term_id:
            try:
                term_row = sb.table("policy_terms").select("id").eq(
                    "policy_id", policy_id
                ).order("effective_date", desc=True).limit(1).execute()
                if term_row.data:
                    resolved_term_id = term_row.data[0]["id"]
                    logger.info("E&S writeback: resolved policy_term_id=%s for policy=%s", resolved_term_id, policy_id)
            except Exception as e:
                logger.warning("E&S writeback: failed to resolve policy_term_id: %s", e)

        if resolved_term_id:
            es_num = extracted.get("policy_number") or extracted.get("quote_number")
            total_prem = extracted.get("total_policy_premium") or extracted.get("base_premium")

            def _clean_num(val: Any) -> float | None:
                if val is None:
                    return None
                if isinstance(val, (int, float)):
                    return float(val)
                if isinstance(val, str):
                    try:
                        return float(val.replace("$", "").replace(",", "").strip())
                    except ValueError:
                        return None
                return None

            es_update: dict[str, Any] = {
                "es_exists": True,
                "updated_at": now_iso,
            }
            if es_num:
                es_update["es_policy_number"] = es_num
            cleaned_prem = _clean_num(total_prem)
            if cleaned_prem is not None:
                es_update["es_annual_premium_raw"] = cleaned_prem

            try:
                sb.table("policy_terms").update(es_update).eq("id", resolved_term_id).execute()

                log.append({
                    "action": "written",
                    "target": "policy_terms.es_exists",
                    "value": "True",
                    "reason": "E&S document attached",
                    "timestamp": now_iso,
                })
            except Exception as e:
                log.append({
                    "action": "error",
                    "target": "policy_terms.es_update",
                    "error": str(e),
                    "timestamp": now_iso,
                })

        return log
