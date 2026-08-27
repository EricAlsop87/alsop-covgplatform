export interface PolicyNormalizationResult {
    basePolicy: string | null;
    suffix: string | null;
}

/**
 * Parses a raw policy string into its canonical Base Policy and Sequence Suffix
 * according to the Global Policy Invariant (treat all term suffixes as the same base).
 *
 * Input: "CFP 0102162693 01"
 * Output: { basePolicy: "CFP 0102162693", suffix: "01" }
 *
 * Input: "0102162693"
 * Output: { basePolicy: "CFP 0102162693", suffix: null }
 */
export function normalizePolicyNumber(rawPolicy: string | null | undefined): PolicyNormalizationResult {
    if (!rawPolicy) {
        return { basePolicy: null, suffix: null };
    }

    let s = rawPolicy.toUpperCase().trim();
    // Remove all non-alphanumeric except spaces
    s = s.replace(/[^A-Z0-9\s]/g, '');

    // Strategy: Optional "CFP ", exactly 10 digits, optional spaces, optional 2 digits of suffix.
    const regex = /(?:CFP\s*)?(\d{10})(?:\s*(\d{2}))?\b/;
    const match = s.match(regex);

    if (match) {
        const baseDigits = match[1];
        const suffix = match[2] ? match[2] : null;
        return { basePolicy: `CFP ${baseDigits}`, suffix };
    }

    // Fallback for non-standard or legacy policy strings that don't match 10-digit requirement
    // Collapse multiple spaces into one.
    return { basePolicy: s.replace(/\s+/g, ' '), suffix: null };
}
