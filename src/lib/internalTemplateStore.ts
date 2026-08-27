/**
 * Internal Email Template & Rule Store Engine
 *
 * Manages native agency templates and template rules locally.
 * Completely decoupled from external Postmark templates.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateRule {
    id: string;
    label: string;
    instruction: string;
    enabled: boolean;
}

export interface SystemEmailTemplate {
    id: string;
    name: string;
    category: 'rce' | 'recommendations' | 'renewal' | 'review' | 'custom';
    description: string;
    subjectTemplate: string;
    draftBodyTemplate: string;
    copilotPromptTemplate: string;
    rules: TemplateRule[];
    variables: string[];
    isSystemDefault?: boolean;
}

export interface TemplateContext {
    clientName: string;
    clientEmail?: string;
    policyNumber: string;
    propertyAddress: string;
    agentName: string;
    expirationDate?: string;
    effectiveDate?: string;
    annualPremium?: string;
    paymentMethod?: string;
    mortgageeName?: string;
    carrierStatus?: string;
    reportUrl?: string;
    rceDownloadUrl?: string;
    meetingUrl?: string;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Storage Keys & Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'cfp_internal_email_templates_v6';

/**
 * Strips parentheses, explicit term labels ("Term 1"), and trailing term/sequence suffixes
 * from a raw policy number string.
 *
 * Examples:
 *  "(0102162693)" -> "0102162693"
 *  "CFP 0102162693 01" -> "CFP 0102162693"
 *  "0102162693-01" -> "0102162693"
 *  "0102162693 - Term 2" -> "0102162693"
 *  "CFP-9842104-1" -> "CFP-9842104"
 */
export function cleanPolicyNumber(rawPolicy: string | null | undefined): string {
    if (!rawPolicy) return '';
    let s = rawPolicy.replace(/[()]/g, '').trim();
    // Strip explicit "Term X" or "Term"
    s = s.replace(/\s*[-–—]?\s*term\s*\d*\b/gi, '').trim();
    // Strip trailing 1 or 2 digit term/sequence suffix after a hyphen, underscore, or space
    s = s.replace(/(\d{6,})[-_\s]+(\d{1,2})$/, '$1').trim();
    return s;
}

/**
 * Extracts the trailing digits (last 4 characters/digits) from a policy number.
 *
 * Examples:
 *  "0102717347" -> "7347"
 *  "CFP 0102717347 00" -> "7347"
 *  "CFP-9842104" -> "2104"
 *  "7347" -> "7347"
 */
export function getPolicyEnding(rawPolicy: string | null | undefined): string {
    const cleaned = cleanPolicyNumber(rawPolicy);
    if (!cleaned) return '';
    const digitsOnly = cleaned.replace(/\D/g, '');
    if (digitsOnly.length >= 4) {
        return digitsOnly.slice(-4);
    }
    const match = cleaned.match(/([a-zA-Z0-9]{1,4})$/);
    return match ? match[1] : cleaned;
}

export const AVAILABLE_VARIABLES = [
    { tag: '{{first_name}}', description: 'Client First Name' },
    { tag: '{{client_name}}', description: 'Named Insured / Full Client Name' },
    { tag: '{{policy_last4}}', description: 'Last 4 digits / Policy Ending (e.g. 7347)' },
    { tag: '{{policy_ending}}', description: 'Last 4 digits / Policy Ending (e.g. 7347)' },
    { tag: '{{policy_number}}', description: 'Clean Policy Number (no parens/terms)' },
    { tag: '{{expiration_date}}', description: 'Policy Expiration Date' },
    { tag: '{{meeting_url}}', description: 'Calendly / Meeting Scheduling Link' },
    { tag: '{{property_address}}', description: 'Insured Property Location' },
    { tag: '{{effective_date}}', description: 'Policy Effective Date' },
    { tag: '{{annual_premium}}', description: 'Annual Policy Premium' },
    { tag: '{{payment_method}}', description: 'Payment Method (Direct / Mortgage)' },
    { tag: '{{agent_name}}', description: 'Agency / Agent Name' },
    { tag: '{{client_email}}', description: 'Client Email Address' },
];

