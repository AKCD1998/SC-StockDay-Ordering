# Post-grant native Task read —16November2026

The human applied the approved filesystem-root-only mask129 at10:09:48 Bangkok.
Main's original authorized SMB readback at10:10:45 found the final and child
receipts for this same invocation, both reporting verified write/preservation.
The earlier09:58 BUSY attempt remains separate and did not write permissions.
No new owner download or diagnostic execution is requested.

Actual Ozymandias same-context native Status at10:16:52 was still PARTIAL:
host/identity/timezone/non-admin checks passed, receipt2 verified, cpu-v5 pointer,
queue0, Task0/11, task-read NOT_FOUND with DirectoryNotFoundException/HRESULT
0x80070003. Current ACK qualification is unknown because it needs matching Task
evidence. The existing30s supervisor closed its own child in2037ms. No stock
Task, SQL, capture/upload, config, ACL or recovery change occurred in that read.

Main's separate authorized read at10:24:37 found one self-only allow129 for the
target user on the filesystem root, but no ACE for that SID in the COM root
folder's GetSecurityDescriptor(4) view. This is a descriptor-view difference,
not proof of separate stores/caching, effective COM denial or a sufficient fix.
Groups/restricted token/mandatory access and the requested rights still matter.
An earlier Main metadata attempt failed on a missing local Get-Acl cmdlet; using
the same identity/channel and .NET read accessor corrected that local-tool issue.
It was not a source access-denied or installation failure.

The previously proposed mask129 did not establish Task API access. Review must
test the actual service namespace as well as a filesystem descriptor before
calling an owner permission operation complete. Do not repair this by adding
broad rights or repeatedly asking the owner to execute diagnostics.

`Inspect-Hourly004TaskReadLayers.ps1` is a one-shot **memory-only read probe**,
requiring the existing owned-child30s supervisor and same authorized native
context. It has fixed host/user/non-admin/no-impersonation/timezone/PS5.1x64
gates; no account/profile, registry, ACL, file-content or Task mutation. It opens
only the known root directory with requested read masks129,8 and GENERIC_READ,
closes every obtained handle, and reports exact COM creation/Connect/target/
GetFolder/exact-task stages. There is no enumeration/name/argument output.
Even successful lookup is not full receipt/Task/ACK/queue admission.

Reflection.Emit uses Run-only memory and checked signatures. DefineMethod plus
the DllImport pseudoattribute is used to verify SetLastError is actually enabled;
the IL wrapper captures the cached error before the PowerShell binder can make
another native call. A local negative fixture exposed that setting this pseudo-
attribute after DefinePInvokeMethod had left it false. The new fixture checks
the binding and real missing-path errors2/3. Earlier successful kernel boolean
decisions remain boolean evidence; do not reinterpret old failure error codes
from unverified bindings as authoritative. No PR81/runtime change is made.

Native5.1 tests exercise binding/read-open/close/error on a disposable local
directory only, plus the real wrong-host gate. They do not spoof SERVER004 or
certify the actual restricted caller. Independent review and pinned CI precede
one native invocation; no repeated whole-Status attempts or new permission write.

Generic file Read also includes ReadEA8, which mask129 lacks
([Microsoft](https://learn.microsoft.com/en-us/windows/win32/secauthz/generic-access-rights)).
Whether it explains this Task Service failure remains unproven.
[TaskFolder.SetSecurityDescriptor](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/nf-taskschd-itaskfolder-setsecuritydescriptor)
is a new production permission write. Its effects on filesystem/child ACLs must
be established and rollback reviewed before any fresh scope approval. Do not
reuse the SetSecurityInfo MAXIMUM_ALLOWED propagation exception or RegisteredTask
flag16 for the different Folder API. A self-only new ACE does not prove that
pre-existing inheritable ACEs will not propagate through that API.

Keep the existing filesystem129 grant, guard12seconds/recoveryOFF, FullSync/
Delta001004/003005 and source runtime unchanged. Source admission is closed;
the existing cloud monitor remains central-only. No new schedule, RunNow,
compensation, permission retry/rollback or owner command is authorized here.
