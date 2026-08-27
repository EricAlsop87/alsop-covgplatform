/**
 * CoPilot Prompt Generator
 *
 * Generates structured prompts that agents can paste into Allstate CoPilot
 * to have it draft professional emails with full policy/client context.
 *
 * This does NOT send any emails — it only produces text prompts.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CoPilotPromptContext {
    clientName: string;
    clientEmail?: string;
    policyNumber: string;
    propertyAddress: string;
    agentName: string;
    expirationDate?: string;
    effectiveDate?: string;
    annualPremium?: string;
    paymentMethod?: string;        // 'insured' | 'mortgage' | etc.
    mortgageeName?: string;
    carrierStatus?: string;
    reportUrl?: string;
    rceDownloadUrl?: string;
    meetingUrl?: string;
}

export type PromptTemplateId =
    | 'renewal_notice_insured'
    | 'renewal_notice_mortgage'
    | 'rce_verification'
    | 'coverage_recommendations_meeting'
    | 'schedule_review'
    | 'custom';

export interface PromptTemplate {
    id: PromptTemplateId;
    name: string;
    description: string;
    /** Generate the full CoPilot prompt for this template */
    generate: (ctx: CoPilotPromptContext) => string;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Shared Helpers
// ---------------------------------------------------------------------------

/**
 * Strips parentheses, explicit term labels ("Term 1"), and trailing term/sequence suffixes
 * from a raw policy number string.
 */
export function cleanPolicyNumber(rawPolicy: string | null | undefined): string {
    if (!rawPolicy) return '';
    let s = rawPolicy.replace(/[()]/g, '').trim();
    s = s.replace(/\s*[-–—]?\s*term\s*\d*\b/gi, '').trim();
    s = s.replace(/(\d{6,})[-_\s]+(\d{1,2})$/, '$1').trim();
    return s;
}

