// src/lib/rce/InterimEstimator.ts

export interface EnrichmentRecord {
    policy_id: string;
    field_key: string;
    field_value: string | null;
    confidence?: string;
}

export interface PolicyRecord {
    id: string;
    property_address_raw?: string | null;
}

export interface NormalizedPropertyInput {
    // Structural
    livingAreaSqft: number | null;
    yearBuilt: number | null;
    stories: number | null;
    roofMaterial: string | null;
    propertyType: 'single_family' | 'condo' | 'mobile' | 'unknown';
    
    // Geography
    zipCode: string | null;
    
    // Risk & Quality proxies
    slopeRisk: boolean; // Derived from wildfire/location
    highEndFinishProxy: boolean; // E.g., indicated by massive sqft > 4000 or custom flag
}

export interface EstimationResult {
    rangeMin: number;
    rangeMax: number;
    confidence: 'High' | 'Medium' | 'Low';
    usedInputs: Record<string, string | number | boolean>;
    missingInputs: string[];
    baseCostPerSqft: number;
    appliedMultipliers: {
        cause: string;
        factor: number;
        explanation: string;
        source: string;
    }[];
    exceedsFairPlanMax: boolean;
}

// Map specific zip codes to base regional costs. 
// A real system would use a full zipcode boundary DB.
function getRegionalBaseCost(zipCode: string | null): number {
    if (!zipCode) return 300; // California minimum base

    // High cost areas (Bay Area, LA coastal, etc)
    const bayAreaZips = ['941', '940', '943', '949', '950'];
    const laCoastalZips = ['902', '904', '900'];
    
    if (bayAreaZips.some(prefix => zipCode.startsWith(prefix))) return 450;
    if (laCoastalZips.some(prefix => zipCode.startsWith(prefix))) return 400;
    
    // Standard CA base
    return 350;
}

/**
 * Extracts raw enrichment rows and parser data into a Normalized Input structure.
 */
export function normalizeInputs(policy: PolicyRecord, enrichments: EnrichmentRecord[]): NormalizedPropertyInput {
    // Helper to find highest-confidence enrichment for a key
    const getValue = (key: string): string | null => {
        const matches = enrichments.filter(e => e.field_key === key && e.field_value);
        if (matches.length === 0) return null;
        // Prioritize 'high' confidence, fall back to whatever is first
        const highConf = matches.find(m => m.confidence === 'high');
        return highConf ? highConf.field_value : matches[0].field_value;
    };

    const sqftStr = getValue('living_area_sqft');
    const yearStr = getValue('year_built');
    const storiesStr = getValue('stories');
    
    // Parse zip from policy address
    const zipMatch = policy.property_address_raw?.match(/\b9\d{4}\b/);
    const zipCode = zipMatch ? zipMatch[0] : null;

    // Check for hillside/slope flags (e.g. from wildfire risk enrichment)
    const wildfireZone = getValue('wildfire_hazard_zone');
    const slopeRisk = wildfireZone === 'Very High' || wildfireZone === 'High' || getValue('slope_factor') === 'severe';

    const sqft = sqftStr ? parseInt(sqftStr, 10) : null;
    const highEndFinishProxy = sqft ? sqft > 3500 : false;

    return {
        livingAreaSqft: sqft,
        yearBuilt: yearStr ? parseInt(yearStr, 10) : null,
        stories: storiesStr ? parseInt(storiesStr, 10) : null,
        roofMaterial: getValue('roof_material'),
        propertyType: (getValue('property_type') as any) || 'unknown',
        zipCode,
        slopeRisk,
        highEndFinishProxy
    };
}

/**
 * Calculates the California Interim Replacement Cost Estimate.
 */
