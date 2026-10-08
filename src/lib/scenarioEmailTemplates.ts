/**
 * Scenario Email Templates & Smart Generator
 *
 * Implements approved templates from:
 * 1. Google Doc: "For Approval - Email Template" (Scenarios 1-5)
 * 2. Agency Standards: Eric Alsop's RCE disclaimer/call-to-action & Misty Torrez's Replacement Policy template.
 */

export interface PolicyScenarioData {
    clientName?: string;
    propertyAddress?: string;
    policyNumber?: string;
    currentDwellingLimit?: number | string | null;
    rceValuationAmount?: number | string | null;
    rceCarrier?: string;
    otherStructureTypes?: string[]; // e.g. ['Detached Garage', 'Shed', 'Deck', 'Fence', 'Barn', 'Workshop', 'Pool']
    otherStructureCoverage?: number | string | null;
    propertyFeatures?: string[]; // e.g. ['Wood-Burning Stove', 'Solar Panels', 'Propane Tank']
    carrierName?: string; // e.g. 'Bamboo', 'Aegis', 'Pacific Specialty (PSIC)'
    carrierQuoteNumber?: string;
    annualSavings?: number | string | null;
    standardQuotePremium?: number | string | null;
    currentCfpPremium?: number | string | null;
    agentName?: string;
    agencyName?: string;
    agentPhone?: string;
    agentEmail?: string;
    vaRemarks?: string;
}

export type ScenarioType =
    | 'rce_review'           // Scenario 1: FAIR Plan / RCE Coverage Review
    | 'standard_savings'      // Scenario 2: Standard Homeowners Policy Found (with Savings)
    | 'property_feature'      // Scenario 3: Property Feature Needs Review (Stove, Solar, Propane)
    | 'other_structures'      // Scenario 4: Other Structures Review (Garage, Shed, Fence, Deck)
    | 'standard_no_savings';  // Scenario 5: Standard Policy Found (No Savings / Consolidation)

export interface ScenarioDefinition {
    id: ScenarioType;
    label: string;
    shortBadge: string;
    description: string;
    defaultSubject: (data: PolicyScenarioData) => string;
    generateBody: (data: PolicyScenarioData) => string;
}

function formatCurrency(val: number | string | null | undefined): string {
    if (val === null || val === undefined || val === '') return '$0';
    const num = typeof val === 'string' ? parseFloat(val.replace(/[^0-9.-]/g, '')) : val;
    if (isNaN(num)) return '$0';
    return `$${Math.round(num).toLocaleString()}`;
}

