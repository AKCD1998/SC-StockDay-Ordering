Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$InstallerDir = $PSScriptRoot
$AgentDir = [System.IO.Path]::GetFullPath((Join-Path $InstallerDir ".."))
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $AgentDir "..\.."))
$EnvExamplePath = Join-Path $AgentDir ".env.example"
$EnvPath = Join-Path $AgentDir ".env"
$Script:Advice = New-Object System.Collections.Generic.List[string]
$Script:Status = @{
  TaskMissing = $false
  ApiUnauthorized = $false
  SqlTcpFailed = $false
  TaskFailure = $false
}

function Write-Section {
  param([string]$Title)
  Write-Output ""
  Write-Output "== $Title =="
}

function Add-Advice {
  param([string]$Message)
  if ([string]::IsNullOrWhiteSpace($Message)) {
    return
  }
  if (-not $Script:Advice.Contains($Message)) {
    $Script:Advice.Add($Message) | Out-Null
  }
}

function Invoke-Section {
  param(
    [string]$Title,
    [scriptblock]$Body
  )

  Write-Section $Title
  try {
    & $Body
  } catch {
    Write-Output ("FAILED: " + $_.Exception.Message)
  }
}

function Get-CommandVersion {
  param(
    [string]$CommandName,
    [string[]]$Arguments
  )

  $command = Get-Command $CommandName -ErrorAction SilentlyContinue
  if (-not $command) {
    return "NOT INSTALLED"
  }

  try {
    $output = & $command.Source @Arguments 2>&1
    if ($LASTEXITCODE -ne 0 -and $output) {
      return ($output | Select-Object -First 1).ToString().Trim()
    }
    return (($output | Select-Object -First 1).ToString().Trim())
  } catch {
    return "ERROR: $($_.Exception.Message)"
  }
}

function Get-EnvMap {
  param([string]$Path)

  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $map
  }

  foreach ($line in Get-Content -LiteralPath $Path -ErrorAction Stop) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }
    $trimmed = $line.Trim()
    if ($trimmed.StartsWith("#")) {
      continue
    }
    $parts = $trimmed.Split("=", 2)
    if ($parts.Count -lt 2) {
      continue
    }
    $map[$parts[0].Trim()] = $parts[1]
  }

  return $map
}

function Format-SecretStatus {
  param([string]$Value)

  if ([string]::IsNullOrEmpty($Value)) {
    return "MISSING"
  }
  return "SET ($($Value.Length) chars)"
}

function Decode-TaskResult {
  param([int]$Code)

  switch ($Code) {
    0 { return "0 = success" }
    267009 { return "267009 = currently running" }
    267011 { return "267011 = never run" }
    -2147023673 { return "-2147023673 = cancelled by user" }
    default { return "$Code = unknown" }
  }
}

function Find-SyncTasks {
  try {
    $allTasks = Get-ScheduledTask -ErrorAction Stop
  } catch {
    Write-Output "Could not enumerate scheduled tasks: $($_.Exception.Message)"
    return @()
  }

  $matches = @()
  foreach ($task in $allTasks) {
    foreach ($action in $task.Actions) {
      $execute = ""
      $arguments = ""
      if ($action -and $action.PSObject.Properties["Execute"]) {
        $execute = $action.Execute -as [string]
      }
      if ($action -and $action.PSObject.Properties["Arguments"]) {
        $arguments = $action.Arguments -as [string]
      }
      $actionText = (($execute) + " " + ($arguments)).Trim()
      if ($actionText -match "sync-and-shutdown") {
        $matches += $task
        break
      }
    }
  }
  return $matches
}

function Get-RecentLogTail {
  $candidates = @(
    (Join-Path $AgentDir "sync.log"),
    (Join-Path $AgentDir "logs\sync.log"),
    (Join-Path $AgentDir "output\sync.log")
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return @{
        Found = $true
        Lines = @("Log file: $candidate") + @(Get-Content -LiteralPath $candidate -Tail 200 -ErrorAction Stop)
      }
    }
  }

  $recommendation = "Recommendation: run sync-and-shutdown.ps1 -Branch XXX -NoShutdown once manually so a live error is visible."
  return @{
    Found = $false
    Lines = @("No sync log file found.", $recommendation)
  }
}

