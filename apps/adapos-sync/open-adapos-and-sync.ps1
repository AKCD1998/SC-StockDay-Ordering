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
  [switch]$NoAutoUpdate
)

$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
Set-Location $ScriptDir

$LogDir = Join-Path $ScriptDir "logs"
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$LogPath = Join-Path $LogDir ("sync-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))

function Write-Log([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Write-Output $line
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

function Invoke-SelfUpdate([string]$BranchCode) {
  # Fleet self-update: fetches the same fix/config improvements every branch
  # gets, on this branch's own next scheduled run, with no per-machine
  # coordination needed. Pull-based via the Scheduled Task this machine
  # already runs unattended — never push-based (no remote-exec trust exists
  # between machines, and none is needed for this). Fails safe by design:
  # any reason to be unsure (dirty tree, wrong branch, git missing, pull
  # error) just skips the update and runs the sync with whatever code is
  # already on disk — an update check must never block the actual sync.
  #
  # In Windows PowerShell 5.1, $ErrorActionPreference = "Stop" promotes ANY
  # native command's stderr write into a terminating NativeCommandError, and
  # 2>$null does NOT prevent that promotion — it only discards the text.
  # Every $LASTEXITCODE check below is a no-op unless this is scoped to
  # Continue: a bare git error (e.g. dubious ownership when this runs as
  # SYSTEM but the repo is owned by a different user) would otherwise kill
  # the whole script before a single Write-Log call ever fires.
  $local:ErrorActionPreference = "Continue"

  $git = Get-Command git -ErrorAction SilentlyContinue
  if (-not $git) {
    Write-Log "SELF-UPDATE: git not found on PATH, skipping."
    return
  }

  $topLevel = Find-GitRepositoryRoot -StartPath $ScriptDir
  if (-not $topLevel) {
    Write-Log "SELF-UPDATE: no .git directory found in this path or its parents, skipping."
    return
  }

  Write-Log "SELF-UPDATE: identity hostname=$env:COMPUTERNAME branch=$BranchCode repo=$topLevel"

  # Trust only the repository containing this checked-in launcher, and only
  # for this git process. This fixes SYSTEM-vs-owner dubious-ownership errors
  # without permanently weakening the machine's global safe.directory list.
  $gitPrefix = @("-c", "safe.directory=$topLevel", "-C", $topLevel)

  $status = (& git @gitPrefix status --porcelain 2>$null)
  if ($LASTEXITCODE -ne 0) {
    Write-Log "SELF-UPDATE: git status failed (exit $LASTEXITCODE), continuing with existing code."
    return
  }
  if ($status) {
    $fileCount = ($status | Measure-Object -Line).Lines
    Write-Log "SELF-UPDATE: $fileCount local uncommitted change(s) present, skipping to avoid clobbering. Investigate manually if this persists."
    return
  }

  $branchName = (& git @gitPrefix rev-parse --abbrev-ref HEAD 2>$null)
  if ($branchName -ne "main") {
    Write-Log "SELF-UPDATE: on branch '$branchName', not 'main' — skipping (assuming intentional)."
    return
  }

  $fetchOutput = (& git @gitPrefix fetch origin main --quiet 2>&1)
  if ($LASTEXITCODE -ne 0) {
    $fetchDetail = (($fetchOutput | ForEach-Object { "$_" }) -join " ").Trim()
    Write-Log "SELF-UPDATE: git fetch failed (exit $LASTEXITCODE): $fetchDetail Continuing with existing code."
    return
  }

  $localHead = (& git @gitPrefix rev-parse HEAD 2>$null)
  $remoteHead = (& git @gitPrefix rev-parse origin/main 2>$null)
  if ($localHead -eq $remoteHead) {
    Write-Log "SELF-UPDATE: already up to date ($($localHead.Substring(0,7)))."
    return
  }

  Write-Log "SELF-UPDATE: $($localHead.Substring(0,7)) -> $($remoteHead.Substring(0,7)), pulling..."
  & git @gitPrefix pull origin main --ff-only --quiet 2>&1 | ForEach-Object { Write-Log "SELF-UPDATE: $_" }
  if ($LASTEXITCODE -eq 0) {
    Write-Log "SELF-UPDATE: pulled successfully, now at $($remoteHead.Substring(0,7))."
  } else {
    Write-Log "SELF-UPDATE: git pull failed (exit $LASTEXITCODE) — possibly a non-fast-forward history divergence. Continuing with existing code; investigate manually."
  }
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

if (-not (Test-Path -LiteralPath $NodeExe)) {
  throw "Node.js executable not found: $NodeExe"
}

if (-not (Test-Path -LiteralPath ".env")) {
  Write-Log "WARNING: .env not found in $ScriptDir. The sync may fail unless environment variables are set elsewhere."
}

if (-not $Branch) {
  $Branch = Get-EnvValue "ADAPOS_SYNC_BRANCH_CODE"
}

if (-not $Branch) {
  throw "Branch is required. Pass -Branch 005 or set ADAPOS_SYNC_BRANCH_CODE in apps\adapos-sync\.env."
}

if ($Branch -notmatch '^\d{3}$') {
  throw "Invalid branch code '$Branch'. Expected exactly three digits, for example 005."
}

if ($NoAutoUpdate) {
  Write-Log "SELF-UPDATE: skipped (-NoAutoUpdate passed)."
} else {
  try {
    Invoke-SelfUpdate -BranchCode $Branch
  } catch {
    # Defense in depth: Invoke-SelfUpdate is scoped to fail safe internally
    # now, but if anything else in it ever throws, catch it here too rather
    # than let a self-update problem take down the actual sync.
    Write-Log "SELF-UPDATE: unexpected error ($($_.Exception.Message)), continuing with existing code."
  }
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
