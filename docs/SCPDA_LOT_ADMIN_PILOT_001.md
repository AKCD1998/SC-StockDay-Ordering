# SCPDA lot review in StockDay admin

Implemented against current main `01400bf` with the branch 005 vigilant changes
retained. Activation candidate only; no publish/deploy in this phase.

The existing branch-stock product-code cell receives a “ล็อต / ผลนับ PDA” entry
and the page receives a branch 001 review-queue entry **only** when
`VITE_FEATURE_SCPDA_LOTS_001=true` and the current account is admin. The server
independently requires existing admin web auth, CSRF and review revision.

The drawer separates Full Sync reference, most recent observed count/time/unit,
and FEFO inference. Partial counts and independent rounds remain distinct; no
quantity summing, source override, order submission or official Ada adjustment
is performed. Lot manufacture/expiry unknowns stay explicit. A previously
estimated depleted lot can be recorded with a reason and reviewed without
asserting staff are wrong. Corrected/unaccepted projection baselines retain
their history and stop being presented as valid estimates. Other branches
show missing PDA coverage, never invented zero stock.

Admin can accept the measurement, request a recount, dismiss or read review
history. Acceptance is evidence review, not approval of a current inventory
adjustment. Corrections show the linked immutable original. Last-observed time
is distinct from server receive time and Full Sync ingestion time.

The backend contract is `/api/stock-lots`, `scpda-counts-001-v1`; see the reviewed
backend `docs/SCPDA_COUNT_PILOT_001.md`. No live FEFO movement-completeness
provider is verified yet. The quantity estimate can correctly remain unknown
while the pilot begins collecting observations.

Tests: component review/unknown/branch/queue behavior; actual BranchStockPanel
regressions and default-off/admin-only entry; Vite production build; separate
browser execution against actual fixture HTTP/auth/PostgreSQL. The fixture
HTML/JSX under `tests/fixtures/` is loopback-only, not a deployed route and is
not imported by the production app. Prior ScProductDev/static/hosted v4 and
physical Android acceptance do not constitute verification of this new UI.

Production activation requires separately approved backend migration/deploy,
branch 001 submit flag, and this frontend deployment/build flag. Reverting or
disabling the frontend flag hides the entry without deleting evidence. Existing
stock columns, branch004 Hourly/Shopee and branch005 alert logic are unchanged.
