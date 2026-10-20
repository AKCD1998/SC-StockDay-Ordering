# Complete Hourly cohorts — preparation only, OFF by default

This change prepares branch 004 to handle the whole web catalog without a
morning-by-morning B50/B100 ladder. It does not enable a pilot, install a Task,
change a credential, run Sync, or change Full Sync/Transfer Delta queries.

## Contract and bounds

- Existing captures without coverage metadata retain their exact identity,
  500-record limit and 256 KiB body limit.
- A separate opt-in, ADAPOS_HOURLY_STOCK_EVIDENCE_COMPLETE_COHORT, defaults OFF.
  The existing three Hourly switches also stay OFF. No config changes ship here.
- Complete cohorts are 004 only: at most 10,000 expected products and 4 MiB
  per assembled capture. Membership comes from an approved private manifest,
  never a truncated environment variable.
- The intraday reader uses one connection and sequential batches of 100
  (hard maximum 500), retains the existing PR66 reader/formulas and suppressions,
  and only queues after all batches and coverage validation finish.
- Local guard checks CPU below 70%, existing Agent/Full Sync activity and a
  15-minute quiet window before every batch. A missing guard fails closed.
  No existing process is stopped.
- Combined SQL work in each batch has a 3,000 ms deadline; a completed batch
  over 2,000 ms stops further reads. The whole collection, including guards,
  has a separate 120,000 ms upper bound. These do not relax per-read limits.
- A changed observer clock boundary over 250 ms stops assembly. This is not
  proof of Windows time synchronization or SQL business freshness.
  Combining batches preserves missing/inconsistent SQL clock diagnostics;
  it never relabels them as a consistent observation.
- One logical slot is one durable upload, not independent per-batch captures.
  Thirteen slots are thirteen uploads. The outbox keeps the existing 168-item
  cap and adds a 64 MiB byte cap, without evicting unsent evidence.
- Complete-mode replay is sequential, up to 24 uploads and 60 seconds; each
  request has one attempt and a timeout bounded by remaining time. A failed or
  invalid acknowledgement preserves the exact queued body.

## Private manifest preparation while capture stays OFF

After a separately approved backend release, its separate complete-cohort
flag may authorize GET /api/hourly-stock-evidence/cohort?branchCode=004.
This uses the existing branch-specific Hourly credential; it does not require
the receiver to be ON, read stock, write capture rows or alter credentials.
An absent/incorrect credential or disabled complete-cohort flag stops the call.

An operator may then run src/prepareHourlyCohortManifest.js from the existing
repository. It refuses all three enabled Hourly switches, reads only catalog
membership, and writes a new private file in the existing protected cache
directory. It refuses redirects, oversized bodies and overwriting an existing
file. Output contains only the count and file location. It does not edit .env,
Tasks or the source repository. ADAPOS_HOURLY_STOCK_EVIDENCE_COHORT_FILE is only a
future approved config pointer; preparing a manifest does not set it.

Keep the cache SYSTEM/Administrators only using the existing deployment
procedure. Do not paste the manifest, credentials or capture bodies into chat.
Do not broaden SQL permissions or Git trust to make preparation pass.

## Coverage versus availability

On 20 October 2026 the readonly aggregate reference was 7,042 unique website
products and 6,827 active branch-stock products. The difference of 215 is not
zero stock. Coverage metadata privately accounts for unavailable identities;
reports show counts and mark source completeness as incomplete. Ingestion of a
new web-all capture checks membership against the current website catalog.
Catalog changes require a newly approved manifest, not silently dropping rows.
An exact retry of a committed capture still acknowledges after catalog drift.

The morning anchor only projects rows already accepted by successful Full
Sync, with its original receipt requirement. It does not add SQL reads or
change canonical Full Sync stock. All unavailable products remain unavailable.

## Evidence required before a full-size field pilot

1. Agent and backend contract/scale/error tests and CI pass; backend migration
   is reviewed and deployed separately under production migration rules.
2. Operator-local readonly full-size load measurement passes the unchanged
   CPU/quiet-window/2-second/3-second limits, including worst-case movement
   volume. Synthetic timings are not SQL benchmarks.
3. The natural operational cycle and final self-disable pass. Boot/Logon
   evidence alone cannot guarantee a baseline before POS posting.
4. Explain unavailable products and agree the business freshness/drift policy.
   Keep NOLOCK, non-atomic/ABA, missing posting watermark and unverified time
   synchronization explicit. Stable bookends never qualify stock accuracy.
5. A separately approved bounded pilot may use full size directly if these
   gates pass; this PR does not authorize its flags, schedule or backend ON.

The session-only remote shadow was not started: original-identity source CPU
inspection was Access denied before any stock query. Do not bypass that denial.
An operator-local measurement or approved access change needs human action.

## Tests

Synthetic source batches cover 50, 100, 200, 500, 501, 1,000, 2,000, 5,000,
6,827, 7,042 and 10,000 products, unavailable products, whole-run failure,
clock/privilege/deadline guards, Full receipt gating, exact replay, byte/budget
limits and private manifest preparation. Backend local PostgreSQL integration
uses these Agent builders to test all 13 slots, reporting and idempotency.
No production SQL, captures, Sync or migrations are part of these tests.
