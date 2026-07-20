# open-adapos-and-sync.ps1
# Runs the branch sync directly against the local SQL Server.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\open-adapos-and-sync.ps1 -Branch 005

param(
  [string]$Branch = "",
  [string]$NodeExe = "C:\Program Files\nodejs\node.exe",
  # Pass this on the 19:20 evening trigger only. It makes the sync agent check
  # whether the 08:20 run already succeeded today and, if so, send a heartbeat
  # and skip the full resync instead of re-sending unchanged stock numbers.
  [switch]$SkipIfSyncedToday,
  # Pass this to skip the self-update check (e.g. while intentionally testing
  # a local uncommitted change on this specific machine).
  [switch]$NoAutoUpdate,
  # Run the real fleet self-update path and exit without starting Node/SQL/API
  # work. Intended for installation checks and one-time repair operations.
  [switch]$SelfUpdateOnly,
  # RUN-ADAPOS-SYNC.bat generates one GUID per invocation and passes it here
  # so its post-run checker can prove the status file it reads was written by
  # this run, not a leftover from an earlier day. When omitted (e.g. a
  # verifier or operator calling this script directly), an attemptId is
  # generated internally so the self-update flow still works standalone.
  [string]$AttemptId = ""
)

$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
Set-Location $ScriptDir

