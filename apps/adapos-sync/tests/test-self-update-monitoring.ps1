# test-self-update-monitoring.ps1
# Integration tests for the self-update status file / heartbeat / checker
# monitoring added to open-adapos-and-sync.ps1, check-self-update-result.ps1,
# RUN-ADAPOS-SYNC.bat and register-task.ps1.
#
# Everything here runs against disposable fixture Git repos and a local
# HttpListener under a temp directory. It never touches the real production
# or legacy repositories, never calls the real ADAPOS_SYNC_API_BASE_URL, and
# never runs a Node/SQL/API full sync.
#
# Usage: powershell -ExecutionPolicy Bypass -File test-self-update-monitoring.ps1

# Deliberately "Continue", not "Stop": this script shells out to git/cmd/
# powershell repeatedly and asserts on their exit codes and captured output,
# including several intentional-failure scenarios. Native stderr output must
# not be promoted into a terminating error here.
$ErrorActionPreference = "Continue"
$RepoAdaposSyncDir = $PSScriptRoot | Split-Path -Parent
$Results = New-Object System.Collections.Generic.List[object]

function Record([string]$Name, [bool]$Pass, [string]$Detail = "") {
  $Results.Add([pscustomobject]@{ Name = $Name; Pass = $Pass; Detail = $Detail })
  $status = if ($Pass) { "PASS" } else { "FAIL" }
  Write-Host "[$status] $Name $(if ($Detail) { "- $Detail" })"
}

function New-TempDir([string]$Prefix) {
  $path = Join-Path ([System.IO.Path]::GetTempPath()) "$Prefix-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
  New-Item -ItemType Directory -Path $path -Force | Out-Null
  return $path
}

function Invoke-GitTest {
  param([string]$RepoDir, [string[]]$Arguments)
  $local:ErrorActionPreference = "Continue"
  $allArgs = @("-c", "user.email=test@example.invalid", "-c", "user.name=Test", "-c", "safe.directory=$RepoDir", "-C", $RepoDir) + $Arguments
  $out = & git @allArgs 2>&1
  $out = $out | ForEach-Object { if ($_ -is [System.Management.Automation.ErrorRecord]) { "$_" } else { "$_" } }
  return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($out -join "`n") }
}

function New-FixtureRepoPair {
  # Returns @{ Origin = <bare repo path>; Work = <clone path> } with one
  # commit containing a copy of the launcher under test.
  param([string]$RootDir)
  $originDir = Join-Path $RootDir "origin.git"
  $workDir = Join-Path $RootDir "work"
  New-Item -ItemType Directory -Path $originDir -Force | Out-Null
  Invoke-GitTest -RepoDir $originDir -Arguments @("init", "--bare", "-q") | Out-Null

  Invoke-GitTest -RepoDir $RootDir -Arguments @("clone", "-q", $originDir, $workDir) | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $workDir "logs") -Force | Out-Null
  Copy-Item -Path (Join-Path $RepoAdaposSyncDir "open-adapos-and-sync.ps1") -Destination $workDir -Force
  Set-Content -LiteralPath (Join-Path $workDir "README.txt") -Value "fixture" -Encoding UTF8
  # Mirrors the production repo's root .gitignore (apps/adapos-sync/logs/) so
  # the launcher's own log/status writes never make git status --porcelain
  # report a false dirty-worktree failure.
  Set-Content -LiteralPath (Join-Path $workDir ".gitignore") -Value "logs/`n.env" -Encoding UTF8
  Invoke-GitTest -RepoDir $workDir -Arguments @("add", "-A") | Out-Null
  Invoke-GitTest -RepoDir $workDir -Arguments @("commit", "-q", "-m", "fixture commit") | Out-Null
  Invoke-GitTest -RepoDir $workDir -Arguments @("push", "-q", "origin", "HEAD:main") | Out-Null
  Invoke-GitTest -RepoDir $workDir -Arguments @("checkout", "-q", "-B", "main") | Out-Null
  return @{ Origin = $originDir; Work = $workDir }
}

