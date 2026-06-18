# Inter-Branch Stock Request Rollout Runbook

This runbook covers WP-14 rollout for the branch-facing `order-web` and the authoritative
backend in the sibling `PaaSRTSM-project` repository. The legacy
`SC-StockDay-Ordering/server` is not part of this feature.

## Release Gates

Do not enable the feature until all of these pass from clean working trees:

```powershell
cd "C:\Users\scgro\Desktop\Webapp training project\PaaSRTSM-project"
npm test

cd "C:\Users\scgro\Desktop\Webapp training project\SC-StockDay-Ordering"
npm test -w apps/order-web
npm run build -w apps/order-web
npm run test:e2e
```

The E2E harness uses a throwaway PostgreSQL cluster on port `55432`, the real admin API
on port `3001`, and the built order-web on port `4174`. Docker is not required.

## Pre-Deploy Checks

1. Commit and review both repositories together so frontend and backend contracts remain aligned.
2. Back up the live Render PostgreSQL database.
3. Confirm migrations `033`, `034`, and `035` have not already been recorded by the migration runner.
4. Confirm the backend has branch users and branch mappings configured.
5. Keep both flags disabled initially:
   - Backend: `FEATURE_STOCK_REQUESTS=false`
   - order-web build: `VITE_FEATURE_STOCK_REQUESTS=false`
6. Set `VITE_API_BASE_URL` to the deployed PaaSRTSM API origin.
7. Confirm the API CORS allowlist accepts the new order-web static-site origin with credentials.

## Database and Backend

Run migrations only from `PaaSRTSM-project`:

```powershell
cd "C:\Users\scgro\Desktop\Webapp training project\PaaSRTSM-project"
npm run db:migrate
```

Expected new migrations:

- `033_add_stock_request_workflow.sql`
- `034_add_stock_request_fulfillment.sql`
- `035_allow_branch_audit_role.sql`

Deploy the backend with `FEATURE_STOCK_REQUESTS=false`, verify `/admin/health`, and inspect
startup logs before enabling traffic.

## Static Site

The `sc-stockday-order-web` static service is declared in `render.yaml`. Its SPA rewrite
routes all paths to `index.html`.

Deploy once with `VITE_FEATURE_STOCK_REQUESTS=false`. Verify the disabled screen, API URL,
TLS, cookie behavior, and CORS. Vite environment variables are compiled at build time, so
changing `VITE_FEATURE_STOCK_REQUESTS` requires a rebuild.

## Pilot Enablement

1. Enable `FEATURE_STOCK_REQUESTS=true` on the backend.
2. Rebuild order-web with `VITE_FEATURE_STOCK_REQUESTS=true`.
3. Pilot only requester branch `001` and source branch `000`.
4. Execute one low-risk request through submit, response, acknowledge, document, dispatch,
   and receipt.
5. Verify domain events, notifications, audit rows, and document versioning in the database.
6. Monitor pending request age, API errors, duplicate idempotency conflicts, and branch login failures.
7. Expand to branches `003`, `004`, and `005` only after pilot sign-off.

## Rollback

For workflow or authorization problems:

1. Set backend `FEATURE_STOCK_REQUESTS=false`.
2. Rebuild order-web with `VITE_FEATURE_STOCK_REQUESTS=false`.
3. Leave migrations and workflow data in place; do not drop tables during an incident.
4. Existing legacy ordering remains available because migrations are additive.
5. Preserve API logs, `ordering.stock_request_events`, notifications, and audit rows for investigation.

Migration `035` broadens the audit-role constraint to include the configured branch role.
Do not roll it back while branch-auth audit rows exist.

## Local Harness Cleanup

The E2E database remains running by default for faster reruns. Stop it with:

```powershell
cd "C:\Users\scgro\Desktop\Webapp training project\SC-StockDay-Ordering\e2e"
$env:E2E_STOP_DB = "1"
npx playwright test specs/smoke.spec.cjs
Remove-Item Env:E2E_STOP_DB
```