export const STANDARD_RULES: TemplateRule[] = [
    {
        id: 'no_pre_review_changes',
        label: 'No Pre-Review Changes & Permission-Based Recommendations',
        instruction: 'Explicitly state that NO changes have been made to the client’s policy pre-review: "No changes have been made to your policy. Any changes are recommendations only — we always request your permission before making updates to your policy."',
        enabled: true,
    },
    {
        id: 'policy_ending_identification',
        label: 'Policy Ending Identification (No Parentheses, No Terms)',
        instruction: 'Identify policies as "policy ending in [last 4 digits]" (e.g. "policy ending in 7347") in subject lines and email text. Never enclose policy numbers in parentheses, and never include term numbers or sequence suffixes.',
        enabled: true,
    },
    {
        id: 'prioritize_calendly_no_period',
        label: 'Prioritize Calendly Booking (Clean Link Separation)',
        instruction: 'Prioritize the Calendly scheduling link as the primary call to action for booking a dedicated review appointment at a convenient time. Offer the office phone number (909) 626-5000 secondarily to speak with a licensed agent. Ensure the Calendly link is followed by whitespace and NEVER has an attached trailing period that breaks the link.',
        enabled: true,
    },
    {
        id: 'client_responsibility_and_non_binding',
        label: 'Client Responsibility & Non-Binding Carrier Disclaimer',
        instruction: 'Include the exact disclaimer: "Please remember that final coverage selections and decisions remain the responsibility of the policyholder. Email communications do not bind, change, or modify coverage without formal carrier confirmation."',
        enabled: true,
    },
    {
        id: 'non_judgmental',
        label: 'Non-Judgmental Comparative Tone',
        instruction: 'Never use words like "adequate", "inadequate", "deficient", "underinsured", "poor", or "lacking". Simply explain coverage found on the previous policy versus available options and updated replacement cost estimates.',
        enabled: true,
    },
    {
        id: 'concise_length',
        label: 'Concise Length (Under 180 Words)',
        instruction: 'Keep the draft email direct, professional, warm, and under 180 words.',
        enabled: true,
    },
];

// ---------------------------------------------------------------------------
// Default System Templates (Refreshed with Calendly & Manual Attachments)
// ---------------------------------------------------------------------------

