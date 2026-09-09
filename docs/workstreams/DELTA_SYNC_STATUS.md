# Session D — Delta Sync Status

Last reviewed: 2026-09-09

## Transfer Content Capture 005 — PASS 2/2, ACCEPTANCE CLOSED — 2026-09-09

This is a local documentation closure after a read-only recheck of the three
natural Morning windows. No branch configuration, cache, Scheduled Task,
database, Git ref, or production service was changed while closing the
evidence.

### Natural-window evidence

The branch-005 Morning task ran naturally at 08:20 ICT. Every file below
contains one active Transfer Content Capture result, an accepted Full Transfer
payload, and terminal `Sync succeeded`. A read-only task query after the final
window reported Enabled/Ready, Daily at 08:20, last run 2026-09-09 08:20:02
ICT, result 0, and next run 2026-09-10 08:20.

| Acceptance round | Start -> success (ICT) | Branch-005 log path | Full headers / lines accepted | Transfer classification | Content evidence | Cache evidence | Estimated document reduction |
|---|---|---|---:|---|---|---|---:|
| Round 0 — baseline only, not counted | 2026-09-07 08:20:06 -> 08:21:15 | `X:\SCstockDay\apps\adapos-sync\logs\sync-20260907-082002.log` | 195 / 1,590 | unchanged 0; changed 0; new 195; disappeared 0; would send 195 | capture active; mismatch 0; baseline missing 0; comparison not skipped | rebuilt for `no-previous-cache`; write true | 0.0% |
| Round 1/2 | 2026-09-08 08:20:06 -> 08:21:39 | `X:\SCstockDay\apps\adapos-sync\logs\sync-20260908-082002.log` | 192 / 1,558 | unchanged 190; changed 0; new 2; disappeared 5; would send 2 | capture active; mismatch 0; baseline missing 0; comparison not skipped | loaded; rebuild reason null; write true | 99.0% |
| Round 2/2 | 2026-09-09 08:20:06 -> 08:21:39 | `X:\SCstockDay\apps\adapos-sync\logs\sync-20260909-082003.log` | 196 / 1,618 | unchanged 185; changed 0; new 11; disappeared 7; would send 11 | capture active; mismatch 0; baseline missing 0; comparison not skipped | loaded; rebuild reason null; write true | 94.4% |

Round 0 created the first content-bearing cache and is excluded from the two
comparison rounds. Rounds 1/2 and 2/2 loaded the previous cache, compared
unchanged documents against captured Full content, reported zero content
mismatches and zero missing baselines, and completed the cache write.

The current `transfer-shadow-005.json` independently parses as valid JSON with
contract `delta-shadow-transfers-v1`, storage version
`delta-shadow-transfer-cache-v1`, branch `005`, and 196 cached documents. Its
`updatedAt` is 2026-09-09 01:20:41.909Z, matching the last natural window. The
cache directory has zero `.tmp-transfer-shadow-*` files, and its SHA-256 prefix
remained `C23F92ED6DCA` before and after the read-only inspection.

The volumes are internally stable: headers remain within 192-196, lines remain
within 1,558-1,618, and scanned documents equal accepted headers in every
window. The final 94.4% value is the implementation's document-count estimate
(`185 unchanged / 196 scanned`), not a measured byte reduction.

The three enclosing Agent commits were `4807b7f`, `8c5bc10`, and `5003414`, but
their complete `apps/adapos-sync` subtree hash is identical at
`ce55d59832908aa2dca7c12a560bb0cd63dd1f1e`. No Agent or Transfer runtime change
occurred between the baseline and accepted comparisons.

The final fleet window also completed Full Sync for branches 000, 001, 003,
004, and 005 as runs 2104-2108. All 338 batches were applied, every retirement
was `done`, every reconciliation was `pass`, manifests and generation
membership matched, normalized-vs-wide mismatch count was zero, and associated
sync-error count was zero.

### Closure boundary

This closure certifies only:

- branch `005`;
- Transfer Slice 1 under the unchanged current Full-query scope;
- document types 4, 7, and 8 under the previously established Slice-1 scope;
  and
- two consecutive natural comparison windows after a separate baseline
  window.

It does **not** certify future document types 2 or 3, another branch, Approved
Receipts, or production Delta cutover. Full Sync remains authoritative;
`disappearedCount` remains observational and is not a deletion signal.

