# sync-and-shutdown.ps1
# Runs the AdaPOS sync agent with retry logic, then shuts down the laptop.
# Usage: powershell -ExecutionPolicy Bypass -File sync-and-shutdown.ps1 -Branch 005
#
# The script:
#  1. Sends a startup heartbeat so the dashboard knows the laptop was on
#  2. Runs the sync up to 3 times (retries on failure)
#  3. Shuts down the PC after success or all retries exhausted

param(
  [string]$Branch   = "005",
  [string]$NodeExe  = "C:\Program Files\nodejs\node.exe"
)

$ScriptDir = $PSScriptRoot
Set-Location $ScriptDir

$MaxRetries        = 3
$RetryWaitSeconds  = 120   # 2 minutes between retries
$ShutdownDelaySec  = 60    # grace period before shutdown
$LaptopName        = $env:COMPUTERNAME

# ── Read .env values ────────────────────────────────────────────────────────
function Get-EnvValue([string]$Key) {
  $line = Get-Content ".env" -ErrorAction SilentlyContinue |
          Where-Object { $_ -match "^$Key=" } |
          Select-Object -First 1
  if ($line) { return ($line -replace "^$Key=", "").Trim() }
  return ""
}

$ApiUrl = Get-EnvValue "ADAPOS_SYNC_API_BASE_URL"
$Token  = Get-EnvValue "ADAPOS_SYNC_SHARED_TOKEN"

# SC-StockDay-Ordering URL for heartbeat + nightly-log dashboard.
# Set ADAPOS_SC_ORDERING_URL in .env (e.g. https://sc-stockday-ordering.onrender.com).
$ScUrl  = Get-EnvValue "ADAPOS_SC_ORDERING_URL"

# ── Heartbeat ───────────────────────────────────────────────────────────────
Write-Output "[$(Get-Date -Format 'HH:mm:ss')] Starting sync for branch $Branch on $LaptopName"

# Heartbeat goes to SC-StockDay-Ordering so the nightly-log dashboard can see it.
# Falls back to ADAPOS_SYNC_API_BASE_URL if ADAPOS_SC_ORDERING_URL is not set.
$HeartbeatUrl = if ($ScUrl) { $ScUrl } else { $ApiUrl }

if ($HeartbeatUrl) {
  try {
    $Body = @{ branchCode = $Branch; laptopName = $LaptopName; event = "startup" } | ConvertTo-Json
    Invoke-RestMethod `
      -Uri "$HeartbeatUrl/api/sync/heartbeat" `
      -Method POST `
      -Body $Body `
      -ContentType "application/json" `
      -TimeoutSec 15 | Out-Null
    Write-Output "[$(Get-Date -Format 'HH:mm:ss')] Heartbeat sent OK -> $HeartbeatUrl"
  } catch {
    Write-Output "[$(Get-Date -Format 'HH:mm:ss')] Heartbeat failed (non-fatal): $($_.Exception.Message)"
  }
} else {
  Write-Output "[$(Get-Date -Format 'HH:mm:ss')] Skipping heartbeat — ADAPOS_SC_ORDERING_URL not set in .env"
}

# ── Sync with retries ───────────────────────────────────────────────────────
$Success = $false

for ($Attempt = 1; $Attempt -le $MaxRetries; $Attempt++) {
  Write-Output "[$(Get-Date -Format 'HH:mm:ss')] Attempt $Attempt of $MaxRetries..."

  & $NodeExe "src/index.js" "--execute" "--branch=$Branch"

  if ($LASTEXITCODE -eq 0) {
    $Success = $true
    Write-Output "[$(Get-Date -Format 'HH:mm:ss')] Sync succeeded on attempt $Attempt"
    break
  }

  Write-Output "[$(Get-Date -Format 'HH:mm:ss')] Attempt $Attempt failed (exit code $LASTEXITCODE)"

  if ($Attempt -lt $MaxRetries) {
    Write-Output "[$(Get-Date -Format 'HH:mm:ss')] Waiting $RetryWaitSeconds seconds before retry..."
    Start-Sleep -Seconds $RetryWaitSeconds
  }
}

# ── Shutdown ────────────────────────────────────────────────────────────────
if ($Success) {
  Write-Output "[$(Get-Date -Format 'HH:mm:ss')] All done. Shutting down in $ShutdownDelaySec seconds..."
} else {
  Write-Output "[$(Get-Date -Format 'HH:mm:ss')] All $MaxRetries attempts failed. Shutting down in $ShutdownDelaySec seconds..."
}

Start-Sleep -Seconds $ShutdownDelaySec
Stop-Computer -Force
