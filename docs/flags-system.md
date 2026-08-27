# Flag System — Architecture & Conventions

> This document defines the flag system for the CFP Platform.
> **Last updated:** 2026-03-11 — Phase 1 design (schema + docs)

---

## 1. Purpose

Flags are **actionable work items** for staff. They represent data quality issues, upcoming deadlines, coverage gaps, and other conditions that require human review or action.

Flags are **NOT** activity history. Use `activity_events` for informational records like "document uploaded" or "policy created."

### When to use Flags vs Activity Events

| Use a **Flag** when...                        | Use an **Activity Event** when...            |
|-----------------------------------------------|----------------------------------------------|
| Staff needs to take action                    | Something happened worth noting              |
| The item should appear in a work queue        | No follow-up action is needed                |
| It can be resolved/dismissed                  | It's permanent history                       |
| It has severity (warning/critical)            | It's informational only                      |
| Examples: missing data, renewal due, DIC gap  | Examples: doc uploaded, field edited, import  |

---

## 2. Tables

### `public.flag_definitions`
**Purpose:** Catalog of all known flag types. Acts as a lookup / registry. Worker evaluator and UI both reference this table.

| Column               | Type        | Notes                                              |
|----------------------|-------------|----------------------------------------------------|
| `code`               | text PK     | Stable identifier, e.g. `MISSING_DWELLING_LIMIT`   |
| `label`              | text        | Human-readable name                                |
| `description`        | text null   | Longer explanation for staff/admin                  |
| `category`           | text        | One of: `data_quality`, `renewal`, `coverage_gap`, `dic`, `duplicate`, `workflow`, `manual`, `parser` |
| `default_severity`   | text        | Default: `info`, `warning`, or `critical`           |
| `entity_scope`       | text        | Where flags attach: `policy`, `client`, `policy_term`, `submission`, `dec_page` |
| `auto_resolve`       | boolean     | If `true`, system auto-resolves when condition clears |
| `is_manual_allowed`  | boolean     | If `true`, staff can create this flag manually      |
| `is_active`          | boolean     | If `false`, evaluator skips this rule               |
| `default_action_path`| text null   | Optional: deep link path for the flag, e.g. `/policy/{id}?tab=coverage` |
| `rule_version`       | text null   | Semver string for the rule logic version            |
| `created_at`         | timestamptz | Auto-set on insert                                 |

### `public.policy_flags` (upgraded)
**Purpose:** Live work queue. Every row is an actionable flag instance attached to an entity.

| Column                   | Type          | Notes                                               |
|--------------------------|---------------|------------------------------------------------------|
| `id`                     | uuid PK       | Existing                                             |
| `policy_id`              | uuid null      | FK to `policies.id` — nullable for client-only flags |
| `client_id`              | uuid null      | FK to `clients.id` — NEW                             |
| `policy_term_id`         | uuid null      | FK to `policy_terms.id` — NEW                        |
| `submission_id`          | uuid null      | FK to `submissions.id` — NEW                         |
| `dec_page_id`            | uuid null      | Rename of `source_dec_page_id` — NEW column, keep old |
| `code`                   | text           | FK to `flag_definitions.code`                        |
| `severity`               | text           | `info`, `warning`, `critical`                        |
| `title`                  | text           | Short human title                                    |
| `message`                | text null      | Longer explanation                                   |
| `details`                | jsonb          | Structured metadata                                  |
| `source`                 | text           | `system`, `user`, `ai`, `rule`                       |
| `status`                 | text           | `open`, `resolved`, `dismissed` — default `open`     |
| `flag_key`               | text null      | Dedup key: `{scope}:{entity_id}:{code}:{path}`       |
| `category`               | text null      | Denormalized from `flag_definitions`                 |
| `action_path`            | text null      | Deep link for staff to navigate                      |
| `rule_version`           | text null      | Version of the rule that created this                |
| `source_dec_page_id`     | uuid null      | EXISTING — kept for backward compat                  |
| `created_by_account_id`  | uuid null      | Who created (for manual flags)                       |
| `assigned_account_id`    | uuid null      | Who's assigned to work this flag — NEW               |
| `assigned_office`        | text null      | Office assignment — NEW                              |
| `first_seen_at`          | timestamptz    | When system first detected — NEW                     |
| `last_seen_at`           | timestamptz    | When system last confirmed — NEW                     |
| `times_seen`             | int            | Bump count on each re-evaluation — NEW               |
| `resolved_at`            | timestamptz    | When resolved                                        |
| `resolved_by_account_id` | uuid null      | Who resolved                                         |
| `dismissed_at`           | timestamptz    | When dismissed — NEW                                 |
| `dismissed_by_account_id`| uuid null      | Who dismissed — NEW                                  |
| `dismiss_reason`         | text null      | Free-text reason for dismissal — NEW                 |
| `created_at`             | timestamptz    | Auto-set                                             |
| `updated_at`             | timestamptz    | Auto-set, updated on every change — NEW              |

