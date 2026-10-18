# Local operational metadata only. No source/configuration/Task/clock writes.
$ErrorActionPreference = 'Stop'
$taskResult = [ordered]@{
  inspectionTime = [DateTimeOffset]::Now.ToString('o',[Globalization.CultureInfo]::InvariantCulture)
  hostName = $env:COMPUTERNAME
  branch = '004'
  readOnly = $true
  settingsChanged = $false
  serviceStartRequested = $false
  timeResyncRequested = $false
  syncRequested = $false
  rawOutputDisplayed = $false
}
$taskStep = 'host-guard'
$taskProcess = $null
try {
  if ($env:COMPUTERNAME -cne 'SERVER004') { throw 'Wrong host' }
  $taskStep = 'local-time-metadata'
  $taskResult.timeZone = [TimeZoneInfo]::Local.Id
  $taskResult.utcOffsetMinutes = [int][DateTimeOffset]::Now.Offset.TotalMinutes
  $taskResult.windowsTimeService = (Get-Service -Name W32Time -ErrorAction Stop).Status.ToString()
  if ($taskResult.windowsTimeService -cne 'Running') {
    $taskResult.status = 'time-service-not-running-no-change-requested'
    $taskResult.timeSynchronizationVerified = $false
  } else {
    $taskStep = 'local-windows-time-status'
    $taskInfo = New-Object Diagnostics.ProcessStartInfo
    $taskInfo.FileName = Join-Path $env:SystemRoot 'System32\w32tm.exe'
    $taskInfo.Arguments = '/query /status /verbose'
    $taskInfo.UseShellExecute = $false
    $taskInfo.CreateNoWindow = $true
    $taskInfo.RedirectStandardOutput = $true
    $taskInfo.RedirectStandardError = $true
    $taskProcess = New-Object Diagnostics.Process
    $taskProcess.StartInfo = $taskInfo
    [void]$taskProcess.Start()
    $taskOutput = $taskProcess.StandardOutput.ReadToEndAsync()
    $taskError = $taskProcess.StandardError.ReadToEndAsync()
    if (-not $taskProcess.WaitForExit(8000)) {
      # Only the read-only process started immediately above is terminated.
      $taskProcess.Kill()
      throw 'Time status query timeout'
    }
    $taskText = $taskOutput.Result + ' ' + $taskError.Result
    $taskResult.queryExitCode = $taskProcess.ExitCode
    if ($taskProcess.ExitCode -ne 0) { throw 'Time status query failed' }
    $taskResult.leapIndicator = if ($taskText -match 'Leap Indicator:\s*(\d+)') { [int]$Matches[1] } else { $null }
    $taskResult.stratum = if ($taskText -match 'Stratum:\s*(\d+)') { [int]$Matches[1] } else { $null }
    $taskResult.lastSuccessfulSyncTimeLocal = if ($taskText -match 'Last Successful Sync Time:\s*([^\r\n]+)') { $Matches[1].Trim() } else { $null }
    $taskResult.lastSyncError = if ($taskText -match 'Last Sync Error:\s*(\d+)') { [int]$Matches[1] } else { $null }
    $taskResult.status = 'local-time-status-observed'
    $taskResult.timeSynchronizationVerified = $false
    $taskResult.interpretation = 'Service status and last-sync metadata only; clock accuracy and business freshness require separate review'
  }
} catch {
  $taskResult.status = 'inspection-stopped'
  $taskResult.step = $taskStep
  $taskResult.exceptionType = $_.Exception.GetType().Name
  $taskResult.detailsWithheld = $true
  $taskResult.timeSynchronizationVerified = $false
} finally {
  $taskText = $null
  if ($taskProcess) { $taskProcess.Dispose() }
}
$taskResult | ConvertTo-Json -Depth 4