export const DEFAULT_TEMPLATES: SystemEmailTemplate[] = [
    {
        id: 'renewal_review',
        name: 'Annual Renewal Review Notice',
        category: 'renewal',
        description: 'Notice of upcoming policy renewal with attached Replacement Cost Estimate (RCE) & Coverage Report, offering a Calendly review appointment.',
        subjectTemplate: '{{first_name}}, Your Home Policy Review Is Ready | Policy Ending in {{policy_last4}}',
        draftBodyTemplate: `Hi {{first_name}},

With your policy scheduled for renewal on {{expiration_date}}, now is a helpful time to review your current coverage versus updated replacement cost information and available options.

We have attached your Replacement Cost Estimate (RCE) and Coverage Report for policy ending in {{policy_last4}}. These documents can help guide a brief conversation about your current limits, property information, and any questions or concerns you may have.

No changes have been made to your policy. Any changes are recommendations only — we always request your permission before making updates to your policy.

Please schedule a brief review on our calendar: {{meeting_url}} at a convenient time, or call our office at (909) 626-5000 to speak with a licensed agent.

Please remember that final coverage selections and decisions remain the responsibility of the policyholder. Email communications do not bind, change, or modify coverage without formal carrier confirmation.

Thank you for your time and trust,

Alsop & Associates Insurance Agency
(909) 626-5000 | support@coveragechecknow.com`,
        copilotPromptTemplate: `Act as an expert insurance communications specialist writing on behalf of Alsop & Associates Insurance Agency.

TASK: Draft a professional, warm, permission-based renewal review email for policyholder {{client_name}} regarding policy ending in {{policy_last4}}, scheduled for renewal on {{expiration_date}}.

CLIENT & POLICY DETAILS:
- Client Name: {{client_name}}
- Policy Identification: Policy ending in {{policy_last4}} (Full: {{policy_number}})
- Insured Property Address: {{property_address}}
- Expiration Date: {{expiration_date}}
- Effective Date: {{effective_date}}
- Annual Premium: {{annual_premium}}
- Payment Method: {{payment_method}}
- Calendly Scheduling Link: {{meeting_url}}
- Attachments: Replacement Cost Estimate (RCE) and Coverage Report attached directly to the email

REFERENCE EMAIL BLUEPRINT (Match structure, tone, and flow closely):
---
Subject: {{first_name}}, Your Home Policy Review Is Ready | Policy Ending in {{policy_last4}}

Hi {{first_name}},

With your policy scheduled for renewal on {{expiration_date}}, now is a helpful time to review your current coverage versus updated replacement cost information and available options.

We have attached your Replacement Cost Estimate (RCE) and Coverage Report for policy ending in {{policy_last4}}. These documents can help guide a brief conversation about your current limits, property information, and any questions or concerns you may have.

No changes have been made to your policy. Any changes are recommendations only — we always request your permission before making updates to your policy.

Please schedule a brief review on our calendar: {{meeting_url}} at a convenient time, or call our office at (909) 626-5000 to speak with a licensed agent.

Please remember that final coverage selections and decisions remain the responsibility of the policyholder. Email communications do not bind, change, or modify coverage without formal carrier confirmation.

Thank you for your time and trust,

Alsop & Associates Insurance Agency
(909) 626-5000 | support@coveragechecknow.com
---

STRICT AGENCY RULES & GUARDRAILS (YOU MUST FOLLOW ALL OF THESE):
1. AGENCY IDENTITY & SIGN-OFF: Do NOT include a personal agent name or introduction. Sign off ONLY as "Alsop & Associates Insurance Agency" with phone (909) 626-5000 and support@coveragechecknow.com.
2. NO PRE-REVIEW CHANGES & PERMISSION-BASED FRAMING: Explicitly state that NO changes have been made to the client's policy: "No changes have been made to your policy. Any changes are recommendations only — we always request your permission before making updates to your policy."
3. POLICY IDENTIFICATION FORMAT (POLICY ENDING IN XXXX): Refer to the policy as "policy ending in {{policy_last4}}" in the subject line and email body. Never enclose policy numbers in parentheses, and never include term numbers or sequence suffixes.
4. CALENDLY & CONTACT PRIORITY (NO TRAILING PERIODS): Prioritize the Calendly scheduling link ({{meeting_url}}) as the primary call to action for booking a dedicated review appointment at a convenient time. Offer the office phone number (909) 626-5000 secondarily to speak with a licensed agent. Ensure the Calendly link is followed by whitespace and NEVER has an attached trailing period that breaks the link.
5. NON-JUDGMENTAL COMPARATIVE TONE (STRICT BAN): NEVER use words like "adequate", "inadequate", "deficient", "underinsured", "poor", or "lacking". Describe coverage neutrally by comparing current limits to updated replacement cost estimates.
6. ATTACHMENT REFERENCING (RCE FIRST, COVERAGE REPORT): State that the Replacement Cost Estimate (RCE) and Coverage Report are attached directly to the email for policy ending in {{policy_last4}}. Do NOT output file URLs or download links.
7. CLIENT RESPONSIBILITY & NON-BINDING DISCLAIMER: Include the exact statement: "Please remember that final coverage selections and decisions remain the responsibility of the policyholder. Email communications do not bind, change, or modify coverage without formal carrier confirmation."
8. CONCISENESS & RESPECT FOR TIME: Keep the email concise — under 180 words — and reassuring.
9. NO PHYSICAL ADDRESS IN EMAIL TEXT: Do NOT include the physical property address anywhere in the email subject line or body text. Identify the policy strictly by policy ending.
10. OUTPUT FORMAT: Output ONLY the Subject line and the complete email body ready to send. Do NOT include conversational preamble or surrounding code block backticks.`,
        rules: STANDARD_RULES,
        variables: ['{{first_name}}', '{{client_name}}', '{{policy_last4}}', '{{policy_ending}}', '{{policy_number}}', '{{expiration_date}}', '{{meeting_url}}', '{{property_address}}', '{{agent_name}}'],
        isSystemDefault: true,
    },
    {
        id: 'rce_verification',
        name: 'Verify Replacement Cost Estimate',
        category: 'rce',
        description: 'Ask client to verify property specs on their attached Replacement Cost Estimate (RCE).',
        subjectTemplate: '{{first_name}}, Please Verify Your Property Details | Policy Ending in {{policy_last4}}',
        draftBodyTemplate: `Hi {{first_name}},

With your policy scheduled for renewal on {{expiration_date}}, we have attached your updated Replacement Cost Estimate (RCE) for policy ending in {{policy_last4}} to ensure your home is accurately valued against current construction costs.

Please take a moment to review the attached estimate, specifically:
• Living area square footage
• Year built & construction details
• Any recent renovations or additions

No changes have been made to your policy. Any changes are recommendations only — we always request your permission before making updates to your policy.

Please schedule a brief review on our calendar: {{meeting_url}} at a convenient time, or call our office at (909) 626-5000 to speak with a licensed agent.

Please remember that final coverage selections and decisions remain the responsibility of the policyholder. Email communications do not bind, change, or modify coverage without formal carrier confirmation.

Thank you for your time and trust,

Alsop & Associates Insurance Agency
(909) 626-5000 | support@coveragechecknow.com`,
        copilotPromptTemplate: `Act as an expert insurance communications specialist writing on behalf of Alsop & Associates Insurance Agency.

TASK: Draft a professional, warm email requesting that policyholder {{client_name}} review and verify the property specifications on their attached Replacement Cost Estimate (RCE) for policy ending in {{policy_last4}}.

CLIENT & POLICY DETAILS:
- Client Name: {{client_name}}
- Policy Identification: Policy ending in {{policy_last4}} (Full: {{policy_number}})
- Expiration Date: {{expiration_date}}
- Calendly Scheduling Link: {{meeting_url}}
- Attachment: Replacement Cost Estimate (RCE) attached directly to the email

EMAIL PURPOSE:
Ask the client to review and verify their property details (square footage, year built, renovations) shown on their attached Replacement Cost Estimate (RCE). Explain that accurate property data ensures their replacement cost calculation properly reflects current construction costs. Explicitly state that NO changes have been made to their policy pre-review and adjustments are recommendations only. Prioritize scheduling via Calendly, with office phone (909) 626-5000 for speaking with a licensed agent.

STRICT AGENCY RULES:
1. State that the RCE is attached directly to the email for policy ending in {{policy_last4}}. Do not output download links.
2. Explicitly state that no changes have been made to the policy pre-review; all adjustments are recommendations only requiring client permission.
3. Refer to the policy as "policy ending in {{policy_last4}}". Do NOT enclose policy numbers in parentheses or include term suffixes.
4. Prioritize the Calendly link {{meeting_url}} with clean spacing (no attached trailing periods), offering the office phone (909) 626-5000 secondarily.
5. Sign off as "Alsop & Associates Insurance Agency" with phone (909) 626-5000 | support@coveragechecknow.com.
6. Include disclaimer: "Please remember that final coverage selections and decisions remain the responsibility of the policyholder. Email communications do not bind, change, or modify coverage without formal carrier confirmation."
7. Output ONLY Subject and Email Body ready to send.`,
        rules: STANDARD_RULES,
        variables: ['{{first_name}}', '{{client_name}}', '{{policy_last4}}', '{{policy_ending}}', '{{policy_number}}', '{{meeting_url}}', '{{expiration_date}}'],
        isSystemDefault: true,
    },
    {
        id: 'coverage_recommendations_meeting',
        name: 'Coverage Recommendations & Consultation',
        category: 'recommendations',
        description: 'Present coverage review findings and invite client to schedule a consultation.',
        subjectTemplate: '{{first_name}}, Your Coverage Review & Options Are Ready | Policy Ending in {{policy_last4}}',
        draftBodyTemplate: `Hi {{first_name}},

With your policy scheduled for renewal on {{expiration_date}}, we recently completed an annual review of your property coverage and have attached your Replacement Cost Estimate (RCE) and Coverage Report for policy ending in {{policy_last4}}.

These documents highlight comparative options between your current policy limits and updated rebuilding cost estimates. No changes have been made to your policy. Any changes are recommendations only — we always request your permission before making updates to your policy.

Please schedule a brief review on our calendar: {{meeting_url}} at a convenient time, or call our office at (909) 626-5000 to speak with a licensed agent.

Please remember that final coverage selections and decisions remain the responsibility of the policyholder. Email communications do not bind, change, or modify coverage without formal carrier confirmation.

Thank you for your time and trust,

Alsop & Associates Insurance Agency
(909) 626-5000 | support@coveragechecknow.com`,
        copilotPromptTemplate: `Act as an expert insurance communications specialist writing on behalf of Alsop & Associates Insurance Agency.

TASK: Draft a professional, warm email presenting annual coverage recommendations and requesting client permission to review and update coverage for policy ending in {{policy_last4}}.

CLIENT & POLICY DETAILS:
- Client Name: {{client_name}}
- Policy Identification: Policy ending in {{policy_last4}} (Full: {{policy_number}})
- Calendly Scheduling Link: {{meeting_url}}
- Attachments: Replacement Cost Estimate (RCE) and Coverage Report attached directly to the email

EMAIL PURPOSE:
Highlight key coverage differences identified during our annual review when comparing current policy limits against updated replacement cost estimates. Explicitly clarify that NO changes have been made to the policy pre-review. Request permission from the client to discuss recommended adjustments, and invite them to schedule a review via Calendly {{meeting_url}} (cleanly spaced, no trailing period), or call our office at (909) 626-5000 to speak with a licensed agent.

STRICT AGENCY RULES:
1. State that the Replacement Cost Estimate (RCE) and Coverage Report are attached directly to the email for policy ending in {{policy_last4}} (do NOT refer to it as an 'updated' report).
2. Explicitly state that NO changes have been made pre-review; all adjustments are recommendations requiring client permission.
3. Identify policy as "policy ending in {{policy_last4}}". Do NOT enclose policy numbers in parentheses or include term numbers.
4. Prioritize the Calendly link {{meeting_url}} for scheduling, offering office phone (909) 626-5000 secondarily.
5. Sign off as "Alsop & Associates Insurance Agency" with phone (909) 626-5000 | support@coveragechecknow.com.
6. Include disclaimer: "Please remember that final coverage selections and decisions remain the responsibility of the policyholder. Email communications do not bind, change, or modify coverage without formal carrier confirmation."
7. Output ONLY Subject and Email Body ready to send.`,
        rules: STANDARD_RULES,
        variables: ['{{first_name}}', '{{client_name}}', '{{policy_last4}}', '{{policy_ending}}', '{{policy_number}}', '{{meeting_url}}', '{{expiration_date}}'],
        isSystemDefault: true,
    }
];

