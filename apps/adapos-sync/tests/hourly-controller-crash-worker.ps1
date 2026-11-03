param([Parameter(Mandatory=$true)][string]$FixtureRoot,[ValidateSet('Update','Rollback','Recover')][string]$RequestedAction,[string]$CrashPhase,[string]$FaultCode='',[switch]$Hold)
$ErrorActionPreference='Stop'
$parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
$resolved=[IO.Path]::GetFullPath($FixtureRoot)
if(-not $resolved.StartsWith($parent,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -notlike 'hourly-controller-*'){throw 'FIXTURE_ROOT_REQUIRED'}
. (Join-Path $resolved 'package\hourly004-update.ps1')
. (Join-Path $PSScriptRoot 'hourly-controller-crash-providers.ps1')
Set-HourlyCrashFixture $resolved
$Action=$RequestedAction;$ReleaseApproved=$true
try{
  $null=Invoke-HourlyUpdateController -OnPhase {
    param($phase)
    if($phase -eq $CrashPhase){
      [IO.File]::WriteAllText((Join-Path $resolved 'phase-reached.txt'),$phase)
      if($FaultCode){
        if($FaultCode -eq 'EACCES'){throw [UnauthorizedAccessException]::new('INJECTED_FIXTURE_FAILURE')}
        $hr=if($FaultCode -eq 'ENOSPC'){-2147024784}else{-2147023779}
        throw [IO.IOException]::new('INJECTED_FIXTURE_FAILURE',$hr)
      }
      if($Hold){
        # Only this fixture child waits for its fixture-owned release file.
        $until=[DateTime]::UtcNow.AddSeconds(25)
        while(-not(Test-Path -LiteralPath (Join-Path $resolved 'release-child.txt')) -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 25}
      }
      # A real, abrupt process termination: no controller finally/catch runs.
      # Never accepts another PID and cannot kill a production process.
      [Diagnostics.Process]::GetCurrentProcess().Kill()
    }
  }
  [pscustomobject]@{status='completed';simulation=$true}|ConvertTo-Json -Compress
}catch{[pscustomobject]@{status='injected-stop';reason=(Get-HourlyInstallSafeReason $_);simulation=$true}|ConvertTo-Json -Compress;exit 7}