$envExample = Get-EnvMap -Path $EnvExamplePath
$envCurrent = Get-EnvMap -Path $EnvPath
$syncTasks = Find-SyncTasks
$branchCode = $null
if ($envCurrent.ContainsKey("ADAPOS_SYNC_BRANCH_CODE")) {
  $branchCode = $envCurrent["ADAPOS_SYNC_BRANCH_CODE"]
}
$sqlHost = $null
$sqlPort = $null
$apiBaseUrl = $null
$sharedToken = $null
if ($envCurrent.ContainsKey("ADAPOS_SQLSERVER_HOST")) { $sqlHost = $envCurrent["ADAPOS_SQLSERVER_HOST"] }
if ($envCurrent.ContainsKey("ADAPOS_SQLSERVER_PORT")) { $sqlPort = $envCurrent["ADAPOS_SQLSERVER_PORT"] }
if ($envCurrent.ContainsKey("ADAPOS_SYNC_API_BASE_URL")) { $apiBaseUrl = $envCurrent["ADAPOS_SYNC_API_BASE_URL"] }
if ($envCurrent.ContainsKey("ADAPOS_SYNC_SHARED_TOKEN")) {
  $sharedToken = $envCurrent["ADAPOS_SYNC_SHARED_TOKEN"]
} elseif ($envCurrent.ContainsKey("BRANCH_STOCK_SYNC_TOKEN")) {
  $sharedToken = $envCurrent["BRANCH_STOCK_SYNC_TOKEN"]
}

Invoke-Section "System info" {
  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  Write-Output "Windows: $($os.Caption) $($os.Version)"
  Write-Output "Hostname: $env:COMPUTERNAME"
  Write-Output "Current user: $env:USERDOMAIN\$env:USERNAME"
  Write-Output "Current date/time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  $tz = Get-TimeZone -ErrorAction Stop
  Write-Output "Time zone: $($tz.Id) ($($tz.DisplayName))"
}

Invoke-Section "Prerequisites" {
  Write-Output "node: $(Get-CommandVersion -CommandName 'node' -Arguments @('--version'))"
  Write-Output "npm:  $(Get-CommandVersion -CommandName 'npm' -Arguments @('--version'))"
  Write-Output "git:  $(Get-CommandVersion -CommandName 'git' -Arguments @('--version'))"
}

Invoke-Section "Repo state" {
  Write-Output "Repo root: $RepoRoot"
  try {
    Write-Output "HEAD:"
    & git -C $RepoRoot rev-parse HEAD
  } catch {
    Write-Output "HEAD lookup failed: $($_.Exception.Message)"
  }
  try {
    Write-Output ""
    Write-Output "Status:"
    & git -C $RepoRoot status --short
  } catch {
    Write-Output "Status lookup failed: $($_.Exception.Message)"
  }
  try {
    Write-Output ""
    Write-Output "Current branch:"
    & git -C $RepoRoot branch --show-current
  } catch {
    Write-Output "Branch lookup failed: $($_.Exception.Message)"
  }
  try {
    Write-Output ""
    Write-Output "Last 5 commits:"
    & git -C $RepoRoot log --oneline -n 5
  } catch {
    Write-Output "Commit log lookup failed: $($_.Exception.Message)"
  }
}

Invoke-Section ".env audit" {
  Write-Output ".env.example: $EnvExamplePath"
  Write-Output ".env: $EnvPath"

  if (-not (Test-Path -LiteralPath $EnvPath)) {
    Write-Output "Current .env file is missing."
    Add-Advice "Run install.ps1 as admin to create .env and register the task."
    return
  }

  foreach ($key in ($envExample.Keys | Sort-Object)) {
    $value = $null
    if ($envCurrent.ContainsKey($key)) {
      $value = $envCurrent[$key]
    }

    if ($key -eq "ADAPOS_SQLSERVER_PASSWORD" -or $key -eq "ADAPOS_SYNC_SHARED_TOKEN") {
      Write-Output ("{0}: {1}" -f $key, (Format-SecretStatus -Value $value))
    } else {
      if ([string]::IsNullOrEmpty($value)) {
        Write-Output ("{0}: MISSING" -f $key)
      } else {
        Write-Output ("{0}: SET" -f $key)
      }
    }
  }
}

