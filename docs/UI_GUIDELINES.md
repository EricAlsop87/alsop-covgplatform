# UI Design System – CFP Platform

Design language extracted from reference: enterprise insurance SaaS dashboard (Shoor).
All values are strict. Do not deviate without updating this document.

---

## 1. Color System (Dark Mode First)

| Token | Value | Usage |
|---|---|---|
| `--bg-base` | `#0b0e14` | Page-level background, deepest layer |
| `--bg-surface` | `#12151c` | Sidebar, panels, card bodies |
| `--bg-surface-raised` | `#1a1e28` | Hover rows, elevated panels, dropdowns |
| `--bg-surface-overlay` | `#21252f` | Modals, popovers, expanded row content |
| `--border-default` | `rgba(255, 255, 255, 0.06)` | Panel borders, dividers, table lines |
| `--border-subtle` | `rgba(255, 255, 255, 0.03)` | Faint separators between sidebar groups |
| `--accent-primary` | `#3b3ff0` | Active row highlight, sidebar active item bg, primary buttons |
| `--accent-primary-hover` | `#4a4ef5` | Hover on primary accent elements |
| `--accent-primary-muted` | `rgba(59, 63, 240, 0.12)` | Subtle accent tints on badges, chips |
| `--text-high` | `#f1f3f5` | Headings, policy names, monetary values |
| `--text-mid` | `#8b92a5` | Column headers, labels, descriptions |
| `--text-muted` | `#555d72` | Timestamps, secondary metadata, disabled |
| `--text-accent` | `#818cf8` | Links, active tab labels |
| `--status-success` | `#22c55e` | "Renews in 30 days" dot, success badges |
| `--status-warning` | `#f59e0b` | Near-expiry, attention-needed |
| `--status-error` | `#ef4444` | Lapsed, failed, overdue |
| `--status-info` | `#3b82f6` | Informational badges, count pills |

### Rules
- **No pure white** (`#fff`) for backgrounds. Maximum brightness is `--bg-surface-overlay`.
- **No pure black** (`#000`) for text. Use `--text-high` (`#f1f3f5`).
- Accent color is **indigo-blue** (`#3b3ff0`), not cyan or teal.
- Status colors appear **only** as dots, badge backgrounds, or border tints — never as full-width fills.

---

## 2. Layout System

### Structure
```
┌──────────────────────────────────────────────────────┐
│  Top bar (command search, user avatar, icons)        │
├────────────┬─────────────────────────┬───────────────┤
│            │                         │               │
│  Sidebar   │   Main Content Area     │  Summary      │
│  240px     │   flex: 1               │  Panel        │
│  fixed     │   max-width: 960px      │  280–320px    │
│            │                         │  optional     │
│            │                         │               │
└────────────┴─────────────────────────┴───────────────┘
```

| Element | Spec |
|---|---|
| Sidebar | `width: 240px`, fixed position, full height, `--bg-surface` |
| Top bar | `height: 48px`, spans full width above sidebar + content |
| Main content | Fluid, padded `2rem`, max-width `960px` |
| Summary panel | `width: 280–320px`, right-aligned, appears on detail views |
| Page padding | `padding: 2rem` on main content |
| Section gap | `gap: 1.5rem` between major sections |

### Grid
- **Tables**: Full-width within main content area
- **Summary cards**: Stack vertically in summary panel, `gap: 1rem`
- **Form layouts**: Max `700px`, centered

---

## 3. Component System

### 3.1 Table Rows

| State | Background | Border | Text |
|---|---|---|---|
| Default | `transparent` | `1px solid var(--border-default)` bottom | `--text-high` / `--text-mid` |
| Hover | `var(--bg-surface-raised)` | Same | Same |
| Active / Selected | `var(--accent-primary)` | None | `#fff` for all text |
| Expanded (child) | `var(--bg-surface-overlay)` | `1px solid var(--border-default)` | `--text-high` / `--text-mid` |