export function calculateEstimate(input: NormalizedPropertyInput): EstimationResult | null {
    // RCE requires square footage at a bare minimum
    if (!input.livingAreaSqft || input.livingAreaSqft <= 0) {
        return null; // Cannot calculate at all
    }

    const missingInputs: string[] = [];
    const usedInputs: Record<string, string | number | boolean> = {
        'Square Footage': input.livingAreaSqft
    };

    let baseCost = getRegionalBaseCost(input.zipCode);
    if (input.zipCode) usedInputs['Region (Zip)'] = input.zipCode;

    // Adjustments
    const multipliers: { cause: string; factor: number; explanation: string; source: string }[] = [];
    
    // 1. Age (Pre-1990 CA homes heavily require code upgrades on rebuild)
    if (input.yearBuilt) {
        usedInputs['Year Built'] = input.yearBuilt;
        if (input.yearBuilt < 1990) {
            multipliers.push({ 
                cause: 'Code Upgrade Factor (Pre-1990)', 
                factor: 1.15,
                explanation: 'Homes built prior to 1990 in California require significant mandatory structural and electrical code upgrades during a full rebuild, increasing costs by ~15%.',
                source: 'CA Department of Insurance / Marshall & Swift Baselines'
            });
        }
    } else {
        missingInputs.push('Year Built');
    }

    // 2. Slope / Hillside
    if (input.slopeRisk) {
        usedInputs['Hillside / Slope Risk'] = true;
        multipliers.push({ 
            cause: 'Hillside Foundation / Access', 
            factor: 1.25,
            explanation: 'Properties located in high-wildfire risk or severe slope areas carry a ~25% premium for complex foundation engineering, retaining walls, and difficult construction access.',
            source: 'Topographical Analysis & Regional Fire Zones'
        });
    }

    // 3. Quality & Finishes
    if (input.highEndFinishProxy) {
        usedInputs['High-End Finishes'] = 'Assumed based on footprint';
        multipliers.push({ 
            cause: 'Custom / Premium Finishes', 
            factor: 1.20,
            explanation: 'Properties with over 3,500 sq.ft. typically indicate high-end custom finishes, specialty materials, and premium labor costs.',
            source: 'Internal Footprint Proxy'
        });
    }

    // 4. Roof type
    if (input.roofMaterial) {
        usedInputs['Roof Material'] = input.roofMaterial;
        if (input.roofMaterial.toLowerCase().includes('tile') || input.roofMaterial.toLowerCase().includes('slate')) {
            multipliers.push({ 
                cause: 'Heavy Roof (Tile/Slate)', 
                factor: 1.05,
                explanation: 'Tile or slate roofs are heavier, requiring reinforced structural trussing as well as higher material costs vs standard asphalt shingle.',
                source: 'Structural Property Data (ATTOM / Estated)'
            });
        }
    } else {
        missingInputs.push('Roof Material');
    }

    // 5. Structure height
    if (input.stories) {
        usedInputs['Stories'] = input.stories;
        if (input.stories > 1) {
            multipliers.push({ 
                cause: 'Multi-Story Complexity', 
                factor: 1.08,
                explanation: 'Multi-story structures require extensive scaffolding, crane operation, and a longer build timeline, increasing the overall cost.',
                source: 'Structural Property Data (ATTOM / Estated)'
            });
        }
    } else {
        missingInputs.push('Stories');
    }

    // Compute multiplier
    let totalMultiplier = 1.0;
    multipliers.forEach(m => totalMultiplier *= m.factor);

    // Confidence determination
    let confidence: 'High' | 'Medium' | 'Low' = 'High';
    if (missingInputs.length > 2 || !input.yearBuilt) {
        confidence = 'Low';
    } else if (missingInputs.length > 0) {
        confidence = 'Medium';
    }

    // Final Math
    const exactCost = input.livingAreaSqft * baseCost * totalMultiplier;
    
    // Apply a bound range around the exact cost based on confidence
    // Low confidence yields a wider band to indicate uncertainty
    const varianceBand = confidence === 'High' ? 0.08 : (confidence === 'Medium' ? 0.15 : 0.25);
    
    // Round to nearest 5000 for realistic looking estimates
    const roundTo = 5000;
    const rangeMin = Math.floor((exactCost * (1 - varianceBand)) / roundTo) * roundTo;
    const rangeMax = Math.ceil((exactCost * (1 + varianceBand)) / roundTo) * roundTo;

    // California FAIR plan statutory maximum is currently $3,000,000 
    // for all combined residential coverages (usually dominated by Dwelling limit A).
    const exceedsFairPlanMax = rangeMax > 3000000;

    return {
        rangeMin,
        rangeMax,
        confidence,
        missingInputs,
        usedInputs,
        baseCostPerSqft: baseCost,
        appliedMultipliers: multipliers,
        exceedsFairPlanMax
    };
}