export const SCENARIO_DEFINITIONS: Record<ScenarioType, ScenarioDefinition> = {
    rce_review: {
        id: 'rce_review',
        label: 'RCE / Dwelling Coverage Review',
        shortBadge: 'RCE REVIEW',
        description: 'Dwelling limit differs from estimated replacement cost (Under/Over-insurance).',
        defaultSubject: (data) => `Your Home Coverage Review – ${data.propertyAddress || '[Property Address]'}`,
        generateBody: (data) => {
            const client = data.clientName || '[Client Name]';
            const curDwell = formatCurrency(data.currentDwellingLimit);
            const rceVal = formatCurrency(data.rceValuationAmount);

            return `Hi ${client},

I hope you’re doing well. As part of your upcoming renewal, I reviewed your current California FAIR Plan coverage together with the available replacement cost estimate.

• Current Dwelling Coverage: ${curDwell}
• Estimated Replacement Cost: ${rceVal}

I am also sharing the home replacement estimator with you. Please check if we missed anything.

Quick reminder: I’m not a contractor or professional estimator, and I don’t know the exact details of your home, so I can’t guarantee this amount will rebuild it. This estimator is a tool and should be considered the minimum amount to insure for. You are responsible for selecting the final dwelling limit.

Please reply with one of the following:
1. You agree with the estimated amount, or
2. You want a higher limit and tell me what amount you prefer.

Best regards,`;
        },
    },

    standard_savings: {
        id: 'standard_savings',
        label: 'Standard Policy Found (With Savings)',
        shortBadge: 'STANDARD + SAVINGS',
        description: 'Standard homeowners companion quote found with annual savings over CFP.',
        defaultSubject: (data) => `A New Homeowners Insurance Option for You – ${data.propertyAddress || '[Property Address]'}`,
        generateBody: (data) => {
            const client = data.clientName || '[Client Name]';
            const carrier = data.carrierName || 'Bamboo';
            const savingsStr = data.annualSavings ? formatCurrency(data.annualSavings) : '$[Amount]';

            return `Hi ${client},

I am thrilled to share some excellent news regarding your homeowners insurance.

We successfully secured a standard homeowners insurance quote for your property through ${carrier}. This means we can transition you away from your current California FAIR Plan policy and companion DIC policy into one unified policy.

Moving to a standard policy provides you with several major benefits:
• Better Coverage: Your new policy bundles your fire, theft, liability, and water damage coverages into one seamless package.
• Lower Costs: Standard policies generally offer much more competitive premium rates than the FAIR Plan. Estimated Annual Savings: ${savingsStr}
• Single Deductible: You will no longer have to manage separate deductibles across two different insurance plans.
• Easier Management: You will deal with just one insurance company, one bill, and one point of contact.

What happens next?
We need to finalize the details to officially activate your new coverage and cancel your FAIR Plan policy. Please review the attached premium quote and coverage summary.

Please confirm if you wish to proceed or if you would like to go over the coverage together.

Best regards,`;
        },
    },

    property_feature: {
        id: 'property_feature',
        label: 'Property Feature / Hazard Needs Review',
        shortBadge: 'PROPERTY FEATURE',
        description: 'Confirm wood-burning stove, solar panels, propane tank, or detached hazards.',
        defaultSubject: (data) => `Quick Review of Your Property Coverage – ${data.propertyAddress || '[Property Address]'}`,
        generateBody: (data) => {
            const client = data.clientName || '[Client Name]';
            const features = (data.propertyFeatures && data.propertyFeatures.length > 0)
                ? data.propertyFeatures.join(', ')
                : 'Wood-Burning Stove / Solar Panels / Propane Tank';

            return `Hi ${client},

I hope you’re doing well.

I reviewed your upcoming renewal, and overall the coverage appears to be in line based on the information we currently have.

There is just one property feature I’d like to confirm with you:
• ${features}

We simply want to make sure this is properly reflected in the policy and that the carrier has the correct information on file.

When you have a chance, please let me know if this feature is currently present and whether there is anything else about the property we should be aware of. I’d be happy to review it with you.

Please note: Any property observations are based on the information or images available to us. Please confirm the information with us so we can help ensure policy details remain accurate.

Best regards,`;
        },
    },

    other_structures: {
        id: 'other_structures',
        label: 'Other Structures Review',
        shortBadge: 'OTHER STRUCTURES',
        description: 'Confirm coverage for detached garage, shed, barn, deck, or fence.',
        defaultSubject: (data) => `Quick Review of Other Structures on Your Property – ${data.propertyAddress || '[Property Address]'}`,
        generateBody: (data) => {
            const client = data.clientName || '[Client Name]';
            const structures = (data.otherStructureTypes && data.otherStructureTypes.length > 0)
                ? data.otherStructureTypes.join(', ')
                : 'fence / deck / detached garage / shed / barn / pool';
            const covAmount = data.otherStructureCoverage !== undefined && data.otherStructureCoverage !== null && data.otherStructureCoverage !== ''
                ? formatCurrency(data.otherStructureCoverage)
                : 'None ($0)';

            return `Hi ${client},

As part of your upcoming renewal review, we noticed there may be additional structures on the property, such as ${structures}.

Your current Other Structures (Coverage B) is ${covAmount}.

We’d like to make sure the coverage properly reflects what is currently on the property.

When you have a moment, please let us know if there are any other detached structures, improvements, or additions we should be aware of. If you’d like, we can also review the current coverage amount with you and discuss whether any changes may be appropriate.

Please note: Any review of fences, decks, sheds, garages, barns, or other structures is based on available imagery and property records. Please let us know if there are additional structures or improvements we should update.

Best regards,`;
        },
    },

    standard_no_savings: {
        id: 'standard_no_savings',
        label: 'Standard Policy Option (No Savings / Consolidation)',
        shortBadge: 'STANDARD (NO SAVINGS)',
        description: 'Standard companion policy available for single-policy convenience & broader protection.',
        defaultSubject: (data) => `Another Homeowners Insurance Option to Consider – ${data.propertyAddress || '[Property Address]'}`,
        generateBody: (data) => {
            const client = data.clientName || '[Client Name]';
            const carrier = data.carrierName || 'Bamboo';

            return `Hi ${client},

We found a standard homeowners insurance option for your property through ${carrier} that I wanted to share with you.

While this option may not lower the overall premium, it may still offer some distinct advantages by combining your coverage into one standard homeowners policy instead of having separate California FAIR Plan and DIC policies.

Some potential benefits include:
• Broader Coverage: Comprehensive protection under one single master policy.
• One Deductible Structure: No split deductibles between fire and standard perils.
• Easier Policy Management: One carrier, one bill, and one direct point of contact.

I’ve attached the quote and coverage summary for your review. There’s no pressure to make a change—I simply wanted to ensure you had every option available to consider.

Please let me know if you would like to go over the coverage together or compare it with your current setup.

Best regards,`;
        },
    },
};

