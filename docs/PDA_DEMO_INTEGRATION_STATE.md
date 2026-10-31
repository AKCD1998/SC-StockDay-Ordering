# PDA integration living state

Updated: 2026-10-31, Asia/Bangkok. Owner: existing PDA conversation. Existing Transfer Delta owner was consulted once through the coordinating conversation; response received and incorporated. No replacement owner, CPU-v5/Delta work, or production changes.

| Area | State | Evidence / practical limit |
|---|---|---|
| Hosted PDA | Unchanged, v4 | Existing Sites project metadata read; no source push/save/deploy |
| Approved navy/yellow styling | Preserved | style.css byte-identical to prior committed review |
| Scanner/manual capture/torch-off default | Preserved | camera-scanner, decoder, core and original policy modules unchanged; existing camera checks reused |
| Existing real mobile contract | Owner-confirmed, partial runtime proof | Exact routes/auth/read shape; owner saw anonymous 400/401. No enrolled-device live read |
| Mobile read adapter | Implemented; fixture-tested | Strings/leading zeros, null/zero/negative, unknown pack/uniqueness/cutoff; no fresh/current claim |
| Real mobile stock freshness | Unknown | Full Sync without stock observation timestamp; price/fetch timestamps excluded |
| Hosted-to-production mobile access | Blocked | Owner reported OPTIONS 403 at 11:19 ICT; no bypass attempted |
| Shared count/lot/date storage | Implemented locally | Real SQLite WAL + transaction + immutable rows, synthetic products/accounts only |
| Authentication/assignments | Implemented fixture isolation | Server verification, branch/task/role constraints, expiring session+CSRF. Not production PIN/enrollment |
| Receipts / dedup / conflicts | Implemented and HTTP-tested | Original receipt on same request retry; altered/scoped replay denied; stale revision retained |
| Corrections / source-choice audit | Implemented and tested | New linked record + original retained; source history survives restart |
| Offline queue / cold reopen | Implemented and browser-tested | IndexedDB + app-shell cache; no API/receipt caching; actual reconnect required |
| Multiple browser clients | Tested locally | Separate authenticated contexts see same persisted records. Not a remote phone test |
| Real server-process restart | Tested | SQLite evidence/session/receipt/source history survive a new process; UI records also reopened afterward |
| Real inventory / financial writes | Excluded | No production SQL, Sync, receiving, transfer or official-stock mutations |
| Real staff enrollment / new credentials | Not performed | Original fixture PINs unchanged; no production account/key/permission operations |
| Remote staging / APK deployment | Not performed / pending approval | No staging service was established or exposed |
| Team stocktake sessions / floor rounds | Planned only | Separate architecture document; fixed fixture product assignments are not full session management |

## Actual verification

Final measured results: 37 actual HTTP/SQLite assertions passed; 6 mobile-contract fixture tests passed. Integrated UI, real offline cold reopen, existing camera/torch-off controls, and static correction-flow regressions passed without browser errors. These checks were already scheduled for the implementation; the later status-only clarification did not restart work or trigger duplicate tests.


- `apps/pda-demo-server/tests/api_roundtrip.py`: actual HTTP requests to a separate real Node process and isolated SQLite file, with process termination/restart. Covers authorization, role filtering in the existing handler, assignment/branch/CSRF/origin enforcement, quantity/date/unit checks, idempotency, original preservation, lost-response replay, source history, conflicts and restart.
- `tests/ui_roundtrip.py`: real UI -> API -> durable receipt -> another browser client; two-lot correction with manufacturing/expiry dates; offline queue and retry.
- `tests/offline_reopen.py`: actual network-offline cold reload via app-shell cache; original request/capture time retained; real receipt only after reconnect; API routes absent from cache.
- `apps/pda-preview/tests/mobile-contract.test.mjs`: explicit contract fixtures, including absent pack identity, ambiguous mapping and price-vs-stock time. These are not live authenticated production tests.

Sanitized evidence is retained in the integration handoff artifact. Session cookies, CSRF tokens, bearer tokens and SQLite session files are excluded from distributable artifacts. Paths/receipt/event IDs in evidence identify synthetic test records only.

## Next smallest blocked step

To run a remote-phone pilot, the existing owners must approve an isolated, reachable HTTPS staging endpoint and its auth/count schema/route contract. Current production CORS denial must remain in force until explicitly reviewed. The local demo is complete enough to review/test that contract; it is not proof that those staging decisions have been approved or implemented.
