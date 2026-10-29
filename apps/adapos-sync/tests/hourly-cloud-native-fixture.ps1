$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition -ne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5){throw 'NATIVE_PS51_REQUIRED'}
$controller=Join-Path $PSScriptRoot '..\installer\hourly004\hourly004-update.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($controller,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'CONTROLLER_PARSE_FAILED'}
$node=$ast.Find({param($a) $a -is [Management.Automation.Language.FunctionDefinitionAst] -and $a.Name -eq 'Get-HourlyTaskAttemptInfo'},$true)
. ([scriptblock]::Create($node.Extent.Text))
$script:HourlyNode='C:\Program Files\nodejs\node.exe'
$script:HourlyApp='C:\fixture\adapos-sync'
$script:HourlySecure='C:\fixture\hourly004'
$script:Releases=0;$checks=0
function Check([bool]$Condition){if(-not $Condition){throw 'NATIVE_CLOUD_FIXTURE_FAILED'};$script:checks++}
function New-FixtureService([string]$Fault=''){
 $folder=[pscustomobject]@{Fault=$Fault}
 $folder | Add-Member ScriptMethod GetTask {param($Name)
  if($this.Fault -eq 'denied'){throw 'PRIVATE-ACCESS-DENIED'}
  $hour=[int]$Name.Substring($Name.Length-4,2);$slot=('{0:00}:00' -f $hour)
  $started=[datetimeoffset]'2000-01-01T00:00:00+07:00';if($hour -eq 15){$started=[datetimeoffset]'2026-10-29T15:00:01+07:00'}
  $args='"C:\fixture\hourly004\hourly-complete-launcher.mjs" run '+$slot
  $limit='PT20M';$principal='S-1-5-18'
  if($this.Fault -eq 'arguments'){$args='SYNTHETIC-PRIVATE-NOT-OUTPUT'}
  if($this.Fault -eq 'limit'){$limit='PT30M'}
  if($this.Fault -eq 'principal'){$principal='other'}
  $xml='<Task xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Principals><Principal><UserId>'+ $principal+'</UserId></Principal></Principals><Settings><ExecutionTimeLimit>'+$limit+'</ExecutionTimeLimit></Settings><Actions><Exec><Command>C:\Program Files\nodejs\node.exe</Command><Arguments>'+$args+'</Arguments><WorkingDirectory>C:\fixture\adapos-sync</WorkingDirectory></Exec></Actions></Task>'
  return [pscustomobject]@{Name=$Name;LastRunTime=$started;LastTaskResult=$(if($this.Fault -eq 'failed'){1}else{0});State=$(if($this.Fault -eq 'running'){4}elseif($this.Fault -eq 'queued'){2}else{3});Enabled=$true;Xml=$xml}
 }
 $service=[pscustomobject]@{Folder=$folder}
 $service | Add-Member ScriptMethod Connect {}
 $service | Add-Member ScriptMethod GetFolder {param($Path) if($Path -cne '\'){throw 'UNEXPECTED_FOLDER'};return $this.Folder}
 return $service
}
foreach($fault in @('','arguments','limit','principal','failed','running','queued','denied')){
 $script:FixtureService=New-FixtureService $fault
 $r=Get-HourlyTaskAttemptInfo -CreateService {$script:FixtureService} -ReleaseService {param($s) $script:Releases++}
 if($fault -eq 'denied'){Check ($r.verified -eq $false);Check ($null -eq $r.startedAt)}else{
  Check ($r.verified -eq $true);Check ($r.enabled -eq $true)
  Check ($r.definitionVerified -eq ($fault -notin @('arguments','limit','principal')))
  Check ($r.lastResult -eq $(if($fault -eq 'failed'){1}else{0}))
  if($fault -eq 'queued'){Check ($null -eq $r.running)}else{Check ($r.running -eq ($fault -eq 'running'))}
  Check (([datetimeoffset]$r.startedAt).ToUniversalTime().ToString('HH:mm:ss') -eq '08:00:01')
 }
 Check (-not (($r|ConvertTo-Json -Depth 6 -Compress).Contains('SYNTHETIC-PRIVATE')))
}
Check ($script:Releases -eq 8)
[pscustomobject]@{simulation=$true;nativePowerShell51=$true;checks=$checks;sourceTaskAccess=$false;sqlQueries=0;taskRuns=0;productionChanges=$false}|ConvertTo-Json -Compress
