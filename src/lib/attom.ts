import { logger } from '@/lib/logger';

/**
 * ATTOM Data Solutions — Property Enrichment Client
 *
 * ATTOM is used as the primary source for baseline property facts:
 * square footage, year built, stories, construction type, roof material, etc.
 *
 * These fields feed into:
 * - Replacement Cost Estimation (RCE)
 * - Underinsurance flag (SEVERE_UNDERINSURANCE_ESTIMATE)
 * - Other Structures analysis
 * - Report data payload / confidence scoring
 *
 * API Docs: https://api.gateway.attomdata.com
 *
 * Set ATTOM_API_KEY in .env.local to enable. If the key is absent,
 * enrichment is skipped gracefully — no mock data is written.
 */

const ATTOM_API_BASE = 'https://api.gateway.attomdata.com/propertyapi/v1.0.0';
import { env } from '@/lib/env';
const ATTOM_API_KEY = env.ATTOM_API_KEY || '';

/** Any field produced by ATTOM should use this source tier. */
export const ATTOM_SOURCE_TIER = 'enriched_real' as const;
export const ATTOM_SOURCE_NAME = 'ATTOM Data Solutions' as const;

export interface AttomPropertyDetail {
    /** Living area (sq ft). Maps to ATTOM: building.size.livingSize */
    livingAreaSqft: number | null;
    /** Year structure was built. Maps to ATTOM: building.summary.yearBuilt */
    yearBuilt: number | null;
    /** Number of stories. Maps to ATTOM: building.summary.storyCount */
    stories: number | null;
    /** Construction frame type. Maps to ATTOM: building.construction.frameType */
    constructionType: string | null;
    /** Roof cover material. Maps to ATTOM: building.construction.roofCover */
    roofCover: string | null;
    /** Exterior walls. Maps to ATTOM: building.construction.exteriorWalls */
    exteriorWalls: string | null;
    /** Garage type. Maps to ATTOM: building.parking.garageType */
    garageType: string | null;
    /** Garage capacity (cars). Maps to ATTOM: building.parking.prkgSize */
    garageSize: number | null;
    /** Total building sq ft. Maps to ATTOM: building.size.bldgSize */
    totalBuildingArea: number | null;
    /** Lot size (sq ft). Maps to ATTOM: lot.lotSize2 */
    lotSizeSqft: number | null;
    /** Property use. Maps to ATTOM: summary.propClass */
    propertyClass: string | null;
    /** Pool indicator. Maps to ATTOM: building.interior.bsmtType or amenities */
    hasPool: boolean | null;
    /** Fireplace count. Maps to ATTOM: building.interior.fplcType */
    fireplaceCount: number | null;
    /** Number of bedrooms. */
    bedrooms: number | null;
    /** Number of bathrooms. */
    bathrooms: number | null;
}

export interface AttomFetchResult {
    success: boolean;
    data?: AttomPropertyDetail;
    rawResponse?: Record<string, unknown>;
    error?: string;
    /** True if ATTOM_API_KEY is not configured — not an error, just not integrated yet. */
    notConfigured?: boolean;
}

/**
 * Fetch baseline property detail from ATTOM by address.
 *
 * Splits address into address1 (street) and address2 (city/state/zip).
 * ATTOM requires them separately for best match quality.
 */
