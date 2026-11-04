# StockDay PDA: frontline counting interface

Date: 2026-11-04. Continues the existing branch-001 PDA, StockDay integration and navy/yellow/white theme. This is an original UI implementation in the existing pilot entry, not a new project or a replacement backend. Hosted v4 and production remain unchanged.

## GitHub research and reuse

Read the official repositories, licenses/manifests and actual implementation or usage documentation. Public activity was checked on this date; it is evidence of maintenance, not proof of security or usability for our staff.

| Source | Inspected revision / license | Pattern adopted |
| --- | --- | --- |
| [InvenTree mobile app](https://github.com/inventree/inventree-app) | `08f78763f4b2c11d7df609f5842ca96e4fa02dae`, MIT | Separate stock-count action, focused quantity form, refresh/feedback following a successful server response. [Stock detail/count implementation](https://github.com/inventree/inventree-app/blob/08f78763f4b2c11d7df609f5842ca96e4fa02dae/lib/widget/stock/stock_detail.dart), [license](https://github.com/inventree/inventree-app/blob/08f78763f4b2c11d7df609f5842ca96e4fa02dae/LICENSE) |
| [OCA WMS / Shopfloor Mobile](https://github.com/OCA/wms/tree/16.0/shopfloor_mobile) | `d66c83df20c2de11e932cba2cd447ea631523615`, module AGPL-3 | State-oriented work screens: get work, scan, enter quantity, confirm. Show context and only relevant actions. [Scenario component](https://github.com/OCA/wms/blob/d66c83df20c2de11e932cba2cd447ea631523615/shopfloor_mobile/static/wms/src/scenario/location_content_transfer.esm.js), [manifest/license](https://github.com/OCA/wms/blob/d66c83df20c2de11e932cba2cd447ea631523615/shopfloor_mobile/__manifest__.py) |
| [OCA Stock Barcodes](https://github.com/OCA/stock-logistics-barcode/tree/18.0/stock_barcodes) | `a5b11ce9a5b8b51ac11ff7ed8ed69759017ab0b0`, module AGPL-3 | Guided scanning with clear expected input, manual alternative, explicit mismatch/error feedback and lot context. [Usage](https://github.com/OCA/stock-logistics-barcode/blob/a5b11ce9a5b8b51ac11ff7ed8ed69759017ab0b0/stock_barcodes/readme/USAGE.md), [manifest/license](https://github.com/OCA/stock-logistics-barcode/blob/a5b11ce9a5b8b51ac11ff7ed8ed69759017ab0b0/stock_barcodes/__manifest__.py) |

These are official InvenTree/OCA organization repositories, not unidentified forks. InvenTree provides Android/iOS build workflows; OCA documents maintainers, CI and test/demo infrastructure. Shopfloor's implemented source was inspected on 16.0 and barcode counting documentation on 18.0, rather than assuming every module exists on the newest default branch.

Their source is free under its license. InvenTree's prebuilt app distribution has separate channels/terms; no promise is made that every app-store/download binary is free. No upstream source, artwork, libraries or framework was copied into this app. We adapted interaction ideas with original SC HTML/CSS/JS. Consequently this change adds no Odoo/Flutter dependency, account, subscription or hosting service. Copying AGPL code in a future change requires a separate license review.

## Applied interface

- Count / Records / Operator views replace the always-visible form/history columns. Three visible steps: scan, count, review.
- Keep branch, server-provided work scope, area and round visible. Round 1/2/3 remain independent recounts; the UI never adds them together.
- A prominent camera button and Bluetooth/manual barcode alternative both use the existing lookup. A scan still selects a product; it does not save or increment stock.
- Explicit unit selection remains mandatory. No unit/factor is inferred from a barcode or product name. Missing factors remain unknown.
- Quantity is prominent with a decimal keyboard hint. Each lot has its own expandable card and summary. All lot/manufacturing/expiry fields and explicit unknown choices remain present; no date defaults are invented.
- Sticky total/review action, specific field focus on incomplete input, automatic opening of an invalid collapsed lot, and cancellation that retains the draft.
- Records show received, pending, rejected and conflict states in words. Real receipts and the original correction chain remain available in expandable details. The next-item button returns to the scanner input.
- Main controls are at least 48 px high; selected/error/offline states use words as well as color. Thai labels, native controls, visible focus and reduced-motion support remain.

This design aims to reduce searching, scrolling across old records and training effort during repeated counts. It does not assume staff literacy or dexterity. Gloves, actual shelf lighting, Thai comprehension, screen size and fatigue require a real worker/device trial; browser checks alone do not establish that this interface is easier for every worker.

## Preserved integration

`mobile-count-pilot.mjs`, `pilot-001-outbox.mjs`, `camera-scanner.mjs`, scanner/decoder modules and original R2 app files are byte-identical. The `draft()` payload builder is byte-identical. The backend worktree, migrations, database schema, routes, auth/roles, source-selection rules, official-stock readers and website code are unchanged.

Only view markup/styles/rendering/focus and UI test navigation changed. The existing pilot service worker caches the new CSS as a public app-shell asset, and the existing preparation script includes it in its fingerprint. Origin, worker scope, IndexedDB identity/schema, retry semantics and API caching policy did not change. Tokens remain in memory; enrollment remains the existing one-use-code contract, with no new PIN/refresh mechanism.

Exact string barcodes/leading zeroes, null/zero/negative reference quantities, Full Sync with unknown stock observation time, immutable event UUID/payload, actor/device scope, server receipts and append-only correction semantics are retained. Human counts remain observations held from official stock selection until the existing unit/movement/coverage requirements are met. No receiving/transfer/Sync endpoint is repurposed.

## Verification and boundaries

The updated UI was exercised with the existing StockDay React app, actual candidate HTTP/auth/enrollment/count routers and a fresh, synthetic PostgreSQL fixture. Bootstrap reused only the existing fixture setup; the previously passed backend/React suites were not repeated merely for this UI change.

The full browser run verified web enrollment → PDA count/lot/date receipt → separate StockDay session and cold reload; original plus linked correction; source-decision agreement; real offline draft/queue cold reopening; identical retry after re-enrollment; expired enrollment recovery; two-client 409 conflict retention; and actor-bound drafts. SQL readback confirmed one row for the offline request, zero for the conflicting request, and unchanged official fixture reference 6. API response cache was empty and browser script errors were absent.

Additional UI checks verified invalid-field focus/opening, review cancellation, next-scan focus, no horizontal overflow at 360/390/768 widths, and touch-control sizes. A targeted Chromium fake-camera check verified aiming without a count write, torch off/unsupported by default, enlarged camera controls, Escape preserving the draft, and logout disabling count navigation. It is not physical camera, Bluetooth/HID, hardware torch or Android Volume+ acceptance.

Updated review assets were prepared locally with the existing build script. The standalone review HTML is a read-only screenshot walkthrough from actual fixture runs, not an interactive API client. The included PDA source is the runnable app when served by the existing isolated fixture; production-origin prepared assets do not grant backend access.

Cloud-local fixture results are separate from the old ScProductDev Windows R2/SQLite acceptance and its static port-8765 HTML. This UI candidate has not been run on ScProductDev, staging or a physical phone. Hosted v4 is unchanged. Production activation still requires the previously documented explicit deployment/migration/CORS and accepted auth/count/product-identity contracts. No production action, official inventory write, permission change, new service, cost or persistent access was performed.

See [existing integration/run instructions](PDA_SHARED_INTEGRATION_2026-11-01.md). Evidence and screenshot walkthrough are delivered in `SC-PDA-WORKER-UX-R1`; earlier immutable archives remain unchanged.

## Requested header cleanup — 2026-11-04

Removed the connection/fixture badge and yellow environment/details notice from the PDA header. Routine informational/sync messages no longer render or reserve space; actionable errors and an actual offline transition can still provide feedback. Operator identification remains in the Operator view. No API/auth/storage/count logic changed. The local read-only review was refreshed; hosted v4 remains unchanged. This small change was checked with explicit synthetic UI read fixtures, not a new PostgreSQL/production acceptance run. Earlier real roundtrip evidence stays attached to the immutable R1 delivery.

## Requested title/navigation cleanup — 2026-11-04

Removed the visible “นับสต๊อก สาขา 001” title and the “ผู้ใช้งาน” navigation button. The existing SC/StockDay branding remains and the two remaining navigation actions fill the row. Enrollment remains available before work and for cached-draft reauthentication; the existing operator name/logout controls are a compact footer. Authentication, branch scope, API, outbox and counting semantics are unchanged. The local review is updated; hosted v4 is unchanged.

## Requested scan-copy cleanup — 2026-11-04

Removed the round-explanation disclosure, the scan-section heading/intro and the Bluetooth/Enter help sentence from the scan card. Scope selection, independent-round rules, camera/manual/HID lookup and backend/auth/count code are unchanged. Only markup and this note changed; the local review was refreshed without publishing.

## Requested operator code / avatar — 2026-11-04

The header now uses an original avatar SVG and a five-digit display alias: two-digit branch user number followed by the three-digit branch code. Explicit preview assignments are `001:staff1 → 01001`, `001:staff2 → 02001`, `001:staff3 → 03001`. The label follows the selected enrolled/cached-draft actor and clears on logout; before login it is a neutral dash.

These are presentation aliases, not new credentials or server staff IDs. The current real enrollment roster exposes globally allocated `staffId` values and sorts by display name; it does not expose a stable per-branch ordinal. Therefore the preview mapping is enabled only by the existing explicitly selected loopback fixture mode. Real deployment requires an approved stable branch/staff-to-number assignment; unknown/unassigned users show a dash rather than a fabricated ordinal. Names, roster order, role, truncated IDs and client-side encounter order are never used to invent a code.

The API client, payload, outbox, stored public identity and backend remain unchanged. The alias formatter is a public app-shell module and is included in the existing worker cache/preparation fingerprint so the header also works after an actual offline cold reload. Formatter checks cover the three requested aliases, unknown/malformed identities, explicit assignment for a different global staff ID, and roster/name independence. Browser evidence for this phase uses explicit synthetic API reads and Chromium fake camera; it does not establish new production backend acceptance.

### Footer removal in the same update

Removed the persistent operator-name / branch / disconnect footer. The avatar now opens the existing account actions in a small native dialog; sign-out retains its original draft preservation, explicit-logout flag and authentication behavior. Closing the dialog does not sign out. Enrollment remains on the existing screen. This supersedes the compact-footer placement described above.

## Default phone workspace — 2026-11-04

The default scan card now fills the available mobile viewport: a larger camera action occupies the spare middle space and manual/HID barcode entry stays at the bottom. Small screens and reduced keyboard-height layouts can scroll naturally. The page background covers the viewport, removing the previous lower background band. Expanded scanning controls use a view-only flex layout; selected-product/counting forms retain their compact layout. No explanatory copy, automatic camera start, API or counting behavior was added.

## Avatar finish / future settings cue — 2026-11-04

Replaced the thin outlined person with an original filled profile: white face, light-blue shoulders/collar, navy gradient disc and a small yellow gear badge. The existing 48 px account button, operator code and account dialog remain unchanged. The gear is a visual cue for future account/settings development; no new settings screen, permissions or backend capability is claimed. Only SVG markup/styles and this note changed.

## Category / round simplification — 2026-11-04

The user chose category and independent round for this phase. Two selectors now replace the combined task/area/round control. [Binding semantics, actual HTTP/PostgreSQL evidence and live limitations](PDA_CATEGORY_ROUND_2026-11-04.md). Backend/API/outbox contracts and all earlier visual refinements are retained.
