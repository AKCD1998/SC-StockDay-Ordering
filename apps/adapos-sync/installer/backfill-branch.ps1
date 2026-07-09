# backfill-branch.ps1
#
# Chunked historical backfill runner. Loops --date-from/--date-to over a list
# of date ranges (newest -> oldest), running only the sales_detail dataset
# (bill + line level sales — the one dataset that actually honors an explicit
# date range; products/branch_stock/transfers are "current state" snapshots
# and would just waste time re-sending today's data on every chunk).
#
# Stops immediately on the first failing chunk — never skips ahead — so a
# partial backfill is always resumable: fix the cause, then re-run with
# -StartAtIndex pointing at the failed chunk. Already-posted chunks are safe
# to re-run (unique key on branch+doc_no in the backend), so re-running from
# the same index never double-counts.
#
# Usage (from apps/adapos-sync):
#   powershell -ExecutionPolicy Bypass -File installer\backfill-branch.ps1 -Branch 004
#   powershell -ExecutionPolicy Bypass -File installer\backfill-branch.ps1 -Branch 004 -StartAtIndex 12
#   powershell -ExecutionPolicy Bypass -File installer\backfill-branch.ps1 -Branch 004 -DryRun

param(
  [Parameter(Mandatory = $true)]
  [string]$Branch,

  # 1-based index into $Chunks to resume from (skips everything before it).
  [int]$StartAtIndex = 1,

  # Pass --dry-run instead of --execute for every chunk (smoke test the whole
  # list without sending anything).
  [switch]$DryRun,

  # Seconds to wait between chunks, to avoid hammering the backend back-to-back.
  [int]$PauseSeconds = 5
)

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
$AgentDir  = Split-Path $ScriptDir -Parent   # apps/adapos-sync
$LogDir    = Join-Path $AgentDir "logs\backfill-branch$Branch"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# ── Branch 004 chunk plan ────────────────────────────────────────────────────
# Derived from the AdaAcc survey (TPSTSalHD, 2024-04-01 .. 2026-07-07):
# normal months (<8,000 bills) run as one chunk; months with an unusual sales
# spike (>=8,000 bills — Nov 2024 through Jun 2025, plus Dec 2025) are split
# into three ~10-day chunks so no single request is larger than what's already
# been proven safe (branch 005's full backfill was ~5,000 bills in one shot).
# Newest -> oldest: today's data is useful immediately, and if this list has
# to stop partway through, everything already posted is still usable.
$Chunks = @(
  @{ From = "2026-07-01"; To = "2026-07-01" }
  @{ From = "2026-06-01"; To = "2026-06-30" }
  @{ From = "2026-05-01"; To = "2026-05-31" }
  @{ From = "2026-04-01"; To = "2026-04-30" }
  @{ From = "2026-03-01"; To = "2026-03-31" }
  @{ From = "2026-02-01"; To = "2026-02-28" }
  @{ From = "2026-01-01"; To = "2026-01-31" }
  @{ From = "2025-12-21"; To = "2025-12-31" }
  @{ From = "2025-12-11"; To = "2025-12-20" }
  @{ From = "2025-12-01"; To = "2025-12-10" }
  @{ From = "2025-11-01"; To = "2025-11-30" }
  @{ From = "2025-10-01"; To = "2025-10-31" }
  @{ From = "2025-09-01"; To = "2025-09-30" }
  @{ From = "2025-08-01"; To = "2025-08-31" }
  @{ From = "2025-07-01"; To = "2025-07-31" }
  @{ From = "2025-06-21"; To = "2025-06-30" }
  @{ From = "2025-06-11"; To = "2025-06-20" }
  @{ From = "2025-06-01"; To = "2025-06-10" }
  @{ From = "2025-05-21"; To = "2025-05-31" }
  @{ From = "2025-05-11"; To = "2025-05-20" }
  @{ From = "2025-05-01"; To = "2025-05-10" }
  @{ From = "2025-04-21"; To = "2025-04-30" }
  @{ From = "2025-04-11"; To = "2025-04-20" }
  @{ From = "2025-04-01"; To = "2025-04-10" }
  @{ From = "2025-03-21"; To = "2025-03-31" }
  @{ From = "2025-03-11"; To = "2025-03-20" }
  @{ From = "2025-03-01"; To = "2025-03-10" }
  @{ From = "2025-02-21"; To = "2025-02-28" }
  @{ From = "2025-02-11"; To = "2025-02-20" }
  @{ From = "2025-02-01"; To = "2025-02-10" }
  @{ From = "2025-01-21"; To = "2025-01-31" }
  @{ From = "2025-01-11"; To = "2025-01-20" }
  @{ From = "2025-01-01"; To = "2025-01-10" }
  @{ From = "2024-12-21"; To = "2024-12-31" }
  @{ From = "2024-12-11"; To = "2024-12-20" }
  @{ From = "2024-12-01"; To = "2024-12-10" }
  @{ From = "2024-11-21"; To = "2024-11-30" }
  @{ From = "2024-11-11"; To = "2024-11-20" }
  @{ From = "2024-11-01"; To = "2024-11-10" }
  @{ From = "2024-10-01"; To = "2024-10-31" }
  @{ From = "2024-09-01"; To = "2024-09-30" }
  @{ From = "2024-08-01"; To = "2024-08-31" }
  @{ From = "2024-07-01"; To = "2024-07-31" }
  @{ From = "2024-06-01"; To = "2024-06-30" }
  @{ From = "2024-05-01"; To = "2024-05-31" }
  @{ From = "2024-04-01"; To = "2024-04-30" }
)

$total = $Chunks.Count
Write-Output "Branch $Branch backfill: $total chunks total, starting at index $StartAtIndex."
Write-Output "Logs: $LogDir"
Write-Output ""

for ($i = $StartAtIndex; $i -le $total; $i++) {
  $chunk = $Chunks[$i - 1]
  $from = $chunk.From
  $to   = $chunk.To
  $modeFlag = if ($DryRun) { "--dry-run" } else { "--execute" }
  $logFile = Join-Path $LogDir ("chunk-{0:D2}-{1}_to_{2}.log" -f $i, $from, $to)

  Write-Output "[$i/$total] $from -> $to ..."

  $psi = Start-Process -FilePath "node" `
    -ArgumentList @(
      ".\src\index.js",
      $modeFlag,
      "--branch=$Branch",
      "--datasets=sales_detail",
      "--date-from=$from",
      "--date-to=$to"
    ) `
    -WorkingDirectory $AgentDir `
    -NoNewWindow -Wait -PassThru `
    -RedirectStandardOutput $logFile `
    -RedirectStandardError "$logFile.err"

  if ($psi.ExitCode -ne 0) {
    Write-Output ""
    Write-Output "STOPPED at chunk $i ($from -> $to) — exit code $($psi.ExitCode)."
    Write-Output "Log:       $logFile"
    Write-Output "Error log: $logFile.err"
    Write-Output ""
    Write-Output "Fix the cause, then resume with:"
    Write-Output "  .\installer\backfill-branch.ps1 -Branch $Branch -StartAtIndex $i"
    exit 1
  }

  Write-Output "  OK — log: $logFile"
  if ($i -lt $total) {
    Start-Sleep -Seconds $PauseSeconds
  }
}

Write-Output ""
Write-Output "All $total chunks completed successfully for branch $Branch."
