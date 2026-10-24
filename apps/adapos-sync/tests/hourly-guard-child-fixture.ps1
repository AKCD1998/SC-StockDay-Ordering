param([int]$ObserverProcessId,[ValidateSet('slow-start','stalled-provider')][string]$Fixture)
# Synthetic child protocol only. No provider, scheduler, SQL or network calls.
if($Fixture -eq 'slow-start'){Start-Sleep -Seconds 20}
foreach($stage in @('host','tasks','processes','cpu')){
  [Console]::Out.WriteLine(([pscustomobject]@{schemaVersion='hourly-source-guard-v2';kind='progress';stage=$stage;elapsedMs=0}|ConvertTo-Json -Compress))
}
if($Fixture -eq 'stalled-provider'){Start-Sleep -Seconds 20}
exit 1