Branch `003` is the proposed next Transfer Content Capture canary. Its
2026-09-09 read-only preflight found the registered official host online, the
Agent clean and equal to current `origin/main`, the enabled Daily 08:20 Morning
task with result 0, a successful Full Sync containing 212 accepted Transfer
headers and 1,931 lines, both Transfer keys absent, and no Transfer cache.
Those facts make branch 003 ready for a separately authorized configuration
change; this closure does not itself enable it or create Round 0.

## Transfer Content Capture 004 — PASS 2/2, ACCEPTANCE CLOSED — 2026-09-03

This is a local documentation closure prepared for Tech Lead review after a
read-only recheck. No branch configuration, cache, Scheduled Task, database,
Git ref, or production service was changed while closing the evidence.

### Natural-window evidence

The branch-004 daily Morning task is scheduled for 08:20 ICT. A read-only task
query after the last window reported `Ready`, last run 2026-09-03 08:20:01 ICT,
and result 0. Each file below contains one Transfer Shadow result followed by
terminal `Sync succeeded`.

| Acceptance round | Start -> success (ICT) | Branch-004 log path | Full headers / lines accepted | Transfer classification | Content evidence | Cache evidence | Estimated document reduction |
|---|---|---|---:|---|---|---|---:|
| Round 0 — baseline only, not counted | 2026-09-01 08:20:07 -> 08:22:05 | `Q:\Users\Administrator\Desktop\RxAuu\apps\adapos-sync\logs\sync-20260901-082004.log` | 235 / 1,867 | unchanged 0; changed 0; new 235; disappeared 0; would send 235 | capture active; mismatch 0; baseline missing 0; comparison not skipped | rebuilt for `no-previous-cache`; write true | 0.0% |
| Round 1/2 | 2026-09-02 08:20:06 -> 08:21:58 | `Q:\Users\Administrator\Desktop\RxAuu\apps\adapos-sync\logs\sync-20260902-082002.log` | 232 / 1,853 | unchanged 227; changed 0; new 5; disappeared 8; would send 5 | capture active; mismatch 0; baseline missing 0; comparison not skipped | loaded; rebuild reason null; write true | 97.8% |
| Round 2/2 | 2026-09-03 08:20:10 -> 08:22:14 | `Q:\Users\Administrator\Desktop\RxAuu\apps\adapos-sync\logs\sync-20260903-082003.log` | 236 / 1,844 | unchanged 222; changed 0; new 14; disappeared 10; would send 14 | capture active; mismatch 0; baseline missing 0; comparison not skipped | loaded; rebuild reason null; write true | 94.1% |

Round 0 created the first content-bearing cache and is deliberately excluded
from the two comparison rounds. Rounds 1/2 and 2/2 both loaded the prior cache,
compared unchanged documents against captured Full content, found zero content
mismatches and zero missing content baselines, and completed an atomic cache
write.

The current `transfer-shadow-004.json` independently parses as valid JSON with
contract `delta-shadow-transfers-v1`, storage version
`delta-shadow-transfer-cache-v1`, branch `004`, and 236 cached documents. Its
`updatedAt` is 2026-09-03 01:21:23.317Z, matching the final natural window, and
the cache directory contains no `.tmp-transfer-shadow-*` file. The counted logs
contain no sync-failure, exception, corruption, or cache-write-failure marker.

The volumes are internally consistent: scanned-document count equals accepted
header count in every window; headers stay within 232-236 and lines within
1,844-1,867; average lines per document stays approximately 7.81-7.99. The
94.1% final metric is the implementation's document-count estimate
(`222 unchanged / 236 scanned`), not a measured byte reduction.

The baseline window ran Agent SHA `f3dd456`, while both counted windows ran
`4faf5ea`. Local Git object comparison gives the same complete
`apps/adapos-sync` subtree hash (`ce55d59832908aa2dca7c12a560bb0cd63dd1f1e`)
for both commits, so no Agent or Transfer behavior changed between Round 0 and
the two accepted comparisons.

### Closure boundary

This closure certifies only:

- branch `004`;
- Transfer Slice 1 under the unchanged current Full-query scope;
- the branch-004 runtime scope observed in the original Transfer review as
  document types 4, 7, and 8; and
- two consecutive natural comparison windows after a separate baseline window.

