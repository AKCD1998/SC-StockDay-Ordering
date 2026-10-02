# Hourly evidence collection policy and release gates — 2 October 2026

Latest decision — 11:59 ICT: the human approved capture lateness 300 seconds
and evidence retention 30 days, plus commit/push to the existing Draft PRs and
fresh CI. Earlier pending-selection statements below are historical snapshots.
This approval does not authorize merge/deploy, cleanup or production activation.

Status: TECHNICAL RE-REVIEW COMPLETED WITH A LOCAL FOLLOW-UP;
NUMERIC POLICY AWAITING HUMAN SELECTION; TRANSFER RELEASE GATE PENDING.

This is an incremental pilot design. It does not authorize production
configuration, migration, cleanup, Scheduled Tasks, Git publication or deployment.

## 1. Evidence-only contract

- FCPdtQtyRet remains canonical. FCPdtQtyNow stays separate, nullable evidence.
- One fixed, recorded cohort per approved branch; do not change it inside a window.
- A complete window needs that day's receipt-gated morning anchor, all eleven
  09:00–19:00 intraday slots, and the next day's receipt-gated morning anchor.
- Morning source read is classified 08:20 inclusive to 09:00 exclusive, but
  must also meet the separately selected scheduling-lateness bound.
- Capture occurs at the real read time. Queue only after successful authoritative
  Full/CP4 completion. Never synthesize a missed morning with a standalone query.
- Each slot must have exactly one capture, a complete unchanged cohort and usable
  estimated quantities. Missing/duplicate/null/mismatched data makes the window
  nonqualifying; partial metrics remain visible rather than being discarded.
- Timing must be finite. Negative capture delay is early capture; negative
  receivedAt-minus-capturedAt is clock skew. Neither qualifies.
- Read time is not AdaSoft's last update time. Movement reconciliation uses actual
  capture boundaries, not an assumption that every value changed exactly at 08:20.

## 2. Proposed capture lateness — awaiting human choice

Recommendation: capturedAt minus plannedFor <=300 seconds, inclusive, for both
morning and intraday slots. Alternate offered: 600 seconds.

HOURLY_STOCK_EVIDENCE_MAX_SLOT_DELAY_SECONDS would be set explicitly only during
a separately authorized rollout. It stays absent/null today, so windows cannot
silently qualify without a policy.

This is a pilot scheduling budget, not an empirically proven stock accuracy,
source-freshness guarantee, Reservation TTL or drift threshold.
Do not infer acceptance of the 300-second proposal from its regression test.

Late captures remain evidence and show their delay, but do not count toward
qualifying windows. Do not backdate, manufacture a replacement or run Manual Sync.
Avoid catch-up triggers (StartWhenAvailable) for intraday collection.

## 3. Delivery delay is a different measurement

Outbox retry preserves the exact original body and capturedAt; delivery may occur
later while still within the retained evidence period. Positive ingestion delay
does not invalidate a historically timely measurement by itself.
Such a window does NOT prove timely availability for live stock decisions.
Report capture delay and ingestion delay separately; never use receivedAt as a
replacement read time or claim a real-time SLO from collection qualification.

Clock-skew/invalid-timing evidence is preserved but does not qualify. Investigate
clock synchronization separately; this task changes no branch clock or service.

## 4. Proposed retention — awaiting human choice

Recommendation: 30 rolling days based on capturedAt; alternate offered: 60 days.
This covers the proposed seven-window experiment plus review/recovery margin.
The experiment's seven qualifying windows/three movement days is still unapproved.

Policy semantics:
- Keep rows at the cutoff; only captures strictly older than now minus N days
  are eligible. Incomplete old windows are eligible too; do not retain them forever.
- Branch cache stores no token; protect it with verified Windows ACLs.
- Local queue cap remains 168 captures including orphan temp files; no silent
  eviction of unsent evidence. This cap is independent of central retention.
- Cleanup remains feature OFF and dry-run unless separately authorized.
  After migration/deploy, first inspect eligible counts and approve cleanup
  ownership/execution separately. Nothing deletes itself merely because N is chosen.
- Execution is bounded (100 runs per invocation by default), row-locked and
  transactional: child rows and parent runs commit together or roll back.
- Once retention is enabled, expired uploads get 410 rather than resurrecting
  pruned data. Keep their local pending files for operator review; do not auto-delete
  or silently relabel them as delivered. Retry unchanged requests, never recapture
  a historical slot. 400/401/409/410 or corruption/full queue require operator review.

## 5. Technical re-review snapshot

Published SC Draft #61: 9fd5799, CI 36960446491 PASS.
Published PaaS Draft #26: 40d2445, CI 36960440156 PASS.

