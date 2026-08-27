# SKILLS.md – CFP Platform Reusable Patterns

This document captures reusable patterns, solutions, and system rules for the CFP Platform.
Each pattern follows a consistent format and should be referenced during development.

---

## Pattern: Supabase Row Mapping

**Problem:** Raw Supabase query results don't match the application-level type shape. Duplicating mapping logic across functions leads to drift and bugs.

**Solution:** Use a single `mapRowToDeclaration()` function as the canonical mapper between `SupabaseDeclarationRow` (DB shape) and `Declaration` (app shape). All fetch functions call this mapper.

**Implementation Notes:**
- Defined in `src/lib/api.ts`
- `SupabaseDeclarationRow` mirrors the DB schema with all fields optional (since the DB may have nulls)
- `mapRowToDeclaration()` applies defaults, type coercion, and flag generation
- `deriveStatus()` computes status from data completeness instead of hard-coding

**When To Use:** Any time you query `parsed_cfpdecpage_data` and need to return a `Declaration` to the UI.

**When NOT To Use:** When working with other tables that have their own types (e.g., `dec_page_submissions`, `accounts`).

**Example Snippet:**
```typescript
const { data } = await supabase.from('parsed_cfpdecpage_data').select('*');
return (data as SupabaseDeclarationRow[]).map(mapRowToDeclaration);
```

---

## Pattern: Secure File Upload

**Problem:** Uploading files to Supabase Storage requires the service role key, which must never be exposed to the browser.

**Solution:** Use a Next.js API Route (`POST /api/upload`) with DB-first pattern. See "Pattern: DB-First Submission Pipeline" below.

**Implementation Notes:**
- Route: `src/app/api/upload/route.ts`
- Uses `getSupabaseAdmin()` (lazy-initialized admin client)
- DB-first: INSERT row → upload file → UPDATE row
- Storage path: `submissions/{account_id}/{submission_id}.pdf`
- Table: `dec_page_submissions`
- Client sends auth token via `Authorization: Bearer` header

**When To Use:** Any file upload that needs to write to Supabase Storage.

**When NOT To Use:** Client-side operations that only need the anon key.

**Example Snippet:**
```typescript
const headers: Record<string, string> = {};
const { data: { session } } = await supabase.auth.getSession();
if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
const response = await fetch('/api/upload', { method: 'POST', body: formData, headers });
```

---

## Pattern: Environment Validation

**Problem:** Missing environment variables cause silent failures or cryptic runtime errors in production.

**Solution:** Centralized `env.ts` module with `requireEnv()` that throws descriptive errors at access time.

**Implementation Notes:**
- Defined in `src/lib/env.ts`
- Uses getters so validation happens at first access (important for server-only vars)
- Public vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- Server-only vars: `SUPABASE_SERVICE_ROLE_KEY`
- Never prefix server-only vars with `NEXT_PUBLIC_`

**When To Use:** Always. Every environment variable should be accessed via `env.X`.

**When NOT To Use:** Never access `process.env` directly in application code.

**Example Snippet:**
```typescript
import { env } from '@/lib/env';
const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
```

---

## Pattern: Structured Logging

**Problem:** Raw `console.log` calls lack structure, context, and are hard to filter in production.

**Solution:** Use the `logger` module which provides leveled, structured logging with context tags and metadata.

**Implementation Notes:**
- Defined in `src/lib/logger.ts`
- Levels: `debug` (suppressed in prod), `info`, `warn`, `error`
- Every log includes: timestamp, level, context tag, message, optional metadata
- Output format: `[ISO_TIMESTAMP] [LEVEL] [Context] message {metadata}`

**When To Use:** All logging in application code.

**When NOT To Use:** Only use raw `console` in one-off debugging that won't be committed.

**Example Snippet:**
```typescript
import { logger } from '@/lib/logger';
logger.info('Auth', 'User signed in', { userId: user.id });
logger.error('Upload', 'Storage write failed', { bucket, error: err.message });
```

---

## Pattern: Error Boundaries

**Problem:** Unhandled React render errors cause white screens. Route-level errors crash the entire page.

**Solution:** Two-layer error handling:
1. **React `ErrorBoundary`** component – wraps sections of the UI, catches render errors, shows fallback
2. **Next.js `error.tsx`** – catches route-level errors with reset capability

**Implementation Notes:**
- Component: `src/components/ui/ErrorBoundary/ErrorBoundary.tsx` (class component, required for React error boundaries)
- Route error: `src/app/error.tsx` (must be `'use client'`)
- 404: `src/app/not-found.tsx` (server component)
- All fallback UIs match the platform's dark/glass design

**When To Use:** Wrap any component tree that could throw during render. Always have `error.tsx` at the route level.

**When NOT To Use:** Don't use for async/event handler errors — those need try/catch.

**Example Snippet:**
```tsx
import { ErrorBoundary } from '@/components/ui/ErrorBoundary/ErrorBoundary';

<ErrorBoundary>
  <PolicyDashboard />
</ErrorBoundary>
```

---

## Pattern: DB-First Submission Pipeline

**Problem:** Upload-first patterns create orphaned files when the DB insert fails. They also prevent deterministic storage paths since you don't have a submission ID yet.

**Solution:** Always INSERT the DB row first (with `status='pending'`), then upload using the submission ID, then UPDATE the row.

**Implementation Notes:**
- Pipeline: validate → resolve account → INSERT (pending) → upload → UPDATE (uploaded)
- Storage path convention: `submissions/{account_id}/{submission_id}.pdf`
- On upload failure: UPDATE `status='failed'`, `error_message`, `error_detail`
- The `markSubmissionFailed()` helper handles failure tracking
- Account resolution: session → existing account lookup → auto-register
- Table: `dec_page_submissions` (NOT old `submissions`)

**When To Use:** All file submission flows in the CFP Platform.

**When NOT To Use:** Read-only data fetches or operations that don't involve file storage.

**Example Snippet:**
```typescript
// 1. Insert row first
const { data: row } = await admin.from('dec_page_submissions')
  .insert({ account_id, status: 'pending', ...metadata }).select('id').single();

// 2. Upload using deterministic path
const storagePath = `submissions/${accountId}/${row.id}.pdf`;
await admin.storage.from('cfp-raw-decpage').upload(storagePath, buffer);

// 3. Update row
await admin.from('dec_page_submissions')
  .update({ status: 'uploaded', storage_path: storagePath }).eq('id', row.id);
```