Invoke-Section "Scheduled task state" {
  if (-not $syncTasks -or $syncTasks.Count -eq 0) {
    Write-Output "No scheduled task found with action containing 'sync-and-shutdown'."
    $Script:Status.TaskMissing = $true
    Add-Advice "Run install.ps1 as admin to register the task."
    return
  }

  foreach ($task in $syncTasks) {
    $info = Get-ScheduledTaskInfo -TaskName $task.TaskName -TaskPath $task.TaskPath -ErrorAction Stop
    Write-Output "TaskName: $($task.TaskName)"
    Write-Output "TaskPath: $($task.TaskPath)"
    Write-Output "State: $($task.State)"
    Write-Output "NextRunTime: $($info.NextRunTime)"
    Write-Output "LastRunTime: $($info.LastRunTime)"
    Write-Output "LastTaskResult: $(Decode-TaskResult -Code $info.LastTaskResult)"
    Write-Output "Action: $($task.Actions[0].Execute) $($task.Actions[0].Arguments)"
    Write-Output ""
    if ($info.LastTaskResult -ne 0 -and $info.LastTaskResult -ne 267011 -and $info.LastTaskResult -ne 267009) {
      $Script:Status.TaskFailure = $true
      if ($branchCode) {
        Add-Advice ("Task exists but LastTaskResult is not success. Run sync-and-shutdown.ps1 -Branch {0} -NoShutdown interactively to see the live error." -f $branchCode)
      } else {
        Add-Advice "Task exists but LastTaskResult is not success. Run sync-and-shutdown.ps1 -Branch XXX -NoShutdown interactively to see the live error."
      }
    }
  }
}

Invoke-Section "SQL Server connectivity" {
  if ([string]::IsNullOrWhiteSpace($sqlHost) -or [string]::IsNullOrWhiteSpace($sqlPort)) {
    Write-Output "SQL host or port missing in .env."
    Add-Advice "SQL Server host/port is missing. Re-run install.ps1 and re-enter the SQL connection settings."
    return
  }

  Write-Output "Testing TCP to $sqlHost`:$sqlPort"
  $result = Test-NetConnection -ComputerName $sqlHost -Port ([int]$sqlPort) -WarningAction SilentlyContinue
  Write-Output "TcpTestSucceeded: $($result.TcpTestSucceeded)"
  Write-Output "RemoteAddress: $($result.RemoteAddress)"
  if (-not $result.TcpTestSucceeded) {
    $Script:Status.SqlTcpFailed = $true
    Add-Advice "SQL Server is unreachable from this machine. Check that AdaPOS is running and firewall allows port 1433."
  }
}

Invoke-Section "API connectivity" {
  if ([string]::IsNullOrWhiteSpace($apiBaseUrl)) {
    Write-Output "ADAPOS_SYNC_API_BASE_URL is missing in .env."
    Add-Advice "API base URL is missing. Re-run install.ps1 and re-enter ADAPOS_SYNC_API_BASE_URL."
    return
  }

  $url = $apiBaseUrl.TrimEnd("/") + "/api/branches"
  Write-Output "GET $url"
  try {
    $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 10 -UseBasicParsing
    Write-Output "StatusCode: $($response.StatusCode)"
  } catch {
    $webResponse = $_.Exception.Response
    if ($webResponse) {
      Write-Output "StatusCode: $([int]$webResponse.StatusCode)"
    } else {
      Write-Output "Request failed: $($_.Exception.Message)"
    }
  }
}