- Rows use `padding: 0.875rem 1rem`
- Expanded content indents `2rem` from left edge
- Expansion toggle is a chevron icon, left-aligned

### 3.2 Sidebar Navigation

| State | Style |
|---|---|
| Section header | Uppercase, `--text-muted`, `font-size: 0.7rem`, `letter-spacing: 0.08em`, `margin-top: 1.5rem` |
| Item (default) | `--text-mid`, `padding: 0.5rem 0.75rem`, `border-radius: 0.375rem` |
| Item (hover) | `background: var(--bg-surface-raised)`, `color: var(--text-high)` |
| Item (active) | `background: var(--accent-primary)`, `color: #fff`, `font-weight: 500` |
| Icon | 18px, left of label, `gap: 0.625rem` |

### 3.3 Status Badges

```
● Renews in 30 days     →  Green dot + text
● Coverage D...         →  Blue bg pill, rounded
```

| Variant | Style |
|---|---|
| Dot + label | `8px` circle + `font-size: 0.8rem`, `color: status color`, no background |
| Pill badge | `padding: 0.25rem 0.625rem`, `border-radius: 9999px`, bg at `0.12` opacity, text at full color |
| Count badge | `font-size: 0.75rem`, `background: var(--accent-primary-muted)`, `color: var(--text-accent)`, inline after tab label |

### 3.4 Summary Cards

- Background: `var(--bg-surface)`
- Border: `1px solid var(--border-default)`
- Border-radius: `0.75rem`
- Padding: `1.25rem`
- Title: `--text-mid`, `font-size: 0.8rem`, uppercase
- Value: `--text-high`, `font-size: 2rem`, `font-weight: 700`

### 3.5 Buttons

| Variant | Background | Border | Text | Hover |
|---|---|---|---|---|
| Primary | `var(--accent-primary)` | None | `#fff` | `var(--accent-primary-hover)` |
| Ghost | `transparent` | `1px solid var(--border-default)` | `--text-mid` | `bg: var(--bg-surface-raised)` |
| Subtle | `var(--bg-surface-raised)` | None | `--text-high` | Lighten bg 5% |
| Destructive | `rgba(239, 68, 68, 0.12)` | None | `--status-error` | Increase bg opacity to 0.2 |

All buttons: `border-radius: 0.5rem`, `padding: 0.5rem 1rem`, `font-size: 0.875rem`, `font-weight: 500`

### 3.6 Section Headers

- Title: `font-size: 1.25rem`, `font-weight: 600`, `color: var(--text-high)`
- Description: `font-size: 0.875rem`, `color: var(--text-mid)`, directly below title
- Gap between title and description: `0.25rem`
- Bottom margin: `1.5rem`

### 3.7 Tabs

- Container: `border-bottom: 1px solid var(--border-default)`
- Tab (default): `color: var(--text-mid)`, `padding: 0.75rem 0`, `margin-right: 1.5rem`
- Tab (active): `color: var(--text-high)`, `font-weight: 500`, `border-bottom: 2px solid var(--accent-primary)`
- Count pill: Inline after label, uses count badge styling

---

## 4. Elevation Rules

| Level | Method | When to use |
|---|---|---|
| Flat | No border, no shadow | Content within a panel |
| Surface | `1px solid var(--border-default)` | Cards, sidebar, panels |
| Raised | Subtle border + `background: var(--bg-surface-raised)` | Hover states, dropdowns |
| Overlay | `box-shadow: 0 8px 32px rgba(0,0,0,0.4)` + border | Modals, command palette |

### Rules
- **Never use drop shadows** on cards or panels in normal flow. Use borders only.
- **Glow** is reserved for focus rings: `0 0 0 3px var(--accent-primary-muted)`
- Depth is conveyed through **background color steps**, not shadows.
- Modals are the only elements that use a shadow + backdrop blur.

