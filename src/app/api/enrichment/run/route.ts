import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { fetchAttomPropertyDetail, ATTOM_SOURCE_NAME, ATTOM_SOURCE_TIER } from '@/lib/attom';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';

/**
 * POST /api/enrichment/run
 *
 * On-demand property enrichment for a specific policy.
 * Runs satellite imagery, geocoding, and fire risk enrichment
 * directly from the Next.js server — no worker needed.
 *
 * Body: { policy_id: string }
 */

const GOOGLE_MAPS_API_KEY = env.GOOGLE_MAPS_API_KEY || '';

// Base URL for internal image proxy (keeps Google API key server-side)
const IMAGE_PROXY_BASE = '/api/enrichment/image-proxy';

const CALFIRE_THREAT_URL =
    'https://egis.fire.ca.gov/arcgis/rest/services/FRAP/FireThreat/MapServer';

const THREAT_LABELS: Record<number, string> = {
    1: 'Very Low',
    2: 'Low',
    3: 'Moderate',
    4: 'High',
    5: 'Very High',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function upsertEnrichment(
    sb: ReturnType<typeof getSupabaseAdmin>,
    payload: {
        policy_id: string;
        field_key: string;
        field_value: string | null;
        source_name: string;
        source_type: string;
        source_tier?: string;
        source_url?: string | null;
        confidence?: string;
        notes?: string | null;
    }
) {
    const now = new Date().toISOString();
    const row = {
        ...payload,
        source_tier: payload.source_tier || 'enriched_ai',
        confidence: payload.confidence || 'medium',
        fetched_at: now,
        updated_at: now,
    };

    const { error } = await sb
        .from('property_enrichments')
        .upsert(row, { onConflict: 'policy_id,field_key,source_name' });

    if (error) {
        logger.error('Enrichment', `upsert failed: ${error.message}`, { field_key: payload.field_key });
    }
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    if (!GOOGLE_MAPS_API_KEY) return null;

    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const results = data.results;
    if (!results || results.length === 0) return null;

    return results[0].geometry.location;
}

// ---------------------------------------------------------------------------
// Enrichment providers
// ---------------------------------------------------------------------------

async function enrichSatelliteImage(
    sb: ReturnType<typeof getSupabaseAdmin>,
    policyId: string,
    address: string
): Promise<boolean> {
    if (!GOOGLE_MAPS_API_KEY) return false;

    // Build the static map URL — this is the direct image URL that browsers load
    const mapUrl =
        `https://maps.googleapis.com/maps/api/staticmap` +
        `?center=${encodeURIComponent(address)}` +
        `&zoom=19&size=640x400&maptype=satellite` +
        `&key=${GOOGLE_MAPS_API_KEY}`;

    // Verify the URL works before storing it
    const res = await fetch(mapUrl, { method: 'HEAD' });
    if (!res.ok) return false;

    // Store the proxy URL (keeps API key server-side)
    await upsertEnrichment(sb, {
        policy_id: policyId,
        field_key: 'property_image',
        field_value: `${IMAGE_PROXY_BASE}?type=satellite&address=${encodeURIComponent(address)}&zoom=19`,
        source_name: 'Google Maps',
        source_type: 'api',
        source_url: `https://maps.google.com/?q=${encodeURIComponent(address)}`,
        confidence: 'high',
        notes: `Satellite view at zoom 19 for address: ${address}`,
    });

    return true;
}

function formatGoogleCaptureDate(dateStr?: string | null): string | null {
    if (!dateStr) return null;
    try {
        const parts = dateStr.split('-');
        if (parts.length === 2) {
            const [year, month] = parts;
            const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
            return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        } else if (parts.length === 3) {
            const [year, month, day] = parts;
            const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
        return dateStr;
    } catch {
        return dateStr;
    }
}

async function enrichStreetViewImage(
    sb: ReturnType<typeof getSupabaseAdmin>,
    policyId: string,
    coords: { lat: number; lng: number }
): Promise<boolean> {
    if (!GOOGLE_MAPS_API_KEY) return false;

    // 1. Check Metadata API to ensure a street view image actually exists here
    const metaUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${coords.lat},${coords.lng}&key=${GOOGLE_MAPS_API_KEY}`;
    
    try {
        const metaRes = await fetch(metaUrl);
        if (!metaRes.ok) return false;
        
        const metaData = await metaRes.json();
        if (metaData.status !== "OK") {
            // No street view image available
            return false;
        }

        // 2. Build the proxy image URL
        const imageUrl = `${IMAGE_PROXY_BASE}?type=streetview&lat=${coords.lat}&lng=${coords.lng}`;
        const captureDateFormatted = formatGoogleCaptureDate(metaData.date);
        
        // 3. Store the URL in enrichments with formatted capture date
        await upsertEnrichment(sb, {
            policy_id: policyId,
            field_key: 'street_view_image',
            field_value: imageUrl,
            source_name: captureDateFormatted ? `Google Street View (Captured: ${captureDateFormatted})` : 'Google Street View',
            source_type: 'api',
            source_url: `https://maps.google.com/?q=${coords.lat},${coords.lng}&layer=c`,
            confidence: 'high',
            notes: `Street View image for coordinates: ${coords.lat}, ${coords.lng}${captureDateFormatted ? ` (Photo Captured: ${captureDateFormatted})` : ''}`,
        });

        // 4. Store dedicated street view capture date
        if (captureDateFormatted) {
            await upsertEnrichment(sb, {
                policy_id: policyId,
                field_key: 'street_view_capture_date',
                field_value: captureDateFormatted,
                source_name: 'Google Street View Metadata',
                source_type: 'api',
                source_url: `https://maps.google.com/?q=${coords.lat},${coords.lng}&layer=c`,
                confidence: 'high',
                notes: `Original photograph date returned by Google Street View vehicle: ${metaData.date}`,
            });
        }
        
        return true;
    } catch (e) {
        logger.error('Enrichment', `Street View Metadata error: ${e}`);
        return false;
    }
}

