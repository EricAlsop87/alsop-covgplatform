---
name: cfp-duplicate-analysis
description: >-
  Analyze and classify duplicate clients and policies in the CFP Platform
  database. Produces a tiered report (auto-merge, review, skip) with
  corroborating evidence from addresses and policy numbers. Use when
  asked to find duplicates, check for merge candidates, or clean up
  the client/policy database.
---

# CFP Duplicate Analysis & Merge Skill

## Overview

Runs a comprehensive duplicate detection scan against the live Supabase database,
cross-references names with property addresses and policy numbers, and classifies
every match into three tiers:

- **Tier 1 (Auto-merge):** High confidence — exact full names, shared policy numbers, or hex→real name patterns
- **Tier 2 (Review):** Medium confidence — fuzzy name matches that need human confirmation
- **Tier 3 (Skip):** Low confidence — first-name-only matches or unlinked hex placeholders

## Quick Start

1. Run the analysis script:
   ```bash
   node -r dotenv/config scripts/analyze_duplicates.js dotenv_config_path=.env.local
   ```

2. Classify results into merge tiers:
   ```bash
   node -r dotenv/config scripts/classify_merges.js dotenv_config_path=.env.local
   ```

3. Review the classification:
   - Summary: printed to console
   - Full data: `scripts/merge_classification.json`
   - Raw report: `scripts/duplicate_analysis_report.json`

4. Execute Tier 1 auto-merges (after user approval):
   ```bash
   node -r dotenv/config scripts/execute_tier1_merges.js dotenv_config_path=.env.local
   ```

5. For Tier 2 candidates, use the admin UI:
   - Navigate to **Operations Hub → Duplicate Review** in the web app
   - The DuplicateEngine now surfaces tier-classified results with confidence scores
   - Review fuzzy matches side-by-side and approve/reject

## Matching Rules

### Exact Name Match (Confidence: 85-95%)
- Normalize: lowercase, strip punctuation, collapse whitespace
- Group identical normalized strings
- First-name-only matches are demoted to Tier 3 unless corroborated

### Fuzzy Token-Subset Match (Confidence: 70-95%)
- Tokenize names into words ≥ 2 chars
- Check if one name's tokens are a complete subset of another's
- Require 2+ tokens on the subset side (prevents "Jason" matching all "Jason *")
- Boosted to 90% if shared address, 95% if shared policy base number

### Hex Placeholder Detection
- Pattern: `/^[0-9A-Fa-f]{10,}$/` after stripping spaces
- Legacy CSV imports created these as client names
- Always merge hex → real name (real name survives)

### Policy Base Number Matching
- Uses `normalizePolicyNumber()` from `src/lib/normalization.ts`
- Strips prefix/suffix: `CFP 0102162693 01` → base `CFP 0102162693`
- Same base = same policy (suffix = term sequence)

## Survivor Selection — "More Context Wins"

When merging, the record with MORE descriptive information survives:

1. Real name > hex placeholder
2. More name tokens > fewer (e.g., `Kimberly Dawn Powell` > `Kimberly Powell`)
3. LLC + person name > LLC alone (e.g., `Peaceful Pines Llc, Robert Lombardi` > `PEACEFUL PINES LLC`)
4. Longer name > shorter
5. Tie-break: older record

## Address Corroboration

For fuzzy matches, cross-reference the clients' policy addresses:
- Normalize: uppercase, strip punctuation, compare first 3 words
- If addresses match → boost confidence, promote to Tier 1
- If policy base numbers match → highest confidence, definitely same person

## Output Files

| File | Contents |
|------|----------|
| `scripts/duplicate_analysis_report.json` | Raw duplicate groups with all details |
| `scripts/merge_classification.json` | Tiered classification with reasons |
| `scripts/merge_execution_log.json` | Results after executing merges |

## Common Mistakes

1. **Don't merge first-name-only matches without corroboration.** Multiple clients named "Michael" or "Patricia" are likely different people.
2. **Always merge hex→real name, not the reverse.** The real-name client should survive even if the hex client was created first.
3. **Run classification before execution.** The analysis script detects candidates; the classification script adds evidence-based tiers. Don't skip the classification step.

## Integration

The matching logic is also built into `src/lib/duplicateEngine.ts`:
- `DuplicateEngine.findClientDuplicates()` — returns tier-classified client duplicates
- `DuplicateEngine.findPolicyDuplicates()` — returns policy duplicates
- Results surface in the admin Duplicate Review panel automatically
