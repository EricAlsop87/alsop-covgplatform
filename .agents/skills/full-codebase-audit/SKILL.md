---
name: full-codebase-audit
description: >-
  Run a comprehensive pre-handoff code audit covering security, reliability,
  performance, UI/UX, SEO, and code quality. Produces a prioritized findings
  report with file:line citations, failure scenarios, and fix suggestions.
  Use when preparing for ownership transfer, major refactor, or periodic health check.
---

# Full Codebase Audit

A repeatable, agent-driven process to perform a thorough 6-section audit of the
CFP Platform codebase and produce a structured findings report.

## Overview

This skill coordinates 4 parallel research subagents (security, reliability,
performance, UX/SEO/quality) to systematically read every critical file and
produce evidence-based findings. The orchestrator then compiles their reports
into a single prioritized audit artifact.

**Output:** A markdown audit report with findings grouped by section, sorted by
severity, each containing file:line citation, failure scenario, suggested fix,
and effort estimate.

## Prerequisites

- Full codebase access (no dev server required — this is a read-only audit)
- Familiarity with the project's key conventions:
  - `src/lib/env.ts` — centralized env access
  - `src/lib/logger.ts` — structured logging
  - `src/lib/apiAuth.ts` → `authenticateRequest()` — API route auth
  - `SKILLS.md` — established patterns
  - `docs/UI_GUIDELINES.md` — design system reference

## Workflow

### 1. Map the Codebase Structure

Read the top-level directory, `src/`, `src/app/`, `src/lib/`, `src/components/`,
`src/hooks/`, `worker/src/`, and `docs/` to understand the project topology.

```bash
# Key structural commands
find src/app/api -name "route.ts" -type f        # All API endpoints
find src/app -name "page.tsx" -type f             # All pages
find src/app -name "layout.tsx" -type f           # All layouts
```

### 2. Launch Parallel Audit Subagents

Define and invoke 4 specialized research subagents, each with read-only tools:

#### Subagent A: Security Auditor
Focus areas:
- **Auth enforcement:** For every API route under `src/app/api/`, verify it
  calls `authenticateRequest()` or has equivalent inline auth. Find routes that
  are missing auth or missing role checks.
- **Service-role key exposure:** Verify `SUPABASE_SERVICE_ROLE_KEY` never
  reaches client bundles. Check `supabaseClient.ts`, `env.ts`,
  `next.config.ts`, and any `'use client'` files importing admin clients.
- **Injection:** Search for `dangerouslySetInnerHTML`, raw SQL, unescaped user
  input in email templates, PostgREST filter injection (unsanitized `.or()`).
- **SSRF:** Check any server-side `fetch()` that constructs URLs from
  `request.nextUrl.origin` or user-supplied data.
- **File upload:** Validate type/size enforcement, path traversal, rate limiting.
- **Secrets:** Grep for raw `process.env` outside `env.ts`, check `.gitignore`.
- **CSRF:** Check state-changing routes for proper auth posture.
- **RLS:** Note that RLS policies live in the DB, not the repo — flag as
  "verify in Supabase dashboard" rather than asserting.

#### Subagent B: Reliability Auditor
Focus areas:
- **Job queue:** Read `worker/src/jobs.py` and `worker/src/main.py`. Trace
  `claim_next_job` for race conditions. Trace every exit path of `process_job`
  — can a job get stuck in `processing`? Check `fail_job` for status guards.
- **Recent bug fixes:** Search for comments about "double ingestion",
  "infinite polling", "stale timer" — verify fixes are complete.
- **Merge transactionality:** Read merge API routes — are multi-step operations
  wrapped in DB transactions?
- **Flag evaluation:** Check for read-modify-write races in flag upsert. Check
  for silently swallowed errors (`except Exception: pass`).
- **External API resilience:** Check timeout/retry for OpenAI, ATTOM, vision
  APIs. What happens when they're down?
- **Error handling:** Find empty catch blocks, `console.log`-only errors.

#### Subagent C: Performance Auditor
Focus areas:
- **api.ts analysis:** Read in 800-line chunks. Flag N+1 patterns, overfetching,
  `paginateAll()` in browser, missing server-side aggregation.
- **Client vs. Server components:** Search for `'use client'` in page files
  that could be Server Components.
- **SWR patterns:** Check cache keys, revalidation, redundant fetches.
- **Database indexes:** Read migration SQL files. Compare against query filter
  columns (status, client_id, policy_id, flag_key, is_current, account_id).
- **Image optimization:** Check for raw `<img>` vs Next.js `<Image />`.
- **Worker bottlenecks:** Check if enrichment blocks the ingestion thread pool.

#### Subagent D: UX/SEO/Quality Auditor
Focus areas:
- **UI Guidelines compliance:** Read `docs/UI_GUIDELINES.md`, then check
  `src/styles/theme.scss` for design token adherence. Flag hardcoded colors.
- **Accessibility:** Check data tables, forms, modals for ARIA labels, focus
  states, color contrast.
- **Loading/empty/error states:** Check 5+ authenticated pages for all three.
- **Customer-facing report:** Audit `(report)` route group for polish.
- **SEO:** Check for `robots.txt`, `sitemap.xml`, OG tags, metadata in public
  routes and root layout.
- **Code quality:** Grep for `TODO`/`FIXME`/`HACK`. Count raw `console.log`
  vs `logger.*`. Find dead exported functions. Check for `.env.example`.
- **Debug scripts:** List ad-hoc scripts in root and worker directories.

### 3. Cross-Validate Critical Findings

While subagents work, the orchestrator should independently read:
- `src/middleware.ts` — confirm no auth enforcement
- `src/lib/supabaseClient.ts` — confirm service key isolation
- `src/lib/env.ts` — audit completeness
- `src/lib/apiAuth.ts` — understand the auth contract
- `worker/src/main.py` + `worker/src/jobs.py` — trace job lifecycle

Use these reads to cross-validate subagent findings.

### 4. Compile the Audit Report

Merge all subagent findings into a single artifact (`audit_report.md`) with:

```markdown
# [Project Name] — Pre-Handoff Audit Report

## 1. SECURITY
### SEC-1 · [Severity] — [Title]
| Field | Detail |
|---|---|
| Location | file:line |
| What's wrong | ... |
| Failure scenario | ... |
| Suggested fix | ... |
| Est. effort | S/M/L |

## 2. RELIABILITY / ERROR HANDLING
## 3. PERFORMANCE
## 4. UI / UX
## 5. SEO
## 6. CODE QUALITY & HANDOFF READINESS

## If You Only Fix Five Things Before Handoff
| # | Finding | Why | Effort |
```

### 5. Identify Highest-Risk Untested Code Paths

In the Code Quality section, always include a table of the top 5 code paths
that most need automated test coverage, with the specific test type needed.

## Common Mistakes

1. **Asserting RLS behavior from code:** RLS policies live in the database.
   Flag them as "verify in Supabase dashboard" instead of claiming they're
   correct or broken.
2. **Confusing inline auth with no auth:** Some routes do inline Bearer token
   checks instead of using `authenticateRequest()`. This is weaker (no role
   check) but it's not "zero auth." Distinguish carefully.
3. **Missing the enrichment exception path:** The background enrichment runs
   AFTER `complete_job()`. Exceptions there have different semantics than
   exceptions during parsing. Trace both paths separately.

## Customization

To scope the audit narrower (e.g., security-only), invoke only the relevant
subagent and skip the others. The report template still applies — just omit
empty sections.

To add new audit categories (e.g., internationalization, compliance), define
an additional subagent with the appropriate focus areas and add a new section
to the report template.
