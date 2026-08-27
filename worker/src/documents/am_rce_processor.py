"""
American Modern RCE (Replacement Cost Estimator) document processor.

Handles American Modern / Cotality RCT Express "Detailed Report" PDFs:
1. Extracts 60+ structured fields via LLM using AM-specific prompt
2. Matches to policy via insured name + address (reuses existing matcher)
3. Persists to doc_data_rce with source='rce_american_modern'
4. Writes enrichment data to property_enrichments

This processor extends DocumentProcessor (same base as RCEProcessor) but
uses a completely different LLM prompt tailored to the American Modern
document layout and field labels.
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from openai import OpenAI

from ..supabase_client import get_supabase
from .base import DocumentProcessor
from .prompts.am_rce_prompt import AM_RCE_SYSTEM_PROMPT

logger = logging.getLogger("worker.documents.am_rce_processor")

MAX_TEXT_CHARS = 12000  # AM docs are 4 pages; allow more chars than 360Value


class AMRCEProcessor(DocumentProcessor):
    """
    Processor for American Modern / Cotality RCT Express RCE documents.

    Shares the same doc_type ('rce') and database table (doc_data_rce) as
    the 360Value processor, but uses a different LLM prompt and populates
    AM-specific columns (coverage_a/b breakdowns, detailed_cost_breakdown,
    materials_detail, geospatial coordinates, etc.).
    """

    @property
    def doc_type(self) -> str:
        return "rce"

    def extract_fields(self, raw_text: str) -> dict[str, Any]:
        """Extract RCE fields using GPT-4o-mini with American Modern prompt."""
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY not set — cannot extract AM RCE fields")

        import httpx

        trimmed = raw_text[:MAX_TEXT_CHARS]
        logger.info(
            "Sending %d chars to GPT-4o-mini for American Modern RCE extraction",
            len(trimmed),
        )

        transport = httpx.HTTPTransport(retries=3)
        with httpx.Client(transport=transport, timeout=90.0) as http_client:
            client = OpenAI(api_key=api_key, http_client=http_client)
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": AM_RCE_SYSTEM_PROMPT},
                    {"role": "user", "content": trimmed},
                ],
                temperature=0.0,
                max_tokens=4000,
                response_format={"type": "json_object"},
            )

        content = response.choices[0].message.content
        if not content:
            raise RuntimeError("LLM returned empty content for AM RCE extraction")

        extracted = json.loads(content)

        # Normalize empty strings to None
        for key in extracted:
            if isinstance(extracted[key], str) and (
                extracted[key] == "" or extracted[key].lower() == "null"
            ):
                extracted[key] = None

        logger.info(
            "AM RCE extraction: owner=%s, addr=%s %s %s, sqft=%s, cov_a=%s",
            extracted.get("owner_name"),
            extracted.get("property_street"),
            extracted.get("property_city"),
            extracted.get("property_state"),
            extracted.get("sq_feet"),
            extracted.get("coverage_a_with_debris"),
        )

        # Build composite address for matching (reusing same pattern as RCEProcessor)
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
        """Save to doc_data_rce table with source='rce_american_modern'."""
        sb = get_supabase()

        def _parse_date(date_str: str | None) -> str | None:
            """Convert M/D/YYYY or MM/DD/YYYY to YYYY-MM-DD for DB storage."""
            if not date_str:
                return None
            try:
                parts = date_str.split("/")
                if len(parts) == 3:
                    return f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"
            except Exception:
                pass
            return None

        # Map coverage_a_with_debris → replacement_cost for compatibility
        # with the existing system (hero display, enrichments, etc.)
        replacement_cost = extracted.get("coverage_a_with_debris")

        payload = {
            "document_id": self.document_id,
            "source": "rce_american_modern",

            # ── Fields shared with 360Value (same columns) ──
            "valuation_id": extracted.get("estimate_number"),
            "stories": extracted.get("stories"),
            "style": extracted.get("style"),
            "sq_feet": extracted.get("sq_feet"),
            "year_built": extracted.get("year_built"),
            "site_access": extracted.get("site_access"),
            "cost_per_sqft": extracted.get("cost_per_sqft"),
            "foundation_type": extracted.get("foundation_type"),
            "foundation_material": extracted.get("foundation_material"),
            "wall_construction": extracted.get("construction_type"),
            "heating": extracted.get("heating"),
            "air_conditioning": extracted.get("air_conditioning"),
            "garage_info": extracted.get("garage_info"),
            "replacement_cost": replacement_cost,
            "cost_breakdown": extracted.get("detailed_cost_breakdown"),

            # ── AM-specific columns ──
            "estimate_number": extracted.get("estimate_number"),
            "effective_date": _parse_date(extracted.get("effective_date")),
            "renewal_date": _parse_date(extracted.get("renewal_date")),
            "estimate_expiration_date": _parse_date(extracted.get("estimate_expiration_date")),
            "insured_name": extracted.get("owner_name"),
            "property_address": extracted.get("property_address"),
            "construction_type": extracted.get("construction_type"),
            "finished_floor_area": extracted.get("finished_floor_area"),
            "num_families": extracted.get("num_families"),
            "perimeter": extracted.get("perimeter"),
            "wall_height": extracted.get("wall_height"),

            # Coverage A breakdown
            "coverage_a_without_debris": extracted.get("coverage_a_without_debris"),
            "coverage_a_debris_removal": extracted.get("coverage_a_debris_removal"),
            "coverage_a_with_debris": extracted.get("coverage_a_with_debris"),

            # Coverage B (Other Structures)
            "coverage_b_without_debris": extracted.get("coverage_b_without_debris"),
            "coverage_b_debris_removal": extracted.get("coverage_b_debris_removal"),
            "coverage_b_with_debris": extracted.get("coverage_b_with_debris"),
            "coverage_b_pct_of_a": extracted.get("coverage_b_pct_of_a"),

            # Cost data reference
            "cost_data_as_of": extracted.get("cost_data_as_of"),

            # Geospatial
            "latitude": extracted.get("latitude"),
            "longitude": extracted.get("longitude"),
            "coordinates_source": extracted.get("coordinates_source"),

            # Detailed structured data (JSONB)
            "detailed_cost_breakdown": extracted.get("detailed_cost_breakdown"),
            "materials_detail": extracted.get("materials_detail"),
            "exterior_features": extracted.get("exterior_features"),
            "interior_features": extracted.get("interior_features"),
            "kitchens_baths": extracted.get("kitchens_baths"),
            "electrical": extracted.get("electrical"),
            "fire_protection": extracted.get("fire_protection"),
        }

        # Remove None values to avoid DB issues
        payload = {k: v for k, v in payload.items() if v is not None}

        result = sb.table("doc_data_rce").insert(payload).execute()
        if not result.data:
            raise RuntimeError("Failed to insert doc_data_rce row (AM)")

        logger.info(
            "Persisted AM RCE data: id=%s, estimate=%s, cov_a=%s",
            result.data[0]["id"],
            extracted.get("estimate_number"),
            extracted.get("coverage_a_with_debris"),
        )

        return result.data[0]["id"]

    def writeback_to_policy(
        self,
        extracted: dict[str, Any],
        policy_id: str,
        policy_term_id: str | None,
    ) -> list[dict]:
        """
        Write AM RCE data to property_enrichments and conditionally to policy_terms.

        Follows the same rules as the 360Value processor:
        - Enrichment-style data: Always insert as property_enrichments rows
        - Policy terms fields: Write only if currently empty, flag conflicts

        Uses source_name='rce_american_modern' so the frontend can distinguish.
        """
        sb = get_supabase()
        now_iso = datetime.now(timezone.utc).isoformat()
        log: list[dict] = []
        source = "rce_american_modern"
        source_tier = "verified"
        source_type = "ai_interpretation"

        # ── Enrichment writebacks ────────────────────────────────────────

        # Map AM fields to the same enrichment keys used by 360Value
        # so the rest of the system (flags, valuation engine, etc.) can consume them
        replacement_cost = extracted.get("coverage_a_with_debris")
        enrichment_fields = [
            ("coverage_a_with_debris", "replacement_cost_rce", replacement_cost),
            ("sq_feet", "square_footage", extracted.get("sq_feet")),
            ("cost_per_sqft", "cost_per_sqft_rce", extracted.get("cost_per_sqft")),
            ("coverage_b_with_debris", "coverage_b_rce", extracted.get("coverage_b_with_debris")),
            ("latitude", "latitude", extracted.get("latitude")),
            ("longitude", "longitude", extracted.get("longitude")),
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
                    "source_type": source_type,
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
                    "Wrote enrichment %s=%s for policy %s (AM RCE)",
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

        # ── Policy term writebacks (only if empty, flag conflicts) ───────

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
                                "reason": "Year built differs between policy and AM RCE",
                                "timestamp": now_iso,
                            })
                        else:
                            log.append({
                                "action": "skipped",
                                "target": "policy_terms.year_built",
                                "reason": "Values already match",
                                "timestamp": now_iso,
                            })

                    # construction_type
                    rce_construction = extracted.get("construction_type")
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
                                "reason": "Construction type differs between policy and AM RCE",
                                "timestamp": now_iso,
                            })

                    # Apply updates if any
                    if term_updates:
                        term_updates["updated_at"] = now_iso
                        sb.table("policy_terms").update(term_updates).eq(
                            "id", policy_term_id
                        ).execute()

            except Exception as e:
                logger.warning("Failed to write policy term data: %s", e)
                log.append({
                    "action": "error",
                    "target": "policy_terms",
                    "error": str(e)[:200],
                    "timestamp": now_iso,
                })

        return log