Invoke-Section "Heartbeat endpoint check" {
  if ([string]::IsNullOrWhiteSpace($apiBaseUrl)) {
    Write-Output "ADAPOS_SYNC_API_BASE_URL is missing in .env."
    return
  }
  if ([string]::IsNullOrWhiteSpace($sharedToken)) {
    Write-Output "ADAPOS_SYNC_SHARED_TOKEN is missing in .env."
    $Script:Status.ApiUnauthorized = $true
    Add-Advice "Token is wrong or missing. Re-run install.ps1 and re-enter ADAPOS_SYNC_SHARED_TOKEN."
    return
  }

  $url = $apiBaseUrl.TrimEnd("/") + "/api/sync/heartbeat"
  $payload = @{
    branchCode = $(if ($branchCode) { $branchCode } else { "diagnostic" })
    laptopName = $env:COMPUTERNAME
    event = "diagnostic"
  } | ConvertTo-Json

  Write-Output "POST $url"
  try {
    $response = Invoke-WebRequest `
      -Uri $url `
      -Method POST `
      -TimeoutSec 10 `
      -UseBasicParsing `
      -Headers @{ "x-api-key" = $sharedToken } `
      -ContentType "application/json" `
      -Body $payload

    Write-Output "StatusCode: $($response.StatusCode)"
    Write-Output "ResponseBody: $($response.Content)"
  } catch {
    $webResponse = $_.Exception.Response
    if ($webResponse) {
      $statusCode = [int]$webResponse.StatusCode
      Write-Output "StatusCode: $statusCode"
      try {
        $stream = $webResponse.GetResponseStream()
        if ($stream) {
          $reader = New-Object System.IO.StreamReader($stream)
          $content = $reader.ReadToEnd()
          $reader.Dispose()
          Write-Output "ResponseBody: $content"
        }
      } catch {
        Write-Output "ResponseBody: <unavailable>"
      }
      if ($statusCode -eq 401) {
        $Script:Status.ApiUnauthorized = $true
        Add-Advice "Token is wrong. Re-run install.ps1 and re-enter ADAPOS_SYNC_SHARED_TOKEN."
      }
    } else {
      Write-Output "Request failed: $($_.Exception.Message)"
    }
  }
}

Invoke-Section "Disk space" {
  $drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction Stop
  $freeGb = [Math]::Round(($drive.FreeSpace / 1GB), 2)
  $sizeGb = [Math]::Round(($drive.Size / 1GB), 2)
  Write-Output "C: free space = $freeGb GB of $sizeGb GB"
}

Invoke-Section "Recent sync agent output" {
  $logResult = Get-RecentLogTail
  foreach ($line in $logResult.Lines) {
    Write-Output $line
  }
  if (-not $logResult.Found) {
    Add-Advice "No sync log file was found. Run sync-and-shutdown.ps1 -Branch XXX -NoShutdown manually if you need live output."
  }
}

Invoke-Section "Task Scheduler history" {
  if (-not $syncTasks -or $syncTasks.Count -eq 0) {
    Write-Output "No sync task found, so no task history can be shown."
    return
  }

  try {
    $events = Get-WinEvent -LogName "Microsoft-Windows-TaskScheduler/Operational" -MaxEvents 300 -ErrorAction Stop
    foreach ($task in $syncTasks) {
      Write-Output "Task: $($task.TaskName)"
      $taskEvents = @(
        $events |
          Where-Object {
            $_.Properties.Count -gt 0 -and (
              ($_.Message -like "*$($task.TaskName)*") -or
              ($_.Properties[0].Value -as [string]) -like "*$($task.TaskName)*"
            )
          } |
          Select-Object -First 5
      )

      if (-not $taskEvents -or $taskEvents.Count -eq 0) {
        Write-Output "No recent events found."
      } else {
        foreach ($event in $taskEvents) {
          Write-Output ("[{0}] Id={1} {2}" -f $event.TimeCreated, $event.Id, ($event.Message -replace "\r?\n", " "))
        }
      }
      Write-Output ""
    }
  } catch {
    Write-Output "Could not read Task Scheduler event log: $($_.Exception.Message)"
  }
}

Invoke-Section "Next-step suggestions" {
  if ($Script:Status.TaskMissing) {
    Add-Advice "Run install.ps1 as admin to register the task."
  }
  if ($Script:Status.ApiUnauthorized) {
    Add-Advice "Token is wrong. Re-run install.ps1 and re-enter ADAPOS_SYNC_SHARED_TOKEN."
  }
  if ($Script:Status.SqlTcpFailed) {
    Add-Advice "SQL Server is unreachable from this machine. Check that AdaPOS is running and firewall allows port 1433."
  }
  if ($Script:Status.TaskFailure -and -not $branchCode) {
    Add-Advice "Task exists but LastTaskResult is not success. Run sync-and-shutdown.ps1 -Branch XXX -NoShutdown interactively to see the live error."
  }

  if ($Script:Advice.Count -eq 0) {
    Write-Output "No obvious issues detected."
  } else {
    foreach ($message in $Script:Advice) {
      Write-Output "- $message"
    }
  }
}