// ---------------------------------------------------------------------------
// Store Operations
// ---------------------------------------------------------------------------

/** Get all templates (merged localStorage custom templates + system defaults) */
export function getInternalTemplates(): SystemEmailTemplate[] {
    if (typeof window === 'undefined') return DEFAULT_TEMPLATES;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_TEMPLATES;
        const saved: SystemEmailTemplate[] = JSON.parse(raw);
        
        // Merge system defaults with saved custom templates
        const savedMap = new Map(saved.map(t => [t.id, t]));
        const merged: SystemEmailTemplate[] = DEFAULT_TEMPLATES.map(dt => savedMap.get(dt.id) || dt);
        
        // Append user-created custom templates
        for (const s of saved) {
            if (!DEFAULT_TEMPLATES.some(dt => dt.id === s.id)) {
                merged.push(s);
            }
        }
        return merged;
    } catch {
        return DEFAULT_TEMPLATES;
    }
}

/** Get a single template by ID */
export function getInternalTemplate(id: string): SystemEmailTemplate | null {
    const templates = getInternalTemplates();
    return templates.find(t => t.id === id) || null;
}

/** Save or update a template in local storage */
export function saveInternalTemplate(template: SystemEmailTemplate): void {
    if (typeof window === 'undefined') return;
    const current = getInternalTemplates();
    const idx = current.findIndex(t => t.id === template.id);
    let updated: SystemEmailTemplate[];
    if (idx >= 0) {
        updated = [...current];
        updated[idx] = template;
    } else {
        updated = [...current, template];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('cfp-templates-updated', { detail: updated }));
    window.dispatchEvent(new Event('storage'));
}

