# New-member targets on the focus-products page

Campaign start: 1 November 2026 (Asia/Bangkok). Recurring monthly targets:

| Branch | New members/month |
| --- | ---: |
| 001 | 500 |
| 003 | 500 |
| 004 | 250 |
| 005 | 250 |

`MemberRegistrationTargets.jsx` appears above the sales targets on `#/focus-products`.
It shows today's new members, monthly totals, remaining targets, percentages, a
month selector and daily counts. It refreshes every minute while visible. Admins
see all four branches; branch/staff accounts see their authenticated branch.

## Data contract

Browser → authenticated `PaaSRTSM-project` API:
`GET /api/member-registration-targets?month=2026-11`.

The API uses the existing server-only `CRM_MIRROR_BASE_URL` and
`CRM_MIRROR_INTERNAL_TOKEN` to read
`GET /internal/crm/member-registrations?month=2026-11` from
`AKCD1998/SC-official-website`. Only daily counts cross this boundary.

CRM records one event per newly created member in
`crm_reporting.member_registrations`, inside the same transaction as the signup.
The POS, counter CRM, staff/app and public QR writers record events. Staff branch
comes from the authenticated device; the QR form asks the customer to select a
branch and supports `?branch=004` to preselect it. Old QR clients and app signups
without a branch remain unattributed. Admins see these separately from targets.
Branch assignment is retained at signup, even if the device is moved later.

Imports, legacy-member adoption, profile edits, code consolidation and fanout
sync never record registration events. Creating a customer directly in native
Ada is outside this SCCRM signup metric. Existing `member_profiles.created_at`
cannot establish a new signup or its branch and is deliberately not backfilled.

The response includes `trackingStartedAt`. Days before tracking show missing
data; future days show no count. A partial first month is explicitly labelled.
CRM failures show an error with retry, rather than zero counts.

## Coordinated release

This is a three-repository change. Before releasing:

1. From the website backend, run
   `node scripts/provision-member-registration-reporting.cjs` against the intended
   CRM database: the default is a dry run ending in ROLLBACK. Review its result.
2. Apply that single private-schema migration with `--apply`. It creates no
   historical-member events, enables RLS, revokes browser-role access and leaves
   tracking inactive. Do not run the unrelated bulk migration runners.
3. Deploy the website registration writers. Their new transactional insert
   requires the reporting tables from step 2.
4. Once the writers are live, run the provisioner with `--apply --activate`.
   This fixes the actual tracking start once; retries preserve it. Counts from
   before activation are excluded. No continuous tracking is claimed for the
   migration/deployment interval.
5. Deploy the shared API, then this frontend. Confirm an authenticated report,
   scoped branch access, and an anonymous 401 without creating fake production
   members. Existing CRM mirror environment values are reused.

For rollback, restore frontend/API first and hide the report before reverting
the website writers; retain the private tables and recorded events. A writer
rollback interrupts tracking, so reconcile that interval before reopening the
report. Never recreate signup events from the current member directory.

## Validation (1 November 2026)

- Shared API: six new tests for targets, scoping, input validation, unavailable
  CRM, timeout, Bangkok dates and recurring months; existing focus-product and
  member-directory suites also pass (32 tests combined).
- CRM: eight new real-PostgreSQL tests cover migration rollback/idempotence,
  POS/counter/staff/QR signup capture, retries, transaction rollback, legacy
  exclusion, Thai date boundaries and private aggregate access. Existing
  signup/loyalty/internal suites pass (41 tests).
- Frontend: three tests cover display, failed refresh/retry and stale-request
  cancellation; the production Vite build passes.
- Browser: real local QR submission for branch 004 increases its report by one
  through the CRM SQL aggregate and shared API. Verified desktop, 390px mobile,
  dark mode and branch-only view with a synthetic local database.

Preview screenshots in the task worktree: `output/playwright/` (local artifacts,
not production figures). No production database changes or deployment occurred
while preparing this implementation.
