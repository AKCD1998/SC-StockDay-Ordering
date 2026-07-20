# check-self-update-result.ps1
# Fleet-compatible post-run checker for the deterministic self-update status
# file written by open-adapos-and-sync.ps1
# (apps\adapos-sync\logs\self-update-latest.json). Not hardcoded to any
# branch: it only reads whatever status file lives next to it.
#
# Usage (called by RUN-ADAPOS-SYNC.bat after every launcher run):
#   powershell -ExecutionPolicy Bypass -File check-self-update-result.ps1
#
# Exit codes:
#   0  RESULT is CURRENT, UPDATED, or SKIPPED (self-update did what it should)
#   1  RESULT is FAILED
#   2  RESULT is STARTED (attempt never reached a terminal result)
#   3  status file is missing
#   4  status file exists but is not valid JSON, missing 'result', or a
#      terminal result is missing 'finishedAt'
#   5  -ExpectedAttemptId was given and does not match the file's attemptId
#      (the file is stale -- it was not written by this invocation)

param(
  [string]$StatusPath = (Join-Path $PSScriptRoot "logs\self-update-latest.json"),
  # Pass the same attemptId RUN-ADAPOS-SYNC.bat gave the launcher for this
  # run. Without this, a launcher that returns exit 0 without ever running
  # (or without writing a new status) would let a stale CURRENT/UPDATED
  # status from a previous day silently pass as this run's result.
  [string]$ExpectedAttemptId = ""
)

if (-not (Test-Path -LiteralPath $StatusPath)) {
  Write-Host "SELF-UPDATE-CHECK: status file not found at $StatusPath"
  exit 3
}

try {
  $status = Get-Content -LiteralPath $StatusPath -Raw | ConvertFrom-Json
} catch {
  Write-Host "SELF-UPDATE-CHECK: status file is not valid JSON: $StatusPath"
  exit 4
}

if (-not $status.result) {
  Write-Host "SELF-UPDATE-CHECK: status file is missing the 'result' field: $StatusPath"
  exit 4
}

if ($ExpectedAttemptId -and $status.attemptId -ne $ExpectedAttemptId) {
  Write-Host "SELF-UPDATE-CHECK: status file attemptId '$($status.attemptId)' does not match this invocation's attemptId '$ExpectedAttemptId' -- stale status from a previous run."
  exit 5
}

if ($status.result -in @("CURRENT", "UPDATED", "FAILED", "SKIPPED") -and -not $status.finishedAt) {
  Write-Host "SELF-UPDATE-CHECK: terminal result '$($status.result)' is missing 'finishedAt': $StatusPath"
  exit 4
}

switch ($status.result) {
  "CURRENT" {
    Write-Host "SELF-UPDATE-CHECK: RESULT=CURRENT attemptId=$($status.attemptId) head=$($status.headAfter)"
    exit 0
  }
  "UPDATED" {
    Write-Host "SELF-UPDATE-CHECK: RESULT=UPDATED attemptId=$($status.attemptId) head=$($status.headAfter)"
    exit 0
  }
  "SKIPPED" {
    Write-Host "SELF-UPDATE-CHECK: RESULT=SKIPPED attemptId=$($status.attemptId) reasonCode=$($status.reasonCode)"
    exit 0
  }
  "FAILED" {
    Write-Host "SELF-UPDATE-CHECK: RESULT=FAILED attemptId=$($status.attemptId) reasonCode=$($status.reasonCode)"
    exit 1
  }
  "STARTED" {
    Write-Host "SELF-UPDATE-CHECK: RESULT=STARTED (no terminal outcome was ever recorded) attemptId=$($status.attemptId) startedAt=$($status.startedAt)"
    exit 2
  }
  default {
    Write-Host "SELF-UPDATE-CHECK: unrecognized result '$($status.result)' in $StatusPath"
    exit 4
  }
}