/** Reset templates to factory defaults */
export function resetInternalTemplates(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('cfp-templates-updated', { detail: DEFAULT_TEMPLATES }));
    window.dispatchEvent(new Event('storage'));
}

// ---------------------------------------------------------------------------
// Interpolation & Rule Application
// ---------------------------------------------------------------------------

/** Interpolate variable tags in text */
export function interpolateText(text: string, ctx: TemplateContext): string {
    if (!text) return '';
    
    // Automatically extract first name from client name if possible
    const rawClientName = ctx.clientName || '';
    const firstName = rawClientName.trim() ? rawClientName.trim().split(/\s+/)[0] : 'Valued Client';
    
    const cleanPolicy = cleanPolicyNumber(ctx.policyNumber);
    const policyLast4 = getPolicyEnding(ctx.policyNumber);
    const reportLink = ctx.reportUrl || '';
    const rceLink = ctx.rceDownloadUrl || '';
    const meetingLink = ctx.meetingUrl || '';

    const replacements: Record<string, string> = {
        '{{client_name}}': rawClientName || 'Valued Client',
        '{{first_name}}': firstName,
        '{{client_email}}': ctx.clientEmail || '',
        '{{policy_number}}': cleanPolicy,
        '{{policy_last4}}': policyLast4 || cleanPolicy,
        '{{policy_ending}}': policyLast4 || cleanPolicy,
        '{{property_address}}': ctx.propertyAddress || '',
        '{{expiration_date}}': ctx.expirationDate || '',
        '{{effective_date}}': ctx.effectiveDate || '',
        '{{annual_premium}}': ctx.annualPremium || '',
        '{{payment_method}}': ctx.paymentMethod || '',
        '{{agent_name}}': ctx.agentName || 'Alsop & Associates Insurance Agency',
        '{{meeting_url}}': meetingLink,
        '{{report_url}}': reportLink,
        '{{rce_download_url}}': rceLink,
    };

    let result = text;
    for (const [tag, val] of Object.entries(replacements)) {
        result = result.replaceAll(tag, val);
    }
    return result;
}