/**
 * Smart Composite Email Generator
 * Handles multi-scenario selection and merges them into a single, cohesive email.
 */
export function generateCompositeClientEmail(
    activeScenarios: ScenarioType[],
    data: PolicyScenarioData
): { subject: string; bodyText: string; bodyHtml: string } {
    if (!activeScenarios || activeScenarios.length === 0) {
        return {
            subject: `Coverage Review – ${data.propertyAddress || '[Property Address]'}`,
            bodyText: '',
            bodyHtml: '',
        };
    }

    // If single scenario, use exact Google Doc template
    if (activeScenarios.length === 1) {
        const def = SCENARIO_DEFINITIONS[activeScenarios[0]];
        const subject = def.defaultSubject(data);
        const bodyText = def.generateBody(data);
        const bodyHtml = bodyText
            .split('\n\n')
            .map(p => `<p style="margin: 0 0 14px 0; line-height: 1.6; color: #1e293b;">${p.replace(/\n/g, '<br/>')}</p>`)
            .join('');
        return { subject, bodyText, bodyHtml };
    }

    // ── Multi-Scenario Smart Fusion ──────────────────────────────────────────
    const client = data.clientName || '[Client Name]';
    const carrier = data.carrierName || 'Bamboo';
    const hasStandardSavings = activeScenarios.includes('standard_savings');
    const hasStandardNoSavings = activeScenarios.includes('standard_no_savings');
    const hasStandardQuote = hasStandardSavings || hasStandardNoSavings;
    const hasRce = activeScenarios.includes('rce_review');
    const hasOtherStructures = activeScenarios.includes('other_structures');
    const hasPropertyFeature = activeScenarios.includes('property_feature');

    const sections: string[] = [];
    let subject = `Your Home Coverage & Property Review – ${data.propertyAddress || '[Property Address]'}`;

    // ── Section 1: Standard Policy Opportunity Hook (If applicable) ─────────
    if (hasStandardSavings) {
        subject = `A New Homeowners Insurance Option for You – ${data.propertyAddress || '[Property Address]'}`;
        const savingsStr = data.annualSavings ? formatCurrency(data.annualSavings) : null;
        sections.push(`Hi ${client},

I am thrilled to share some excellent news regarding your homeowners insurance.

We successfully secured a standard homeowners insurance quote for your property through ${carrier}. This means we can transition you away from your current California FAIR Plan policy and companion DIC policy into one unified policy.

Moving to a standard policy provides you with several major benefits:
• Better Coverage: Your new policy bundles your fire, theft, liability, and water damage coverages into one seamless package.
• Lower Costs: Standard policies offer competitive premium rates compared to the FAIR Plan.${savingsStr ? ` Estimated Annual Savings: ${savingsStr}.` : ''}
• Single Deductible: You will no longer have to manage separate deductibles across two different insurance plans.
• Easier Management: You will deal with just one insurance company, one bill, and one point of contact.`);
    } else if (hasStandardNoSavings) {
        subject = `Another Homeowners Insurance Option to Consider – ${data.propertyAddress || '[Property Address]'}`;
        sections.push(`Hi ${client},

We found a standard homeowners insurance option for your property through ${carrier} that I wanted to share with you.

While this option may not lower the overall premium, it offers distinct advantages by combining your coverage into one standard homeowners policy instead of having separate California FAIR Plan and DIC policies:

• Broader Coverage: Comprehensive protection bundling fire, theft, liability, and water damage under one master policy.
• Single Deductible: No split deductibles between fire and standard perils.
• Easier Management: One insurance company, one bill, and one direct point of contact.`);
    } else {
        // Renewal coverage review only (no standard quote)
        sections.push(`Hi ${client},

I hope you’re doing well. As part of your upcoming renewal review, I reviewed your current California FAIR Plan coverage together with the available replacement cost estimate and property records:`);
    }

    // ── Section 2: Dwelling Coverage & RCE Review ──────────────────────────
    if (hasRce) {
        const curDwell = formatCurrency(data.currentDwellingLimit);
        const rceVal = formatCurrency(data.rceValuationAmount);

        const rceIntro = hasStandardQuote
            ? `Dwelling Coverage & Replacement Cost Estimate:\nIn preparing this quote, we evaluated your current dwelling limit against the latest replacement cost estimate:\n• Current Dwelling Coverage: ${curDwell}\n• Estimated Replacement Cost: ${rceVal}`
            : `Dwelling Coverage vs. Replacement Cost Estimate:\n• Current Dwelling Coverage: ${curDwell}\n• Estimated Replacement Cost: ${rceVal}`;

        sections.push(`${rceIntro}

I am also sharing the home replacement estimator with you. Please check if we missed anything.

Quick reminder: I’m not a contractor or professional estimator, and I don’t know the exact details of your home, so I can’t guarantee this amount will rebuild it. This estimator is a tool and should be considered the minimum amount to insure for. You are responsible for selecting the final dwelling limit.`);
    }

    // ── Section 3: Other Structures (if applicable) ────────────────────────
    if (hasOtherStructures) {
        const structures = (data.otherStructureTypes && data.otherStructureTypes.length > 0)
            ? data.otherStructureTypes.join(', ')
            : 'detached garage / shed / deck / fence / pool';
        const covAmount = data.otherStructureCoverage ? formatCurrency(data.otherStructureCoverage) : 'None ($0)';
        sections.push(`Other Structures on Property:
• We noticed additional detached structures (e.g. ${structures}). Current Other Structures coverage is ${covAmount}.
• Please let us know if there are detached structures or additions we should properly protect.`);
    }

    // ── Section 4: Property Features (if applicable) ───────────────────────
    if (hasPropertyFeature) {
        const features = (data.propertyFeatures && data.propertyFeatures.length > 0)
            ? data.propertyFeatures.join(', ')
            : 'Wood-Burning Stove / Solar Panels / Propane Tank';
        sections.push(`Property Feature Confirmation:
• Property records indicate: ${features}.
• Please confirm if this feature is currently present so carrier underwriting details remain accurate.`);
    }

    // ── Section 5: Next Steps & Clear Call to Action ───────────────────────
    if (hasStandardQuote) {
        const replyIntro = hasRce
            ? `What happens next?
We need to finalize the details to officially activate your new coverage and cancel your FAIR Plan policy. Please review the attached quote, estimator, and coverage summary.

Please reply with one of the following:
1. You agree with the estimated amount and wish to proceed with the new policy, or
2. You want a higher dwelling limit or would like to discuss adjustments before activating.`
            : `What happens next?
We need to finalize the details to officially activate your new coverage and cancel your FAIR Plan policy. Please review the attached premium quote and coverage summary.

Please confirm if you wish to proceed or if you would like to go over the coverage together.`;
        sections.push(`${replyIntro}

Best regards,`);
    } else if (hasRce) {
        sections.push(`Please reply with one of the following:
1. You agree with the estimated amount, or
2. You want a higher limit and tell me what amount you prefer.

Best regards,`);
    } else {
        sections.push(`When you have a moment, please review the attached summary and let us know if you have any questions or would like to discuss adjustments.

Best regards,`);
    }

    const bodyText = sections.join('\n\n');

    const bodyHtml = bodyText
        .split('\n\n')
        .map(p => {
            const trimmed = p.trim();
            if (trimmed.startsWith('•') || trimmed.includes('\n•')) {
                return `<p style="margin: 0 0 14px 0; line-height: 1.6; color: #1e293b;">${trimmed.replace(/\n/g, '<br/>')}</p>`;
            }
            if (/^\d+\./.test(trimmed) || trimmed.includes('\n1.')) {
                return `<p style="margin: 0 0 14px 0; line-height: 1.6; color: #1e293b; font-weight: 500;">${trimmed.replace(/\n/g, '<br/>')}</p>`;
            }
            return `<p style="margin: 0 0 14px 0; line-height: 1.6; color: #1e293b;">${trimmed.replace(/\n/g, '<br/>')}</p>`;
        })
        .join('');

    return { subject, bodyText, bodyHtml };
}
