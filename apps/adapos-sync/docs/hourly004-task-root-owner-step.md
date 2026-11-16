# Hourly004 — one administrator operation for the approved Task-root read

Preparation on16November2026; not applied to SERVER004 by Main. This extends
PR87 only. The original19-object controller/snapshot remains unchanged. The
owner approved the extra root-only scope on12November and has now requested the
consolidated command. There is no authorization for broader security changes.

## Scope and reason

Ozymandias's existing SERVER004 restricted, non-admin native context read the
two durable receipts and current queue on12November, but read0/11 Tasks. COM
creation/Connect passed; GetFolder(root) failed0x80070003. Kernel AccessCheck
confirmed missing root directory-list/read-attributes. The RAM-only candidate
adding current-user mask129 allowed these rights under the actual token.
Neither the candidate nor local tests prove real COM admission after a grant.

`Set-Hourly004TaskRootRead.ps1` changes only the DACL on
`C:\Windows\System32\Tasks` itself: add missing bits from129 (ListDirectory and
ReadAttributes) for the SAME existing sandbox user. No inheritance or Generic
Read, Task Run/change/delete, owner, account/group/profile, credentials or
security-policy change. Existing rights remain. A shared sandbox account can
see other root Task names/metadata through this access; it is not an
Ozymandias-only grant.

The account SID must match the private original19-object snapshot, preventing
an account deleted/recreated under the same name from acquiring the new grant.
The new before-image is separate and create-only. Unknown/deny/object/callback
DACL forms, foreign edits, identity changes, busy work, a nonempty queue and
unverified backup/preservation stop safely. No automatic write retry/rollback.

## Owner operation

1. On SERVER004, open native64-bit **Windows PowerShell** with **Run as
   administrator** under the existing Administrator account. Leave SERVER004
   and its existing ChatGPT computer connection online for the later native
   read. Do not elevate the Ozymandias reader or change its profile.
2. Run the single immutable-revision Apply command supplied by Main after
   review/CI. It fetches only this reviewed operator into memory; there is no
   diagnostic ZIP/download to manage. Do not run the old19-object Apply/Resume.
3. Keep the window open and tell Main the operation finished. Safe results are
   retained for the existing authorized SMB reader; no stock rows/keys/logs are
   requested in chat. If it stops, do not run Apply/rollback repeatedly.

The operator checks actual Task state and next times before writing: no running
Hourly/FullSync, at least5minutes before an enabled Hourly Task and15minutes
before FullSync, and queue empty. No tasks are stopped, run or rescheduled.
It does not wait/retry permission writes to force a busy window to pass.

Native child execution is bounded at60seconds in its own kill-on-close Windows
job. A start gate prevents the child invoking the operator before job ownership
is established. Timeout kills only this helper's child tree, never stock/Task
processes; an uncertain write stays UNKNOWN. Fetch20seconds and parent setup/
cleanup are separate from the child budget. No promise of natural capture PASS.

## Exact mutation and preservation

The writer holds a root-directory handle without delete sharing, validates
object identity, saves/readbacks an immutable before-image, then rechecks
quiet state and exact current DACL immediately before its one DACL write.
Another Administrator can still edit between check/write; this API has no
atomic compare-and-swap, and the operation does not claim otherwise.

The writer opens its handle with MAXIMUM_ALLOWED because
[SetSecurityInfo explicitly suppresses descendant ACE propagation for this
handle access](https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-setsecurityinfo).
This is the existing administrator's handle, not a grant of these rights to the
reader. SetSecurityInfo receives only DACL_SECURITY_INFORMATION. A self-only
new ACE and original ACE bytes/order/owner/group are preserved; only the kernel
AI control-bit normalization is accepted. Do not replace this with a recursive
ACL command, Set-Acl tree operation or a normal propagation-enabled writer.

RAM before/after comparisons cover11 Hourly Task definitions/DACLs,2 FullSync
definitions/DACLs, the8 existing ProgramData reader-object ACLs and the existing
Agent configuration bytes/ACL. Configuration and Task arguments are never
persisted/output. Guard12seconds/recoveryOFF are preserved through no runtime
or configuration write. No SQL, TaskRun, Sync, replay, capture/upload, schedule,
source release, backend or FullSync/Delta001004/003005 change.

Private operator data is kept beneath the existing protected evidence directory:
`reader-task-root-permission-20261116`. Before-image and numbered safe result
files are create-only, with a bounded32-record history and an exclusive operator
lock. Result-persistence failure retains actual operation outcome and clearly
asks to keep the window open. No old evidence/snapshot is overwritten/deleted.

## Status, rollback and acceptance

Status is metadata-only. Rollback uses the same pinned operator with explicit
scope approval; Main supplies the exact command if it is needed. It restores
only the owned root difference when object identity/current after-image match,
preserving all original grants. A foreign change stops rollback for review;
there is no whole-current-DACL overwrite to force success or automatic restore.

The expected successful Apply status is
`ROOT_READ_APPLIED_NATIVE_ACCEPTANCE_PENDING` (or an already-present variant).
That is a permission-write result, **not** actual Task/ACK/queue admission.
Main must then coordinate the SAME real native context to read both receipts,
all11 verified Tasks, current ACK/queue and compare safe source/central evidence.
Only actual full admission permits adding source read to existing cloud task
6ae1e857b364819198f844902670d3c2, preserving owner/timing/query/journal. A later
scheduled reuse is separately verified; no new schedule or stock compensation.

## Verification limits

Native PowerShell5.1 fixtures cover Apply/Status/Rollback/idempotency, original
and foreign ACE preservation, late identity/ACL edits, backup/readback/write/
persistence faults, malformed child output and owned-child-tree deadline.
A disposable local directory test exercises the actual writer API and verifies
unchanged child/grandchild ACLs through Apply/Rollback; no system Task directory
or production permission is used. These tests do not prove actual SERVER004
installation, Task Service visibility, native admission or Hourly stability.