/**
 * Extracts the trailing digits (last 4 characters/digits) from a policy number.
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

function formatContextBlock(ctx: CoPilotPromptContext): string {
    const cleanPolicy = cleanPolicyNumber(ctx.policyNumber) || 'N/A';
    const policyEnding = getPolicyEnding(ctx.policyNumber) || cleanPolicy;
    const lines = [
        `- Named Insured / Client Name: ${ctx.clientName || 'Valued Client'}`,
        `- Policy Identification: Policy ending in ${policyEnding} (Full: ${cleanPolicy})`,
        `- Property Address: ${ctx.propertyAddress || 'N/A'}`,
    ];
    if (ctx.expirationDate) lines.push(`- Policy Expiration Date: ${ctx.expirationDate}`);
    if (ctx.effectiveDate) lines.push(`- Policy Effective Date: ${ctx.effectiveDate}`);
    if (ctx.annualPremium) lines.push(`- Annual Premium: ${ctx.annualPremium}`);
    if (ctx.paymentMethod) lines.push(`- Payment Method: ${ctx.paymentMethod}`);
    if (ctx.mortgageeName) lines.push(`- Mortgagee / Lender: ${ctx.mortgageeName}`);
    if (ctx.meetingUrl) lines.push(`- Calendly / Meeting Scheduling Link: ${ctx.meetingUrl}`);
    lines.push(`- Attached Files: Replacement Cost Estimate (RCE) & Coverage Report attached directly to email`);
    return lines.join('\n');
}

const MASTER_GUARDRAIL_RULES = `
STRICT AGENCY RULES & GUARDRAILS (YOU MUST FOLLOW ALL OF THESE):
1. AGENCY IDENTITY & SIGN-OFF: Do NOT introduce a named individual agent or share personal stories. Sign off ONLY as:
   Alsop & Associates Insurance Agency
   (909) 626-5000 | support@coveragechecknow.com

2. NO PRE-REVIEW CHANGES & PERMISSION-BASED FRAMING: Explicitly state that NO changes have been made to the client's policy:
   "No changes have been made to your policy. Any changes are recommendations only — we always request your permission before making updates to your policy."

3. POLICY IDENTIFICATION FORMAT (POLICY ENDING IN XXXX): Refer to the policy as "policy ending in [last 4 digits]" (e.g. "policy ending in 7347") in both the subject line and email body. NEVER enclose policy numbers in parentheses, and NEVER include term numbers or sequence suffixes.

4. NON-JUDGMENTAL COMPARATIVE TONE (STRICT BAN):
   - NEVER use words like "adequate", "inadequate", "deficient", "underinsured", "poor", or "lacking".
   - Describe coverage differences neutrally by comparing current policy limits directly to updated replacement cost estimates and available options.

5. MANUAL ATTACHMENTS (RCE FIRST, COVERAGE REPORT): State that the Replacement Cost Estimate (RCE) and Coverage Report are attached directly to the email for policy ending in [last 4 digits]. Do NOT refer to it as an "updated" report. Do NOT generate file URLs or download links.

6. CALENDLY & CONTACT PRIORITY (NO TRAILING PERIODS): Prioritize the Calendly scheduling link as the primary call to action for booking a dedicated review appointment at a convenient time. Offer the office phone number (909) 626-5000 secondarily to speak with a licensed agent.
   CRITICAL: Ensure the Calendly URL is followed by a space before text like "at a convenient time" and NEVER attach a period directly to the URL (e.g., write "calendar: [URL] at a convenient time", NEVER "[URL].").

7. CLIENT RESPONSIBILITY & NON-BINDING DISCLAIMER: You must include this notice near the end of the email:
   "Please remember that final coverage selections and decisions remain the responsibility of the policyholder. Email communications do not bind, change, or modify coverage without formal carrier confirmation."

8. CONCISENESS & RESPECT FOR TIME: Keep the entire email concise (under 180 words). Reassure the client that an annual review takes only a few minutes.

9. PREPARATION CHECKLIST: Encourage the client to have handy any questions, concerns, or feedback they would like to discuss during the review. Do NOT ask for mortgage statements or other policy dec pages.

10. NO PHYSICAL ADDRESS IN EMAIL TEXT: Do NOT include the physical property address anywhere in the email subject line or body text. Identify the policy strictly by policy ending digits.

11. OUTPUT FORMAT: Output ONLY the Subject line and the complete email body ready to send. Do NOT include conversational preambles, introductory filler ("Here is the email draft:"), or surrounding code block backticks.`.trim();

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const PROMPT_TEMPLATES: Record<PromptTemplateId, PromptTemplate> = {

    renewal_notice_insured: {
        id: 'renewal_notice_insured',
        name: 'Annual Renewal Notice',
        description: 'For clients with upcoming renewals. Prompts CoPilot to draft a permission-requesting review email.',
        generate: (ctx) => {
            const cleanPolicy = cleanPolicyNumber(ctx.policyNumber);
            const policyEnding = getPolicyEnding(ctx.policyNumber) || cleanPolicy;
            const firstName = ctx.clientName ? ctx.clientName.trim().split(/\s+/)[0] : 'Valued Client';
            const contactSentence = ctx.meetingUrl
                ? `Please schedule a brief review on our calendar: ${ctx.meetingUrl} at a convenient time, or call our office at (909) 626-5000 to speak with a licensed agent.`
                : `To schedule a review or speak with a licensed agent, please call our office at (909) 626-5000.`;

            return `Act as an expert insurance communications specialist writing on behalf of Alsop & Associates Insurance Agency.

TASK: Draft a professional, warm renewal review email to policyholder ${ctx.clientName || 'Valued Client'} regarding policy ending in ${policyEnding}, expiring on ${ctx.expirationDate || 'upcoming renewal date'}.

CLIENT & POLICY DETAILS:
${formatContextBlock(ctx)}

EMAIL PURPOSE:
Notify the client that their policy renewal is approaching. Explain the value of reviewing current coverage versus updated replacement cost information and available options. Explicitly clarify that NO changes have been made to their policy pre-review and ask permission before any updates. Prioritize scheduling via Calendly (cleanly separated link, no trailing period), with office phone (909) 626-5000 to speak with a licensed agent.

REFERENCE EMAIL BLUEPRINT (Match structure, tone, and flow):
---
Subject: ${firstName}, Your Home Policy Review Is Ready | Policy Ending in ${policyEnding}

Hi ${firstName},

With your policy scheduled for renewal on ${ctx.expirationDate || '[confirmed renewal date]'}, now is a helpful time to review your current coverage versus updated replacement cost information and available options.

We have attached your Replacement Cost Estimate (RCE) and Coverage Report for policy ending in ${policyEnding}. These documents can help guide a brief conversation about your current limits, property information, and any questions or concerns you may have.

No changes have been made to your policy. Any changes are recommendations only — we always request your permission before making updates to your policy.

${contactSentence}

Please remember that final coverage selections and decisions remain the responsibility of the policyholder. Email communications do not bind, change, or modify coverage without formal carrier confirmation.

Thank you for your time and trust,

Alsop & Associates Insurance Agency
(909) 626-5000 | support@coveragechecknow.com
---

${MASTER_GUARDRAIL_RULES}`;
        },
    },

    rce_verification: {
        id: 'rce_verification',
        name: 'Verify Replacement Cost Estimate',
        description: 'Ask client to verify property specs (sq ft, features) from the attached Replacement Cost Estimate.',
        generate: (ctx) => {
            const cleanPolicy = cleanPolicyNumber(ctx.policyNumber);
            const policyEnding = getPolicyEnding(ctx.policyNumber) || cleanPolicy;
            const firstName = ctx.clientName ? ctx.clientName.trim().split(/\s+/)[0] : 'Valued Client';
            const contactSentence = ctx.meetingUrl
                ? `Please schedule a brief review on our calendar: ${ctx.meetingUrl} at a convenient time, or call our office at (909) 626-5000 to speak with a licensed agent.`
                : `To schedule a review or speak with a licensed agent, please call our office at (909) 626-5000.`;

            return `Act as an expert insurance communications specialist writing on behalf of Alsop & Associates Insurance Agency.

TASK: Draft a professional, warm, permission-based email requesting that policyholder ${ctx.clientName || 'Valued Client'} review and verify property specifications on their attached Replacement Cost Estimate (RCE) for policy ending in ${policyEnding}.

CLIENT & POLICY DETAILS:
${formatContextBlock(ctx)}

EMAIL PURPOSE:
Ask the client to review and verify their property details (square footage, year built, renovations) shown on their attached Replacement Cost Estimate (RCE) for policy ending in ${policyEnding}. Explain that accurate property data ensures their replacement cost calculation properly reflects current construction costs. Explicitly state that NO changes have been made to their policy pre-review and adjustments are recommendations only. Prioritize scheduling via Calendly, with office phone (909) 626-5000 to speak with a licensed agent.

REFERENCE EMAIL BLUEPRINT (Match structure, tone, and flow):
---
Subject: ${firstName}, Please Verify Your Property Details | Policy Ending in ${policyEnding}

Hi ${firstName},

With your policy scheduled for renewal on ${ctx.expirationDate || '[confirmed renewal date]'}, we have attached your updated Replacement Cost Estimate (RCE) for policy ending in ${policyEnding} to ensure your home is accurately valued against current construction costs.

Please take a moment to review the attached estimate, specifically:
• Living area square footage
• Year built & construction details
• Any recent renovations or additions

No changes have been made to your policy. Any changes are recommendations only — we always request your permission before making updates to your policy.

${contactSentence}

Please remember that final coverage selections and decisions remain the responsibility of the policyholder. Email communications do not bind, change, or modify coverage without formal carrier confirmation.

Thank you for your time and trust,

Alsop & Associates Insurance Agency
(909) 626-5000 | support@coveragechecknow.com
---

${MASTER_GUARDRAIL_RULES}`;
        },
    },

    coverage_recommendations_meeting: {
        id: 'coverage_recommendations_meeting',
        name: 'Coverage Recommendations & Consultation',
        description: 'Present coverage findings, request permission to apply increases, and invite to Calendly meeting.',
        generate: (ctx) => {
            const cleanPolicy = cleanPolicyNumber(ctx.policyNumber);
            const policyEnding = getPolicyEnding(ctx.policyNumber) || cleanPolicy;
            const firstName = ctx.clientName ? ctx.clientName.trim().split(/\s+/)[0] : 'Valued Client';
            const contactSentence = ctx.meetingUrl
                ? `Please schedule a brief review on our calendar: ${ctx.meetingUrl} at a convenient time, or call our office at (909) 626-5000 to speak with a licensed agent.`
                : `To schedule a review or speak with a licensed agent, please call our office at (909) 626-5000.`;

            return `Act as an expert insurance communications specialist writing on behalf of Alsop & Associates Insurance Agency.

TASK: Draft a professional, warm email presenting annual coverage recommendations and requesting client permission to review and update coverage for policy ending in ${policyEnding}.

CLIENT & POLICY DETAILS:
${formatContextBlock(ctx)}

EMAIL PURPOSE:
Highlight key coverage differences identified during our annual review when comparing current policy limits against updated replacement cost estimates. Explicitly clarify that NO changes have been made to their policy pre-review. State that the Replacement Cost Estimate (RCE) and Coverage Report are attached directly to the email for policy ending in ${policyEnding}. Request permission from the client to review recommended adjustments, and invite them to schedule a brief appointment via Calendly (${ctx.meetingUrl ? ctx.meetingUrl : ''}) as primary, or call our office at (909) 626-5000 to speak with a licensed agent.

REFERENCE EMAIL BLUEPRINT (Match structure, tone, and flow):
---
Subject: ${firstName}, Your Coverage Review & Options Are Ready | Policy Ending in ${policyEnding}

Hi ${firstName},

With your policy scheduled for renewal on ${ctx.expirationDate || '[confirmed renewal date]'}, we recently completed an annual review of your property coverage and have attached your Replacement Cost Estimate (RCE) and Coverage Report for policy ending in ${policyEnding}.

These documents highlight comparative options between your current policy limits and updated rebuilding cost estimates. No changes have been made to your policy. Any changes are recommendations only — we always request your permission before making updates to your policy.

${contactSentence}

Please remember that final coverage selections and decisions remain the responsibility of the policyholder. Email communications do not bind, change, or modify coverage without formal carrier confirmation.

Thank you for your time and trust,

Alsop & Associates Insurance Agency
(909) 626-5000 | support@coveragechecknow.com
---

${MASTER_GUARDRAIL_RULES}`;
        },
    },

    renewal_notice_mortgage: {
        id: 'renewal_notice_mortgage',
        name: 'Renewal Notice — Mortgage Escrow',
        description: 'For clients whose lender pays premium through escrow.',
        generate: (ctx) => {
            const cleanPolicy = cleanPolicyNumber(ctx.policyNumber);
            const policyEnding = getPolicyEnding(ctx.policyNumber) || cleanPolicy;
            const firstName = ctx.clientName ? ctx.clientName.trim().split(/\s+/)[0] : 'Valued Client';
            const contactSentence = ctx.meetingUrl
                ? `Please schedule a brief review on our calendar: ${ctx.meetingUrl} at a convenient time, or call our office at (909) 626-5000 to speak with a licensed agent.`
                : `To schedule a review or speak with a licensed agent, please call our office at (909) 626-5000.`;

            return `Act as an expert insurance communications specialist writing on behalf of Alsop & Associates Insurance Agency.

TASK: Draft a professional, warm renewal review email to a policyholder whose renewal premium is paid through mortgage escrow regarding policy ending in ${policyEnding}.

CLIENT & POLICY DETAILS:
${formatContextBlock(ctx)}

EMAIL PURPOSE:
Inform the client that their policy renewal is approaching. Clarify that while their mortgage lender handles premium payments, conducting an annual coverage review ensures their property remains fully protected against current rebuilding costs. Explicitly state that NO changes have been made to their policy pre-review. State that their Replacement Cost Estimate (RCE) along with a Coverage Report are attached for review for policy ending in ${policyEnding}. Request permission to review potential coverage recommendations. Prioritize scheduling via Calendly, with office phone (909) 626-5000 to speak with a licensed agent.

REFERENCE EMAIL BLUEPRINT (Match structure, tone, and flow):
---
Subject: ${firstName}, Your Home Policy Review Is Ready | Policy Ending in ${policyEnding}

Hi ${firstName},

With your policy scheduled for renewal on ${ctx.expirationDate || '[confirmed renewal date]'}, now is a helpful time to review your current coverage versus updated replacement cost information and available options. While your lender (${ctx.mortgageeName || 'mortgage escrow'}) handles premium payments, an annual review ensures your coverage limits align with current rebuilding costs.

We have attached your Replacement Cost Estimate (RCE) and Coverage Report for policy ending in ${policyEnding}. These documents can help guide a brief conversation about your current limits, property information, and any questions or concerns you may have.

No changes have been made to your policy. Any changes are recommendations only — we always request your permission before making updates to your policy.

${contactSentence}

Please remember that final coverage selections and decisions remain the responsibility of the policyholder. Email communications do not bind, change, or modify coverage without formal carrier confirmation.

Thank you for your time and trust,

Alsop & Associates Insurance Agency
(909) 626-5000 | support@coveragechecknow.com
---

${MASTER_GUARDRAIL_RULES}`;
        },
    },

    schedule_review: {
        id: 'schedule_review',
        name: 'Schedule Coverage Review',
        description: 'Invite the client to schedule a coverage review appointment.',
        generate: (ctx) => {
            const cleanPolicy = cleanPolicyNumber(ctx.policyNumber);
            const policyEnding = getPolicyEnding(ctx.policyNumber) || cleanPolicy;
            return `Act as an expert insurance communications specialist writing on behalf of Alsop & Associates Insurance Agency.

TASK: Draft a professional, warm email inviting a policyholder to schedule a policy review appointment for policy ending in ${policyEnding}.

CLIENT & POLICY DETAILS:
${formatContextBlock(ctx)}

EMAIL PURPOSE:
Invite the client to schedule a brief appointment on our calendar${ctx.meetingUrl ? `: ${ctx.meetingUrl} at a convenient time` : ''} to review their coverage options and discuss recommended policy updates. Reassure them that no changes have been made to their policy pre-review, the review is quick and permission-based, and designed to protect their property investment. Offer office phone (909) 626-5000 to speak with a licensed agent.

${MASTER_GUARDRAIL_RULES}`;
        },
    },

    custom: {
        id: 'custom',
        name: 'Custom Prompt',
        description: 'Provide your own purpose — CoPilot drafts based on the context you supply.',
        generate: (ctx) => {
            const cleanPolicy = cleanPolicyNumber(ctx.policyNumber);
            const policyEnding = getPolicyEnding(ctx.policyNumber) || cleanPolicy;
            return `Act as an expert insurance communications specialist writing on behalf of Alsop & Associates Insurance Agency.

TASK: Draft a professional, warm email to a policyholder regarding policy ending in ${policyEnding}.

CLIENT & POLICY DETAILS:
${formatContextBlock(ctx)}

EMAIL PURPOSE: [Describe the purpose of this email — note that no changes have been made to the policy pre-review]

${MASTER_GUARDRAIL_RULES}`;
        },
    },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Get all available CoPilot prompt templates */
