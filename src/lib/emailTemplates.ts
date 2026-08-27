/**
 * Email Templates — Ground-truth registry synced to Postmark.
 *
 * IMPORTANT: This registry must stay in sync with templates in Postmark.
 * Source of truth: https://account.postmarkapp.com → Your Server → Templates
 *
 * The `postmarkAlias` field is the Postmark template alias used for API sends.
 * Variables listed here exactly match what each Postmark template expects.
 *
 * To add a new template:
 *   1. Create it in Postmark first
 *   2. Copy its alias and variable names here
 *   3. Set `isClientFacing` accordingly
 *
 * Last synced: 2026-04-10
 * Total Postmark templates: 7
 */

import { getDefaultFrom, getDefaultReplyTo } from './emailService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailTemplate {
    /** Our internal ID (matches Postmark alias where possible) */
    id: string;
    /** Postmark template alias — used for withTemplate sends. null = inline HTML only */
    postmarkAlias: string | null;
    /** Postmark numeric template ID for direct reference */
    postmarkTemplateId: number | null;
    name: string;
    description: string;
    /** Template subject (from Postmark, with {{variable}} placeholders) */
    subject: string;
    /** Whether this template is sent to clients (vs. internal/admin) */
    isClientFacing: boolean;
    /** Variables the Postmark template expects — must match exactly */
    variables: string[];
    defaultFrom?: string;
    defaultReplyTo?: string;
}

// ---------------------------------------------------------------------------
// Template Registry — Exact match to Postmark account (7 templates)
// ---------------------------------------------------------------------------

const TEMPLATES: Record<string, EmailTemplate> = {

    /** Campaign 1: Verify RCE Property Data */
    rce_verification: {
        id: 'rce_verification',
        postmarkAlias: null,
        postmarkTemplateId: null,
        name: 'Campaign 1: Verify RCE Property Data',
        description: 'Ask client to verify property specs (square footage, features) from their Replacement Cost Estimate.',
        subject: 'Action Requested: Verify Property Specs for Your Replacement Cost Estimate',
        isClientFacing: true,
        variables: ['first_name'],
    },

    /** Campaign 2: Coverage Recommendations & Outlook Meeting Invite */
    coverage_recommendations_meeting: {
        id: 'coverage_recommendations_meeting',
        postmarkAlias: null,
        postmarkTemplateId: null,
        name: 'Campaign 2: Coverage Recommendations & Meeting',
        description: 'Present coverage findings, request permission for coverage adjustments, and invite to Outlook meeting.',
        subject: 'Coverage Review & Recommended Adjustments — Action Requested',
        isClientFacing: true,
        variables: ['first_name'],
    },

    /**
     * Postmark: "Payment Due: Insured Billed"
     * Alias: code-your-own-3 | ID: 44383039
     * Subject: "Important: California Fair Plan Renewal Payment Notice"
     * Use: Notify clients who pay their own CFP bill that payment is due
     */
    payment_due_insured: {
        id: 'payment_due_insured',
        postmarkAlias: 'code-your-own-3',
        postmarkTemplateId: 44383039,
        name: 'Payment Due — Insured Billed',
        description: 'Notify a client who pays their own CFP bill that renewal payment is due.',
        subject: 'Important: California Fair Plan Renewal Payment Notice',
        isClientFacing: true,
        variables: ['first_name'],
    },

    /**
     * Postmark: "Payment Due: Mortgage"
     * Alias: code-your-own-2 | ID: 44382840
     * Subject: "Important: California Fair Plan Renewal Payment Notice"
     * Use: Notify clients whose lender/mortgage pays CFP bill
     */
    payment_due_mortgage: {
        id: 'payment_due_mortgage',
        postmarkAlias: 'code-your-own-2',
        postmarkTemplateId: 44382840,
        name: 'Payment Due — Mortgage Billed',
        description: 'Notify a client whose mortgage/lender handles CFP payment that renewal is due.',
        subject: 'Important: California Fair Plan Renewal Payment Notice',
        isClientFacing: true,
        variables: ['first_name'],
    },

    /**
     * Postmark: "Schedule Appt"
     * Alias: code-your-own-4 | ID: 44383042
     * Subject: "Schedule a Time to Review Your Coverage"
     * Use: Invite a client to schedule a coverage review appointment
     */
    schedule_appt: {
        id: 'schedule_appt',
        postmarkAlias: 'code-your-own-4',
        postmarkTemplateId: 44383042,
        name: 'Schedule Appointment',
        description: 'Invite a client to schedule a coverage review meeting.',
        subject: 'Schedule a Time to Review Your Coverage',
        isClientFacing: true,
        variables: ['first_name'],
    },

    /**
     * Postmark: "Welcome"
     * Alias: welcome | ID: 44383145
     * Subject: "Welcome to {{product_name}}, {{name}}!"
     * Use: Onboard a new user after they accept an invite
     */
    welcome: {
        id: 'welcome',
        postmarkAlias: 'welcome',
        postmarkTemplateId: 44383145,
        name: 'Welcome',
        description: 'Welcome a new user after they accept their invite and set up their account.',
        subject: 'Welcome to {{product_name}}, {{name}}!',
        isClientFacing: false,
        variables: ['product_name', 'name', 'first_name', 'login_url', 'username',
            'trial_length', 'trial_start_date', 'trial_end_date', 'sender_name', 'action_url'],
    },

    /**
     * Postmark: "Password reset"
     * Alias: password-reset | ID: 44384260
     * Subject: "Set up a new password for CoverageCheckNow.com"
     * Use: Platform-triggered password reset (Supabase sends its own for auth resets)
     */
    password_reset: {
        id: 'password_reset',
        postmarkAlias: 'password-reset',
        postmarkTemplateId: 44384260,
        name: 'Password Reset',
        description: 'Send a password reset link to a user. Used for platform-level resets.',
        subject: 'Set up a new password for CoverageCheckNow.com',
        isClientFacing: false,
        variables: ['name', 'product_name', 'action_url', 'operating_system', 'browser_name', 'support_url'],
    },

    /**
     * Postmark: "User invitation"
     * Alias: user-invitation | ID: 44384251
     * Subject: "{{invite_sender_name}} invited you to {{ product_name }}"
     * Use: Invite a new user to the platform (alternative to Supabase invite email)
     */
    user_invitation: {
        id: 'user_invitation',
        postmarkAlias: 'user-invitation',
        postmarkTemplateId: 44384251,
        name: 'User Invitation',
        description: 'Invite a new user to the CFP Platform (Postmark version of the invite email).',
        subject: '{{invite_sender_name}} invited you to {{product_name}}',
        isClientFacing: false,
        variables: ['invite_sender_name', 'name', 'invite_sender_organization_name',
            'action_url', 'support_email', 'live_chat_url', 'help_url'],
    },

    /**
     * Postmark: "Code your own"
     * Alias: code-your-own | ID: 44382871
     * Subject: (none — fully custom)
     * Use: Freeform one-off email that agents compose entirely from scratch in the platform.
     *      Subject and body are set by the agent before sending.
     */
    custom_outreach: {
        id: 'custom_outreach',
        postmarkAlias: 'code-your-own',
        postmarkTemplateId: 44382871,
        name: 'Custom Outreach',
        description: 'Freeform email — compose the subject and body directly in the platform. No variables required.',
        subject: '',
        isClientFacing: true,
        variables: [],
    },
};

