param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Find-SyncTasks {
  $allTasks = Get-ScheduledTask -ErrorAction Stop
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

if (-not (Test-IsAdministrator)) {
  Write-Host "This uninstall script must be run as Administrator."
  Write-Host "Right-click PowerShell and choose 'Run as administrator', then run uninstall.ps1 again."
  exit 1
}

Write-Host "Looking for scheduled tasks that run sync-and-shutdown..."
$tasks = Find-SyncTasks

if (-not $tasks -or $tasks.Count -eq 0) {
  Write-Host "No matching scheduled tasks were found."
} else {
  foreach ($task in $tasks) {
    Write-Host "Removing task: $($task.TaskPath)$($task.TaskName)"
    Unregister-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath -Confirm:$false -ErrorAction Stop
  }
}

Write-Host ""
Write-Host "Removed:"
if (-not $tasks -or $tasks.Count -eq 0) {
  Write-Host "- No scheduled tasks"
} else {
  foreach ($task in $tasks) {
    Write-Host "- $($task.TaskPath)$($task.TaskName)"
  }
}

Write-Host ""
Write-Host "Left in place:"
Write-Host "- Repo folder"
Write-Host "- .env file"
Write-Host "- node_modules"
