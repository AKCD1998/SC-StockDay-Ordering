# PR87 — permission approval boundary, 12 November 2026

**BLOCKED pending permission approval. No ACL/profile/account change applied.**
The new reader profile is prepared and tested locally; it is not a successful
SERVER004 native read and has not been added to the recurring monitor.

## What has actually passed or failed

- Ozymandias's existing native SERVER004 context can execute the bounded reader.
  Its owned-child 30-second termination proof passed. This is distinct from
  Hourly's unchanged 12-second guard.
- The latest actual native follow-up completed as the existing non-admin
  `SERVER004\CodexSandboxOffline` caller: protected status-file ACCESS_DENIED,
  Task reads 0/11, receipt/ACK/pending UNKNOWN. No permission workaround/retry.
- Main's authorized read-only SMB/COM audit on 12Nov14:05–14:07 found that the
  evidence directory and four known files, queue directory, and all eleven
  Hourly task DACLs allow SYSTEM/Administrators, with no ordinary sandbox read
  entry. Task root has additional entries; this does not prove the sandbox can
  traverse it. Native Task0/11 does not prove tasks absent.
- Main can read these objects using ScProductDev's existing rights. That access
  does not establish or grant Ozymandias's native permissions.

## Narrow proposed scope

The exact review-only object/mask manifest is
`hourly004-direct-read-permissions-20261112.json`. Bind it to the **actual SID**
of the already-observed native caller on SERVER004 before any approved apply.
No new account, group, Administrator membership, elevation, credential, service,
endpoint, Task, observer, grant to another device or global profile change.

Windows ACEs bind a Windows principal, not a dot's name. If other native chats
use this same sandbox account, they receive the same additional access to these
specific objects. The existing per-context sandbox policy remains a separate
boundary; this proposal cannot claim an Ozymandias-only OS grant. If the actual
token also needs a task/capability SID, do not guess or automatically add a shared
group: inspect the trusted token/profile metadata and bring that extra scope
back for approval.

1. Non-inheriting file read (0x120089) on **two existing durable receipts and
   the existing public launcher pointer only**. No read on the full evidence
   tree, backups, configuration, product manifests or queued payloads.
2. Traverse/read-attributes/synchronize only (0x1000A0), non-inheriting, on four exact ancestor
   directories. This grants no directory listing or file-content access there.
3. List/traverse/read-attributes/synchronize (0x1000A1), this-directory-only, on the existing
   branch004 outbox. Inherit **read-attributes only** (0x80) to its children,
   including future children, with synchronize (0x100080), so the reader can count/type/size entries without
   reading queued business payloads. Do not inherit file ReadData.
   The synchronize bit matches Windows allow-rule construction; it grants no
   content read/write, delete or ownership change.
4. Read-only Task access (0x120089) on the **eleven exact Hourly004 tasks**.
   Preserve every existing ACE, action, principal, trigger and setting. No
   execute/start/stop/change/delete/write-DACL right for the reader. No Full
   Sync/Delta task ACL or Task-folder ACL change.

These are Windows object-permission changes, requiring explicit user approval
and an already-authorized local administrator to apply. Do not attempt them over
the previously denied remote-write path or elevate the restricted cloud reader.
The user should not download or repeatedly run diagnostic packages. Execution
can be coordinated through existing SERVER004 ownership after approval; this
document is not proof that main can perform administrator writes remotely.

Keep the existing native read-only sandbox policy. If its policy also blocks
these exact reads or local Task COM after Windows access is granted, report the
precise stage and propose a separate narrow policy change. This proposal does
not authorize sandbox disabling, an alternate token/channel or broad root read.
Do not automatically grant Task-root enumeration if exact Task reads still fail.

## Why receipt-based access

`latest-slot-result.json` is a display file replaced by atomic rename. Giving
its current file object a read ACE is not a lasting per-hour solution; granting
inheritable read on the whole protected tree exposes unrelated artifacts.

The deployed writer updates the two durable receipt files in place. The new
default `DurableReceipt` profile reads those two snapshots, validates their
envelopes in RAM, binds the selected attempt to actual Task/time, validates its
ACK and successful totals or matched failure, and independently counts the
existing queue. It does not access the display file, create an export, modify
the writer, rescan SQL, or add another observer. The pointer remains a separately
recognized version hint, not full release verification.