Self re-review found the published collection classifier accepted negative
ingestion delay and non-finite timing as qualifying. A LOCAL, UNCOMMITTED PaaS
follow-up now reports clock-skew/invalid-timing and retains computable drift.

Latest local verification:
- Agent unchanged: 227/227, zero fail/skip.
- Backend focused: 20/20.
- Backend full: 692 tests =505 pass +187 environment skips +0 fail.
- Guarded disposable PostgreSQL 18: 1/1, zero skip. DB dropped/cluster stopped;
  test port 55439 has no listener. Existing PostgreSQL service unchanged.
- Published CI does not cover this new local follow-up. It must be committed,
  pushed and freshly checked with separate Git authorization before merge review.
No independent second-agent review is claimed.

## 6. Transfer Delta release gate for Hourly

The existing two-qualifying-natural-window rule is preserved; this is NOT the
already-closed Transfer Content Capture fleet acceptance.

- 2 October natural bootstrap Round 0 is PASS and not a counted comparison.
  Fresh central HTTPS 401/200/no-store evidence: sequence 1, counts 1/1/0,
  latest request rebaseline/applied. Local SERVER004 sequence 1/249 documents,
  terminal success and CP4 APPLIED agree. No changed-document Delta request exists.
- Count two consecutive subsequent clean natural Morning windows on branch 004.
  Earliest candidates are 3 October 08:20 (1/2) and 4 October 08:20 (2/2), not promises.
- At least one counted window must demonstrate a non-zero Delta request:
  exact acknowledged header/line counts, applied central request, matching
  local/central checkpoint progression and verified projection consistency.
- A noop may show healthy operation but cannot alone prove changed-document
  application. Two noops do not close this gate; wait for real source movement.
- Each window also requires terminal sync success/CP4 APPLIED, complete legacy
  Content Capture with mismatch/baseline-missing zero and healthy cache.
  Missing branch/central/projection evidence leaves PARTIAL, not PASS.
- Unexpected Full fallback/rebaseline or a failed/misaligned apply needs review;
  it is not a successful Delta comparison merely because final Full succeeded.
- Freeze SC main/Agent and Transfer behavior during counted evidence collection.
  No Manual Sync, synthetic movement, branch 005 activation or hard tombstones.
  An incident requiring changes needs a separate human decision.

## 7. Release order after all gates

Approve numeric collection policy and operational cohort/ACL/Task ownership;
publish and check the local re-review follow-up; finish Transfer acceptance.
Then separately authorize backend migration/deploy with all flags OFF, Agent
deployment OFF, and finally one-branch tokens/flags/Tasks. Backend precedes Agent.
Only actual qualifying collection windows support later source-accuracy decisions.
WP4, canonical QtyNow, drift/fallback thresholds and Reservation TTL remain gated.

Refactor consideration: reuse the isolated Agent outbox/morning-anchor modules
and Backend quality/retention services. No App.jsx, UI/Reservation or broad
legacy refactor is mixed into this collection/release slice.

## 8. Human-approved collection policy — 2 October 2026, 11:59 ICT

Human decision: "ยืนยันใช้ **5 นาที / 30 วัน** และให้นาย commit/push patch ใหม่เข้า Draft PR แล้วรอ CI ได้".

- Approved future pilot configuration: HOURLY_STOCK_EVIDENCE_MAX_SLOT_DELAY_SECONDS=300
  and HOURLY_STOCK_EVIDENCE_RETENTION_DAYS=30. These are not applied to production here.
- Capture lateness is inclusive: actual capture minus planned slot from 0 through
  300 seconds qualifies on timing; later capture remains evidence but cannot
  qualify. Morning remains receipt-gated after successful authoritative Full/CP4,
  never backdated or reconstructed by an independent 08:20 query.
- Negative delivery delay (clock skew) and non-finite timing cannot qualify.
  A delayed upload preserves the original capture time and drift metrics; this
  policy is not a live-delivery SLO or a claim that the source stock is fresh.
- Retention cutoff is capturedAt strictly earlier than now minus 30 days;
  evidence exactly on the cutoff stays. Expired incomplete runs are included.
  Cleanup remains default OFF/dry-run and requires separate rollout authority.
  Unsent local evidence must not be silently evicted or deleted on expiry.
- Publication is limited to the existing Draft PRs #61 (SC) and #26 (PaaS).
  New head CI must pass; the old green CI does not cover this follow-up.
- Transfer Delta release gate in section 6 remains pending. Operational cohort,
  ACL, Task ownership and separate merge/deploy/activation approvals remain gates.
  Source accuracy thresholds, live freshness/fallback, Reservation TTL and the
  proposed 7 windows/3 movement days are not approved by this numerical selection.
