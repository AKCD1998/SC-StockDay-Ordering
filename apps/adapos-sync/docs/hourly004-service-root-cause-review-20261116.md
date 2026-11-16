# Hourly004 Task service root — consolidated review, 16 November 2026

This is PR87 preparation, not permission-change, install or schedule approval.
Do not ask the owner to run another diagnostic. Use the existing restricted
native context for necessary bounded reads; a denial ends that read, with no
alternative identity, profile or access channel. Preserve the applied filesystem
129 grant and the original19-object grants. Guard12000/recoveryOFF stay fixed.

## Actual evidence and the error path

At10:09:48 the human's approved root-filesystem129 operation succeeded. At
10:16:52 actual native receipt/queue reads succeeded but Task0/11 and current
ACK qualification remained unknown. At10:44:18 the same non-admin context opened
the real root directory with129; ReadEA8/GenericRead failed Win325. COM creation,
Connect and target validation passed; GetFolder(root) failed0x80070003 before any
exact task lookup. This is an access investigation, not evidence of lost stock.

Main copied ONLY the actual system binaries through the original authorized
read-only SMB route to an isolated local analysis directory. Nothing on the
source was written. At11:53:01 `taskschd.dll` was10.0.19041.3636; at11:55:22
`schedsvc.dll` was10.0.19041.5965. Matching public Microsoft PDB identities were
verified against each PE CodeView GUID/age. The binaries were statically analyzed
with Ghidra12.1.4; they were not loaded/executed or patched. Full local evidence
is retained outside the repository; no binary, symbol database or raw descriptor
is published. Public-symbol addresses label functions independently of Ghidra's
generated names. Decompiler output is derived evidence, not original source.

| Exact-build function | Address | Observed static behavior |
| --- | --- | --- |
| TaskServiceImpl::GetFolder (client) | 0x18000e200 | Calls FolderExists before returning a TaskFolder |
| TaskServiceImpl::FolderExists | 0x18000e964 | Uses a folder snapshot in the modern RPC session |
| RpcFolderSnapshot enumeration | 0x18000ecf4 | Calls NdrClientCall3 with opnum7 for task enumeration |
| SchRpcEnumTasks (service) | 0x18000cd50 | Calls RpcServer::EnumFolder |
| RpcServer::EnumFolder | 0x18000f11c | Reads stored service SD; checks concrete mask1, or mask2; returns0x80070003 when both checks fail |
| TaskAccessCheck | 0x1800159a4 | Queries the stored SD and calls JobAccessCheck |
| JobAccessCheck | 0x180015ae0 | AccessCheck uses the concrete requested mask; no implicit conversion of1 to GenericRead |
| JobStore::RegJobSecurityQuery | 0x180011660 | Reads TaskCache Tree's binary SD value |
| Tree-key/value reader | 0x180014a30 / 0x180014f58 | Resolves root to TaskCache\\Tree, reads value SD |

Thus a valid physical directory and a correct one-character root argument do
not guarantee GetFolder succeeds. In this build0x80070003 also hides a service
read/write denial. The filesystem129 grant did not update the service's stored
SD. The observed descriptor difference now has an implementation explanation;
it alone still does not establish the effective RPC caller's denial. Store-query
errors and the task/folder-kind check are other branches. Runtime branch tracing
or permission application has NOT been performed.

ReadEA8 is a real missing filesystem right but is NOT the concrete service-root
check found here. Do not add it or stack filesystemGR and a service grant as a
trial fix. Do not misclassify this error as an absent capture, offline source,
eleven individual Task denials, or proof that the original19 grants failed.

## Same-context evaluation, no owner diagnostic

The existing `Inspect-Hourly004TaskReadLayers.ps1` has an optional
`-EvaluateServiceRootRead` evaluation. It retains its exact host/caller/non-admin,
no-impersonation, PS5.1x64/timezone gates and requires the existing owned-child
30s supervisor. It queries ONE fixed64-bit registry key with QueryValues rights
and reads only its binary SD value. No key/subtree enumeration, registry key ACL,
Task XML/arguments, file content, source file, credential or permission write.
The descriptor and caller SID remain in RAM and are never output/persisted.

It uses an identification-only copy of the process primary token for AccessCheck
on the stored SD and a RAM-only copy adding current-user self-only allow1. It
compares service read1, write2, execute32, READ_CONTROL, WRITE_DAC and WRITE_OWNER.
The copy does not adopt an identity, enable a privilege or change a token.
It is not the RPC server's actual impersonation token and cannot certify RPC
admission. If the fixed value cannot be read or evaluated, report that boundary
and stop; do not switch access paths or ask the owner to run a new probe.

NativePS5.1 local fixtures cover24 AccessCheck comparisons, existing ACE/owner/
group/control preservation, a deny that the candidate cannot override, unchanged
non-read rights, real native open/close/error handling and the wrong-host gate.
They use synthetic descriptors/local disposable data, no production registry.
The same script includes `Get-H004ServiceRootRollback`, a **RAM-only planner**,
not a production rollback controller. Sixteen local cases exercise exact prior
restoration/already-restored results and rejection of foreign changes or a
tampered before/after pair. It has no registry/ACL write adapter. These results
must not be presented as an Apply/Status/Rollback production roundtrip.

### Actual coordination result,12:10 Bangkok

