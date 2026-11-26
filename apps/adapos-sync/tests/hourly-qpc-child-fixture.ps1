param([double]$MonotonicDeadlineMs)
# Clock-domain proof only; no CPU/provider/task/SQL query or impersonation.
[pscustomobject]@{qpcMs=[Diagnostics.Stopwatch]::GetTimestamp()*(1000.0/[Diagnostics.Stopwatch]::Frequency);highResolution=[Diagnostics.Stopwatch]::IsHighResolution;deadlineMs=$MonotonicDeadlineMs}|ConvertTo-Json -Compress
