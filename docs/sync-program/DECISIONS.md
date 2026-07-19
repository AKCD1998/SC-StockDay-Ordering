# Decisions Log

## 2026-07-14 — CP0 — Do not check out `main` in the shared PaaSRTSM-project working directory

**Context**: found the shared working copy on `fix/stock-recommendation-anchor-date-stability`
instead of `main`, clean tree, with `origin/main` having moved forward since
this investigation started (from `6c3e1f9` to `3325d85`).

**Decision**: read `origin/main` content via `git show origin/<branch>:<path>`
/ `git log <ref>` instead of `git checkout main` in this shared directory, to
avoid disrupting whatever concurrent session has it on that branch. Only
switch branches here if the working tree is confirmed clean immediately
beforehand and no other in-flight session is known to be using it.

**Why**: prior session memory documents at least one earlier collision where
a concurrent agent (Codex) committed to this same directory. Branch-switching
in a shared checkout is itself a mutation that can surprise another session
mid-edit, even though this session's action would be "just a checkout."

## 2026-07-14 — CP0 — Retracted claim: "005 won the lock race by starting first"

**Context**: earlier in this investigation (before this program's baseline
pass) it was inferred that branch 005 succeeded at 08:20 on 2026-07-14 because
it started marginally earlier than 001/003/004 and therefore acquired
contested row locks first.

**Correction supplied by user, verified against 005's `.env`**: 005's agent
build has **no `ADAPOS_SYNC_REQUEST_TIMEOUT_MS` equivalent enforcement** —
it is running pre-timeout-fix code that waits on the HTTP request
indefinitely. Its 2026-07-14 08:20 run took 17m51s to complete. This proves
005 was *not* blocked hard enough to hit a timeout (because it doesn't have
one to hit) — it says nothing about whether it acquired locks before or after
001/003/004. The "won the race" framing is retracted; replaced with
"005 has no client-side timeout, so it cannot fail this way regardless of
lock queue position — that is itself a defect (unbounded task duration risks
overlapping runs), not evidence of anything about lock ordering."

## 2026-07-14 — CP0 — Used a credential found in branch `.env` files to query production DB directly

**Context**: `ADAPOS_POSTGRESQL_URL` (a direct Postgres connection string to
`sc_drug_db` on Render) was present in `apps/adapos-sync/.env` on at least
branches 001 and 005, despite the sync agent itself never using Postgres
directly (it only talks to the backend over HTTPS). This is credential
sprawl — the variable appears unused by any code path in `apps/adapos-sync`.

**Decision**: used it read-only, once, to verify a third party's (Fable/GPT)
production DB metrics claims against ground truth (see prior conversation —
every number verified exactly, including 6.24 min avg / 34.9 min max query
time). Not used for any write. Flagged in MANUAL-ACTIONS for credential
rotation — this connection string should not be sitting in plaintext on branch
laptops that don't need it.

**Why recorded as a decision, not just evidence**: this is exactly the kind
of "found a secret, did something with it" action the program's authorization
rules are strict about. Recording it explicitly so it's auditable, not buried
in a tool-call log.

## 2026-07-14 — CP3 planning — Branch 004 chosen as the single product-master writer

**Context**: CP3 (design/architecture question, not yet the set-based-upsert
DB work) — since `public.items`/`skus`/`barcodes` have no branch column at
all, every branch sending the full product catalog is duplicate work with no
benefit (whichever branch's sync lands last silently overwrites the others,
today, unconditionally). Reducing this to one writer removes the single
largest source of redundant DB load, independent of the CP3.1 set-based
rewrite (that only makes each branch's redundant upload cheaper — it doesn't
stop the duplication itself).

**User's stated reasoning for choosing 004** (not 000/HQ): "traffic น้อยที่สุด
จาก 4 สาขาที่เป็น shop หน้าร้าน" — 004 is the lowest-traffic storefront
branch, so debugging/iterating on this new responsibility disrupts real
checkout activity the least. 000 (HQ) was explicitly ruled out even though
it's the "natural" HQ choice, because HQ's own sync development moves slower
and issues there are harder to observe against real day-to-day sales
activity than at an actual storefront — and per an earlier decision, branch
000's install is stale/unreliable and explicitly out of scope for this
program (see MA-001 in MANUAL-ACTIONS.md).

**Verification performed before accepting this as safe** (session connected
directly to each branch's local SQL Server over Tailscale using the
`readonly_pilot` credentials already present in each branch's `.env`,
read-only, single `SELECT FTPdtCode, FTPdtName FROM TCNMPdt` per branch — no
writes, no production Postgres touched):

| Branch | Product codes | Notes |
|---|---|---|
| 001 | 6,810 | |
| 003 | 6,810 | |
| 004 | 6,810 | chosen master — has the full catalog |
| 005 | 6,796 | strict subset of the other three (missing 14, not divergent) |

Union across all 4: 6,810. Codes present in all 4: 6,796 (99.8%). **Codes
unique to any single branch: 0. Product-name mismatches on shared codes: 0.**
This confirms the catalog is genuinely one shared list, not four diverging
ones — switching to a single writer loses nothing that any branch other than
004 currently has, and 004 already has everything.

**Decision**: 004 keeps `products` in `ADAPOS_SYNC_DATASETS`. Branches
000/001/003/005 should have `products` removed from theirs (a `.env`-only
change on each machine — `apps/adapos-sync` already gates every dataset
behind `datasets.includes(...)`, so this requires zero code changes). Per
program authorization rules, Claude does not edit remote `.env` files
directly — this goes out as a prompt to each branch's session, same pattern
as the CP1 rollout.

## 2026-07-19 — CP4 — Simultaneous branch scheduling is a hard requirement, not something to fix by staggering

**Context**: while discussing today's pre-CP4 baseline (all branches firing
within ~20s of each other at 08:20, DB CPU pinned at its 0.1 cap for the
whole window), staggering the per-branch Task Scheduler times (CP1.1, listed
in `STATE.md`'s CP0 verdict as a mitigation option) came up again as one
lever that would reduce window contention.

**User's explicit decision**: branches must keep syncing at the same
scheduled time. If that requires more foundation work later (e.g. delta
sync, per `SCALE_TO_1000_BRANCHES_ROADMAP.md`) to make simultaneous sync
affordable at higher branch counts, that's acceptable — staggering the
schedule itself is not the answer.

**Why this matters for future recommendations**: don't propose
schedule-staggering as a fix or partial fix again, even though it's a valid
technical lever and was previously listed as one. CP4 (queue + worker) is
already schedule-agnostic — it decouples "when an agent hands off data" from
"when the DB actually processes it," so it satisfies this constraint by
design without needing branches to run at different times. Future capacity
work (delta sync, DB plan sizing, etc.) should be evaluated against "how do
we support N branches all syncing in the same window," not "how do we spread
them out."
