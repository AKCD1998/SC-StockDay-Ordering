# backfill-branch.ps1
#
# Chunked historical backfill runner. Loops --date-from/--date-to over a list
# of date ranges (newest -> oldest), running only the sales_detail dataset
# (bill + line level sales - the one dataset that actually honors an explicit
# date range; products/branch_stock/transfers are "current state" snapshots
# and would just waste time re-sending today's data on every chunk).
#
# Stops immediately on the first failing chunk - never skips ahead - so a
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

# --- Per-branch chunk plans ---------------------------------------------------
# Each branch's AdaAcc data has a different retention window and monthly
# volume, so each gets its own surveyed plan (MIN/MAX doc_date + monthly
# bill counts from TPSTSalHD). Newest -> oldest: today's data is useful
# immediately, and if the list stops partway through, everything already
# posted is still usable. Chunk boundaries target ~5,000 bills/chunk or
# less (branch 005's full backfill was ~5,000 bills in one proven-safe shot).
$ChunkPlans = @{

  # Branch 004: surveyed 2024-04-01 .. 2026-07-07. Normal months (<8,000
  # bills) run as one chunk; the Nov 2024 - Jun 2025 + Dec 2025 sales spike
  # (>=8,000 bills/month) is split into three ~10-day chunks.
  "004" = @(
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

  # Branch 003: surveyed 2025-06-01 .. 2026-07-09 (131,006 bills total).
  # Unlike branch 004, every month here runs 8,000-15,000 bills - well above
  # the single-chunk safe ceiling - so every month is split: two ~15-day
  # chunks normally, three ~10-day chunks for the two highest months
  # (Jun 2025 = 15,005 bills, Dec 2025 = 14,538 bills). ada.sales_headers had
  # zero rows for this branch before this plan (sales_detail was never synced
  # here), so this covers the entire available history, not just a gap.
  "003" = @(
    @{ From = "2026-07-01"; To = "2026-07-09" }
    @{ From = "2026-06-16"; To = "2026-06-30" }
    @{ From = "2026-06-01"; To = "2026-06-15" }
    @{ From = "2026-05-16"; To = "2026-05-31" }
    @{ From = "2026-05-01"; To = "2026-05-15" }
    @{ From = "2026-04-16"; To = "2026-04-30" }
    @{ From = "2026-04-01"; To = "2026-04-15" }
    @{ From = "2026-03-16"; To = "2026-03-31" }
    @{ From = "2026-03-01"; To = "2026-03-15" }
    @{ From = "2026-02-15"; To = "2026-02-28" }
    @{ From = "2026-02-01"; To = "2026-02-14" }
    @{ From = "2026-01-16"; To = "2026-01-31" }
    @{ From = "2026-01-01"; To = "2026-01-15" }
    @{ From = "2025-12-21"; To = "2025-12-31" }
    @{ From = "2025-12-11"; To = "2025-12-20" }
    @{ From = "2025-12-01"; To = "2025-12-10" }
    @{ From = "2025-11-16"; To = "2025-11-30" }
    @{ From = "2025-11-01"; To = "2025-11-15" }
    @{ From = "2025-10-16"; To = "2025-10-31" }
    @{ From = "2025-10-01"; To = "2025-10-15" }
    @{ From = "2025-09-16"; To = "2025-09-30" }
    @{ From = "2025-09-01"; To = "2025-09-15" }
    @{ From = "2025-08-16"; To = "2025-08-31" }
    @{ From = "2025-08-01"; To = "2025-08-15" }
    @{ From = "2025-07-16"; To = "2025-07-31" }
    @{ From = "2025-07-01"; To = "2025-07-15" }
    @{ From = "2025-06-21"; To = "2025-06-30" }
    @{ From = "2025-06-11"; To = "2025-06-20" }
    @{ From = "2025-06-01"; To = "2025-06-10" }
  )

  # Branch 001: surveyed 2024-07-01 .. 2026-07-10 (279,465 bills total).
  # All full months are high-volume (~9k-13.5k bills/month), so they are split
  # into 10-day chunks. Nov 2024 is an outlier (20,553 bills) and is split more
  # tightly to keep per-chunk payload size near the proven-safe ceiling.
  "001" = @(
    @{ From = "2026-07-01"; To = "2026-07-10" }
    @{ From = "2026-06-21"; To = "2026-06-30" }
    @{ From = "2026-06-11"; To = "2026-06-20" }
    @{ From = "2026-06-01"; To = "2026-06-10" }
    @{ From = "2026-05-21"; To = "2026-05-31" }
    @{ From = "2026-05-11"; To = "2026-05-20" }
    @{ From = "2026-05-01"; To = "2026-05-10" }
    @{ From = "2026-04-21"; To = "2026-04-30" }
    @{ From = "2026-04-11"; To = "2026-04-20" }
    @{ From = "2026-04-01"; To = "2026-04-10" }
    @{ From = "2026-03-21"; To = "2026-03-31" }
    @{ From = "2026-03-11"; To = "2026-03-20" }
    @{ From = "2026-03-01"; To = "2026-03-10" }
    @{ From = "2026-02-21"; To = "2026-02-28" }
    @{ From = "2026-02-11"; To = "2026-02-20" }
    @{ From = "2026-02-01"; To = "2026-02-10" }
    @{ From = "2026-01-21"; To = "2026-01-31" }
    @{ From = "2026-01-11"; To = "2026-01-20" }
    @{ From = "2026-01-01"; To = "2026-01-10" }
    @{ From = "2025-12-21"; To = "2025-12-31" }
    @{ From = "2025-12-11"; To = "2025-12-20" }
    @{ From = "2025-12-01"; To = "2025-12-10" }
    @{ From = "2025-11-21"; To = "2025-11-30" }
    @{ From = "2025-11-11"; To = "2025-11-20" }
    @{ From = "2025-11-01"; To = "2025-11-10" }
    @{ From = "2025-10-21"; To = "2025-10-31" }
    @{ From = "2025-10-11"; To = "2025-10-20" }
    @{ From = "2025-10-01"; To = "2025-10-10" }
    @{ From = "2025-09-21"; To = "2025-09-30" }
    @{ From = "2025-09-11"; To = "2025-09-20" }
    @{ From = "2025-09-01"; To = "2025-09-10" }
    @{ From = "2025-08-21"; To = "2025-08-31" }
    @{ From = "2025-08-11"; To = "2025-08-20" }
    @{ From = "2025-08-01"; To = "2025-08-10" }
    @{ From = "2025-07-21"; To = "2025-07-31" }
    @{ From = "2025-07-11"; To = "2025-07-20" }
    @{ From = "2025-07-01"; To = "2025-07-10" }
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
    @{ From = "2024-11-25"; To = "2024-11-30" }
    @{ From = "2024-11-19"; To = "2024-11-24" }
    @{ From = "2024-11-13"; To = "2024-11-18" }
    @{ From = "2024-11-07"; To = "2024-11-12" }
    @{ From = "2024-11-01"; To = "2024-11-06" }
    @{ From = "2024-10-21"; To = "2024-10-31" }
    @{ From = "2024-10-11"; To = "2024-10-20" }
    @{ From = "2024-10-01"; To = "2024-10-10" }
    @{ From = "2024-09-21"; To = "2024-09-30" }
    @{ From = "2024-09-11"; To = "2024-09-20" }
    @{ From = "2024-09-01"; To = "2024-09-10" }
    @{ From = "2024-08-21"; To = "2024-08-31" }
    @{ From = "2024-08-11"; To = "2024-08-20" }
    @{ From = "2024-08-01"; To = "2024-08-10" }
    @{ From = "2024-07-21"; To = "2024-07-31" }
    @{ From = "2024-07-11"; To = "2024-07-20" }
    @{ From = "2024-07-01"; To = "2024-07-10" }
  )
}

if (-not $ChunkPlans.ContainsKey($Branch)) {
  Write-Error "No chunk plan defined for branch '$Branch'. Known branches: $($ChunkPlans.Keys -join ', '). Survey AdaAcc (TPSTSalHD MIN/MAX doc_date + monthly counts) and add a plan to `$ChunkPlans in this script first."
  exit 1
}
$Chunks = $ChunkPlans[$Branch]
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
    Write-Output "STOPPED at chunk $i ($from -> $to) - exit code $($psi.ExitCode)."
    Write-Output "Log:       $logFile"
    Write-Output "Error log: $logFile.err"
    Write-Output ""
    Write-Output "Fix the cause, then resume with:"
    Write-Output "  .\installer\backfill-branch.ps1 -Branch $Branch -StartAtIndex $i"
    exit 1
  }

  Write-Output "  OK - log: $logFile"
  if ($i -lt $total) {
    Start-Sleep -Seconds $PauseSeconds
  }
}

Write-Output ""
Write-Output "All $total chunks completed successfully for branch $Branch."