It does **not** certify future document types 2 or 3, another branch, Approved
Receipts, or production Delta cutover. Full Sync remains authoritative; this
result does not authorize disabling Full Sync or switching Transfer delivery to
Delta. `disappearedCount` remains observational and is not a deletion signal.

Branch `001` is the proposed next isolated canary, but branch 004's result does
not transfer to it. Enabling Transfer Shadow/Content Capture on 001 requires a
separate human-approved configuration change, followed by its own Round 0 and
natural comparison evidence. No such change was made in this closure.

## Purpose

Session D owns Delta Sync discovery, design, and the Slice 1 (sales
headers/lines) shadow implementation only. It does not own Track R, Track C,
Gate 6, CP4 rollout, UI refactoring, or OCR/receiving/lot work. Production
rollout and cross-workstream coordination remain Session A's authority.

## Current position — 2026-08-16

- Gate 6 is CLOSED (two consecutive natural qualifying fleet windows,
  2026-08-15 and 2026-08-16; `_ledger/codex.md` CLAIM-X-227 plus an
  independently CONFIRMED verdict in `_ledger/claude.md`). Per
  `docs/sync-program/DELTA_SYNC_DESIGN.md` §11's own pre-written decision
  table, Track C passing means Delta Sync "remains a medium-term efficiency
  project and does not block cautious CP4 expansion" — CP4 branch-by-branch
  expansion may proceed on its own track, in parallel with Delta Sync, not
  strictly before or after it.
