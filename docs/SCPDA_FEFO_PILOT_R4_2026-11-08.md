# SCPDA R4 — branch 001 lot observations and admin review

Continuation of the same SCPDA project, source branch `codex/pda-durable-demo`.
R4 adds optional authenticated count upload to the R3 local lot/date UI. Existing
live reader remains available, and the new count service is not activated.

## Delivered behavior

- Manufacture date, expiry date, lot and whole-number quantity, multiple lots,
  explicit unknowns, category and independent count round; same approved SC
  navy/blue/yellow/white theme and red “อ่านบาร์โค้ด” action.
- Fresh device-purpose proof negotiates a distinct count capability after the
  existing registered-device PIN reader login. It uses the same three accounts,
  creates no credentials, and exposes only availability to JS. Count JWT stays
  in native memory. Disabled/absent count service leaves reader/local counts
  usable. No old mobile PIN/refresh contract is invented.
- Confirmed count intent queues a fixed event UUID and payload in an additive
  IndexedDB v2 sidecar. Old R3 counts/drafts survive and are not silently sent.
  Legacy local-only results require explicit “ส่งผลนับนี้” confirmation.
- Recovery looks for a receipt before retrying an upload. A receipt is accepted
  only with the exact event/branch/contract, receipt UUID, server time and
  official-stock-write=false marker. Network failures retain the queue. Account
  switches cannot attribute another operator's queued count to the new login.
- A lot previously estimated depleted requests a reason. A reason allows the
  entry, records a review issue, and returns a receipt. Admin can review evidence
  and the app receives that review status/reason on refresh. Corrections keep
  the original and original observation time, and append a linked new event.
- Background history refresh cannot pull someone back from Scan; saving during
  an existing sync schedules another flush rather than stranding the new row.

## Verification actually performed

Backend source is in the existing PaaSRTSM repository's isolated branch
`codex/scpda-fefo-pilot-001`, based on deployed reader commit `a04e8a49`.
Admin source is based on current frontend main `01400bf`, branch
`codex/scpda-fefo-admin-001`, preserving branch005 and branch004 work.

Current evidence directory:
`/workspace/artifacts/scpda-fefo-pilot-2026-11-08`.

- 8 pure FEFO checks; 13 HTTP/PostgreSQL ledger/auth/review/immutability checks;
  2 default-off checks; 28 existing auth/mobile reader regressions.
- Admin: 4 component checks and 40 existing branch-stock checks passed. One new
  targeted entry test verifies default-off and admin-only gating. Vite build
  passes (existing large-chunk warning retained).
- 7 real-browser IndexedDB/recovery checks, including actual v1→v2 migration,
  explicit old-record upload, account switching, wrong receipt rejection, and
  save during in-flight refresh. Transport in these checks is synthetic.
- Exact final APK HTML → shipping host JVM `StockDaySession` with software test
  key → actual isolated HTTP/auth/PostgreSQL → actual admin React component:
  nine linked checks passed. They include reason/receipt, admin review returned
  to app, offline cold reopen, lost accepted response, correction and a second
  clean browser store. Synthetic camera verifies aim-first/torch-off/red action;
  it does not verify hardware camera/torch or Android WebView.
- Owned PostgreSQL persistent-volume container and API process were restarted.
  All 27 accumulated synthetic observation IDs, receipt IDs and payload hashes
  were unchanged. Four final-flow receipts were reopened through a fresh host
  JVM session. Existing reader still works against a count-disabled fixture;
  count access is unavailable there, with no downgrade in reader auth.
- Fixture official stock remains exactly 6/null/-2. No official inventory write,
  live authenticated count, production migration, deploy, CORS change, hosted
  v4 publish or new ScProductDev/physical Android run occurred in this phase.

The browser harness was corrected during development for asynchronous waits,
synthetic offline handling of local native status, icon text and CSS transitions.
A real history-navigation/sync race found by that exercise was fixed before the
final passing exact-APK run. Earlier failed logs are development attempts, not
passing evidence. Do not count them as independent accepted runs.

## FEFO and activation limitations

The backend stores observations, lots, receipts, immutable reviews and projection
history separately from Ada stock. Full Sync observation time and pack/unit
factor are still unknown. Admin acceptance confirms the measurement only; it
does not select a current-stock override or adjust Ada.

The pure FEFO policy requires reviewed complete baseline + verified units +
complete deduplicated movements. The live Ada movement adapter is **not**
verified/connected. Synthetic projection evidence is not real sales coverage.
An actual pilot can collect lot observations first while estimates remain
unknown; no false zero is generated to fill incomplete history. No scheduled
Codex/LLM auditor or official Ada adjustment job was activated.

Production activation is pending the earlier explicitly separate approval for
the exact new migration `083_add_scpda_lot_observations.sql`, new branch001 count
submit capability (`FEATURE_SCPDA_COUNTS_001`), reviewed backend deployment and
admin UI deployment/build flag (`VITE_FEATURE_SCPDA_LOTS_001`). Existing keys,
PINs, CORS and branch004/005 logic remain unchanged. Render's current predeploy
runs migrations; merging even with flags off would cross the migration gate.

Existing source branch includes historical unmerged PDA work. Do not merge that
whole branch into current frontend main. The reviewed admin PR is based on
current main; the Android source package/patch is separately scoped for review.

User may shut down the office PC while this cloud turn runs. Development and
synthetic checks are cloud-local. This does not create an indefinite background
schedule or permit office-only Ada access after that machine shuts down.
