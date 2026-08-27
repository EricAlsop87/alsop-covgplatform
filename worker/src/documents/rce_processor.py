"""
RCE (Replacement Cost Estimator) document processor.

Handles 360Value RCE PDFs:
1. Extracts 50+ structured fields via LLM
2. Matches to policy via owner name + address
3. Persists to doc_data_rce
4. Writes enrichment data (replacement_cost, sq_feet, etc.) to property_enrichments
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from openai import OpenAI

from ..supabase_client import get_supabase
from .base import DocumentProcessor
from .prompts.rce_prompt import RCE_SYSTEM_PROMPT

logger = logging.getLogger("worker.documents.rce_processor")

MAX_TEXT_CHARS = 10000


class RCEProcessor(DocumentProcessor):

    @property
    def doc_type(self) -> str:
        return "rce"

    def extract_fields(self, raw_text: str) -> dict[str, Any]:
        """Extract RCE fields using GPT-4o-mini."""
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY not set — cannot extract RCE fields")

        client = OpenAI(api_key=api_key)
        trimmed = raw_text[:MAX_TEXT_CHARS]

        logger.info("Sending %d chars to GPT-4o-mini for RCE extraction", len(trimmed))

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": RCE_SYSTEM_PROMPT},
                {"role": "user", "content": trimmed},
            ],
            temperature=0.0,
            max_tokens=3000,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content
        if not content:
            raise RuntimeError("LLM returned empty content for RCE extraction")

        extracted = json.loads(content)

        # Normalize empty strings to None
        for key in extracted:
            if isinstance(extracted[key], str) and (
                extracted[key] == "" or extracted[key].lower() == "null"
            ):
                extracted[key] = None

        logger.info(
            "RCE extraction: owner=%s, addr=%s %s %s, sqft=%s, repl_cost=%s",
            extracted.get("owner_name"),
            extracted.get("property_street"),
            extracted.get("property_city"),
            extracted.get("property_state"),
            extracted.get("sq_feet"),
            extracted.get("replacement_cost"),
        )

        # Build composite address for matching
        address_parts = [
            extracted.get("property_street"),
            extracted.get("property_city"),
        ]
        state_zip = " ".join(filter(None, [
            extracted.get("property_state"),
            extracted.get("property_zip"),
        ]))
        if state_zip:
            address_parts.append(state_zip)
        extracted["property_address"] = ", ".join(filter(None, address_parts))

        return extracted

    def persist_extracted_data(self, extracted: dict[str, Any]) -> str:
        """Save to doc_data_rce table."""
        sb = get_supabase()

        def _parse_date(date_str: str | None) -> str | None:
            """Convert MM/DD/YYYY to YYYY-MM-DD for DB storage."""
            if not date_str:
                return None
            try:
                parts = date_str.split("/")
                if len(parts) == 3:
                    return f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"
            except Exception:
                pass
            return None

        payload = {
            "document_id": self.document_id,
            "valuation_id": extracted.get("valuation_id"),
            "date_entered": _parse_date(extracted.get("date_entered")),
            "date_calculated": _parse_date(extracted.get("date_calculated")),
            "created_by": extracted.get("created_by"),
            "stories": extracted.get("stories"),
            "use_type": extracted.get("use_type"),
            "style": extracted.get("style"),
            "sq_feet": extracted.get("sq_feet"),
            "year_built": extracted.get("year_built"),
            "quality_grade": extracted.get("quality_grade"),
            "site_access": extracted.get("site_access"),
            "cost_per_sqft": extracted.get("cost_per_sqft"),
            "foundation_shape": extracted.get("foundation_shape"),
            "foundation_material": extracted.get("foundation_material"),
            "foundation_type": extracted.get("foundation_type"),
            "property_slope": extracted.get("property_slope"),
            "roof_year": extracted.get("roof_year"),
            "roof_cover": extracted.get("roof_cover"),
            "roof_shape": extracted.get("roof_shape"),
            "roof_construction": extracted.get("roof_construction"),
            "wall_finish": extracted.get("wall_finish"),
            "wall_construction": extracted.get("wall_construction"),
            "num_dormers": extracted.get("num_dormers"),
            "avg_wall_height": extracted.get("avg_wall_height"),
            "floor_coverings": extracted.get("floor_coverings"),
            "ceiling_finish": extracted.get("ceiling_finish"),
            "interior_wall_material": extracted.get("interior_wall_material"),
            "interior_wall_finish": extracted.get("interior_wall_finish"),
            "rooms": extracted.get("rooms"),
            "garage_info": extracted.get("garage_info"),
            "porch_info": extracted.get("porch_info"),
            "heating": extracted.get("heating"),
            "air_conditioning": extracted.get("air_conditioning"),
            "fireplace_info": extracted.get("fireplace_info"),
            "home_features": extracted.get("home_features"),
            "replacement_cost": extracted.get("replacement_cost"),
            "replacement_range_low": extracted.get("replacement_range_low"),
            "replacement_range_high": extracted.get("replacement_range_high"),
            "actual_cash_value": extracted.get("actual_cash_value"),
            "acv_age": extracted.get("acv_age"),
            "acv_condition": extracted.get("acv_condition"),
            "cost_breakdown": extracted.get("cost_breakdown"),
        }

        # Remove None values to avoid DB issues
        payload = {k: v for k, v in payload.items() if v is not None}

        result = sb.table("doc_data_rce").insert(payload).execute()
        if not result.data:
            raise RuntimeError("Failed to insert doc_data_rce row")

        return result.data[0]["id"]

    def writeback_to_policy(
        self,
        extracted: dict[str, Any],
        policy_id: str,
        policy_term_id: str | None,
    ) -> list[dict]:
        """
        Write RCE data to property_enrichments and conditionally to policy_terms.
        
        Rules:
        - Enrichment-style data (replacement_cost, sq_feet, etc.): Always insert
          as property_enrichments rows with source='rce_360value'
        - policy_terms fields (year_built, construction_type): Write only if
          currently empty. Flag conflict if different value exists.
        """
        sb = get_supabase()
        now_iso = datetime.now(timezone.utc).isoformat()
        log: list[dict] = []
        source = "rce_360value"
        source_tier = "document"

        # ── Enrichment writebacks (always insert, never overwrite) ────────

        enrichment_fields = [
            ("replacement_cost", "replacement_cost_rce", extracted.get("replacement_cost")),
            ("actual_cash_value", "actual_cash_value_rce", extracted.get("actual_cash_value")),
            ("sq_feet", "square_footage", extracted.get("sq_feet")),
            ("cost_per_sqft", "cost_per_sqft_rce", extracted.get("cost_per_sqft")),
            ("roof_year", "roof_year", extracted.get("roof_year")),
            ("quality_grade", "quality_grade_rce", extracted.get("quality_grade")),
            ("replacement_range_low", "replacement_range_low_rce", extracted.get("replacement_range_low")),
            ("replacement_range_high", "replacement_range_high_rce", extracted.get("replacement_range_high")),
        ]

        for rce_field, field_key, value in enrichment_fields:
            if value is None:
                continue

            try:
                sb.table("property_enrichments").insert({
                    "policy_id": policy_id,
                    "field_key": field_key,
                    "field_value": str(value),
                    "source_name": source,
                    "source_tier": source_tier,
                    "created_at": now_iso,
                }).execute()

                log.append({
                    "action": "written",
                    "target": f"property_enrichments.{field_key}",
                    "value": str(value),
                    "source": source,
                    "rce_field": rce_field,
                    "timestamp": now_iso,
                })
                logger.info(
                    "Wrote enrichment %s=%s for policy %s",
                    field_key, value, policy_id,
                )
            except Exception as e:
                logger.warning(
                    "Failed to write enrichment %s: %s", field_key, e,
                )
                log.append({
                    "action": "error",
                    "target": f"property_enrichments.{field_key}",
                    "error": str(e)[:200],
                    "timestamp": now_iso,
                })

        # ── Policy term writebacks (only if empty, flag conflicts) ────────

        if policy_term_id:
            try:
                term_result = sb.table("policy_terms").select(
                    "year_built, construction_type"
                ).eq("id", policy_term_id).limit(1).execute()

                if term_result.data:
                    term = term_result.data[0]
                    term_updates = {}

                    # year_built
                    rce_year = extracted.get("year_built")
                    if rce_year is not None:
                        existing_year = term.get("year_built")
                        if not existing_year:
                            term_updates["year_built"] = str(rce_year)
                            log.append({
                                "action": "written",
                                "target": "policy_terms.year_built",
                                "value": str(rce_year),
                                "source": source,
                                "timestamp": now_iso,
                            })
                        elif str(existing_year) != str(rce_year):
                            log.append({
                                "action": "conflict",
                                "target": "policy_terms.year_built",
                                "existing_value": str(existing_year),
                                "new_value": str(rce_year),
                                "source": source,
                                "reason": "Year built differs between policy and RCE",
                                "timestamp": now_iso,
                            })
                        else:
                            log.append({
                                "action": "skipped",
                                "target": "policy_terms.year_built",
                                "reason": "Values already match",
                                "timestamp": now_iso,
                            })

                    # construction_type (from wall_construction)
                    rce_construction = extracted.get("wall_construction")
                    if rce_construction:
                        existing_constr = term.get("construction_type")
                        if not existing_constr:
                            term_updates["construction_type"] = rce_construction
                            log.append({
                                "action": "written",
                                "target": "policy_terms.construction_type",
                                "value": rce_construction,
                                "source": source,
                                "timestamp": now_iso,
                            })
                        elif existing_constr.upper() != rce_construction.upper():
                            log.append({
                                "action": "conflict",
                                "target": "policy_terms.construction_type",
                                "existing_value": existing_constr,
                                "new_value": rce_construction,
                                "source": source,
                                "reason": "Construction type differs between policy and RCE",
                                "timestamp": now_iso,
                            })

                    # Apply updates if any
                    if term_updates:
                        term_updates["updated_at"] = now_iso
                        sb.table("policy_terms").update(term_updates).eq("id", policy_term_id).execute()

            except Exception as e:
                logger.warning("Failed to write policy term data: %s", e)
                log.append({
                    "action": "error",
                    "target": "policy_terms",
                    "error": str(e)[:200],
                    "timestamp": now_iso,
                })

        return log