function Invoke-Launcher {
  param([string]$WorkDir, [string]$Branch = "999", [switch]$SelfUpdateOnlyFlag = $true, [string]$AttemptId = "")
  $local:ErrorActionPreference = "Continue"
  $launcher = Join-Path $WorkDir "open-adapos-and-sync.ps1"
  $psi = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $launcher, "-Branch", $Branch)
  if ($SelfUpdateOnlyFlag) { $psi += "-SelfUpdateOnly" }
  if ($AttemptId) { $psi += @("-AttemptId", $AttemptId) }
  & powershell @psi *>&1 | Out-Null
  return $LASTEXITCODE
}

function Get-LatestStatus([string]$WorkDir) {
  $p = Join-Path $WorkDir "logs\self-update-latest.json"
  if (-not (Test-Path $p)) { return $null }
  return (Get-Content -LiteralPath $p -Raw | ConvertFrom-Json)
}

function Get-LatestSyncLogText([string]$WorkDir) {
  $log = Get-ChildItem (Join-Path $WorkDir "logs") -Filter "sync-*.log" -File |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $log) { return "" }
  return (Get-Content -LiteralPath $log.FullName -Raw)
}

# ---------------------------------------------------------------------------
# 0. Parser check on every changed/added PS1
# ---------------------------------------------------------------------------
$changedFiles = @(
  (Join-Path $RepoAdaposSyncDir "open-adapos-and-sync.ps1"),
  (Join-Path $RepoAdaposSyncDir "check-self-update-result.ps1"),
  (Join-Path $RepoAdaposSyncDir "register-task.ps1"),
  (Join-Path $PSScriptRoot "test-self-update-monitoring.ps1")
)
foreach ($f in $changedFiles) {
  $perrors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($f, [ref]$null, [ref]$perrors) | Out-Null
  Record "parser: $(Split-Path $f -Leaf)" ($perrors.Count -eq 0) "$($perrors.Count) error(s)"
}