- Delta Sync Slice 1 (sales headers/lines shadow candidate) is merged to
  `SC-StockDay-Ordering` `main` at commit `cdf8fb8763a001dda65c041858f016da8d455db5`
  (PR #14). **Off by default** (`ADAPOS_DELTA_SHADOW_SALES=false` unless a
  branch PC's `.env` explicitly sets it `true`). Not enabled on any branch
  yet. Writes only to a local, isolated cache directory outside the git
  repository; never sends anything to the Backend; never advances any
  checkpoint; any internal error is caught and logged, never fails the
  enclosing sync run.
- The Stage 1 comparison gap identified below (2026-08-16, earlier same
  day) has since been filled and merged: `src/delta/salesShadowProjection.js`
  (PR #15, merged as `bddcbaca0d0f37421ee1e5d1fec34f7f72517cb6`) reconstructs
  a hypothetical Delta-mode projection and compares it document-by-document
  against Full Sync's real content for the same run, proven correct via 15
  pure-JS tests plus 3 real-disposable-PostgreSQL transactional tests (see
  `_ledger/claude.md` CLAIM-C-110/111/112/113).
- **That comparison logic has since been wired into the live shadow runtime
  path** (`salesShadow.js`, CLAIM-C-114, candidate not yet pushed/merged —
  worktree `SC-StockDay-Ordering.delta-sync-slice1-wiring-2026-08-16`).
  Resolved open question #9 (privacy of captured shadow evidence) in the
  process: the existing shadow cache deliberately stores only fingerprint
  hashes, never raw content — making the live comparison possible required
  the cache to optionally store real per-document content for a branch that
  explicitly opts in via a new, separate, default-empty
  `ADAPOS_DELTA_SHADOW_CONTENT_CAPTURE_BRANCHES` config value (layered on
  top of, not replacing, `ADAPOS_DELTA_SHADOW_SALES`). This is a deliberate,
  temporary, human-approved tradeoff (2026-08-16): verify correctness fully
  at small scale before reducing exposure once confident, ahead of scaling
  to ~100 branches. Graduation criteria (documented in `salesShadow.js`'s
  own header comment): revert to hash-only once a content-capture branch
  accumulates 10+ consecutive Full Sync cycles with zero content mismatches
  — a manual, ledger-recorded decision, not automatic.
- **Both flags remain unset/false everywhere** — this candidate changes
  zero real branch-PC behavior by itself. Enabling requires two separate,
  still-outstanding authorizations per branch: `ADAPOS_DELTA_SHADOW_SALES=true`
  AND adding that branch code to `ADAPOS_DELTA_SHADOW_CONTENT_CAPTURE_BRANCHES`.
- Even with wiring merged/pushed, this is still not what
  DELTA_SYNC_DESIGN.md §8 Stage 1 requires in full in practice — the code
  path exists and is proven correct (including an adversarial test against
  the real on-disk cache, not a mock), but it has never actually RUN
  against real production data, because both required flags remain unset
  everywhere. Stage 1 in the fullest sense ("accumulating evidence over
  real windows") starts only once a branch has both flags enabled and has
  completed real Full Sync cycles.
- What the code does today, end to end, once this candidate is
  push/PR/merged: computes a document fingerprint per sales header/line
  (already-fetched rows, no extra source query), compares it against the
  previous local run's own cache (run-over-run drift detection), and — for
  a branch explicitly opted into content-capture — additionally
  reconstructs and compares real content for "unchanged"-classified
  documents, reporting `contentMismatchCount`. For every branch NOT opted
  in (i.e. every real branch today), behavior is unchanged from PR #14/#15.
- Dataset scope: **exactly one of the eight datasets in the §3 eligibility
  matrix has any code** (Sales headers/lines). The other seven (Products,
  Sales summary, Transfers, Approved receipts, Stock history, Branch stock,
  Pending receipts) are untouched. Per §8 Stage 3, expansion is meant to be
  one dataset at a time, each behind its own gate -- not simultaneous.
- **Branch stock is explicitly and deliberately out of scope for the
  foreseeable future.** §3 and §6 of the design doc call it "Shadow research
  only," "very high risk because absence drives retirement," and "unsafe to
  claim now" -- it feeds CP4 retirement/reconciliation directly, and a
  changed-row branch-stock payload must never be allowed to imply that an
  absent product should be retired. A future branch-stock Delta needs a
  Merkle-like catalog commitment or periodic full seal that does not exist
  yet. Do not bundle this dataset into Slice 1 work for any reason, "since
  we're at it" included -- this was raised and explicitly declined
  2026-08-16.
- Open questions (§10, 9 total): #1 (AdaPOS rowversion/update-sequence
  trustworthiness) dispatched to a bounded Junior (GLM 5.2) investigation,
  read-only, source/doc-based only (no live AdaPOS SQL Server access exists
  in this environment). #4 (actual changed-key ratio between consecutive
  runs) in progress via direct read-only production SQL analysis. #9
  (privacy of captured shadow evidence) requires human/product judgment, not
  a bounded audit -- explicitly not delegated. #2, #3, #7, #8 not yet
  started.

## Immediate task for this session

**Do not start any new dataset. Do not touch branch stock. Do not enable the
shadow flag anywhere.** Finish Slice 1 (sales headers/lines) to the standard
its own design already sets:

1. Read `docs/sync-program/DELTA_SYNC_DESIGN.md` in full again, especially
   §8 (Stage 1's exact requirement), §10 (open questions), and §13
   (documentation drift already on record -- do not silently "fix" those
   docs, they are owned by other sessions).
2. Read the merged Slice 1 code in full:
   `apps/adapos-sync/src/delta/salesFingerprint.js`,
   `apps/adapos-sync/src/delta/salesShadow.js`,
   `apps/adapos-sync/src/delta/salesShadowCache.js`, and their four test
   files under `apps/adapos-sync/tests/delta-*.test.js`.
3. Design and implement, in an isolated branch/worktree, the missing
   Stage-1 comparison: reconstruct what a Delta-only run would have produced
   for a given window, and compare it against what Full Sync's real,
   already-committed result was for the same window/branch -- using
   preserved trace/fixture data or a disposable-Postgres replay, not
   production writes. The comparison must be able to say, with evidence,
   "Delta would have produced the same effective document set Full Sync
   did" or name exactly where it would have differed.
4. Tests-first, real disposable Postgres where the comparison touches
   database state, non-vacuous revert-check, exact manifest, full relevant
   regression (`apps/adapos-sync` test suite) -- same discipline as the
   already-merged Slice 1 candidate and as this whole engagement's standing
   practice.
5. Independently pick up and adversarially re-verify GLM's Question #1
   report when it arrives (do not accept it at face value), and continue
   Question #4's own SQL-based investigation if not already finished by the
   time this session starts.
6. Do not merge/push/PR this round without explicit separate human
   authorization, same as every prior round -- prepare a candidate, report
   it, stop.

## Cross-workstream notes

- `docs/ACTIVE_WORKSTREAMS.md` still does not list Session D in its
  ownership table (dated 2026-08-06) -- known drift, not this session's file
  to fix; flag it again if it causes real confusion, otherwise leave it for
  Session A.
- CP4 branch-by-branch expansion (Session A) is proceeding on its own,
  separately-gated track starting with branch 005 -- Delta Sync's own
  branch-by-branch canary expansion (once Stage 2 is authorized) is a
  parallel, independent track, not a dependency of CP4's expansion or vice
  versa. Each still needs two qualifying windows per step, counted
  separately, and each branch/dataset enablement needs its own explicit
  human authorization.

## Required handoff format

Append a dated entry with: what was investigated/built, files touched,
tests run (exact counts), what remains open, and exact external state
touched (should be `none` unless explicitly authorized this round).

## Bootstrap prompt for Session D

```text
คุณคือ Sonnet 5 — เจ้าของ Session D: Delta Sync (discovery, design, และ Slice 1
sales-headers/lines shadow implementation เท่านั้น). ไม่ใช่เจ้าของ Track R, Track C,
Gate 6, CP4 rollout, UI refactor หรือ OCR/lot work — เรื่องเหล่านั้นเป็นของ Session อื่น.

อ่านให้ครบก่อนเริ่ม:
- C:\Users\scgro\Desktop\Webapp training project\_ledger\PROTOCOL.md
- entry ล่าสุดใน _ledger/codex.md และ _ledger/claude.md (โดยเฉพาะ Gate 6 closure
  entries และทุกอย่างที่เกี่ยวกับ Delta Sync/PR #14)
- SC-StockDay-Ordering/docs/ACTIVE_WORKSTREAMS.md
- SC-StockDay-Ordering/docs/workstreams/DELTA_SYNC_STATUS.md (ไฟล์นี้)
- SC-StockDay-Ordering/docs/sync-program/DELTA_SYNC_DESIGN.md (roadmap เต็ม)
- SC-StockDay-Ordering/docs/ARCHITECTURE.md

สถานะปัจจุบัน: Slice 1 (sales headers/lines) merge เข้า main แล้ว (PR #14,
d8d3f83...->cdf8fb87...) แต่ยังไม่ครบตามที่ design เองต้องการ -- ขาดส่วนเทียบผลกับ
Full Sync จริง มีแค่การเทียบ fingerprint รอบต่อรอบในเครื่องเดียว.

ขอบเขตรอบนี้ชัดเจน:
- ทำต่อเฉพาะ Slice 1 (sales headers/lines) เท่านั้น
- ห้ามเริ่ม dataset อื่นใน roadmap ทั้ง 7 ตัวที่เหลือ
- ห้ามแตะ branch stock dataset โดยเด็ดขาด -- เอกสารเขียนไว้ชัดว่าเสี่ยงสูงสุด
  เพราะผูกกับ CP4 retirement/reconciliation โดยตรง ("absence drives retirement"),
  "unsafe to claim now", ต้องมี Merkle-like commitment หรือ periodic full seal
  ก่อนที่ยังไม่มี -- นี่ถูกขอเพิ่มและถูกปฏิเสธไปแล้วเมื่อ 2026-08-16
- ห้ามเปิด ADAPOS_DELTA_SHADOW_SALES ที่สาขาไหนทั้งสิ้น (ต้องขออนุมัติแยก)
- ห้าม commit/push/PR/merge/deploy โดยไม่มีอนุมัติแยกชัดเจนสำหรับ action นั้น
- ห้ามแก้ไฟล์ status ของ Session อื่น หรือ ACTIVE_WORKSTREAMS.md

งานหลัก: เติมส่วนที่ Stage 1 ต้องการจริงๆ -- เทียบผลลัพธ์ Delta ที่คำนวณได้กับผลจริง
ของ Full Sync ในช่วงเวลาเดียวกัน ไม่ใช่แค่เทียบ fingerprint รอบต่อรอบ ใช้ tests-first,
disposable Postgres จริงตอนแตะ database state, non-vacuous revert-check,
full regression บน apps/adapos-sync suite.

ตอบกลับก่อนเริ่ม เป็นภาษาไทยง่ายๆ: เข้าใจขอบเขตครบไหม, ไฟล์ที่จะแก้/สร้าง,
วิธีตรวจว่า behavior-preserving, stop condition, unresolved question ที่พบ (ถ้ามี).
```