This is explicitly **receipt-based evidence**, not a claim of identical detail
to the display profile. Live batch progress, collection-start time, HTTP attempt
count, current CPU/IO and recovery flag observation remain UNKNOWN where the
receipt does not record them. The expected recovery-OFF policy is not substituted
for an observation. Last-success totals/ACK cannot certify a newer running or
failed attempt; a single retained ACK is not a count of HTTP attempts. Current
queue counts remain distinct from the receipt's historical pending snapshot.

The optional old display profile remains available for already-authorized owner
use. Do not silently fall back to it after a denied receipt. Both receipt files
must actually be readable and valid before this proposed profile can be admitted.
Corrupt, conflicting, stale or task-mismatched evidence stays unknown.

## Approved apply / acceptance / rollback sequence

The one-time owner controller is now prepared in
`scripts/Set-Hourly004ReaderPermissions.ps1`; see
`hourly004-reader-permission-owner-setup.md`. Default action is Plan.
Only the human owner runs Apply/Resume/Rollback with explicit `-ApproveReadScope`
in an already-elevated SERVER004 Administrator PowerShell. Main does not execute
permission writes remotely. This does not change the native reader's sandbox or policy.
The owner Apply at 12Nov16:30:55 stopped after the first approved receipt ACE was
written: Windows added only the DACL AutoInherited control bit, triggering the old
strict string readback check. The other18 DACLs remain at their saved before-image.
The corrected comparison masks only that bit and still compares complete ACL
binary/order and all other represented control bits. Explicit Resume requires
the original valid snapshot and skips matching after-images; it never creates a
new baseline or discards foreign changes. See the owner setup document for this
incident and the reviewed continuation; native access remains unproven.
After approval of the scope:

1. Reconfirm native caller SID/context, exact reviewed bytes, filesystem policy,
   current object identities/DACLs, existing incident owner and quiet task/queue
   state. Keep private before-images with SYSTEM/Admin access only; never print
   SDDL, arguments, receipt keys or source data. Missing/foreign/denied state
   stops the affected action without a blind retry.
2. Have the authorized administrator add only missing manifest ACEs, preserving
   inheritance, owners, existing rights and every non-target object. No Task
   Run or source data/config/code action. Verify actions/principals/triggers/
   settings and Full Sync/Delta definitions remain unchanged. Never discard
   foreign ACL edits to force a baseline match.
3. Revalidate the existing native grant, context, reader and deadline supervisor.
   Execute its harmless owned-child deadline proof and then **one** actual
   receipt-profile Status on SERVER004 through Ozymandias. Require real readable
   receipts/pointer, 11 actual verified Task definitions, known queue counts,
   genuine native provenance and zero mutations by the reader. No ScProductDev
   relay. Keep data completeness separate from access admission.
4. Only after real admission PASS, add the exact source read to Ozymandias's
   existing automation `6ae1e857b364819198f844902670d3c2`; retain its owner/times,
   central query and journal. No new daily/local schedule. Verify a natural
   scheduled reuse; no stock-slot compensation or manual capture.
5. Roll back by removing that source step while keeping central monitoring.
   For ACL rollback, remove only ACEs introduced by this approved change if
   object identity and current after-image match. Preserve foreign changes;
   stop for review rather than replacing entire current DACLs. Do not remove
   pre-existing read grants or other device authorizations. Keep receipts/queue.

Future installer releases must preserve/review these explicit reader ACEs and
must not reset or silently broaden them. Pointer/receipt replacement that loses
access must surface UNKNOWN and stop source admission, not trigger automatic ACL
repair. This profile alone does not solve future installer-permission drift.

## Validation limits

Local PowerShell5.1 fixtures test read scope, no display-file dependency, both
receipts required, durable ACK vs old ACK/failure/running states, private-field
suppression, queue unknown and unchanged trusted native admission requirements.
The manifest has regression checks against write/execute rights and broad
inheritance. These are simulations, not successful cloud-to-SERVER004 reads.

Official platform distinction: [local computer access](https://learn.chatgpt.com/docs/enterprise/cloud-local-access)
and [read-only permission profiles](https://learn.chatgpt.com/docs/permissions).
An existing computer grant does not override Windows object permissions.
