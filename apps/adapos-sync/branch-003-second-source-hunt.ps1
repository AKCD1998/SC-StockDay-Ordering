# Read-only diagnostic - does not change any settings or files.
# Purpose: find a SECOND, unofficial source of adapos-sync running on THIS
# machine (branch 003's real machine, confirmed hostname POSSRV, Tailscale
# 100.77.101.94, public IP 182.53.106.138). The known, official install at
# C:\Users\Administrator\Desktop\RxAuu\SC-StockDay-Ordering already checked
# clean (one legitimate Scheduled Task firing, one matching log file) - this
# looks for whatever else on this machine could be sending sync traffic.

Write-Host "===== MACHINE: $env:COMPUTERNAME =====" -ForegroundColor Cyan
Write-Host "Time now: $(Get-Date)"
Write-Host ""

Write-Host "----- 1. ALL scheduled tasks (not just adapos/sync-named ones) whose action mentions node, RxAuu, or SC-StockDay -----" -ForegroundColor Yellow
$allTasks = Get-ScheduledTask
$suspects = @()
foreach ($t in $allTasks) {
    foreach ($a in $t.Actions) {
        $blob = "$($a.Execute) $($a.Arguments) $($a.WorkingDirectory)"
        if ($blob -match "node|RxAuu|SC-StockDay|adapos") {
            $suspects += [PSCustomObject]@{
                TaskName = $t.TaskName
                TaskPath = $t.TaskPath
                State    = $t.State
                Execute  = $a.Execute
                Arguments = $a.Arguments
                WorkingDirectory = $a.WorkingDirectory
            }
        }
    }
}
if ($suspects.Count -eq 0) {
    Write-Host "No scheduled task (of any name) has an action referencing node/RxAuu/SC-StockDay/adapos."
} else {
    $suspects | Format-List
}

Write-Host ""
Write-Host "----- 2. Startup folders (current user + all users) -----" -ForegroundColor Yellow
$startupPaths = @(
    [Environment]::GetFolderPath("Startup"),
    [Environment]::GetFolderPath("CommonStartup")
)
foreach ($p in $startupPaths) {
    Write-Host "Checking: $p"
    if (Test-Path $p) {
        Get-ChildItem $p -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  - $($_.Name)" }
    } else {
        Write-Host "  (path not found)"
    }
}

Write-Host ""
Write-Host "----- 3. Registry Run keys (current user + local machine) -----" -ForegroundColor Yellow
$runKeys = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run"
)
foreach ($k in $runKeys) {
    Write-Host "Checking: $k"
    if (Test-Path $k) {
        Get-ItemProperty $k | Select-Object * -ExcludeProperty PS* | Format-List
    } else {
        Write-Host "  (key not found)"
    }
}

Write-Host ""
Write-Host "----- 4. Currently running node.exe processes and their command line -----" -ForegroundColor Yellow
$nodeProcs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
if (-not $nodeProcs) {
    Write-Host "No node.exe processes currently running."
} else {
    $nodeProcs | Select-Object ProcessId, CommandLine, CreationDate | Format-List
}

Write-Host ""
Write-Host "----- 5. Search common locations for OTHER copies of the adapos-sync repo -----" -ForegroundColor Yellow
$searchRoots = @("C:\Users", "C:\", "D:\") | Where-Object { Test-Path $_ }
foreach ($root in $searchRoots) {
    Write-Host "Searching under $root for RUN-ADAPOS-SYNC.bat (depth-limited, may take a moment)..."
    Get-ChildItem -Path $root -Filter "RUN-ADAPOS-SYNC.bat" -Recurse -ErrorAction SilentlyContinue -Depth 5 |
        ForEach-Object { Write-Host "  FOUND: $($_.FullName)  (LastWriteTime: $($_.LastWriteTime))" }
}

Write-Host ""
Write-Host "----- 6. Confirm the KNOWN install's own recent log files (sanity check) -----" -ForegroundColor Yellow
$knownLogDir = "C:\Users\Administrator\Desktop\RxAuu\SC-StockDay-Ordering\apps\adapos-sync\logs"
if (Test-Path $knownLogDir) {
    Get-ChildItem $knownLogDir -Filter "sync-20260719-*.log" | Sort-Object Name | Select-Object Name, LastWriteTime, Length
} else {
    Write-Host "Known log dir not found at expected path: $knownLogDir"
}

Write-Host ""
Write-Host "===== END OF REPORT - copy everything above and send back ====="