export function getCoPilotTemplates(): PromptTemplate[] {
    return Object.values(PROMPT_TEMPLATES);
}

/** Get a specific CoPilot prompt template by ID */
export function getTemplate(id: PromptTemplateId): PromptTemplate | null {
    return PROMPT_TEMPLATES[id] || null;
}

/** Generate a CoPilot prompt for the given template and context */
export function generateCoPilotPrompt(
    templateId: PromptTemplateId,
    ctx: CoPilotPromptContext
): string {
    const template = PROMPT_TEMPLATES[templateId];
    if (!template) return '';
    return template.generate(ctx);
}

/**
 * Generate a plain-text email draft from the preview body content.
 * This converts the rendered preview into copyable text.
 */
export function generateEmailDraftText(opts: {
    subject: string;
    body: string;
    from?: string;
    agentName: string;
}): string {
    const lines = [];
    lines.push(`Subject: ${opts.subject}`);
    if (opts.from) lines.push(`From: ${opts.from}`);
    lines.push('');
    lines.push(opts.body);
    lines.push('');
    lines.push(opts.agentName);
    lines.push('Alsop and Associates Insurance Agency');
    lines.push('');
    lines.push('Notice: This draft is provided for informational purposes. Final coverage selection remains the responsibility of the policyholder.');
    return lines.join('\n');
}