/** Render full email draft text with applied rules and disclaimers */
export function renderInternalDraft(template: SystemEmailTemplate, ctx: TemplateContext): { subject: string; body: string } {
    const subject = interpolateText(template.subjectTemplate, ctx);
    let body = interpolateText(template.draftBodyTemplate, ctx);

    // Append safety disclaimer if enabled in rules and not already present
    const hasDisclaimerRule = template.rules.some(r => r.enabled && (r.id === 'client_responsibility' || r.id === 'client_responsibility_and_non_binding'));
    if (hasDisclaimerRule && !body.includes('Please remember that final coverage selections')) {
        body += `\n\nPlease remember that final coverage selections and decisions remain the responsibility of the policyholder. Email communications do not bind, change, or modify coverage without formal carrier confirmation.`;
    }
    return { subject, body };
}

/** Render full CoPilot prompt incorporating active rules, instructions, and context */
export function renderInternalCopilotPrompt(template: SystemEmailTemplate, ctx: TemplateContext): string {
    const interpolatedPrompt = interpolateText(template.copilotPromptTemplate, ctx);
    const activeRules = template.rules.filter(r => r.enabled);

    // Only append rules if they are not already integrated into the template
    const customRules = activeRules.filter(r => !interpolatedPrompt.toLowerCase().includes(r.label.toLowerCase()));
    
    if (customRules.length > 0) {
        const rulesBlock = customRules.map(r => `- ${r.label}: ${r.instruction}`).join('\n');
        return `${interpolatedPrompt}\n\nAdditional Agency Custom Rules:\n${rulesBlock}`;
    }

    return interpolatedPrompt.trim();
}
