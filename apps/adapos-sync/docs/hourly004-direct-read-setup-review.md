# SERVER004 direct read: review package, not activation

Current direct-read steps: hourly004-direct-read-r2.md and hourly004-direct-read-r2-handoff.txt (H004-DIRECT-READ-20261112-R2). R2 supersedes the R1 direct-read onboarding steps below; existing full-policy controller and recovery contracts are unchanged.

Prepared 11 November 2026. Continue the existing PR #87 and Ozymandias monitor.
No change to PR #81, its installed CPU-v5, backend, schema or Windows Tasks.

## Result being prepared

Ozymandias cloud -> ChatGPT desktop connection on SERVER004 -> approved read-only
command on SERVER004 -> existing Hourly receipts and eleven local Task records.

SCPRODUCTDEV is not a hop in this path. No public SMB port, additional VPN,
public API, Windows service, new observer or Scheduled Task is proposed. One
small approved reader can be retained in one native task workspace and reused;
the owner does not download a new diagnostic each time a run fails.

The preparation is reviewable. Direct cloud access is **not yet accepted**.

## Facts checked, and remaining unknowns

- Main checked existing SMB/COM from SCPRODUCTDEV with its existing identity.
  That proves main access only. No remote write or new credential was used.
- Actual SERVER004 evidence directory has a protected DACL containing SYSTEM
  and Administrators FullControl. A normal/non-elevated native executor might
  not be able to read it. No ACL was changed; no elevation workaround is allowed.
- The connected source kernel file reports 10.0.19041.6456. This is kernel file
  metadata, not proof of Windows edition or desktop-app feature eligibility.
- Existing cloud monitor's 11Nov17:28 record says SERVER004 is absent from its
  direct environment catalog; task authorization and source reads are UNKNOWN.
  It can read central and this main chat. Its morning-report handoff is received.
- CPU-v5 installation was independently accepted on 11Nov, and the natural
  17:00 slot has source/ACK/central6835,35batches,pending0,Task0. This does not
  authorize device access or prove morning stability.
- PR #87 is a dependent draft, not merged or deployed. Its validator is not a
  permission broker. This preparation does not ship its upload recovery.
- SERVER004's current ChatGPT desktop version, signed-in account/workspace,
  native task authorization, actual native token, and native timeout behavior
  have not been verified from Ozymandias. Main cannot infer them from SMB.

## Platform boundary and approval impact

Use the existing native computer connection first. Official guidance requires
the target computer online, ChatGPT desktop running and signed in to the same
account/workspace. Local access is a separate opt-in for dots; the documented
desktop minimum is26.929. Package versions must not be guessed equivalent to
that app version.

On SERVER004, the eventual human step is the dot's Details -> Computers ->
the actual SERVER004/Your computer entry -> Allow -> Allow access. Verify the
machine name first, not the main laptop. For managed workspaces, missing or
disabled controls require the workspace owner to inspect the dots local-access
permission/policy. Do not enable it for the whole workspace as a shortcut.

**That grant is broader task/computer access, not an OS-enforced read-only
file/Task permission.** This package limits the approved workflow; it does not
turn an Administrator account into a read-only security principal. The human
must review that grant before any action. No approval is requested or implied
for arbitrary shell commands, account switching, RunAs, ACL changes, software
installation, security-policy changes or registry/autologin edits.

If the existing native token cannot read the protected files/Tasks, stop and
report the exact stage. Do not run the desktop elevated or grant file/Task ACLs
automatically. Any narrowly scoped permission proposal would require its own
review with the actual executor identity first. This package promises a single
setup session when prerequisites hold, not automatic repair of denied access.

Official sources:

- [Local computer access, setup and dots end-user steps](https://learn.chatgpt.com/docs/enterprise/cloud-local-access)
- [Cloud and local execution/policy boundaries](https://learn.chatgpt.com/docs/agent-approvals-security)

## One-time sequence after explicit approval

1. On SERVER004, confirm the existing ChatGPT desktop account/workspace and
   actual computer name. Confirm supported app version. If absent/unsupported,
   stop for a concrete software/permission review; do not install an alternative.
2. Human grants only the intended SERVER004 entry to the existing Ozymandias.
   No credential is sent to chat, reader, repository or journal.
3. In the existing cloud owner, refresh trusted native computer inventory. Require
   exact SERVER004 match and actual task-execution authorization. Connected
   alone is insufficient. No source call when false, absent or unknown.
4. Inspect existing source-read task ownership. Reuse a dedicated read-only
   SERVER004 context if it already exists. If the platform requires a local
   task and none exists, approval must cover creating **one** dedicated read-only
   context there. Do not resume the CPU-v5 editing chat or unrelated workers.
   Record and reuse that context; it is not a new Windows scheduled task.
5. Transfer only the reviewed `Read-Hourly004DirectSource.ps1` into that native
   context's workspace once, with byte comparison in RAM against the approved
   artifact. This is one code file in the task workspace, not an Hourly install.
   No runtime source, .env, old evidence or permission is changed. Use the same
   file on later checks; no automatic code update or self-modification.
6. Invoke the file with the existing native Windows PowerShell5.1, NoProfile,
   NonInteractive and RemoteSigned. Require a native per-invocation deadline
   of30seconds. Keep the platform task/command audit outside the source JSON.
   Do not execute on SCPRODUCTDEV or open remote SMB as a substitute.
7. Accept direct access only after trusted authorization plus real hostname,
   existing SERVER004\Administrator identity, timezone, readable file and
   all11 local Task reads agree. Save one sanitized receipt in the existing
   journal with revision guard and readback. Local JSON cannot grant access.
8. Add this source read to the **existing** hourly cloud check, retaining its
   owner/times and central query/journal behavior. Keep the local monitor paused.
   No extra timer. Preserve the already-requested12Nov09/10 reports.

The only future server-side code write is the one reviewed reader in the
dedicated native task workspace. There is no installer command to run on the
business runtime. Today no file has been transferred to SERVER004 and no native
context, grant, task, service or schedule has been created.

## Reader behavior and limits

Public actions are Preflight/Status only. It reads the four exact existing
status/receipt/pointer files, local metadata for Hourly0900..1900, and at most512
queue entries without returning their names or contents. It loads no .env,
SQL library, collector, runner, CPU provider or business rows. It does not run
the existing update controller or any Task. Hidden ancestors are read with
Get-Item -Force; reparse paths and oversized inputs stop inspection.

The two existing receipt snapshots are validated in RAM. Corrupt readable JSON
is not permission denial. A valid other slot does not certify the expected
slot. The actual17:00 timing pattern is tested: Task start17:00:02, receipt
attempt17:00:03.248, collection17:00:07.951. The existing2-second Task/attempt
binding is retained; collection start is separately labelled. No guard threshold
is extended to make the check pass.

`PASS_READ_ACCESS_ONLY` proves file/Task access, not full delivery or policy
integrity. The pointer is recognized separately; full release integrity is
explicitly not revalidated. `expectedGuardBudgetMs=12000` is an expectation,
not a freshly measured policy assertion. Recovery is observed from a coherent
cached run when possible. Never populate PR87's full controller-policy contract
from those expectation fields or manufacture `installationTransaction:idle`.

The reader has a20-second cooperative budget between blocking operations.
That does **not** preempt a stalled COM/filesystem call. A proven native30-second
deadline/cancellation is therefore an external admission gate. If the executor
cannot provide it, mark admission PARTIAL and do not add repeated reads to the
timer. On timeout, no retry; verify the owned read invocation ended before the
next source read. Never terminate Hourly/POS/Full Sync processes.

Keep central/source/journal health independent. Access PASS can coexist with
unknown evidence, a pending queue or a failed actual capture. Reuse the PR87
reconciler only with its real supported controller contract; otherwise report
central delivery and the new source facts separately, without a fabricated
full-PASS label. Retained failure history covers at most8 entries, not all time.

## Rollback

1. Preserve current safe incident facts and the central monitor.
2. Remove the source-read step from the existing cloud prompt; do not delete or
   duplicate the existing schedule. Do not alter the current running read blindly.
3. Human revokes only Ozymandias's SERVER004 computer grant if revocation is
   desired and that grant was introduced by this onboarding. Inventory other
   authorized work first: revocation may affect its native tasks too. Never
   revoke a pre-existing/shared grant just to remove this reader. In that case
   roll back only the source-read step and leave the grant for its other owners.
   It does not revoke access to other computers or delete the dot.
4. Retain the isolated reader file and audit until reviewed cleanup. No runtime
   rollback, Task disable/Run, data cleanup, credential rotation or stock action.

Hourly and Full Sync/Delta continue under their existing Windows tasks even if
this reader connection is revoked. Cloud checks continue central-only and mark
source UNKNOWN. Closing/signing out the target desktop app makes source access
unavailable; it does not imply Hourly failed. SERVER004 must remain online and
the app connected for native source reads; the user's main laptop can be off.

## Review/activation gates

- Preparation: review diff, nativePS5.1 simulations, literal wrong-host CLI gate,
  no-write command surface and failure cases. None is a cloud grant test.
- Before connection: explicit human approval of target/account/native access
  breadth, optional single read context/file transfer, and timeout requirement.
- Before source scheduling: actual authorized cloud invocation, real file/Task
  receipt, no laptop hop, queue semantics and exact-slot comparison to central.
- Before claiming unattended sustainability: a later scheduled run in the
  existing cloud owner reuses the admitted context; observe normal reconnect/
  boot behavior when it occurs. Do not reboot or disconnect POS to create a test.

No merge, deployment, installation, permission grant, recovery enablement or
production acceptance is performed by this review package.