// ---------------------------------------------------------------------------
// Template API
// ---------------------------------------------------------------------------

/** Return all registered templates */
export function getAllTemplates(): EmailTemplate[] {
    return Object.values(TEMPLATES);
}

/** Return templates that are appropriate for client-facing sends */
export function getClientFacingTemplates(): EmailTemplate[] {
    return Object.values(TEMPLATES).filter(t => t.isClientFacing);
}

/** Get a template by internal ID */
export function getTemplate(templateId: string): EmailTemplate | null {
    return TEMPLATES[templateId] || null;
}

/** Get a template by its Postmark alias */
export function getTemplateByAlias(alias: string): EmailTemplate | null {
    return Object.values(TEMPLATES).find(t => t.postmarkAlias === alias) || null;
}

/**
 * Get the Postmark send payload for a given template + variables.
 * Returns null if the template doesn't have a Postmark alias (inline-only).
 *
 * Used by /api/email/send to send via Postmark's withTemplate endpoint.
 */
export function getPostmarkTemplatePayload(
    templateId: string,
    variables: Record<string, string>
): { TemplateAlias: string; TemplateModel: Record<string, string> } | null {
    const template = getTemplate(templateId);
    if (!template?.postmarkAlias) return null;
    return {
        TemplateAlias: template.postmarkAlias,
        TemplateModel: variables,
    };
}

/**
 * Get the default From address for a template.
 */
export function getTemplateFrom(templateId: string): string {
    const template = getTemplate(templateId);
    return template?.defaultFrom || getDefaultFrom();
}

/**
 * Get the default Reply-To address for a template.
 */
export function getTemplateReplyTo(templateId: string): string {
    const template = getTemplate(templateId);
    return template?.defaultReplyTo || getDefaultReplyTo();
}

/**
 * Legacy: render inline HTML (only used for custom/freeform sends).
 * Template-based sends should use getPostmarkTemplatePayload() instead.
 */
export function renderTemplate(
    templateId: string,
    variables: Record<string, string>
): { subject: string; htmlBody: string } | null {
    const template = getTemplate(templateId);
    if (!template) return null;

    let subject = template.subject;

    for (const [key, value] of Object.entries(variables)) {
        const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
        subject = subject.replace(pattern, value);
    }

    // For Postmark template-based sends, the body is managed in Postmark — we don't inline it here.
    // Return a placeholder body so callers that need one don't break.
    const htmlBody = `<p>Sending via Postmark template: ${template.postmarkAlias || templateId}</p>`;

    return { subject, htmlBody };
}
