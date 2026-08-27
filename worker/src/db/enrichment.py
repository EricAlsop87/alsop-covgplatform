"""
Property Enrichment Module — fetches external data for policies.

After a dec page is parsed and lifecycle entities are created, this module
enriches the policy with external property data (images, public records, etc.).

Architecture:
  - enrich_property() is the orchestrator, called from main.py after flags
  - Individual provider functions (_enrich_*) handle specific data sources
  - All results stored via upsert_enrichment() with full source attribution
  - Failures are non-fatal — logged but never block ingestion

Adding a new provider:
  1. Write an _enrich_* function
  2. Call it from enrich_property()
  3. Done — it will store results with source tracking automatically
"""

import logging
import os
import urllib.parse
from datetime import datetime, timezone

import httpx

from ..supabase_client import get_supabase

logger = logging.getLogger("worker.db.enrichment")


# ---------------------------------------------------------------------------
# Environment / Config
# ---------------------------------------------------------------------------

GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")

# USDA Wildfire Hazard Potential ArcGIS REST MapServer (free, no API key needed)
USDA_WHP_URL = (
    "https://apps.fs.usda.gov/arcx/rest/services/RDW_Wildfire/"
    "RMRS_WildfireHazardPotential_2023/MapServer"
)

# Wildfire hazard potential class labels
WHP_LABELS = {
    1: "Very Low",
    2: "Low",
    3: "Moderate",
    4: "High",
    5: "Very High",
}


# ---------------------------------------------------------------------------
# Generic enrichment upsert
# ---------------------------------------------------------------------------

def upsert_enrichment(
    *,
    policy_id: str,
    field_key: str,
    field_value: str | None,
    source_name: str,
    source_type: str,
    source_url: str | None = None,
    confidence: str = "medium",
    notes: str | None = None,
) -> str | None:
    """
    Insert or update a property enrichment row.

    Uses the unique constraint (policy_id, field_key, source_name) to upsert.
    Returns the enrichment row id, or None on failure.
    """
    sb = get_supabase()
    now = datetime.now(timezone.utc).isoformat()

    payload = {
        "policy_id": policy_id,
        "field_key": field_key,
        "field_value": field_value,
        "source_name": source_name,
        "source_type": source_type,
        "source_url": source_url,
        "confidence": confidence,
        "notes": notes,
        "fetched_at": now,
        "updated_at": now,
    }

    try:
        res = (
            sb.table("property_enrichments")
            .upsert(payload, on_conflict="policy_id,field_key,source_name")
            .execute()
        )
        if res.data:
            row_id = res.data[0].get("id")
            logger.info(
                "Upserted enrichment: policy=%s field=%s source=%s",
                policy_id, field_key, source_name,
            )
            return row_id
    except Exception as e:
        logger.error(
            "Failed to upsert enrichment: policy=%s field=%s error=%s",
            policy_id, field_key, e,
        )
    return None


# ---------------------------------------------------------------------------
# Helper: Google Geocoding (address → lat/lng)
# ---------------------------------------------------------------------------

def _geocode_address(address: str) -> tuple[float, float] | None:
    """
    Use Google Geocoding API to convert an address to lat/lng coordinates.
    Returns (lat, lng) or None on failure.
    """
    if not GOOGLE_MAPS_API_KEY:
        return None

    url = (
        f"https://maps.googleapis.com/maps/api/geocode/json"
        f"?address={urllib.parse.quote(address)}"
        f"&key={GOOGLE_MAPS_API_KEY}"
    )

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url)

        if response.status_code != 200:
            logger.warning("Geocoding API returned %d", response.status_code)
            return None

        data = response.json()
        results = data.get("results", [])
        if not results:
            logger.warning("Geocoding returned no results for: %s", address)
            return None

        location = results[0]["geometry"]["location"]
        lat = location["lat"]
        lng = location["lng"]
        logger.info("Geocoded address to (%s, %s): %s", lat, lng, address)
        return (lat, lng)

    except Exception as e:
        logger.warning("Geocoding failed: %s", e)
        return None


# ---------------------------------------------------------------------------
# Provider 1: Google Maps Static API — satellite imagery
# ---------------------------------------------------------------------------

