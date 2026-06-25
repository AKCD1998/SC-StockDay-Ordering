# CiPData Lookup Migration Assessment

Date: 2026-06-25

## Purpose

This note records the system expedition of the legacy Google Apps Script CiPData app and the suggested redesign for rebuilding the `สำหรับกรอกข้อมูล` workflow in a cleaner React/Express/Supabase shape.

The legacy source inspected was primarily:

- `ClaspSCWAV2/mainMenu.html`
- `ClaspSCWAV2/lookupNfill.html`
- `ClaspSCWAV2/index.html`
- `ClaspSCWAV2/scripts.html`
- `ClaspSCWAV2/closeup.html`
- `ClaspSCWAV2/Code.js`

## Expedition Findings

### 1. The old GAS app is not one screen

The old `สำหรับกรอกข้อมูล` button does not open a simple standalone page. It enters a multi-workflow app assembled into one Google Apps Script HTML shell.

Main parts:

- `mainMenu.html` is only the chooser.
- `lookupNfill.html` defines the main lookup UI.
- `scripts.html` contains most application logic.
- `closeup.html` provides the case-detail modal.
- `Code.js` provides page bootstrapping, report generation, scheduled jobs, and email sending.
- `index.html` composes all pieces and injects Supabase credentials.

### 2. Main end-user workflow

The user journey in the legacy app is:

1. User lands on chooser.
2. User clicks `สำหรับกรอกข้อมูล`.
3. `goLookup()` hides the chooser and shows the lookup screen.
4. The app loads branch options and the first page of encounter records from Supabase.
5. The user searches, filters, sorts, and paginates records.
6. The user can open a row detail modal from the `⋮` button.
7. Inside lookup, a sidebar exposes extra workflows:
   - edit-data external link
   - drug summary
   - follow-up call queue
   - report generation
   - Rx1011 external link

### 3. Actual lookup screen behavior

The lookup screen includes:

- free-text search
- branch filter
- date range filter
- sort field
- sort direction
- advanced filters for:
  - PID
  - symptom
  - drug
- paginated encounter table
- KPI panel for:
  - today count
  - accumulated count
  - monthly target
  - remaining cases
  - required cases per remaining day
- local preference persistence in `localStorage`

### 4. Data sources used by the old app

The browser directly queries Supabase for most read behavior.

Observed dependencies:

- view: `v_encounters_lookup_ui`
- view: `v_encounter_meds_min`
- RPC: `sku_qty_summary`

The `v_encounters_lookup_ui` view is the main source for:

- encounter list
- branch filter options
- KPI counts
- follow-up queue

The `v_encounter_meds_min` view is used by the close-up modal for per-medication detail rows.

The `sku_qty_summary` RPC is used for the summary workflow.

### 5. Row detail / close-up workflow

The row detail modal is more than a popup:

- opens from the table `⋮` button
- fetches case header from `v_encounters_lookup_ui`
- fetches medication detail from `v_encounter_meds_min`
- formats medication rows for human reading and clipboard copy
- supports previous/next navigation across:
  - rows on the current page
  - rows on adjacent pages

This behavior is real product value and should be preserved in the migration.

### 6. Summary workflow

The summary workflow is a separate screen in the same app:

- date range filter
- branch filter
- quick presets
- hide-zero toggle
- free-text search
- totals row
- CSV export

The result is fetched once from `sku_qty_summary` and then re-filtered client-side.

### 7. Follow-up workflow

The follow-up workflow is also a separate screen:

- loads rows by `followup_call` date
- optional branch filter
- local status marking:
  - โทรแล้ว
  - โทรไม่ติด
  - อื่นๆ
- local undo
- JSON export

This state is not persisted to Supabase in the current implementation. It is UI-only state.

### 8. Report workflow

The report modal is a mixed client/server workflow:

Client side:

- collects report type
- collects branch/date/filter inputs
- calls GAS `generateReport(opts)`

Server side in `Code.js`:

- fetches data from Supabase using server-side REST calls
- creates Google Docs documents
- formats tables
- exports PDF
- returns PDF URL to the browser

There are also scheduled report/email jobs in `Code.js` for:

- daily follow-up reports
- yesterday summary
- weekly reports
- monthly reports

### 9. Technical quality assessment

The legacy app works, but it is structurally poor.

Main issues:

- multiple workflows are packed into one giant HTML/GAS shell
- `scripts.html` mixes:
  - state
  - routing
  - querying
  - rendering
  - modal logic
  - report logic
  - exports
  - follow-up logic