The pinned read-only evaluation was NOT executed on SERVER004. Ozymandias found
the prior native context absent from its live agent tree; followup could not
resolve it. SERVER004 was listed connected, but discovery reached its deadline,
so current authorization/identity/profile and an existing supervisor reference
could not be re-established. It stopped without creating a new agent, connection,
profile or using Main SMB as native proof. Canonical journal event
`H004-COORDINATION-CONTEXT-UNAVAILABLE-20261116T0510Z` was independently read back.
This is a coordination/discovery failure, not an observed source permission
revocation, Task loss, or a new0x80070003 measurement. Actual10:44 remains the
latest same-caller Task-root result. Service SD/candidate decisions remain UNKNOWN.

Separately Main's original authorized read at12:12:00.972 found GetFolder(root)
and all11 exact Hourly Tasks readable; all11 enabled/not running/20-minute limits,
and both FullSync Tasks readable/enabled. No SQL/TaskRun/source write. This proves
the namespace exists and is readable to Main, not native admission or capture/ACK.

CI for the read-only evaluation revision3c29dbe succeeded
([run43808009474](https://github.com/AKCD1998/SC-StockDay-Ordering/actions/runs/43808009474)).
The local focused tests include actual Windows PowerShell5.1. A broader local
suite could not complete cleanly because this isolated checkout lacks dotenv and
other installed workspace dependencies; an npm attempt also lacked node on its
child-shell PATH. These are local validation limitations, not SERVER004 failures.
Linux CI's clean install/test/build passed; neither result certifies a natural run.

## Permission proposal boundary

The minimal implementation-derived candidate is **service root read mask1** for
the same existing sandbox user, self-only/no inheritance in the service's stored
SD. This is NOT ReadEA8, GenericRead, an account/group/profile grant, registry-key
read access, Task Run32, task modification, WRITE_DAC or Administrator access.
It may expose names/metadata of other tasks that the shared account can already
read; the account is not exclusive to Ozymandias. Existing grants must remain.
Actual baseline/candidate decisions are required before calling it sufficient.

The write mechanism is separately gated. The exact service's SetSecurity path
(0x180067ca0 ->0x180059234 ->0x18006cd3c) calls SetSecurityInfo on the filesystem
using explicit access0xe0000, **without MAXIMUM_ALLOWED**, then updates the Tree
SD value (0x18005cfe8 ->0x18006f56c). A COM root grant can therefore touch BOTH
stores and propagate existing inheritable ACEs. It can also overwrite distinct
filesystem grants if the service SD is used blindly. The old filesystem writer's
no-propagation exception does not apply to this different path.

Do not ship a production COM SetSecurityDescriptor or direct TaskCache registry
writer as a diagnostic. A direct value edit would avoid that propagation path
but bypass the documented service API; it needs its own explicit, exact scope,
failure model, nonproduction tests and approval. No write transport is approved
merely because the desired service ACE is minimal. No service restart or cache
rebuild is part of this plan.

## Required one-package apply/status/rollback contract

Before presenting an executable owner command, the SAME reviewed package must:

1. Bind the exact existing account identity, host/timezone, known Windows builds,
   original19-object snapshot and the actual filesystem129 after-image. Stop on
   foreign changes, unknown SD forms, changed build or mismatched identity.
2. Carry private, immutable, separately identified before/after images for each
   store the chosen API really changes. Preserve all original ACE bytes/order,
   owner/group/control and distinct filesystem rights. No public SID/SDDL/hash.
3. Establish and test API propagation effects with disposable nonproduction
   resources. No stock Task creation/run, production trial grant or broad
   recursive reset is allowed to discover those effects.
4. Require quiet state and empty verified queue. Hold an exclusive operator
   lock, bound only its own child, recheck before one write, retain write-unknown
   states on timeout/crash, and persist a safe create-only result. No auto retry,
   escalation, service restart, restore or forcing a busy window.
5. Verify both store views and all affected descendants,11 Hourly+2 FullSync
   definitions/permissions, existing reader grants and config bytes/permissions.
   Preserve guard12s/recoveryOFF, credentials, cohort, Delta and all schedules.
6. Make Status safe after a crash without mutating anything. Rollback is a
   separately approved operation: restore ONLY the owned new service-read
   difference when live object/before/after provenance matches. Keep the old
   filesystem129/19 grants. A later foreign change stops rollback for review;
   never replace the current full ACL/value merely to force rollback success.
   If the API touched both stores/descendants, rollback coverage must include
   both and report partial/unknown rather than claiming atomic restoration.
7. Use the SAME real restricted caller to read both receipts, all11 verified
   Tasks, matching current ACK/pending, then compare central aggregate evidence.
   Only actual full admission permits adding a source step to the existing
   cloud schedule. Files/queue, RAM checks, Main SMB or tests do not qualify.

No additional administrative owner run is requested while these gates are not
satisfied. The current controller remains available for its originally approved
129 rollback; it must not be reused to remove the old grant as part of a new
service repair. Existing central monitoring continues with source/ACK UNKNOWN.

## Primary documentation and limits

- [TaskService.GetFolder](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskservice-getfolder): backslash is the root argument.
- [SchRpcEnumTasks](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-tsch/b1631854-cb8b-4b47-b5d1-550d3afd7507): opnum7 and access-filtered enumeration. The exact-build error collapsing above is from the binary, not inferred solely from the protocol text.
- [TaskFolder.SetSecurityDescriptor](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/nf-taskschd-itaskfolder-setsecuritydescriptor): documented folder write API; no promise of unchanged descendants.
- [SetSecurityInfo](https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-setsecurityinfo): propagation rules and the MAXIMUM_ALLOWED exception are specific to the handle/API actually used.

Do not describe this preparation as a production fix or claim source admission,
stability, future natural capture success, merge/deploy or permission expansion.