def _build_static_map_url(address: str) -> str:
    """Build a Google Maps Static API URL for a satellite view of the address."""
    encoded = urllib.parse.quote(address)
    return (
        f"https://maps.googleapis.com/maps/api/staticmap"
        f"?center={encoded}"
        f"&zoom=19"
        f"&size=640x400"
        f"&maptype=satellite"
        f"&key={GOOGLE_MAPS_API_KEY}"
    )


def _enrich_satellite_image(policy_id: str, address: str) -> bool:
    """
    Fetch a satellite image from Google Maps and store it in Supabase Storage.
    Returns True if successful, False otherwise.
    """
    if not GOOGLE_MAPS_API_KEY:
        logger.warning("GOOGLE_MAPS_API_KEY not set, skipping satellite image enrichment")
        return False

    api_url = _build_static_map_url(address)
    logger.info("Fetching satellite image for policy=%s address=%s", policy_id, address)

    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.get(api_url)

        if response.status_code != 200:
            logger.warning(
                "Google Maps API returned %d for policy=%s",
                response.status_code, policy_id,
            )
            return False

        image_bytes = response.content

        if len(image_bytes) < 5000:
            logger.warning(
                "Image suspiciously small (%d bytes) for policy=%s — may be error tile",
                len(image_bytes), policy_id,
            )

        sb = get_supabase()
        storage_path = f"property-images/{policy_id}.jpg"

        sb.storage.from_("cfp-raw-decpage").upload(
            storage_path,
            image_bytes,
            file_options={"content-type": "image/jpeg", "upsert": "true"},
        )

        public_url_res = sb.storage.from_("cfp-raw-decpage").get_public_url(storage_path)
        public_url = public_url_res if isinstance(public_url_res, str) else str(public_url_res)

        logger.info("Uploaded satellite image for policy=%s: %s", policy_id, public_url)

        upsert_enrichment(
            policy_id=policy_id,
            field_key="property_image",
            field_value=public_url,
            source_name="Google Maps",
            source_type="api",
            source_url=f"https://maps.google.com/?q={urllib.parse.quote(address)}",
            confidence="high",
            notes=f"Satellite view at zoom 19 for address: {address}",
        )

        return True

    except Exception as e:
        logger.error("Satellite image enrichment failed for policy=%s: %s", policy_id, e)
        return False


# ---------------------------------------------------------------------------
# Provider 2: USDA Wildfire Hazard Potential (free, no key needed)
# ---------------------------------------------------------------------------

def _enrich_fire_risk(policy_id: str, address: str, coords: tuple[float, float] | None = None) -> bool:
    """
    Query the USDA Wildfire Hazard Potential MapServer for fire risk at the
    property's coordinates. Uses the ArcGIS REST 'identify' operation.

    Returns True if successful, False otherwise.
    """
    # Get coordinates (either passed in or geocode)
    if not coords:
        coords = _geocode_address(address)
    if not coords:
        logger.warning("Cannot enrich fire risk without coordinates for policy=%s", policy_id)
        return False

    lat, lng = coords

    # Build the ArcGIS identify request
    # We need a small bounding box around the point for the identify call
    delta = 0.001  # ~100m
    params = {
        "geometry": f"{lng},{lat}",
        "geometryType": "esriGeometryPoint",
        "sr": "4326",
        "layers": "all",
        "tolerance": "2",
        "mapExtent": f"{lng - delta},{lat - delta},{lng + delta},{lat + delta}",
        "imageDisplay": "100,100,96",
        "returnGeometry": "false",
        "f": "json",
    }

    identify_url = f"{USDA_WHP_URL}/identify"
    logger.info("Querying USDA fire risk for policy=%s coords=(%s,%s)", policy_id, lat, lng)

    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.get(identify_url, params=params)

        if response.status_code != 200:
            logger.warning("USDA WHP API returned %d for policy=%s", response.status_code, policy_id)
            return False

        data = response.json()
        results = data.get("results", [])

        if not results:
            logger.info("No USDA fire risk data at coords (%s,%s) for policy=%s", lat, lng, policy_id)
            # Still useful to record: property has no wildfire risk data
            upsert_enrichment(
                policy_id=policy_id,
                field_key="fire_risk_class",
                field_value="No Data",
                source_name="USDA Forest Service",
                source_type="public_data",
                source_url="https://wildfirerisk.org",
                confidence="medium",
                notes=f"No wildfire hazard potential data at ({lat}, {lng}). May be non-wildland area.",
            )
            return True

        # Parse the first result — pixel value maps to hazard class
        first = results[0]
        pixel_value = first.get("attributes", {}).get("Pixel Value")
        whp_class = None
        whp_label = "Unknown"

        if pixel_value is not None:
            try:
                whp_class = int(float(pixel_value))
                whp_label = WHP_LABELS.get(whp_class, f"Class {whp_class}")
            except (ValueError, TypeError):
                whp_label = f"Raw: {pixel_value}"

        logger.info(
            "Fire risk for policy=%s: class=%s label=%s",
            policy_id, whp_class, whp_label,
        )

        # Store fire risk class
        upsert_enrichment(
            policy_id=policy_id,
            field_key="fire_risk_class",
            field_value=str(whp_class) if whp_class else str(pixel_value),
            source_name="USDA Forest Service",
            source_type="public_data",
            source_url="https://wildfirerisk.org",
            confidence="high",
            notes=f"Wildfire Hazard Potential: {whp_label} at ({lat}, {lng})",
        )

        # Store human-readable label too
        upsert_enrichment(
            policy_id=policy_id,
            field_key="fire_risk_label",
            field_value=whp_label,
            source_name="USDA Forest Service",
            source_type="public_data",
            source_url="https://wildfirerisk.org",
            confidence="high",
            notes=f"Wildfire Hazard Potential classification (1=Very Low to 5=Very High)",
        )

        return True

    except Exception as e:
        logger.error("Fire risk enrichment failed for policy=%s: %s", policy_id, e)
        return False