$LogDir = Join-Path $ScriptDir "logs"
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$LogPath = Join-Path $LogDir ("sync-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))

# Deterministic, fleet-compatible self-update status file. Every branch's
# launcher writes the same schema here so a future central checker/dashboard
# can read it without per-branch special-casing.
$StatusPath = Join-Path $LogDir "self-update-latest.json"
# If a previous attempt's status file is still "STARTED" past this age, its
# run never reached a terminal result (crash, kill, power loss) and gets
# reported as a missing-terminal event before this attempt begins.
$StaleSelfUpdateMinutes = 20

function Write-Log([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Write-Host $line
  Add-Content -Path $LogPath -Value $line
}

function Get-EnvValue([string]$Key) {
  $line = Get-Content ".env" -ErrorAction SilentlyContinue |
          Where-Object { $_ -match "^$Key=" } |
          Select-Object -First 1
  if ($line) { return ($line -replace "^$Key=", "").Trim() }
  return ""
}

function Find-GitRepositoryRoot([string]$StartPath) {
  # Do not use `git rev-parse` for discovery. Under the Scheduled Task's
  # SYSTEM account Git can reject the repository as "dubious ownership"
  # before rev-parse tells us where the repository is. Walking parents for
  # .git lets us identify the exact directory that may be trusted for this
  # invocation only (via `git -c safe.directory=...` below).
  $current = [System.IO.DirectoryInfo](Get-Item -LiteralPath $StartPath)
  while ($null -ne $current) {
    if (Test-Path -LiteralPath (Join-Path $current.FullName ".git")) {
      return $current.FullName
    }
    $current = $current.Parent
  }
  return ""
}

function ConvertTo-NativeArgument([AllowEmptyString()][string]$Value) {
  # ProcessStartInfo on Windows PowerShell 5.1 accepts one command-line string,
  # not an ArgumentList collection. Quote according to the Windows argv rules
  # so repository paths containing spaces remain a single argument.
  if ($null -eq $Value -or $Value.Length -eq 0) {
    return '""'
  }
  if ($Value -notmatch '[\s"]') {
    return $Value
  }

  $builder = New-Object System.Text.StringBuilder
  [void]$builder.Append('"')
  $backslashes = 0

  foreach ($character in $Value.ToCharArray()) {
    if ($character -eq '\') {
      $backslashes++
      continue
    }

    if ($character -eq '"') {
      if ($backslashes -gt 0) {
        [void]$builder.Append((('\' * ($backslashes * 2)) -join ''))
      }
      [void]$builder.Append('\"')
    } else {
      if ($backslashes -gt 0) {
        [void]$builder.Append((('\' * $backslashes) -join ''))
      }
      [void]$builder.Append($character)
    }
    $backslashes = 0
  }

  # Backslashes immediately before the closing quote must be doubled.
  if ($backslashes -gt 0) {
    [void]$builder.Append((('\' * ($backslashes * 2)) -join ''))
  }
  [void]$builder.Append('"')
  return $builder.ToString()
}

function Invoke-GitProcess {
  param(
    [Parameter(Mandatory = $true)]
    [string]$GitPath,
    [Parameter(Mandatory = $true)]
    [string]$RepositoryRoot,
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  # Avoid PowerShell 5.1's native stderr/error-stream promotion entirely.
  # Running git through ProcessStartInfo gives us an explicit exit code plus
  # complete stdout/stderr for every path, including SYSTEM-task failures.
  $process = $null
  try {
    $allArguments = @(
      "-c",
      "safe.directory=$RepositoryRoot",
      "-C",
      $RepositoryRoot
    ) + $Arguments
    $argumentLine = (($allArguments | ForEach-Object {
      ConvertTo-NativeArgument -Value $_
    }) -join " ")

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $GitPath
    $startInfo.Arguments = $argumentLine
    $startInfo.WorkingDirectory = $RepositoryRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.EnvironmentVariables["GIT_TERMINAL_PROMPT"] = "0"
    $startInfo.EnvironmentVariables["GCM_INTERACTIVE"] = "Never"

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
      throw "Git process did not start."
    }

    # Start both asynchronous reads before waiting, otherwise a sufficiently
    # full stderr/stdout pipe can deadlock the child process.
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()

    $stdout = $stdoutTask.Result.Trim()
    $stderr = $stderrTask.Result.Trim()
    $combined = (@($stdout, $stderr) | Where-Object { $_ }) -join " "
    # Do not leak an embedded HTTPS credential if a remote URL is included in
    # an authentication error.
    $combined = $combined -replace '(https?://)[^/@\s]+@', '$1<redacted>@'

    return [pscustomobject]@{
      ExitCode = $process.ExitCode
      Output   = $combined
    }
  } catch {
    return [pscustomobject]@{
      ExitCode = -1
      Output   = $_.Exception.Message
    }
  } finally {
    if ($null -ne $process) {
      $process.Dispose()
    }
  }
}

function Write-SelfUpdateStatusAtomic {
  param([Parameter(Mandatory = $true)][System.Collections.Specialized.OrderedDictionary]$StatusObject)

  # Write-then-rename so a reader never observes a half-written JSON file.
  # The temp file lives next to the target so Move-Item -Force is a same
  # volume rename, not a copy.
  $json = ($StatusObject | ConvertTo-Json -Depth 5)
  $tempPath = "$StatusPath.tmp-$PID-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
  try {
    Set-Content -LiteralPath $tempPath -Value $json -Encoding UTF8 -NoNewline
    Move-Item -LiteralPath $tempPath -Destination $StatusPath -Force
  } catch {
    Write-Log "SELF-UPDATE-MONITOR: WARNING failed to write status file $StatusPath."
    if (Test-Path -LiteralPath $tempPath) { Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue }
  }
}

function Send-SelfUpdateHeartbeat {
  param(
    [Parameter(Mandatory = $true)][string]$EventString,
    [Parameter(Mandatory = $true)][string]$BranchCode
  )

  try {
    $apiBaseUrl = Get-EnvValue "ADAPOS_SYNC_API_BASE_URL"
    $token = Get-EnvValue "ADAPOS_SYNC_SHARED_TOKEN"
    if (-not $apiBaseUrl -or -not $token) {
      Write-Log "SELF-UPDATE-MONITOR: heartbeat skipped (ADAPOS_SYNC_API_BASE_URL or ADAPOS_SYNC_SHARED_TOKEN not set)."
      return
    }
    $uri = $apiBaseUrl.TrimEnd("/") + "/api/sync/heartbeat"
    $body = @{ branchCode = $BranchCode; laptopName = $env:COMPUTERNAME; event = $EventString } | ConvertTo-Json
    Invoke-WebRequest -Uri $uri -Method POST -UseBasicParsing -TimeoutSec 15 `
      -Headers @{ "x-api-key" = $token } -ContentType "application/json" -Body $body | Out-Null
  } catch {
    # Best-effort only: a heartbeat failure must never change the self-update
    # result (that is decided purely from Git state) and must never block the
    # sync that follows. Deliberately not logging $_.Exception.Message here:
    # a web exception can echo response headers/bodies that may carry the
    # shared token.
    Write-Log "SELF-UPDATE-MONITOR: WARNING heartbeat send failed for event '$EventString'."
  }
}

function Get-CurrentHeadBestEffort {
  try {
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) { return "" }
    $gitPath = if ($git.Path) { $git.Path } else { $git.Source }
    $topLevel = Find-GitRepositoryRoot -StartPath $ScriptDir
    if (-not $topLevel) { return "" }
    $result = Invoke-GitProcess -GitPath $gitPath -RepositoryRoot $topLevel -Arguments @("rev-parse", "HEAD")
    if ($result.ExitCode -eq 0) { return $result.Output.Trim() }
    return ""
  } catch {
    return ""
  }
}

function Test-StaleSelfUpdateStatus {
  param([Parameter(Mandatory = $true)][string]$BranchCode)

  if (-not (Test-Path -LiteralPath $StatusPath)) { return }
  try {
    $prev = Get-Content -LiteralPath $StatusPath -Raw | ConvertFrom-Json
  } catch {
    Write-Log "SELF-UPDATE-MONITOR: previous status file is not valid JSON; ignoring."
    return
  }
  if ($prev.result -ne "STARTED") { return }
  $prevStartedAt = $null
  try { $prevStartedAt = [datetime]$prev.startedAt } catch { }
  if (-not $prevStartedAt) { return }
  if (((Get-Date) - $prevStartedAt).TotalMinutes -le $StaleSelfUpdateMinutes) { return }

  Write-Log "SELF-UPDATE-MONITOR: RESULT=MISSING_TERMINAL attemptId=$($prev.attemptId) startedAt=$($prev.startedAt)"
  Send-SelfUpdateHeartbeat -EventString "self-update:MISSING_TERMINAL:$($prev.attemptId)" -BranchCode $BranchCode
}

function Complete-SelfUpdate {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("UPDATED", "CURRENT", "FAILED")]
    [string]$Status,
    [Parameter(Mandatory = $true)]
    [string]$Detail,
    [string]$ReasonCode = "",
    [string]$HeadBefore = "",
    [string]$HeadAfter = "",
    [Parameter(Mandatory = $true)][string]$AttemptId,
    [Parameter(Mandatory = $true)][string]$StartedAt,
    [Parameter(Mandatory = $true)][string]$BranchCode
  )

  # This is the machine-readable terminal record for every attempted update.
  # Keep it to exactly one line so fleet diagnostics never need to infer the
  # outcome from intermediate git messages.
  Write-Log "SELF-UPDATE: RESULT=$Status $Detail"

  Write-SelfUpdateStatusAtomic -StatusObject ([ordered]@{
    schemaVersion = 1
    attemptId     = $AttemptId
    branch        = $BranchCode
    hostname      = $env:COMPUTERNAME
    account       = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    startedAt     = $StartedAt
    finishedAt    = (Get-Date).ToString("o")
    result        = $Status
    headBefore    = $HeadBefore
    headAfter     = $HeadAfter
    reasonCode    = $ReasonCode
    logPath       = $LogPath
  })

  $shortHead = if ($HeadAfter) { $HeadAfter.Substring(0, [Math]::Min(7, $HeadAfter.Length)) } else { "" }
  $eventString = switch ($Status) {
    "UPDATED" { "self-update:UPDATED:${AttemptId}:${shortHead}" }
    "CURRENT" { "self-update:CURRENT:${AttemptId}:${shortHead}" }
    "FAILED"  { "self-update:FAILED:${AttemptId}:${ReasonCode}" }
  }
  Send-SelfUpdateHeartbeat -EventString $eventString -BranchCode $BranchCode

  return ($Status -ne "FAILED")
}

function Invoke-SelfUpdate {
  param(
    [string]$BranchCode,
    [Parameter(Mandatory = $true)][string]$AttemptId,
    [Parameter(Mandatory = $true)][string]$StartedAt
  )
  # Fleet self-update: fetches the same fix/config improvements every branch
  # gets, on this branch's own next scheduled run, with no per-machine
  # coordination needed. Pull-based via the Scheduled Task this machine
  # already runs unattended — never push-based (no remote-exec trust exists
  # between machines, and none is needed for this). Fails safe by design:
  # any reason to be unsure (dirty tree, wrong branch, git missing, pull
  # error) just skips the update and runs the sync with whatever code is
  # already on disk — an update check must never block the actual sync.
  $git = Get-Command git -ErrorAction SilentlyContinue
  if (-not $git) {
    return (Complete-SelfUpdate -Status "FAILED" -Detail "reason=git_not_found detail='git is not available on PATH; continuing with existing code.'" -ReasonCode "git_not_found" -HeadBefore "" -HeadAfter "" -AttemptId $AttemptId -StartedAt $StartedAt -BranchCode $BranchCode)
  }

  $topLevel = Find-GitRepositoryRoot -StartPath $ScriptDir
  if (-not $topLevel) {
    return (Complete-SelfUpdate -Status "FAILED" -Detail "reason=repository_not_found detail='no .git directory exists in the launcher path or its parents; continuing with existing code.'" -ReasonCode "repository_not_found" -HeadBefore "" -HeadAfter "" -AttemptId $AttemptId -StartedAt $StartedAt -BranchCode $BranchCode)
  }

  $gitPath = if ($git.Path) { $git.Path } else { $git.Source }
  Write-Log "SELF-UPDATE: identity hostname=$env:COMPUTERNAME account=$([Security.Principal.WindowsIdentity]::GetCurrent().Name) branch=$BranchCode repo=$topLevel"

  $headBeforeResult = Invoke-GitProcess -GitPath $gitPath -RepositoryRoot $topLevel -Arguments @("rev-parse", "HEAD")
  $headBefore = if ($headBeforeResult.ExitCode -eq 0) { $headBeforeResult.Output.Trim() } else { "" }

  Write-Log "SELF-UPDATE: checking working tree."
  $statusResult = Invoke-GitProcess -GitPath $gitPath -RepositoryRoot $topLevel -Arguments @("status", "--porcelain")
  if ($statusResult.ExitCode -ne 0) {
    return (Complete-SelfUpdate -Status "FAILED" -Detail "reason=status_failed exit=$($statusResult.ExitCode) detail='$($statusResult.Output)' continuing_with_existing_code=true" -ReasonCode "status_failed" -HeadBefore $headBefore -HeadAfter $headBefore -AttemptId $AttemptId -StartedAt $StartedAt -BranchCode $BranchCode)
  }
  if ($statusResult.Output) {
    $fileCount = ($statusResult.Output -split "`r?`n").Count
    return (Complete-SelfUpdate -Status "FAILED" -Detail "reason=dirty_worktree changes=$fileCount detail='update skipped to avoid clobbering local changes; investigate manually.'" -ReasonCode "dirty_worktree" -HeadBefore $headBefore -HeadAfter $headBefore -AttemptId $AttemptId -StartedAt $StartedAt -BranchCode $BranchCode)
  }

  $branchResult = Invoke-GitProcess -GitPath $gitPath -RepositoryRoot $topLevel -Arguments @("rev-parse", "--abbrev-ref", "HEAD")
  if ($branchResult.ExitCode -ne 0) {
    return (Complete-SelfUpdate -Status "FAILED" -Detail "reason=branch_lookup_failed exit=$($branchResult.ExitCode) detail='$($branchResult.Output)' continuing_with_existing_code=true" -ReasonCode "branch_lookup_failed" -HeadBefore $headBefore -HeadAfter $headBefore -AttemptId $AttemptId -StartedAt $StartedAt -BranchCode $BranchCode)
  }
  $branchName = $branchResult.Output.Trim()
  if ($branchName -ne "main") {
    return (Complete-SelfUpdate -Status "FAILED" -Detail "reason=wrong_branch branch='$branchName' expected='main' detail='update skipped; continuing with existing code.'" -ReasonCode "wrong_branch" -HeadBefore $headBefore -HeadAfter $headBefore -AttemptId $AttemptId -StartedAt $StartedAt -BranchCode $BranchCode)
  }

  Write-Log "SELF-UPDATE: fetching origin/main."
  $fetchResult = Invoke-GitProcess -GitPath $gitPath -RepositoryRoot $topLevel -Arguments @("fetch", "origin", "main", "--quiet")
  if ($fetchResult.ExitCode -ne 0) {
    return (Complete-SelfUpdate -Status "FAILED" -Detail "reason=fetch_failed exit=$($fetchResult.ExitCode) detail='$($fetchResult.Output)' continuing_with_existing_code=true" -ReasonCode "fetch_failed" -HeadBefore $headBefore -HeadAfter $headBefore -AttemptId $AttemptId -StartedAt $StartedAt -BranchCode $BranchCode)
  }

  $localResult = Invoke-GitProcess -GitPath $gitPath -RepositoryRoot $topLevel -Arguments @("rev-parse", "HEAD")
  $remoteResult = Invoke-GitProcess -GitPath $gitPath -RepositoryRoot $topLevel -Arguments @("rev-parse", "origin/main")
  if ($localResult.ExitCode -ne 0 -or $remoteResult.ExitCode -ne 0) {
    return (Complete-SelfUpdate -Status "FAILED" -Detail "reason=commit_lookup_failed local_exit=$($localResult.ExitCode) remote_exit=$($remoteResult.ExitCode) local_detail='$($localResult.Output)' remote_detail='$($remoteResult.Output)' continuing_with_existing_code=true" -ReasonCode "commit_lookup_failed" -HeadBefore $headBefore -HeadAfter $headBefore -AttemptId $AttemptId -StartedAt $StartedAt -BranchCode $BranchCode)
  }

  $localHead = $localResult.Output.Trim()
  $remoteHead = $remoteResult.Output.Trim()
  if ($localHead -eq $remoteHead) {
    return (Complete-SelfUpdate -Status "CURRENT" -Detail "head=$($localHead.Substring(0,7))" -HeadBefore $headBefore -HeadAfter $localHead -AttemptId $AttemptId -StartedAt $StartedAt -BranchCode $BranchCode)
  }

  Write-Log "SELF-UPDATE: $($localHead.Substring(0,7)) -> $($remoteHead.Substring(0,7)), pulling..."
  $pullResult = Invoke-GitProcess -GitPath $gitPath -RepositoryRoot $topLevel -Arguments @("pull", "origin", "main", "--ff-only", "--quiet")
  if ($pullResult.ExitCode -ne 0) {
    return (Complete-SelfUpdate -Status "FAILED" -Detail "reason=pull_failed exit=$($pullResult.ExitCode) detail='$($pullResult.Output)' continuing_with_existing_code=true" -ReasonCode "pull_failed" -HeadBefore $headBefore -HeadAfter $headBefore -AttemptId $AttemptId -StartedAt $StartedAt -BranchCode $BranchCode)
  }

  $verifyResult = Invoke-GitProcess -GitPath $gitPath -RepositoryRoot $topLevel -Arguments @("rev-parse", "HEAD")
  $verifiedHead = $verifyResult.Output.Trim()
  if ($verifyResult.ExitCode -ne 0 -or $verifiedHead -ne $remoteHead) {
    return (Complete-SelfUpdate -Status "FAILED" -Detail "reason=pull_verification_failed exit=$($verifyResult.ExitCode) head='$verifiedHead' expected='$remoteHead' detail='continuing with the code now on disk; investigate manually.'" -ReasonCode "pull_verification_failed" -HeadBefore $headBefore -HeadAfter $verifiedHead -AttemptId $AttemptId -StartedAt $StartedAt -BranchCode $BranchCode)
  }

  return (Complete-SelfUpdate -Status "UPDATED" -Detail "from=$($localHead.Substring(0,7)) to=$($verifiedHead.Substring(0,7))" -HeadBefore $headBefore -HeadAfter $verifiedHead -AttemptId $AttemptId -StartedAt $StartedAt -BranchCode $BranchCode)
}

function Invoke-LoggedProcess {
  param(
    [string]$FilePath,
    [string[]]$ArgumentList
  )

  # "Continue" lets node's stderr flow through the 2>&1 pipe as ErrorRecords
  # rather than terminating the pipeline (which "Stop" would do, silencing the error).
  $local:ErrorActionPreference = "Continue"
  & $FilePath @ArgumentList 2>&1 | ForEach-Object {
    $line = if ($_ -is [System.Management.Automation.ErrorRecord]) {
      if ($null -ne $_.TargetObject) { "$($_.TargetObject)" } else { $_.Exception.Message }
    } else { "$_" }
    Write-Host $line
    Add-Content -Path $LogPath -Value $line
  }

  return $LASTEXITCODE
}

if (-not (Test-Path -LiteralPath ".env")) {
  Write-Log "WARNING: .env not found in $ScriptDir. The sync may fail unless environment variables are set elsewhere."
}

if (-not $Branch) {
  $Branch = Get-EnvValue "ADAPOS_SYNC_BRANCH_CODE"
}

if (-not $Branch) {
  if ($SelfUpdateOnly) {
    Complete-SelfUpdate -Status "FAILED" -Detail "reason=branch_missing detail='pass -Branch NNN or set ADAPOS_SYNC_BRANCH_CODE.'" | Out-Null
  }
  throw "Branch is required. Pass -Branch 005 or set ADAPOS_SYNC_BRANCH_CODE in apps\adapos-sync\.env."
}

if ($Branch -notmatch '^\d{3}$') {
  if ($SelfUpdateOnly) {
    Complete-SelfUpdate -Status "FAILED" -Detail "reason=branch_invalid branch='$Branch' expected='exactly three digits'" | Out-Null
  }
  throw "Invalid branch code '$Branch'. Expected exactly three digits, for example 005."
}

if ($SelfUpdateOnly -and $NoAutoUpdate) {
  Complete-SelfUpdate -Status "FAILED" -Detail "reason=conflicting_arguments detail='-SelfUpdateOnly cannot be combined with -NoAutoUpdate.'" | Out-Null
  throw "-SelfUpdateOnly cannot be combined with -NoAutoUpdate."
}

$selfUpdateSucceeded = $true
if ($NoAutoUpdate) {
  Write-Log "SELF-UPDATE: skipped (-NoAutoUpdate passed)."
  $skipAttemptId = [Guid]::NewGuid().ToString()
  $skipNow = (Get-Date).ToString("o")
  $skipHead = Get-CurrentHeadBestEffort
  Write-SelfUpdateStatusAtomic -StatusObject ([ordered]@{
    schemaVersion = 1
    attemptId     = $skipAttemptId
    branch        = $Branch
    hostname      = $env:COMPUTERNAME
    account       = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    startedAt     = $skipNow
    finishedAt    = $skipNow
    result        = "SKIPPED"
    headBefore    = $skipHead
    headAfter     = $skipHead
    reasonCode    = "no_auto_update"
    logPath       = $LogPath
  })
} else {
  # Detect a previous attempt that crashed/was killed before it could write a
  # terminal result, then start this attempt's own status record.
  Test-StaleSelfUpdateStatus -BranchCode $Branch
  $attemptId = if ($AttemptId) { $AttemptId } else { [Guid]::NewGuid().ToString() }
  $startedAt = (Get-Date).ToString("o")
  Write-SelfUpdateStatusAtomic -StatusObject ([ordered]@{
    schemaVersion = 1
    attemptId     = $attemptId
    branch        = $Branch
    hostname      = $env:COMPUTERNAME
    account       = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    startedAt     = $startedAt
    finishedAt    = $null
    result        = "STARTED"
    headBefore    = $null
    headAfter     = $null
    reasonCode    = $null
    logPath       = $LogPath
  })
  Send-SelfUpdateHeartbeat -EventString "self-update:STARTED:$attemptId" -BranchCode $Branch

  try {
    $selfUpdateSucceeded = Invoke-SelfUpdate -BranchCode $Branch -AttemptId $attemptId -StartedAt $startedAt
  } catch {
    # Defense in depth: Invoke-SelfUpdate is scoped to fail safe internally
    # now, but if anything else in it ever throws, catch it here too rather
    # than let a self-update problem take down the actual sync, and rather
    # than leave the status file stuck on STARTED.
    $headNow = Get-CurrentHeadBestEffort
    Complete-SelfUpdate -Status "FAILED" -Detail "reason=unexpected_error detail='$($_.Exception.Message)' continuing_with_existing_code=true" -ReasonCode "unexpected_error" -HeadBefore $headNow -HeadAfter $headNow -AttemptId $attemptId -StartedAt $startedAt -BranchCode $Branch | Out-Null
    $selfUpdateSucceeded = $false
  }
}

if ($SelfUpdateOnly) {
  if (-not $selfUpdateSucceeded) {
    throw "Self-update-only run failed. See log: $LogPath"
  }
  exit 0
}

if (-not (Test-Path -LiteralPath $NodeExe)) {
  throw "Node.js executable not found: $NodeExe"
}

$SyncArgs = @("src/index.js", "--execute", "--branch=$Branch")
if ($SkipIfSyncedToday) {
  $SyncArgs += "--skip-if-synced-today"
}

Write-Log "Starting sync for branch $Branch.$(if ($SkipIfSyncedToday) { ' (evening skip-if-synced-today check)' })"
$exitCode = Invoke-LoggedProcess -FilePath $NodeExe -ArgumentList $SyncArgs
$global:LASTEXITCODE = $exitCode

if ($LASTEXITCODE -ne 0) {
  throw "Sync failed with exit code $LASTEXITCODE. See log: $LogPath"
}

Write-Log "Sync succeeded."

Write-Log "Done. Log saved to $LogPath"
