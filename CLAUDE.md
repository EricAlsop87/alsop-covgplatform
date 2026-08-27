# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CFP Platform ("CoverageCheckNow") — an insurance CRM for an agency team. Agents upload client documents (declaration pages, RCE valuations, DIC dec pages); a background worker extracts/parses them, matches them to clients/policies/terms, evaluates coverage-gap flags, and enriches property data. The core product goal is surfacing places where clients can improve their insurance coverage.

Two runtimes share one Supabase project (Postgres + Auth + Storage):

- **`src/`** — Next.js 16 App Router frontend + API routes (TypeScript, React 19, SCSS modules, SWR)
- **`worker/`** — Python background worker that polls the `ingestion_jobs` queue

## Commands

```bash
# Frontend (repo root)
npm run dev          # Next.js dev server on :3000
npm run build        # production build
npm run lint         # eslint

# Worker (from worker/, requires .venv + .env with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
python -m src.main
```

There is no test suite or test runner configured. Root-level `tmp_*.js` / `test_*.js` / `_check_*.py` files are one-off debugging scripts run with `node <file>` or `python <file>`, not tests.

Database schema changes are plain SQL files in `docs/migrations/` and `scripts/`, applied manually against Supabase (no migration runner).

## Architecture

### Ingestion pipeline (the heart of the system)

Upload → `dec_page_submissions` row (DB-first: INSERT pending → upload to Storage → UPDATE) → `ingestion_jobs` queue → Python worker claims job:

- Jobs **without** `document_id` → legacy dec-page pipeline (`worker/src/main.py:process_job`): download PDF → pdfplumber/Tesseract text extraction → GPT-4o-mini structured extraction (regex FAIR Plan parser as fallback) → upsert `dec_pages` → create/update Client → Policy → PolicyTerm (`db/lifecycle.py`) → mark done (~15s "fast path") → then background enrichment (ATTOM, satellite/vision, fire risk) and flag evaluation via calls back to the Next.js API (`db/api_enrichment.py`).
- Jobs **with** `document_id` → newer `platform_documents` pipeline (`worker/src/documents/`): processor registry keyed by `doc_type` (`rce`, `dic_dec_page`), each processor extracts then fuzzy-matches to existing clients/policies via `documents/matcher.py`.

Job queue semantics: atomic claim, exponential-backoff retry up to `max_attempts`, stale-job requeue, and a `finally` safety net so jobs never stay stuck in `processing`.

### Frontend structure

- Route groups: `(authenticated)` (dashboard, client/policy detail, flags, admin), `(public)` (signin, invite, public submit), `(home)`, `(report)` (client-facing coverage report by id).
- Auth is enforced **client-side** in `src/app/(authenticated)/layout.tsx` (Supabase session + role check against `accounts` table). `src/middleware.ts` only sets security headers — it deliberately does not gate auth. Roles: `admin`, `service`, `agent`, `user`, `customer`; customers are confined to portal routes.
- `src/lib/api.ts` (~3800 lines) is the data-access layer for the browser (anon-key Supabase client). Server API routes under `src/app/api/` use the service-role admin client for privileged work (uploads, merges, CSV import, flag evaluation, enrichment, email, reports).
- Environment access goes through `src/lib/env.ts` (`env.X`, never raw `process.env`). Logging goes through `src/lib/logger.ts`.

### Flag system

Flags = actionable work items (coverage gaps, missing data, renewals); activity events = history. `flag_definitions` is the rule catalog; `policy_flags` is the live queue with dedup via `flag_key`, statuses `open`/`resolved`/`dismissed`. Rules are evaluated by the worker (`worker/src/db/flag_evaluator.py`, 20+ rules) and by `/api/flags/*`. Full spec: `docs/flags-system.md`.

### Conventions that matter

- `SKILLS.md` documents required patterns: single `mapRowToDeclaration()` mapper, DB-first submission pipeline, `env.ts` access, structured logging, error boundaries.
- `docs/UI_GUIDELINES.md` is the strict design system: dark-mode-first, CSS custom properties (`--bg-*`, `--text-*`, `--accent-primary` indigo `#3b3ff0`), 240px fixed sidebar. Use the existing tokens; don't invent colors.
- Storage buckets: `cfp-raw-decpage` (dec page submissions, path `submissions/{account_id}/{submission_id}.pdf`), `cfp-platform-documents` (platform documents).
- The service-role key must never reach the browser; anything needing it lives in an API route or the worker.