**Indexes:**
- Partial unique: `UNIQUE (flag_key) WHERE status = 'open'` — prevents duplicate open flags
- `(policy_id, status)` — fast filter for policy page
- `(client_id, status)` — fast filter for client page
- `(status, severity, created_at)` — fast dashboard queue

### `public.flag_events`
**Purpose:** Immutable audit trail for every flag lifecycle event.

| Column              | Type          | Notes                                      |
|---------------------|---------------|--------------------------------------------|
| `id`                | uuid PK       | Auto-generated                             |
| `flag_id`           | uuid FK       | References `policy_flags.id` ON DELETE CASCADE |
| `event_type`        | text           | `created`, `resolved`, `dismissed`, `reopened`, `assigned`, `severity_changed`, `note_added` |
| `actor_account_id`  | uuid null      | Who did it (null = system)                 |
| `note`              | text null      | Free-text context                          |
| `details`           | jsonb          | Structured diff, e.g. `{"old_severity":"info","new_severity":"warning"}` |
| `created_at`        | timestamptz    | Auto-set                                   |

---

## 3. Flag Key Format

```
{entity_scope}:{entity_id}:{code}:{subject_path}
```

Examples:
- `policy:abc-123:MISSING_DWELLING_LIMIT:` — dwelling limit missing on a policy term
- `policy:abc-123:RENEWAL_UPCOMING:` — renewal is due
- `client:xyz-789:MISSING_EMAIL:` — client has no email
- `policy:abc-123:MISSING_PREMIUM:annual_premium` — specific field path

The `subject_path` is optional — use it when the same `code` could fire for different fields.

Only **one open flag per `flag_key`** is permitted (enforced by partial unique index).

---

## 4. Lifecycle

```
   ┌─────────┐
   │ Created │──► OPEN
   └────┬────┘
        │
   ┌────▼────┐     ┌───────────┐
   │  OPEN   │────►│ RESOLVED  │  (condition cleared or staff marks resolved)
   └────┬────┘     └───────────┘
        │
   ┌────▼────────┐
   │  DISMISSED  │  (staff dismisses — "not relevant" / "false positive")
   └─────────────┘
```

- **Resolved** = the underlying condition has been fixed (auto or manual).
- **Dismissed** = staff says "I don't care about this one." Requires `dismiss_reason`.
- If a dismissed condition **reappears**, a **new** flag instance is created (new row, new `id`). The old dismissed row stays as history.

---

## 5. Severity Conventions

| Severity   | Weight | Use for                                                      |
|------------|--------|--------------------------------------------------------------|
| `critical` | 3      | Immediate action needed: missing premium, policy expired     |
| `warning`  | 2      | Should fix soon: renewal in 21 days, DIC gap, missing data   |
| `info`     | 1      | Informational: duplicate detected, minor data note           |

---

## 6. Categories

| Category       | Description                                                  |
|----------------|--------------------------------------------------------------|
| `data_quality` | Missing or invalid data fields                               |
| `renewal`      | Upcoming renewal deadlines                                   |
| `coverage_gap` | Missing coverage limits, DIC issues                          |
| `dic`          | DIC-specific gaps                                            |
| `duplicate`    | Possible duplicate client/policy                             |
| `workflow`     | Operational/process flags                                    |
| `manual`       | Staff-created manual flags                                   |
| `parser`       | Parsing/extraction failures                                  |

---

## 7. How to Add a New Flag Rule

1. **Add a row to `flag_definitions`** with the new `code`, `label`, `category`, `default_severity`, `entity_scope`, `auto_resolve`.

2. **Add evaluator logic** in `worker/src/db/flags.py`:
   - Check the condition
   - Build the `flag_key`
   - Upsert: if an open flag with this key exists, bump `last_seen_at` and `times_seen`; otherwise insert
   - If `auto_resolve` is true and condition is cleared, set `status = 'resolved'`

3. **Bump `rule_version`** in the definition if logic changes.

4. **No UI changes needed** — the flag will automatically appear on the policy/client page and the dashboard queue.

---

## 8. Naming Conventions

- **Code**: `SCREAMING_SNAKE_CASE`, e.g. `MISSING_DWELLING_LIMIT`
- **Entity scope**: lowercase singular, e.g. `policy`, `client`, `policy_term`
- **Category**: lowercase `snake_case`
- **Severity**: lowercase: `info`, `warning`, `critical`
- **Status**: lowercase: `open`, `resolved`, `dismissed`
- **Event types**: lowercase: `created`, `resolved`, `dismissed`, `reopened`, `assigned`, `severity_changed`, `note_added`
