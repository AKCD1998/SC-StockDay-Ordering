# Read-only diagnostic - does not change any settings or files.
# Run this in PowerShell on the branch machine and send back the full output.

Write-Host "===== MACHINE: $env:COMPUTERNAME =====" -ForegroundColor Cyan
Write-Host "Time now: $(Get-Date)"
Write-Host ""

Write-Host "----- 1. All scheduled tasks matching adapos/sync -----" -ForegroundColor Yellow
$tasks = Get-ScheduledTask | Where-Object { $_.TaskName -match "adapos|sync" }
if (-not $tasks) {
    Write-Host "No matching scheduled tasks found." -ForegroundColor Red
} else {
    foreach ($t in $tasks) {
        Write-Host ""
        Write-Host "TaskName: $($t.TaskName)"
        Write-Host "TaskPath: $($t.TaskPath)"
        Write-Host "State:    $($t.State)"

        $info = Get-ScheduledTaskInfo -TaskName $t.TaskName -TaskPath $t.TaskPath
        Write-Host "LastRunTime:    $($info.LastRunTime)"
        Write-Host "LastTaskResult: $($info.LastTaskResult)"
        Write-Host "NextRunTime:    $($info.NextRunTime)"

        Write-Host "Triggers:"
        foreach ($trig in $t.Triggers) {
            Write-Host "  - StartBoundary: $($trig.StartBoundary)  Enabled: $($trig.Enabled)"
        }

        Write-Host "Settings (restart-on-failure block):"
        $s = $t.Settings
        Write-Host "  RestartCount:    $($s.RestartCount)"
        Write-Host "  RestartInterval: $($s.RestartInterval)"
        Write-Host "  ExecutionTimeLimit: $($s.ExecutionTimeLimit)"
        Write-Host "  MultipleInstances:  $($s.MultipleInstances)"

        Write-Host "Actions:"
        foreach ($a in $t.Actions) {
            Write-Host "  - Execute:   $($a.Execute)"
            Write-Host "    Arguments: $($a.Arguments)"
            Write-Host "    WorkingDir:$($a.WorkingDirectory)"
        }
    }
}

Write-Host ""
Write-Host "----- 2. Task Scheduler operational log (last 24h, adapos/sync related) -----" -ForegroundColor Yellow
try {
    $events = Get-WinEvent -FilterHashtable @{
        LogName   = 'Microsoft-Windows-TaskScheduler/Operational'
        StartTime = (Get-Date).AddHours(-24)
    } -ErrorAction Stop | Where-Object { $_.Message -match "adapos|sync" }

    if (-not $events) {
        Write-Host "No matching events in the last 24h."
    } else {
        $events | Sort-Object TimeCreated | ForEach-Object {
            $msg = ($_.Message -replace "[\r\n]+", ' ')
            Write-Host "$($_.TimeCreated)  [Id=$($_.Id)]  $msg"
        }
    }
} catch {
    Write-Host "Could not read Task Scheduler event log: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "----- 3. ADAPOS_SYNC_BRANCH_CODE currently set in .env (value shown, not a secret) -----" -ForegroundColor Yellow
$envCandidates = Get-ChildItem -Path $PSScriptRoot,(Split-Path -Parent $PSScriptRoot) -Filter ".env" -ErrorAction SilentlyContinue
if (-not $envCandidates) {
    Write-Host "No .env file found under common locations - search manually if needed."
} else {
    foreach ($f in $envCandidates) {
        $line = Select-String -Path $f.FullName -Pattern "^ADAPOS_SYNC_BRANCH_CODE=" -ErrorAction SilentlyContinue
        if ($line) {
            Write-Host "$($f.FullName): $($line.Line)"
        }
    }
}

Write-Host ""
Write-Host "----- 4. Self-update readiness (read-only; no fetch or pull) -----" -ForegroundColor Yellow
$repoRoot = $PSScriptRoot
while ($repoRoot -and -not (Test-Path -LiteralPath (Join-Path $repoRoot ".git"))) {
    $parent = Split-Path -Parent $repoRoot
    if (-not $parent -or $parent -eq $repoRoot) { $repoRoot = ""; break }
    $repoRoot = $parent
}

$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
    Write-Host "Git is not available on PATH for this account." -ForegroundColor Red
} elseif (-not $repoRoot) {
    Write-Host "No .git directory found in the script path or its parents." -ForegroundColor Red
} else {
    Write-Host "Repository: $repoRoot"
    Write-Host "Running account: $([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)"
    $gitArgs = @("-c", "safe.directory=$repoRoot", "-C", $repoRoot)
    $head = & git @gitArgs rev-parse --short HEAD 2>&1
    $headExit = $LASTEXITCODE
    $branch = & git @gitArgs rev-parse --abbrev-ref HEAD 2>&1
    $branchExit = $LASTEXITCODE
    $dirty = & git @gitArgs status --porcelain 2>&1
    $dirtyExit = $LASTEXITCODE
    Write-Host "Git HEAD: $head (exit $headExit)"
    Write-Host "Git branch: $branch (exit $branchExit)"
    if ($dirtyExit -ne 0) {
        Write-Host "Git status failed (exit $dirtyExit): $dirty" -ForegroundColor Red
    } elseif ($dirty) {
        Write-Host "Working tree has local changes; self-update will safely skip:" -ForegroundColor Red
        $dirty | ForEach-Object { Write-Host "  $_" }
    } else {
        Write-Host "Working tree: clean"
    }
    if ($headExit -eq 0 -and $branchExit -eq 0 -and $dirtyExit -eq 0) {
        Write-Host "Per-command safe.directory probe: passed (global Git config was not changed)."
    } else {
        Write-Host "Per-command safe.directory probe: failed; inspect the Git errors above." -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "===== END OF REPORT - copy everything above and send back ====="
