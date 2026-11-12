# Hourly004 native namespace evidence — 12 November 2026

Owner Windows permission setup succeeded for all19 approved objects at17:28
Bangkok, independently checked via existing main SMB/COM at17:39. This did not
establish native Task access. No root-folder grant was included in that scope.

Actual Ozymandias native R3 at17:58:56 ran on SERVER004 as the existing
CodexSandboxOffline non-admin in its unchanged read-only profile. The owned-child
deadline proof terminated/reaped its own child at30.082s. Status took1.808s:
two receipts readable, current pending0, Task reads0/11. ACK remained unknown.
COM creation and Connect succeeded; GetFolder(root) failed with0x80070003.
The actual argument was one character, codepoint92, and TargetServer SERVER004.
A single exact-task query through the built-in local query client returned the
same HRESULT in92ms and closed its own child. No credential/host/profile change.

At18:15:45, read-only root security metadata showed one matching allow mask
1179926 and no matching deny. It contained READ_CONTROL but no directory-list,
read-attributes or traverse bits. This was rule matching, not effective access
under a restricted token and not proof that adding a particular ACE will fix
Task Service. No root ACL change is authorized or proposed as a proven remedy.
The owner has not established an authorized administrator execution channel.

The generated kernel diagnostic failed before opening a token. Its interop
builder named a parameter `$args`, colliding with PowerShell's automatic variable.
Locally reproducing the original definition yielded a zero-parameter native
OpenProcessToken method instead of three; the call failed in managed binding,
before reaching the Windows API. This is not an access-denied result.

`Inspect-Hourly004TaskNamespaceAccess.ps1` fixes that binding using
`$parameterTypes` and verifies all five P/Invoke signatures before calling any.
It retains exact host, existing user and non-admin gates. Reflection.Emit uses
Run-only memory: no compiler, assembly file or native source file placement.
DuplicateToken creates an identification-only copy of the process primary token
only as an input to AccessCheck; pre-existing thread impersonation is rejected.
The result explicitly labels this token basis. No impersonation, thread-token adoption, privilege adjustment or
identity change occurs. All handles/buffers are released. Results include only
safe kernel access decisions and remain explicitly separate from native Task
Service admission. The existing owned-child30s supervisor is still required.

Validation on ScProductDev used only current-process token queries and synthetic
security descriptors in RAM: five corrected signatures, legacy zero-parameter
regression, eight allow/deny decisions, and the real wrong-host gate. It did not
invoke the SERVER004 audit with a forged context or read a system directory.
These fixtures do not establish actual SERVER004 kernel decisions or admission.
An independent review and exact-revision CI precede any new native diagnostic.

No stock Task, Sync, replay, capture/upload, database, ACL, account, credential,
guard12s, recoveryOFF, PR81 runtime or FullSync/Delta change is included.
Do not turn a diagnostic API failure into a missing-capture or permissions claim.
If actual admission remains partial, do not add a recurring source step.

Storage was repaired separately: the previous journal's body had1,535,901
characters and rejected append with FAILED_PRECONDITION; capacity is a plausible
cause, not uniquely proven by that generic error. A private continuation retains
the old archive/checkpoints/gaps. Ozymandias verified append/readback and updated
only the journal pointer in the same cloud automation, retaining times, owner,
central query and source admission gate. Main independently inspected the saved
prompt and09:25–19:25 rule. No duplicate schedule or Run now was created.

Separately, the18:00 stock slot had no central capture. Main's existing read-only
SMB/COM at18:31 found the actual Task enabled, not running, result1, matching
definition, and a durable failure: observed600, stopped-no-partial-capture,
CPU_LIMIT at cpu stage in3711ms of the unchanged12000ms guard, pending0.
Accepted records/ACK remain unknown in that projection. This evidence has main
SMB provenance and does not certify native access or close older gaps. No
compensation or threshold change was requested.

Platform contracts: [TaskService root path](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskservice-getfolder),
[specific local task query](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks-query).