- behavior relies on global mutable state
- functions are duplicated or overridden in the same file
- HTML strings are assembled manually
- the boundary between browser logic and server logic is unclear
- Apps Script concerns and CiPData business logic are tightly coupled

Despite that, the workflows are clear enough to migrate safely.

## System Design Suggestion

### 1. Rebuild the behavior, not the structure

The correct migration target is not a line-by-line port of GAS files into React.

The correct target is:

- keep the workflows
- keep the data outputs
- keep the useful UX behaviors
- replace the implementation with a clean layered design

### 2. Recommended stack shape

Suggested stack:

- React frontend SPA
- Express API layer
- Supabase as the real database/backend source

This means:

- Supabase remains authoritative for CiPData data
- React handles the UI and client state
- Express provides a stable application contract between UI and Supabase

### 3. Suggested frontend structure

Suggested routes/pages:

- `/lookup`
- `/summary`
- `/followup`
- `/reports`

Suggested component structure:

- `LookupFilters`
- `LookupTable`
- `LookupPagination`
- `KpiPanel`
- `EncounterDetailModal`
- `SummaryTable`
- `FollowupQueue`
- `ReportModal`

Suggested state/data approach:

- React Query or equivalent for server reads
- local component state for filters and modal state
- `localStorage` only for harmless preferences such as monthly target and KPI range
- no manual DOM rendering

### 4. Suggested backend contract

Instead of letting the browser recreate all Supabase queries directly, introduce a small API layer.

Suggested endpoints:

- `GET /api/cipdata/branches`
- `GET /api/cipdata/encounters`
- `GET /api/cipdata/encounters/:id`
- `GET /api/cipdata/encounters/:id/meds`
- `GET /api/cipdata/kpis`
- `GET /api/cipdata/summary`
- `GET /api/cipdata/followups`
- `POST /api/cipdata/reports`

Why this is better:

- stable frontend contract
- auth and audit are centralized
- easier future refactors if views change
- safer report generation
- easier Render deployment and environment management

### 5. Short-term Supabase strategy

For a low-risk migration, reuse the existing Supabase objects first:

- `v_encounters_lookup_ui`
- `v_encounter_meds_min`
- `sku_qty_summary`

This allows the new app to preserve behavior without first redesigning the data model.

### 6. Longer-term Supabase strategy

After parity is reached, replace ad hoc query-building with explicit SQL/RPC contracts where useful.

Good candidates:

- `get_cipdata_lookup_cases(...)`
- `get_cipdata_lookup_kpis(...)`
- `get_cipdata_followups(...)`

This reduces business logic duplication between frontend and backend code.

### 7. Reporting redesign

The report workflow should be removed from Google Apps Script.

Suggested replacement:

- `POST /api/cipdata/reports`
- backend fetches rows from Supabase
- backend generates PDF directly
- backend optionally emails the result

Implementation options:

- HTML template + headless browser PDF if exact print layout matters
- `pdf-lib` if simpler operational PDF output is enough

### 8. Scheduled jobs redesign

Daily/weekly/monthly report sending should also leave GAS.

Suggested replacements:

- Render cron job
- Node worker
- Supabase scheduler / edge function

Preferred direction:

- Node/Render cron if the rest of the stack is already Express on Render

### 9. Recommended migration order

Safest implementation order:

1. rebuild lookup list page
2. rebuild encounter detail modal
3. rebuild KPI panel
4. rebuild summary page
5. rebuild follow-up page
6. rebuild report generation
7. move scheduled emails off GAS

This gets the highest-usage workflow into React first while postponing the harder server-side reporting work.

## Bottom Line

The legacy CiPData GAS code is messy, but the actual product behavior is understandable and portable.

It can be recreated cleanly in a PERN-style architecture with Supabase as the real backend source if we:

- preserve the workflows
- introduce a proper API boundary
- split the large mixed app into focused React pages/components
- move reporting and scheduled jobs out of Apps Script

The correct migration goal is behavioral parity with a cleaner system, not structural imitation of the old GAS implementation.

## Compatibility Note From Workspace Architecture

The architecture document adds one important implementation constraint:

- `SC-StockDay-Ordering/server` is not the live shared backend.
- The real shared backend is the separate `PaaSRTSM-project/apps/admin-api`.
- Because of that, the React migration in this repo should be built against a stable backend contract and must not assume the legacy SC server is the long-term runtime.

For this reason, the recreated `lookup-web` should speak a dedicated `/api/cipdata/*` contract while keeping local mock mode for frontend work before the shared backend routes are added.