---

## 5. Typography System

| Role | Size | Weight | Color | Tracking |
|---|---|---|---|---|
| Page title | `1.25rem` | 600 | `--text-high` | `-0.01em` |
| Section heading | `1rem` | 600 | `--text-high` | Normal |
| Column header | `0.8rem` | 500 | `--text-mid` | `0.03em` |
| Body / row text | `0.875rem` | 400 | `--text-high` | Normal |
| Description / sub | `0.875rem` | 400 | `--text-mid` | Normal |
| Muted metadata | `0.8rem` | 400 | `--text-muted` | Normal |
| Numeric emphasis | `1.75–2rem` | 700 | `--text-high` | `-0.02em` |
| Sidebar group | `0.7rem` | 600 | `--text-muted` | `0.08em`, uppercase |
| Status text | `0.8rem` | 500 | Respective status color | Normal |

### Font Stack
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

### Numeric Values
- Premiums and totals use **tabular-nums** (`font-variant-numeric: tabular-nums`)
- Dollar amounts: `font-weight: 600` at body size, `font-weight: 700` at summary size
- Right-align all numeric columns in tables

---

## 6. Interaction Rules

### Hover Transitions
- All interactive elements: `transition: all 150ms ease`
- Background transitions only (not color flashes or transform bounces)
- No `transform: scale()` on hover — keep elements stationary

### Row Expansion
- Chevron icon rotates `90deg` on expand (`transition: transform 150ms ease`)
- Expanded content slides in with `max-height` transition or simple show/hide
- Expanded area uses `--bg-surface-overlay` background
- Nested table within expanded row uses reduced padding

### Active Selection
- Active row gets `background: var(--accent-primary)` as a solid fill
- All text within active row becomes `#fff`
- Active sidebar item uses the same accent background

### Focus States
- All focusable elements: `outline: none; box-shadow: 0 0 0 3px var(--accent-primary-muted)`
- Tab key navigation must be visible
- Focus rings use accent color at low opacity, not browser default blue

---

## 7. Design Philosophy

| Principle | Rule |
|---|---|
| **Data density** | Prioritize information per screen. No excessive whitespace between rows. |
| **Quiet chrome** | UI framework (borders, headers) should recede. Data should dominate. |
| **Flat hierarchy** | Depth through color steps, not shadows. Maximum 4 background levels. |
| **No gradients** | Backgrounds are solid. No linear-gradient or radial-gradient on surfaces. |
| **Minimal decoration** | No rounded-corner cards-within-cards. No decorative icons. No illustrations. |
| **Accent restraint** | Primary accent (`#3b3ff0`) used for active state only — not decorations. |
| **Enterprise tone** | Professional, serious, data-centric. Not playful, not startup-casual. |
| **Responsive but desktop-first** | Sidebar collapses at `<1024px`. Tables scroll horizontally at `<768px`. |

---

## Quick Reference: CSS Custom Properties

```css
:root {
  --bg-base: #0b0e14;
  --bg-surface: #12151c;
  --bg-surface-raised: #1a1e28;
  --bg-surface-overlay: #21252f;

  --border-default: rgba(255, 255, 255, 0.06);
  --border-subtle: rgba(255, 255, 255, 0.03);

  --accent-primary: #3b3ff0;
  --accent-primary-hover: #4a4ef5;
  --accent-primary-muted: rgba(59, 63, 240, 0.12);

  --text-high: #f1f3f5;
  --text-mid: #8b92a5;
  --text-muted: #555d72;
  --text-accent: #818cf8;

  --status-success: #22c55e;
  --status-warning: #f59e0b;
  --status-error: #ef4444;
  --status-info: #3b82f6;

  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-full: 9999px;

  --transition-fast: 150ms ease;

  --sidebar-width: 240px;
  --topbar-height: 48px;
  --content-max-width: 960px;
  --summary-panel-width: 300px;
}
```