async function enrichCoordinates(
    sb: ReturnType<typeof getSupabaseAdmin>,
    policyId: string,
    address: string
): Promise<{ lat: number; lng: number } | null> {
    const coords = await geocodeAddress(address);
    if (!coords) return null;

    const sourceUrl = `https://maps.google.com/?q=${encodeURIComponent(address)}`;

    await upsertEnrichment(sb, {
        policy_id: policyId,
        field_key: 'latitude',
        field_value: String(coords.lat),
        source_name: 'Google Geocoding',
        source_type: 'api',
        source_url: sourceUrl,
        confidence: 'high',
        notes: `Geocoded from address: ${address}`,
    });

    await upsertEnrichment(sb, {
        policy_id: policyId,
        field_key: 'longitude',
        field_value: String(coords.lng),
        source_name: 'Google Geocoding',
        source_type: 'api',
        source_url: sourceUrl,
        confidence: 'high',
        notes: `Geocoded from address: ${address}`,
    });

    return coords;
}

async function enrichFireRisk(
    sb: ReturnType<typeof getSupabaseAdmin>,
    policyId: string,
    address: string,
    coords: { lat: number; lng: number }
): Promise<boolean> {
    const delta = 0.001;
    const params = new URLSearchParams({
        geometry: `${coords.lng},${coords.lat}`,
        geometryType: 'esriGeometryPoint',
        sr: '4326',
        layers: 'all:0',
        tolerance: '2',
        mapExtent: `${coords.lng - delta},${coords.lat - delta},${coords.lng + delta},${coords.lat + delta}`,
        imageDisplay: '100,100,96',
        returnGeometry: 'false',
        f: 'json',
    });

    const res = await fetch(`${CALFIRE_THREAT_URL}/identify?${params}`, {
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return false;

    const data = await res.json();
    const results = data.results || [];

    let threatLabel = 'No Data';
    let threatClass: string = 'none';

    if (results.length > 0) {
        const threatValue = results[0]?.attributes?.['Raster.THREAT'];
        if (threatValue != null) {
            const cls = Math.round(Number(threatValue));
            threatClass = String(cls);
            threatLabel = THREAT_LABELS[cls] || `Class ${cls}`;
        }
    }

    await upsertEnrichment(sb, {
        policy_id: policyId,
        field_key: 'fire_risk_class',
        field_value: threatClass,
        source_name: 'CAL FIRE',
        source_type: 'public_data',
        source_url: 'https://osfm.fire.ca.gov/divisions/community-wildfire-preparedness-and-mitigation/fire-hazard-severity-zones/',
        confidence: 'high',
        notes: `Fire Threat: ${threatLabel} at (${coords.lat}, ${coords.lng})`,
    });

    await upsertEnrichment(sb, {
        policy_id: policyId,
        field_key: 'fire_risk_label',
        field_value: threatLabel,
        source_name: 'CAL FIRE',
        source_type: 'public_data',
        source_url: 'https://osfm.fire.ca.gov/divisions/community-wildfire-preparedness-and-mitigation/fire-hazard-severity-zones/',
        confidence: 'high',
        notes: 'CAL FIRE Threat classification (1=Very Low to 5=Very High)',
    });

    return true;
}

async function enrichAssessorData(
    sb: ReturnType<typeof getSupabaseAdmin>,
    policyId: string,
    address: string
): Promise<boolean> {
    // Fetch real property data from ATTOM Data Solutions.
    // If ATTOM_API_KEY is not configured, this returns notConfigured=true and we skip.
    // We NEVER write mock/random data — no data is better than misleading data.
    const result = await fetchAttomPropertyDetail(address);

    if (result.notConfigured) {
        logger.warn('Enrichment', 'ATTOM not configured — assessor enrichment skipped. Set ATTOM_API_KEY to enable.', { policyId });
        return false;
    }

    if (!result.success || !result.data) {
        logger.error('Enrichment', `ATTOM fetch failed for policy ${policyId}: ${result.error}`);
        return false;
    }

    const d = result.data;
    const tier = ATTOM_SOURCE_TIER;
    const source = ATTOM_SOURCE_NAME;

    // Helper: only upsert if the value is non-null/non-zero
    async function upsertIfPresent(field_key: string, value: string | number | boolean | null, notes?: string) {
        if (value === null || value === undefined || value === '') return;
        await upsertEnrichment(sb, {
            policy_id: policyId,
            field_key,
            field_value: String(value),
            source_name: source,
            source_type: 'api',
            source_tier: tier,
            confidence: 'high',
            notes: notes ?? null,
        });
    }

    await upsertIfPresent('living_area_sqft', d.livingAreaSqft, 'ATTOM: building.size.livingSize');
    await upsertIfPresent('year_built', d.yearBuilt, 'ATTOM: building.summary.yearBuilt');
    await upsertIfPresent('stories', d.stories, 'ATTOM: building.summary.storyCount');
    await upsertIfPresent('construction_type', d.constructionType, 'ATTOM: building.construction.frameType');
    await upsertIfPresent('roof_material', d.roofCover, 'ATTOM: building.construction.roofCover');
    await upsertIfPresent('exterior_walls', d.exteriorWalls, 'ATTOM: building.construction.exteriorWalls');
    await upsertIfPresent('garage_type', d.garageType, 'ATTOM: building.parking.garageType');
    await upsertIfPresent('garage_size', d.garageSize, 'ATTOM: building.parking.prkgSize');
    await upsertIfPresent('total_building_area', d.totalBuildingArea, 'ATTOM: building.size.bldgSize');
    await upsertIfPresent('lot_size_sqft', d.lotSizeSqft, 'ATTOM: lot.lotSize2');
    await upsertIfPresent('property_class', d.propertyClass, 'ATTOM: summary.propClass');
    await upsertIfPresent('bedrooms', d.bedrooms, 'ATTOM: building.rooms.bedroomsCount');
    await upsertIfPresent('bathrooms', d.bathrooms, 'ATTOM: building.rooms.bathroomsCount');
    await upsertIfPresent('fireplace_count', d.fireplaceCount, 'ATTOM: building.interior.fplcCount');
    if (d.hasPool !== null) {
        await upsertIfPresent('attom_pool_indicator', d.hasPool ? 'detected' : 'not_detected', 'ATTOM: pool amenity');
    }

    logger.info('Enrichment', `ATTOM enrichment complete for policy ${policyId}`, {
        sqft: d.livingAreaSqft,
        yearBuilt: d.yearBuilt,
        stories: d.stories,
    });

    return true;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
    const auth = await authenticateRequest(request, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    try {
        const body = await request.json();
        const { policy_id } = body;

        if (!policy_id) {
            return NextResponse.json({ error: 'policy_id required' }, { status: 400 });
        }

        const pipelineStart = Date.now();
        const timings: Record<string, number> = {};
        const sb = getSupabaseAdmin();

        // Forward auth headers for internal sub-calls
        const fwdHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        const incomingAuth = request.headers.get('Authorization');
        const incomingKey = request.headers.get('X-Internal-Key');
        if (incomingAuth) fwdHeaders['Authorization'] = incomingAuth;
        if (incomingKey) fwdHeaders['X-Internal-Key'] = incomingKey;

        // 1. Fetch the policy's property address (with fallback to declarations table)
        let resolvedPolicyId = policy_id;
        let address = '';

        const isCarrierHq = (addr: string) => /725\s*s(\.|\s)*figueroa|p(\.|\s)*o(\.|\s)*box\s*76924|p\.?o\.?\s*box/i.test(addr);

        const { data: directPolicy } = await sb
            .from('policies')
            .select('id, property_address_raw, property_address_norm')
            .eq('id', policy_id)
            .maybeSingle();

        if (directPolicy) {
            resolvedPolicyId = directPolicy.id;
            const raw = directPolicy.property_address_raw || '';
            const norm = directPolicy.property_address_norm || '';

            if (raw && !isCarrierHq(raw)) {
                address = raw;
            } else if (norm && !isCarrierHq(norm)) {
                address = norm;
            } else {
                address = raw || norm;
            }
        }

        // If no direct policy address, check declarations linked to this policy or where id = policy_id
        if (!address || isCarrierHq(address)) {
            const { data: dec } = await sb
                .from('declarations')
                .select('id, policy_id, property_location')
                .or(`id.eq.${policy_id},policy_id.eq.${policy_id}`)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (dec) {
                if (dec.policy_id) resolvedPolicyId = dec.policy_id;
                if (dec.property_location && !isCarrierHq(dec.property_location)) {
                    address = dec.property_location;
                }
            }
        }

        // If still no address, check policy_terms
        if (!address || isCarrierHq(address)) {
            const { data: term } = await sb
                .from('policy_terms')
                .select('policy_id, property_address')
                .eq('policy_id', resolvedPolicyId)
                .limit(1)
                .maybeSingle();

            if (term?.property_address && !isCarrierHq(term.property_address)) {
                address = term.property_address;
            }
        }

        if (!address) {
            return NextResponse.json({
                error: 'No property address found for this policy — cannot fetch property data',
                results: { satellite_image: false, coordinates: false, fire_risk: false },
            }, { status: 422 });
        }

        // Use resolvedPolicyId for all enrichment storage and calls
        const targetPolicyId = resolvedPolicyId;

        const results: Record<string, boolean | string> = {
            satellite_image: false,
            street_view_image: false,
            coordinates: false,
            fire_risk: false,
            vision_analysis: false,
            street_vision_analysis: false,
            assessor_data: false,
            address_used: address,
        };

        // 2. Satellite image
        let t0 = Date.now();
        try {
            results.satellite_image = await enrichSatelliteImage(sb, targetPolicyId, address);
        } catch (e) {
            logger.error('Enrichment', `Satellite error: ${e}`);
        }
        timings.satellite_ms = Date.now() - t0;

        // 2.5 Assessor Data (ATTOM)
        t0 = Date.now();
        try {
            results.assessor_data = await enrichAssessorData(sb, targetPolicyId, address);
        } catch (e) {
            logger.error('Enrichment', `Assessor Data error: ${e}`);
        }
        timings.assessor_ms = Date.now() - t0;

        // 3. Geocode → coordinates
        t0 = Date.now();
        let coords: { lat: number; lng: number } | null = null;
        try {
            coords = await enrichCoordinates(sb, targetPolicyId, address);
            results.coordinates = coords !== null;
        } catch (e) {
            logger.error('Enrichment', `Geocoding error: ${e}`);
        }
        timings.geocode_ms = Date.now() - t0;

        // 4. Fire risk & Street View (needs coordinates)
        if (coords) {
            t0 = Date.now();
            try {
                results.fire_risk = await enrichFireRisk(sb, targetPolicyId, address, coords);
            } catch (e) {
                logger.error('Enrichment', `Fire risk error: ${e}`);
            }
            timings.fire_risk_ms = Date.now() - t0;

            t0 = Date.now();
            try {
                results.street_view_image = await enrichStreetViewImage(sb, targetPolicyId, coords);
            } catch (e) {
                logger.error('Enrichment', `Street View error: ${e}`);
            }
            timings.street_view_ms = Date.now() - t0;
        }

        // 5. AI Vision Analysis (needs satellite image)
        if (results.satellite_image) {
            t0 = Date.now();
            try {
                const origin = env.APP_BASE_URL;
                const visionRes = await fetch(`${origin}/api/enrichment/vision-analyze`, {
                    method: 'POST',
                    headers: fwdHeaders,
                    body: JSON.stringify({ policy_id: targetPolicyId }),
                });
                if (visionRes.ok) {
                    const visionData = await visionRes.json();
                    results.vision_analysis = visionData.results?.analyzed ?? false;
                } else {
                    logger.error('Enrichment', `Vision analysis HTTP error: ${visionRes.status}`);
                }
            } catch (e) {
                logger.error('Enrichment', `Vision analysis error: ${e}`);
            }
            timings.vision_ai_ms = Date.now() - t0;
        }

        // 6. AI Street Vision Analysis (needs street view image)
        if (results.street_view_image) {
            t0 = Date.now();
            try {
                const origin = env.APP_BASE_URL;
                const streetVisionRes = await fetch(`${origin}/api/enrichment/street-vision-analyze`, {
                    method: 'POST',
                    headers: fwdHeaders,
                    body: JSON.stringify({ policy_id: targetPolicyId }),
                });
                if (streetVisionRes.ok) {
                    const streetVisionData = await streetVisionRes.json();
                    results.street_vision_analysis = streetVisionData.results?.analyzed ?? false;
                } else {
                    logger.error('Enrichment', `Street Vision analysis HTTP error: ${streetVisionRes.status}`);
                }
            } catch (e) {
                logger.error('Enrichment', `Street Vision analysis error: ${e}`);
            }
            timings.street_vision_ai_ms = Date.now() - t0;
        }

        // 7. Auto-generate report after enrichment
        t0 = Date.now();
        let reportGenerated = false;
        try {
            const origin = env.APP_BASE_URL;
            const reportRes = await fetch(`${origin}/api/reports/generate`, {
                method: 'POST',
                headers: fwdHeaders,
                body: JSON.stringify({ policyId: targetPolicyId }),
            });
            if (reportRes.ok) {
                reportGenerated = true;
            } else {
                logger.error('Enrichment', `Report generation HTTP error: ${reportRes.status}`);
            }
        } catch (e) {
            logger.error('Enrichment', `Report generation error: ${e}`);
        }
        results.report_generated = reportGenerated;
        timings.report_ms = Date.now() - t0;

        timings.total_ms = Date.now() - pipelineStart;

        // Log per-step timing summary
        logger.info('Enrichment', `Pipeline timings for policy ${targetPolicyId}: ${JSON.stringify(timings)}`);

        // 8. Activity event: enrichment complete
        try {
            await sb.from('activity_events').insert({
                event_type: 'enrichment.completed',
                title: 'Property data enriched',
                detail: `Satellite: ${results.satellite_image ? '✓' : '✗'}, Street View: ${results.street_view_image ? '✓' : '✗'}, Fire Risk: ${results.fire_risk ? '✓' : '✗'}, AI Vision: ${results.vision_analysis ? '✓' : '✗'}, Report: ${reportGenerated ? '✓' : '✗'}`,
                policy_id: targetPolicyId,
                meta: { results, timings },
            });
        } catch (e) {
            logger.warn('Enrichment', `Activity event insert failed (non-fatal): ${e}`);
        }

        return NextResponse.json({
            message: 'Enrichment complete',
            results,
            timings,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('Enrichment', `Unexpected error: ${msg}`);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