# ---------------------------------------------------------------------------
# 1. CURRENT
# ---------------------------------------------------------------------------
$root1 = New-TempDir "adapos-test-current"
try {
  $pair = New-FixtureRepoPair -RootDir $root1
  $exit = Invoke-Launcher -WorkDir $pair.Work
  $status = Get-LatestStatus -WorkDir $pair.Work
  $logText = Get-LatestSyncLogText -WorkDir $pair.Work
  $terminalMatches = [regex]::Matches($logText, 'SELF-UPDATE: RESULT=(UPDATED|CURRENT|FAILED)(?:\s|$)')
  Record "CURRENT: exit code 0" ($exit -eq 0) "exit=$exit"
  Record "CURRENT: status.result" ($status.result -eq "CURRENT") "result=$($status.result)"
  Record "CURRENT: headBefore == headAfter" ($status.headBefore -eq $status.headAfter -and $status.headBefore) "before=$($status.headBefore) after=$($status.headAfter)"
  Record "CURRENT: exactly one terminal log line (verify-self-update.ps1 regex)" ($terminalMatches.Count -eq 1) "count=$($terminalMatches.Count)"
  Record "CURRENT: status.finishedAt is present" ([bool]$status.finishedAt)
  Record "CURRENT: status.attemptId is present" ([bool]$status.attemptId)
} finally {
  Remove-Item -LiteralPath $root1 -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# 2. UPDATED (via a temporary local bare remote)
# ---------------------------------------------------------------------------
$root2 = New-TempDir "adapos-test-updated"
try {
  $pair = New-FixtureRepoPair -RootDir $root2
  $exit1 = Invoke-Launcher -WorkDir $pair.Work
  $headBeforeAdvance = (Invoke-GitTest -RepoDir $pair.Work -Arguments @("rev-parse", "HEAD")).Output.Trim()

  # Advance origin/main from a second clone, simulating another machine's push.
  # Bare repos created with `git init --bare` default their HEAD symref to
  # whatever init.defaultBranch is (often "master"), which does not exist
  # here -- clone would otherwise leave $pusher on an unborn branch with an
  # empty working tree. Explicitly track main so the new commit is a real
  # fast-forward child of the fixture commit.
  $pusher = Join-Path $root2 "pusher"
  Invoke-GitTest -RepoDir $root2 -Arguments @("clone", "-q", $pair.Origin, $pusher) | Out-Null
  Invoke-GitTest -RepoDir $pusher -Arguments @("checkout", "-q", "-B", "main", "origin/main") | Out-Null
  Set-Content -LiteralPath (Join-Path $pusher "CHANGE.txt") -Value "advance" -Encoding UTF8
  Invoke-GitTest -RepoDir $pusher -Arguments @("add", "-A") | Out-Null
  Invoke-GitTest -RepoDir $pusher -Arguments @("commit", "-q", "-m", "advance commit") | Out-Null
  $pushResult = Invoke-GitTest -RepoDir $pusher -Arguments @("push", "-q", "origin", "HEAD:main")
  $expectedNewHead = (Invoke-GitTest -RepoDir $pusher -Arguments @("rev-parse", "HEAD")).Output.Trim()
  Record "UPDATED fixture: advance push succeeded" ($pushResult.ExitCode -eq 0) "exit=$($pushResult.ExitCode) output=$($pushResult.Output)"

  $exit2 = Invoke-Launcher -WorkDir $pair.Work
  $status = Get-LatestStatus -WorkDir $pair.Work
  $logText = Get-LatestSyncLogText -WorkDir $pair.Work
  $terminalMatches = [regex]::Matches($logText, 'SELF-UPDATE: RESULT=(UPDATED|CURRENT|FAILED)(?:\s|$)')

  Record "UPDATED: exit code 0" ($exit2 -eq 0) "exit=$exit2"
  Record "UPDATED: status.result" ($status.result -eq "UPDATED") "result=$($status.result)"
  Record "UPDATED: headBefore matches pre-advance HEAD" ($status.headBefore -eq $headBeforeAdvance)
  Record "UPDATED: headAfter matches new remote HEAD" ($status.headAfter -eq $expectedNewHead)
  Record "UPDATED: exactly one terminal log line" ($terminalMatches.Count -eq 1) "count=$($terminalMatches.Count)"
  Record "UPDATED: status.finishedAt is present" ([bool]$status.finishedAt)
} finally {
  Remove-Item -LiteralPath $root2 -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# 3. FAILED: dirty worktree
# ---------------------------------------------------------------------------
$root3 = New-TempDir "adapos-test-dirty"
try {
  $pair = New-FixtureRepoPair -RootDir $root3
  Add-Content -LiteralPath (Join-Path $pair.Work "README.txt") -Value "uncommitted change"
  $exit = Invoke-Launcher -WorkDir $pair.Work
  $status = Get-LatestStatus -WorkDir $pair.Work
  $logText = Get-LatestSyncLogText -WorkDir $pair.Work
  $terminalMatches = [regex]::Matches($logText, 'SELF-UPDATE: RESULT=(UPDATED|CURRENT|FAILED)(?:\s|$)')
  Record "FAILED-dirty: nonzero exit" ($exit -ne 0) "exit=$exit"
  Record "FAILED-dirty: status.result=FAILED" ($status.result -eq "FAILED") "result=$($status.result)"
  Record "FAILED-dirty: reasonCode=dirty_worktree" ($status.reasonCode -eq "dirty_worktree") "reasonCode=$($status.reasonCode)"
  Record "FAILED-dirty: exactly one terminal log line" ($terminalMatches.Count -eq 1) "count=$($terminalMatches.Count)"
} finally {
  Remove-Item -LiteralPath $root3 -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# 4. FAILED: fetch failure (origin points at a nonexistent path)
# ---------------------------------------------------------------------------
$root4 = New-TempDir "adapos-test-fetchfail"
try {
  $pair = New-FixtureRepoPair -RootDir $root4
  Invoke-GitTest -RepoDir $pair.Work -Arguments @("remote", "set-url", "origin", (Join-Path $root4 "does-not-exist.git")) | Out-Null
  $exit = Invoke-Launcher -WorkDir $pair.Work
  $status = Get-LatestStatus -WorkDir $pair.Work
  Record "FAILED-fetch: nonzero exit" ($exit -ne 0) "exit=$exit"
  Record "FAILED-fetch: status.result=FAILED" ($status.result -eq "FAILED") "result=$($status.result)"
  Record "FAILED-fetch: reasonCode=fetch_failed" ($status.reasonCode -eq "fetch_failed") "reasonCode=$($status.reasonCode)"
} finally {
  Remove-Item -LiteralPath $root4 -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# 5. Missing terminal: synthetic stale STARTED status file
# ---------------------------------------------------------------------------
$root5 = New-TempDir "adapos-test-stale"
try {
  $pair = New-FixtureRepoPair -RootDir $root5
  $staleStatus = [ordered]@{
    schemaVersion = 1
    attemptId     = "stale-attempt-1234"
    branch        = "999"
    hostname      = $env:COMPUTERNAME
    account       = "test"
    startedAt     = (Get-Date).AddMinutes(-45).ToString("o")
    finishedAt    = $null
    result        = "STARTED"
    headBefore    = $null
    headAfter     = $null
    reasonCode    = $null
    logPath       = ""
  }
  ($staleStatus | ConvertTo-Json) | Set-Content -LiteralPath (Join-Path $pair.Work "logs\self-update-latest.json") -Encoding UTF8
  $exit = Invoke-Launcher -WorkDir $pair.Work
  $logText = Get-LatestSyncLogText -WorkDir $pair.Work
  $status = Get-LatestStatus -WorkDir $pair.Work
  Record "MISSING_TERMINAL: log line present for stale attempt" ($logText -match "SELF-UPDATE-MONITOR: RESULT=MISSING_TERMINAL attemptId=stale-attempt-1234")
  Record "MISSING_TERMINAL: new attempt still reaches a terminal result" ($status.result -in @("CURRENT", "UPDATED")) "result=$($status.result)"
  Record "MISSING_TERMINAL: new attempt has a fresh attemptId" ($status.attemptId -ne "stale-attempt-1234")
} finally {
  Remove-Item -LiteralPath $root5 -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# 6. Invalid / corrupt status JSON does not crash the launcher
# ---------------------------------------------------------------------------
$root6 = New-TempDir "adapos-test-invalidjson"
try {
  $pair = New-FixtureRepoPair -RootDir $root6
  Set-Content -LiteralPath (Join-Path $pair.Work "logs\self-update-latest.json") -Value "{ this is not valid json" -Encoding UTF8
  $exit = Invoke-Launcher -WorkDir $pair.Work
  $logText = Get-LatestSyncLogText -WorkDir $pair.Work
  $status = Get-LatestStatus -WorkDir $pair.Work
  Record "Invalid JSON: launcher does not crash (exit 0, CURRENT)" ($exit -eq 0 -and $status.result -eq "CURRENT") "exit=$exit result=$($status.result)"
  Record "Invalid JSON: logged as ignored" ($logText -match "not valid JSON; ignoring")
  Record "Invalid JSON: status file is valid JSON after this run" ($null -ne $status)
} finally {
  Remove-Item -LiteralPath $root6 -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# 7. check-self-update-result.ps1 exit-code matrix
# ---------------------------------------------------------------------------
$root7 = New-TempDir "adapos-test-checker"
$checkerScript = Join-Path $RepoAdaposSyncDir "check-self-update-result.ps1"
try {
  New-Item -ItemType Directory -Path $root7 -Force | Out-Null
  $ts = (Get-Date).ToString("o")
  $cases = @(
    @{ Name = "CURRENT";  Json = "{`"result`":`"CURRENT`",`"attemptId`":`"a`",`"finishedAt`":`"$ts`"}";  Expected = 0; ExpectedAttemptId = "" }
    @{ Name = "UPDATED";  Json = "{`"result`":`"UPDATED`",`"attemptId`":`"a`",`"finishedAt`":`"$ts`"}";  Expected = 0; ExpectedAttemptId = "" }
    @{ Name = "SKIPPED";  Json = "{`"result`":`"SKIPPED`",`"attemptId`":`"a`",`"finishedAt`":`"$ts`"}";  Expected = 0; ExpectedAttemptId = "" }
    @{ Name = "FAILED";   Json = "{`"result`":`"FAILED`",`"attemptId`":`"a`",`"finishedAt`":`"$ts`"}";   Expected = 1; ExpectedAttemptId = "" }
    @{ Name = "STARTED";  Json = '{"result":"STARTED","attemptId":"a"}';                                  Expected = 2; ExpectedAttemptId = "" }
    @{ Name = "InvalidJSON"; Json = '{ not json';                                                         Expected = 4; ExpectedAttemptId = "" }
    @{ Name = "MissingResultField"; Json = '{"attemptId":"a"}';                                           Expected = 4; ExpectedAttemptId = "" }
    @{ Name = "TerminalMissingFinishedAt"; Json = '{"result":"CURRENT","attemptId":"a"}';                 Expected = 4; ExpectedAttemptId = "" }
    @{ Name = "AttemptIdMatch";    Json = "{`"result`":`"CURRENT`",`"attemptId`":`"match-me`",`"finishedAt`":`"$ts`"}"; Expected = 0; ExpectedAttemptId = "match-me" }
    @{ Name = "AttemptIdMismatch-StaleCurrent"; Json = "{`"result`":`"CURRENT`",`"attemptId`":`"old-attempt`",`"finishedAt`":`"$ts`"}"; Expected = 5; ExpectedAttemptId = "new-attempt" }
  )
  foreach ($case in $cases) {
    $p = Join-Path $root7 "$($case.Name).json"
    Set-Content -LiteralPath $p -Value $case.Json -Encoding UTF8
    $checkerArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $checkerScript, "-StatusPath", $p)
    if ($case.ExpectedAttemptId) { $checkerArgs += @("-ExpectedAttemptId", $case.ExpectedAttemptId) }
    & powershell @checkerArgs | Out-Null
    Record "checker: $($case.Name) -> exit $($case.Expected)" ($LASTEXITCODE -eq $case.Expected) "actual=$LASTEXITCODE"
  }
  $missingPath = Join-Path $root7 "does-not-exist.json"
  & powershell -NoProfile -ExecutionPolicy Bypass -File $checkerScript -StatusPath $missingPath | Out-Null
  Record "checker: missing file -> exit 3" ($LASTEXITCODE -eq 3) "actual=$LASTEXITCODE"
} finally {
  Remove-Item -LiteralPath $root7 -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# 8. Heartbeat: local HTTP listener, no secret leaked in body or log
# ---------------------------------------------------------------------------
$root8 = New-TempDir "adapos-test-heartbeat"
try {
  $pair = New-FixtureRepoPair -RootDir $root8
  $port = Get-Random -Minimum 20000 -Maximum 40000
  $secretToken = "super-secret-token-$([Guid]::NewGuid().ToString('N'))"
  @(
    "ADAPOS_SYNC_API_BASE_URL=http://127.0.0.1:$port"
    "ADAPOS_SYNC_SHARED_TOKEN=$secretToken"
    "ADAPOS_SYNC_BRANCH_CODE=999"
  ) -join "`n" | Set-Content -LiteralPath (Join-Path $pair.Work ".env") -Encoding UTF8

  $listener = New-Object System.Net.HttpListener
  $listener.Prefixes.Add("http://127.0.0.1:$port/")
  $listener.Start()
  # A CURRENT run sends two heartbeats: STARTED, then CURRENT. Capture both.
  $capturedBodies = New-Object System.Collections.Generic.List[string]
  $capturedHeader = ""

  $launcherProcess = Start-Process -FilePath "powershell" -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $pair.Work "open-adapos-and-sync.ps1"),
    "-Branch", "999", "-SelfUpdateOnly"
  ) -WorkingDirectory $pair.Work -PassThru -WindowStyle Hidden

  for ($i = 0; $i -lt 2; $i++) {
    $contextTask = $listener.GetContextAsync()
    if ($contextTask.Wait(15000)) {
      $context = $contextTask.Result
      $reader = New-Object System.IO.StreamReader($context.Request.InputStream)
      $body = $reader.ReadToEnd()
      $capturedBodies.Add($body)
      $capturedHeader = $context.Request.Headers["x-api-key"]
      $context.Response.StatusCode = 200
      $context.Response.Close()
    }
  }
  $launcherProcess.WaitForExit(15000) | Out-Null
  $listener.Stop()
  $listener.Close()

  $logText = Get-LatestSyncLogText -WorkDir $pair.Work
  $status = Get-LatestStatus -WorkDir $pair.Work
  $allBodies = $capturedBodies -join " | "
  $currentBody = $capturedBodies | Where-Object { $_ -match "self-update:CURRENT:" } | Select-Object -First 1

  Record "Heartbeat: both STARTED and CURRENT requests reached listener" ($capturedBodies.Count -eq 2) "count=$($capturedBodies.Count)"
  Record "Heartbeat: x-api-key header carries the token (auth works)" ($capturedHeader -eq $secretToken)
  Record "Heartbeat: JSON bodies do not contain the token" (-not ($allBodies -match [regex]::Escape($secretToken)))
  Record "Heartbeat: event string matches self-update:CURRENT:<attemptId>:<head>" ($null -ne $currentBody -and $currentBody -match 'self-update:CURRENT:[0-9a-fA-F-]{36}:[0-9a-f]{1,7}') "bodies='$allBodies'"
  Record "Heartbeat: sync log file never contains the token" ($logText -notmatch [regex]::Escape($secretToken))
  Record "Heartbeat: status file never contains the token" (((Get-Content (Join-Path $pair.Work "logs\self-update-latest.json") -Raw)) -notmatch [regex]::Escape($secretToken))
} catch {
  Record "Heartbeat: scenario completed without throwing" $false $_.Exception.Message
} finally {
  if ($listener -and $listener.IsListening) { $listener.Stop() }
  Remove-Item -LiteralPath $root8 -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# 9. Path containing spaces
# ---------------------------------------------------------------------------
$root9 = New-TempDir "adapos test with spaces"
try {
  $pair = New-FixtureRepoPair -RootDir $root9
  $exit = Invoke-Launcher -WorkDir $pair.Work
  $status = Get-LatestStatus -WorkDir $pair.Work
  Record "Spaces-in-path: exit code 0" ($exit -eq 0) "exit=$exit path='$root9'"
  Record "Spaces-in-path: status.result=CURRENT" ($status.result -eq "CURRENT") "result=$($status.result)"
} finally {
  Remove-Item -LiteralPath $root9 -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# 10. RUN-ADAPOS-SYNC.bat exit-code precedence (mocked launcher/checker)
# ---------------------------------------------------------------------------
$root10 = New-TempDir "adapos-test-batexit"
try {
  Copy-Item -Path (Join-Path $RepoAdaposSyncDir "RUN-ADAPOS-SYNC.bat") -Destination $root10
  Set-Content -LiteralPath (Join-Path $root10 "show-result.ps1") -Value 'param([int]$ExitCode = 0)' -Encoding UTF8

  $cases = @(
    @{ Sync = 0; Check = 0; Expected = 0;  Name = "sync=0 check=0 -> 0" }
    @{ Sync = 5; Check = 0; Expected = 5;  Name = "sync=5 check=0 -> 5 (sync failure wins)" }
    @{ Sync = 0; Check = 2; Expected = 2;  Name = "sync=0 check=2 -> 2 (checker failure surfaces)" }
    @{ Sync = 3; Check = 2; Expected = 3;  Name = "sync=3 check=2 -> 3 (sync failure takes precedence)" }
  )
  foreach ($case in $cases) {
    Set-Content -LiteralPath (Join-Path $root10 "open-adapos-and-sync.ps1") -Value "param([string]`$Branch,[switch]`$SkipIfSyncedToday,[switch]`$NoAutoUpdate,[switch]`$SelfUpdateOnly,[string]`$AttemptId) exit $($case.Sync)" -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $root10 "check-self-update-result.ps1") -Value "param([string]`$StatusPath,[string]`$ExpectedAttemptId) exit $($case.Check)" -Encoding UTF8
    & cmd.exe /c "`"$($root10)\RUN-ADAPOS-SYNC.bat`" nopause" | Out-Null
    Record "bat-exit-precedence: $($case.Name)" ($LASTEXITCODE -eq $case.Expected) "actual=$LASTEXITCODE"
  }
} finally {
  Remove-Item -LiteralPath $root10 -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# 11. Stale-status masking: pre-existing CURRENT status + a launcher that
#     silently returns 0 without writing a new status must NOT let Task
#     Scheduler see success. Uses the REAL RUN-ADAPOS-SYNC.bat and REAL
#     check-self-update-result.ps1 -- only the launcher is mocked.
# ---------------------------------------------------------------------------
$root11 = New-TempDir "adapos-test-stalemask"
try {
  Copy-Item -Path (Join-Path $RepoAdaposSyncDir "RUN-ADAPOS-SYNC.bat") -Destination $root11
  Copy-Item -Path (Join-Path $RepoAdaposSyncDir "check-self-update-result.ps1") -Destination $root11
  Set-Content -LiteralPath (Join-Path $root11 "show-result.ps1") -Value 'param([int]$ExitCode = 0)' -Encoding UTF8
  # Mock launcher: exits 0 (as if sync succeeded) but never touches the
  # status file at all -- simulates a launcher that crashed/was killed
  # before self-update ran, or a broken deployment, while the sync step
  # itself (mocked here) still reported success.
  Set-Content -LiteralPath (Join-Path $root11 "open-adapos-and-sync.ps1") -Value 'param([string]$Branch,[switch]$SkipIfSyncedToday,[switch]$NoAutoUpdate,[switch]$SelfUpdateOnly,[string]$AttemptId) exit 0' -Encoding UTF8

  New-Item -ItemType Directory -Path (Join-Path $root11 "logs") -Force | Out-Null
  $staleCurrent = [ordered]@{
    schemaVersion = 1
    attemptId     = "stale-old-attempt"
    branch        = "999"
    hostname      = $env:COMPUTERNAME
    account       = "test"
    startedAt     = (Get-Date).AddDays(-3).ToString("o")
    finishedAt    = (Get-Date).AddDays(-3).ToString("o")
    result        = "CURRENT"
    headBefore    = "deadbeef"
    headAfter     = "deadbeef"
    reasonCode    = ""
    logPath       = ""
  }
  ($staleCurrent | ConvertTo-Json) | Set-Content -LiteralPath (Join-Path $root11 "logs\self-update-latest.json") -Encoding UTF8

  & cmd.exe /c "`"$($root11)\RUN-ADAPOS-SYNC.bat`" nopause" | Out-Null
  $batExit = $LASTEXITCODE
  Record "Stale-status masking: bat exit is nonzero despite mock sync returning 0" ($batExit -ne 0) "actual=$batExit"
  Record "Stale-status masking: exit code is the attemptId-mismatch code (5)" ($batExit -eq 5) "actual=$batExit"
} finally {
  Remove-Item -LiteralPath $root11 -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# 12. End-to-end attemptId correlation with the real launcher + real checker
# ---------------------------------------------------------------------------
$root12 = New-TempDir "adapos-test-attemptid"
try {
  $pair = New-FixtureRepoPair -RootDir $root12
  $passedAttemptId = [Guid]::NewGuid().ToString()
  $exit = Invoke-Launcher -WorkDir $pair.Work -AttemptId $passedAttemptId
  $status = Get-LatestStatus -WorkDir $pair.Work
  Record "AttemptId passthrough: launcher writes the caller-supplied attemptId" ($status.attemptId -eq $passedAttemptId) "expected=$passedAttemptId actual=$($status.attemptId)"

  $statusPath = Join-Path $pair.Work "logs\self-update-latest.json"
  & powershell -NoProfile -ExecutionPolicy Bypass -File $checkerScript -StatusPath $statusPath -ExpectedAttemptId $passedAttemptId | Out-Null
  Record "AttemptId passthrough: checker passes with matching -ExpectedAttemptId" ($LASTEXITCODE -eq 0) "actual=$LASTEXITCODE"

  & powershell -NoProfile -ExecutionPolicy Bypass -File $checkerScript -StatusPath $statusPath -ExpectedAttemptId "some-other-attempt" | Out-Null
  Record "AttemptId passthrough: checker fails (exit 5) with mismatched -ExpectedAttemptId" ($LASTEXITCODE -eq 5) "actual=$LASTEXITCODE"

  # verify-self-update.ps1 (and any operator) calls the launcher directly,
  # without -AttemptId. Must still generate its own and complete normally.
  $exitNoAttempt = Invoke-Launcher -WorkDir $pair.Work
  $statusNoAttempt = Get-LatestStatus -WorkDir $pair.Work
  Record "AttemptId omitted: launcher still self-generates an attemptId and completes" ($exitNoAttempt -eq 0 -and [bool]$statusNoAttempt.attemptId -and $statusNoAttempt.attemptId -ne $passedAttemptId)
} finally {
  Remove-Item -LiteralPath $root12 -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "===== TEST SUMMARY ====="
$failCount = ($Results | Where-Object { -not $_.Pass }).Count
$passCount = ($Results | Where-Object { $_.Pass }).Count
Write-Host "Pass: $passCount  Fail: $failCount  Total: $($Results.Count)"
if ($failCount -gt 0) {
  Write-Host ""
  Write-Host "Failures:"
  $Results | Where-Object { -not $_.Pass } | ForEach-Object { Write-Host "  - $($_.Name): $($_.Detail)" }
  exit 1
}
exit 0
