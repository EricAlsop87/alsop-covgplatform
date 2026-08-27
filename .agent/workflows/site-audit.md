---
description: Run a full-site UX audit of the CFP Platform from an agent-first perspective
---

# Full-Site UX Audit

A repeatable process to audit the entire CFP Platform and produce a prioritized improvement report.

## Prerequisites
- Dev server running (`npm run dev`)
- Browser available for page-by-page screenshots

## Step 1: Map all routes

// turbo
Run this to get the complete list of pages:
```
fd page.tsx src/app --type f
```
Also check layouts:
```
fd layout.tsx src/app --type f
```

## Step 2: Map all components

// turbo
Get the component structure to understand what's shared vs page-specific:
```
fd -t d --max-depth 1 src/components
```

## Step 3: Browse and screenshot every page

Use the browser subagent to visit each page in order. For each page:

1. **Navigate** to the page URL
2. **Wait** 2–3 seconds for full load
3. **Screenshot** the top section (above fold)
4. **Scroll down** and screenshot each subsequent section
5. **Note** observations about: layout, spacing, hierarchy, readability, interactions, dead ends

### Pages to audit (in order):
| Page | URL | What to look for |
|------|-----|-------------------|
| Dashboard | `/dashboard` | KPI cards, charts, policy table, stats accuracy, tab behavior |
| Policy Detail | `/policy/[id]` (click into a policy) | Tabs (Review/Flags/Notes/Activity/Files), info cards, action buttons, flag banner |
| Client Detail | `/client/[id]` (click client name) | Contact info, policies table, notes, activity timeline |
| Flags | `/flags` | Severity summary, filters, per-policy accordion, routing from flags |
| Settings | `/settings` | All subsections (Account, Notifications, Display, Data Sources, Admin) |
| Profile | `/profile` | Account info, role display |
| Submit | `/submit` | Auth gate, form layout, agent vs client experience |
| Report | `/report/[id]` (if a report exists) | Standalone layout, print styles, content rendering |

### Interaction testing per page:
- Click every link/button — does it go where expected?
- Check if table rows are clickable
- Check if KPI cards navigate anywhere
- Check if chart elements are interactive
- Look for dead ends (no back button, no breadcrumbs)
- Note any "Coming Soon" or placeholder content

## Step 4: Audit the sidebar navigation

Check from every page:
- Are all nav items present and correct?
- Does "Home" go somewhere useful for authenticated users?
- Is the active state correctly highlighted?
- Is the sidebar consistent across all authenticated pages?

## Step 5: Audit the tables

For each table surface (dashboard policy table, client policies table, flags table):
- **Density**: Are rows compact enough to scan?
- **Readability**: Can you read all columns without horizontal scroll?
- **Sorting**: Is the default sort useful? Can you sort by relevant columns?
- **Filtering**: Are filters appropriate and functional?
- **Actions**: Can you act on rows without full page navigation?
- **Sticky headers**: Do headers stay visible when scrolling?
- **Links**: Are clickable elements obviously clickable?

## Step 6: Check cross-page routing

Test these specific traversal paths:
1. Dashboard KPI card → filtered view (does it navigate?)
2. Dashboard table row → policy detail (clickable?)
3. Policy detail → client page (linked?)
4. Client page → back to policy (linked?)
5. Flags page → specific policy's flags tab (deep-link?)
6. Report → back to policy (link present?)
7. Renewal chart bar → filtered policies (interactive?)

## Step 7: Check branding and consistency

Verify across all pages:
- Is the brand name consistent (header, sidebar, footer, copyright)?
- Are button styles consistent (primary, secondary, destructive)?
- Are card styles consistent?
- Are status labels/badges consistent?
- Are date formats consistent?
- Are empty states handled consistently?

## Step 8: Write the audit document

Save to the artifacts directory as `site_audit.md`. Structure:

### Required sections:
- **A) Quick Wins** — changes under 30 minutes
- **B) Medium-Priority Improvements** — meaningful but take some work
- **C) Structural Improvements** — bigger architectural UX changes
- **D) Routing / Navigation Fixes** — specific cross-linking issues
- **E) Dashboard Improvements** — KPI, chart, and work surface changes
- **F) Table / Worklist Improvements** — density, actions, sorting
- **G) UI / Readability Improvements** — spacing, typography, contrast
- **H) Agent-Workflow Improvements** — operational efficiency

### Per recommendation, include:
- **What** the issue is
- **Why** it matters (from agent perspective)
- **What** you recommend
- **Priority** (High / Medium / Low)
- **Effort** (Small / Medium / Large)

### Required summary rankings at the end:
1. **Top 10 highest-value improvements overall**
2. **Top 5 quickest wins**
3. **Top 5 agent-workflow improvements**
4. **Recommended implementation order** (phased roadmap)

## Step 9: Embed screenshots

Include a carousel of page screenshots at the top of the audit document so the reader can see the current state of each page.

## Tips for a good audit

- **Think like an agent**, not a developer. Ask: "If I had 85 policies to review today, what would slow me down?"
- **Count clicks** — if a common task takes more than 2 clicks, flag it.
- **Check empty states** — what does a page look like with no data?
- **Watch for passive data** — numbers/labels that should be actionable links.
- **Check mobile/responsive** only if the platform is expected to work on tablets.
- **Compare the previous audit** (if one exists) to track what's been fixed and what's new.