# ---------------------------------------------------------------------------
# Provider 3: Google Geocoding — store coordinates as enrichment
# ---------------------------------------------------------------------------

def _enrich_coordinates(policy_id: str, address: str) -> tuple[float, float] | None:
    """
    Geocode the property address and store lat/lng as enrichment.
    Returns (lat, lng) for downstream use, or None on failure.
    """
    coords = _geocode_address(address)
    if not coords:
        return None

    lat, lng = coords

    upsert_enrichment(
        policy_id=policy_id,
        field_key="latitude",
        field_value=str(lat),
        source_name="Google Geocoding",
        source_type="api",
        source_url=f"https://maps.google.com/?q={urllib.parse.quote(address)}",
        confidence="high",
        notes=f"Geocoded from address: {address}",
    )

    upsert_enrichment(
        policy_id=policy_id,
        field_key="longitude",
        field_value=str(lng),
        source_name="Google Geocoding",
        source_type="api",
        source_url=f"https://maps.google.com/?q={urllib.parse.quote(address)}",
        confidence="high",
        notes=f"Geocoded from address: {address}",
    )

    return coords


# ---------------------------------------------------------------------------
# Orchestrator — called from main.py
# ---------------------------------------------------------------------------

def enrich_property(policy_id: str, property_address: str | None) -> dict:
    """
    Run all enrichment providers for a policy.

    Called non-blocking after flag evaluation. Failures are logged
    but never raise — the ingestion job should still complete.

    Returns a summary dict of what succeeded.
    """
    summary = {
        "satellite_image": False,
        "coordinates": False,
        "fire_risk": False,
    }

    if not property_address or not property_address.strip():
        logger.info("No property address for policy=%s, skipping enrichment", policy_id)
        return summary

    address = property_address.strip()

    # --- Provider 1: Satellite imagery ---
    try:
        summary["satellite_image"] = _enrich_satellite_image(policy_id, address)
    except Exception as e:
        logger.warning("Satellite image enrichment error (non-fatal): %s", e)

    # --- Provider 2: Geocode address → store coordinates ---
    coords = None
    try:
        coords = _enrich_coordinates(policy_id, address)
        summary["coordinates"] = coords is not None
    except Exception as e:
        logger.warning("Geocoding enrichment error (non-fatal): %s", e)

    # --- Provider 3: USDA Wildfire Hazard Potential ---
    try:
        summary["fire_risk"] = _enrich_fire_risk(policy_id, address, coords=coords)
    except Exception as e:
        logger.warning("Fire risk enrichment error (non-fatal): %s", e)

    # --- Future providers go here ---
    # Provider 4: Property basics (year_built, sqft, stories) via RentCast/Estated
    # Requires PROPERTY_DATA_API_KEY in .env — scaffold ready, add when key is available

    logger.info("Enrichment complete for policy=%s: %s", policy_id, summary)
    return summary
