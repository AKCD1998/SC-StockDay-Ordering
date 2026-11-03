function Set-HourlyCrashFixture([string]$Root) {
  $script:CrashFixtureRoot=$Root
  $script:HourlyApp=Join-Path $Root 'app';$script:HourlySecure=Join-Path $Root 'secure';$script:HourlyCache=Join-Path $Root 'cache'
  $script:HourlyNode=(Get-Command node.exe -ErrorAction Stop).Source
}
# Only external system observations are substituted. All file comparison,
# metadata, locking, native handle renames and recovery remain production code.
function Get-HourlyUpdateHost {return @{Name='SERVER004';Zone='SE Asia Standard Time';Admin=$true}}
function Get-HourlyUpdateSchedule {foreach($i in 0..12){[pscustomobject]@{Kind=$(if($i -lt 2){'full'}else{'hourly'});Enabled=$true;Running=$false;NextMinutes=120;LastMinutes=120;DefinitionVerified=$true}}}
function Get-HourlyUpdateProcesses {return @()}
function Get-HourlyUpdateCpu {[pscustomobject]@{PercentProcessorTime=5}}
function Get-HourlyProtectedTaskDefinitions {return @{fixture=@{Xml='fixture-unchanged-task-definition';Sddl='fixture-unchanged-task-security'}}}
function Get-HourlyTaskAttemptInfo {return @{verified=$true;startedAt='2026-10-24T08:00:00.000Z';running=$false}}
function Get-HourlyStatusNow {return '2026-10-24T08:03:00.000Z'}