export async function fetchAttomPropertyDetail(
    fullAddress: string
): Promise<AttomFetchResult> {
    if (!ATTOM_API_KEY) {
        return {
            success: false,
            notConfigured: true,
            error: 'ATTOM_API_KEY not set — property data enrichment skipped.',
        };
    }

    // Split address into address1 (street) and address2 (city, state zip).
    // Dec pages often store addresses without commas, e.g.:
    //   "721 SANTA CLARA CIR HEMET CA 92543"
    // ATTOM requires these as separate params for reliable matching.
    const parts = fullAddress.split(',').map(p => p.trim());
    let address1 = fullAddress;
    let address2 = '';

    if (parts.length >= 3) {
        // "123 Main St, Los Angeles, CA 90001"
        address1 = parts[0];
        address2 = parts.slice(1).join(', ');
    } else if (parts.length === 2) {
        // "123 Main St, Los Angeles CA 90001"
        address1 = parts[0];
        address2 = parts[1];
    } else {
        // No commas — try to detect city/state/zip by matching
        // the 2-letter state abbreviation + optional zip at the end.
        // Pattern: "...STREET_NAME CITY ST 12345" or "...STREET_NAME CITY ST 12345-6789"
        const stateZipMatch = fullAddress.match(
            /^(.+?)\s+([\w\s]+?)\s+(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\s+(\d{5}(?:-\d{4})?)$/i
        );
        if (stateZipMatch) {
            // Groups: [full, street, city, state, zip]
            // The tricky part: "street" may bleed into "city" since there's no delimiter.
            // Strategy: use common street suffixes to find the split point.
            const raw = stateZipMatch[0];
            const state = stateZipMatch[3];
            const zip = stateZipMatch[4];

            // Find the last street-type word to determine where the street name ends
            const streetSuffixes = /\b(ST|AVE|AVENUE|BLVD|DR|DRIVE|RD|ROAD|CT|CIR|CIRCLE|LN|LANE|WAY|PL|PLACE|TER|TERRACE|PKWY|HWY|LOOP|TRL|TRAIL)\b/gi;
            let lastSuffixIdx = -1;
            let match;
            while ((match = streetSuffixes.exec(fullAddress)) !== null) {
                // Only consider suffixes before the state abbreviation
                const statePos = fullAddress.toUpperCase().lastIndexOf(` ${state.toUpperCase()} `);
                if (match.index < statePos) {
                    lastSuffixIdx = match.index + match[0].length;
                }
            }

            if (lastSuffixIdx > 0) {
                address1 = fullAddress.substring(0, lastSuffixIdx).trim();
                // Everything between street and state+zip is the city
                const statePos = fullAddress.toUpperCase().lastIndexOf(` ${state.toUpperCase()} ${zip}`);
                address2 = fullAddress.substring(lastSuffixIdx, statePos).trim() + `, ${state} ${zip}`;
            } else {
                // Fallback: send the whole thing as address1, state+zip as address2
                address2 = `${state} ${zip}`;
            }
        }
    }

    const url = new URL(`${ATTOM_API_BASE}/property/detail`);
    url.searchParams.set('address1', address1);
    if (address2) url.searchParams.set('address2', address2);

    // Diagnostic: log the parsed address for debugging
    logger.info('attom', `[ATTOM] Parsed address: address1="${address1}", address2="${address2}" (from: "${fullAddress}")`);

    let rawResponse: Record<string, unknown> = {};

    try {
        const res = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'apikey': ATTOM_API_KEY,
                'accept': 'application/json',
            },
            signal: AbortSignal.timeout(12000),
        });

        if (!res.ok) {
            if (res.status === 401) {
                return {
                    success: false,
                    notConfigured: true,
                    error: 'ATTOM API key is expired or unauthorized — skipping assessor data.',
                };
            }
            const errText = await res.text();
            return {
                success: false,
                error: `ATTOM API error: ${res.status} — ${errText.slice(0, 200)}`,
            };
        }

        rawResponse = await res.json();

        // ATTOM wraps data in property[0].building, property[0].lot, etc.
        const property = (rawResponse as any)?.property?.[0];
        if (!property) {
            return {
                success: false,
                error: 'ATTOM returned no matching property.',
                rawResponse,
            };
        }

        const building = property.building || {};
        const lot = property.lot || {};
        const summary = property.summary || {};

        const detail: AttomPropertyDetail = {
            livingAreaSqft: building.size?.livingSize ?? null,
            yearBuilt: building.summary?.yearBuilt ?? null,
            stories: building.summary?.storyCount ?? null,
            constructionType: building.construction?.frameType ?? null,
            roofCover: building.construction?.roofCover ?? null,
            exteriorWalls: building.construction?.exteriorWalls ?? null,
            garageType: building.parking?.garageType ?? null,
            garageSize: building.parking?.prkgSize ?? null,
            totalBuildingArea: building.size?.bldgSize ?? null,
            lotSizeSqft: lot.lotSize2 ?? null,
            propertyClass: summary.propClass ?? null,
            hasPool: building.rooms?.pool === 'Y' || building.interior?.pool === 'Y' || null,
            fireplaceCount: building.interior?.fplcCount ?? null,
            bedrooms: building.rooms?.bedroomsCount ?? null,
            bathrooms: building.rooms?.bathroomsCount ?? null,
        };

        return { success: true, data: detail, rawResponse };

    } catch (err) {
        return {
            success: false,
            error: `ATTOM fetch failed: ${err instanceof Error ? err.message : String(err)}`,
            rawResponse,
        };
    }
}
