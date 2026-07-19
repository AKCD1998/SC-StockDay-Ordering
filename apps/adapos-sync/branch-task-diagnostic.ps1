# Read-only diagnostic — does not change any settings or files.
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
$envCandidates = Get-ChildItem -Path "$HOME\Desktop","C:\adapos-sync","$HOME" -Filter ".env" -Recurse -ErrorAction SilentlyContinue -Depth 3
if (-not $envCandidates) {
    Write-Host "No .env file found under common locations — search manually if needed."
} else {
    foreach ($f in $envCandidates) {
        $line = Select-String -Path $f.FullName -Pattern "^ADAPOS_SYNC_BRANCH_CODE=" -ErrorAction SilentlyContinue
        if ($line) {
            Write-Host "$($f.FullName): $($line.Line)"
        }
    }
}

Write-Host ""
Write-Host "===== END OF REPORT — copy everything above and send back ====="
