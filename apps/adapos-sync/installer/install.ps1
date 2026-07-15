param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$InstallerDir = $PSScriptRoot
$AgentDir = [System.IO.Path]::GetFullPath((Join-Path $InstallerDir ".."))
$EnvExamplePath = Join-Path $AgentDir ".env.example"
$EnvPath = Join-Path $AgentDir ".env"
$RegisterTaskPath = Join-Path $AgentDir "register-task.ps1"
$DiagnoseBatPath = Join-Path $InstallerDir "diagnose.bat"

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host "== $Title =="
}

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-FirstLine {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) {
    return ""
  }
  return ($Text -split "`r?`n" | Select-Object -First 1).Trim()
}

function Get-CommandInfo {
  param([string]$CommandName)
  return Get-Command $CommandName -ErrorAction SilentlyContinue
}

function Get-CommandOutput {
  param(
    [string]$Executable,
    [string[]]$Arguments
  )

  try {
    $output = & $Executable @Arguments 2>&1
    return @{
      Output = ($output | Out-String).Trim()
      ExitCode = $LASTEXITCODE
    }
  } catch {
    return @{
      Output = $_.Exception.Message
      ExitCode = 1
    }
  }
}

function Test-NodeVersion {
  $cmd = Get-CommandInfo -CommandName "node"
  if (-not $cmd) {
    return @{ Ok = $false; Message = "Node.js is not installed." }
  }

  $result = Get-CommandOutput -Executable $cmd.Source -Arguments @("--version")
  $versionText = Get-FirstLine -Text $result.Output
  if ($result.ExitCode -ne 0) {
    return @{ Ok = $false; Message = "Unable to run node --version: $versionText" }
  }

  $normalized = $versionText.TrimStart("v")
  $major = 0
  if (-not [int]::TryParse(($normalized.Split(".")[0]), [ref]$major)) {
    return @{ Ok = $false; Message = "Could not parse Node.js version: $versionText" }
  }
  if ($major -lt 20) {
    return @{ Ok = $false; Message = "Node.js 20+ required. Found: $versionText" }
  }
  return @{ Ok = $true; Message = $versionText }
}

function Get-EnvMap {
  param([string]$Path)

  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $map
  }

  foreach ($line in Get-Content -LiteralPath $Path -ErrorAction Stop) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }
    $trimmed = $line.Trim()
    if ($trimmed.StartsWith("#")) {
      continue
    }
    $parts = $trimmed.Split("=", 2)
    if ($parts.Count -lt 2) {
      continue
    }
    $map[$parts[0].Trim()] = $parts[1]
  }

  return $map
}

function Read-Choice {
  param(
    [string]$Prompt,
    [string[]]$Allowed,
    [string]$DefaultValue
  )

  while ($true) {
    $answer = Read-Host $Prompt
    if ([string]::IsNullOrWhiteSpace($answer)) {
      $answer = $DefaultValue
    }
    if ($Allowed -contains $answer.ToUpperInvariant()) {
      return $answer.ToUpperInvariant()
    }
    Write-Host "Please enter one of: $($Allowed -join ', ')"
  }
}

function Read-RequiredValue {
  param(
    [string]$Prompt,
    [string]$DefaultValue
  )

  while ($true) {
    if ([string]::IsNullOrEmpty($DefaultValue)) {
      $value = Read-Host $Prompt
    } else {
      $value = Read-Host "$Prompt [$DefaultValue]"
      if ([string]::IsNullOrWhiteSpace($value)) {
        $value = $DefaultValue
      }
    }

    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value.Trim()
    }

    Write-Host "This value is required."
  }
}

function Convert-SecureStringToPlainText {
  param([Security.SecureString]$SecureString)

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Read-SecretValue {
  param(
    [string]$Prompt,
    [string]$ExistingValue
  )

  if (-not [string]::IsNullOrEmpty($ExistingValue)) {
    Write-Host "$Prompt [press Enter to keep current value]"
  } else {
    Write-Host "$Prompt"
  }

  $secure = Read-Host -AsSecureString
  $plain = Convert-SecureStringToPlainText -SecureString $secure
  if ([string]::IsNullOrEmpty($plain) -and -not [string]::IsNullOrEmpty($ExistingValue)) {
    return $ExistingValue
  }
  while ([string]::IsNullOrEmpty($plain)) {
    Write-Host "This value is required."
    $secure = Read-Host -AsSecureString
    $plain = Convert-SecureStringToPlainText -SecureString $secure
  }
  return $plain
}

function Write-EnvFile {
  param(
    [string]$Path,
    [hashtable]$Values
  )

  $order = @(
    "ADAPOS_SQLSERVER_HOST",
    "ADAPOS_SQLSERVER_PORT",
    "ADAPOS_SQLSERVER_USER",
    "ADAPOS_SQLSERVER_PASSWORD",
    "ADAPOS_SQLSERVER_DATABASE",
    "ADAPOS_SYNC_INTERVAL_MINUTES",
    "ADAPOS_SYNC_DRY_RUN",
    "ADAPOS_SYNC_API_BASE_URL",
    "ADAPOS_SYNC_SHARED_TOKEN",
    "ADAPOS_SYNC_DATE_CUTOFF",
    "ADAPOS_SYNC_DATASETS",
    "ADAPOS_SYNC_BRANCH_CODE",
    "BRANCH_STOCK_SYNC_TOKEN",
    "ADAPOS_SYNC_PRODUCT_BATCH_SIZE",
    "ADAPOS_SYNC_SALES_DETAIL_CHUNK_DOCS",
    "ADAPOS_SYNC_TRANSFER_CHUNK_DOCS"
  )

  $lines = New-Object System.Collections.Generic.List[string]
  foreach ($key in $order) {
    if ($Values.ContainsKey($key)) {
      $lines.Add("$key=$($Values[$key])") | Out-Null
    }
  }

  foreach ($key in ($Values.Keys | Sort-Object)) {
    if ($order -notcontains $key) {
      $lines.Add("$key=$($Values[$key])") | Out-Null
    }
  }

  $content = ($lines -join [Environment]::NewLine) + [Environment]::NewLine
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $content, $utf8NoBom)
}

function Invoke-NpmInstall {
  $npm = Get-CommandInfo -CommandName "npm"
  if (-not $npm) {
    throw "npm is not installed."
  }

  Write-Host "Running npm install --production in $AgentDir"
  Push-Location $AgentDir
  try {
    & $npm.Source install --production
    if ($LASTEXITCODE -ne 0) {
      throw "npm install failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function Test-HeartbeatEndpoint {
  param(
    [string]$ApiBaseUrl,
    [string]$Token,
    [string]$BranchCode
  )

  $uri = $ApiBaseUrl.TrimEnd("/") + "/api/sync/heartbeat"
  $body = @{
    branchCode = $BranchCode
    laptopName = $env:COMPUTERNAME
    event = "install-test"
  } | ConvertTo-Json

  try {
    $response = Invoke-WebRequest `
      -Uri $uri `
      -Method POST `
      -UseBasicParsing `
      -TimeoutSec 15 `
      -Headers @{ "x-api-key" = $Token } `
      -ContentType "application/json" `
      -Body $body

    return @{
      Ok = $true
      StatusCode = $response.StatusCode
      Body = $response.Content
      Message = "Heartbeat succeeded."
    }
  } catch {
    $webResponse = $_.Exception.Response
    if ($webResponse) {
      $statusCode = [int]$webResponse.StatusCode
      $content = ""
      try {
        $reader = New-Object System.IO.StreamReader($webResponse.GetResponseStream())
        $content = $reader.ReadToEnd()
        $reader.Dispose()
      } catch {
        $content = "<unavailable>"
      }
      return @{
        Ok = $false
        StatusCode = $statusCode
        Body = $content
        Message = "Heartbeat failed with HTTP $statusCode."
      }
    }
    return @{
      Ok = $false
      StatusCode = $null
      Body = ""
      Message = $_.Exception.Message
    }
  }
}

function Invoke-DryRun {
  param([string]$BranchCode)

  $node = Get-CommandInfo -CommandName "node"
  if (-not $node) {
    throw "node is not installed."
  }

  Push-Location $AgentDir
  try {
    & $node.Source "src/index.js" "--dry-run" "--branch=$BranchCode"
    return $LASTEXITCODE
  } finally {
    Pop-Location
  }
}

function Get-TaskSummary {
  param([string]$TaskName)

  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $task) {
    return $null
  }
  $info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
  return @{
    Task = $task
    Info = $info
  }
}

Write-Section "Admin check"
if (-not (Test-IsAdministrator)) {
  Write-Host "This installer must be run as Administrator."
  Write-Host "Right-click PowerShell and choose 'Run as administrator', then run install.ps1 again."
  exit 1
}
Write-Host "Administrator check passed."

Write-Section "Prerequisites"
$nodeCheck = Test-NodeVersion
if (-not $nodeCheck.Ok) {
  Write-Host $nodeCheck.Message
  Write-Host "Download Node.js 20 LTS: https://nodejs.org/en/download"
  exit 1
}
Write-Host "Node.js: $($nodeCheck.Message)"

$git = Get-CommandInfo -CommandName "git"
if (-not $git) {
  Write-Host "Git is not installed."
  Write-Host "Download Git for Windows: https://git-scm.com/download/win"
  exit 1
}
$gitVersion = Get-CommandOutput -Executable $git.Source -Arguments @("--version")
Write-Host "Git: $(Get-FirstLine -Text $gitVersion.Output)"

Write-Section "Repo location"
Write-Host "Installer folder: $InstallerDir"
Write-Host "Agent folder: $AgentDir"
Set-Location $AgentDir

Write-Section "Install dependencies"
Invoke-NpmInstall

Write-Section "Configure .env"
$exampleValues = Get-EnvMap -Path $EnvExamplePath
$existingValues = Get-EnvMap -Path $EnvPath
$mode = "OVERWRITE"
if (Test-Path -LiteralPath $EnvPath) {
  Write-Host ".env already exists at $EnvPath"
  $mode = Read-Choice -Prompt "Choose K=keep, E=edit, O=overwrite [E]" -Allowed @("K", "E", "O") -DefaultValue "E"
}

$finalValues = @{}
if ($mode -eq "K") {
  foreach ($key in $existingValues.Keys) {
    $finalValues[$key] = $existingValues[$key]
  }
  Write-Host "Keeping existing .env values."
} else {
  foreach ($key in $exampleValues.Keys) {
    $finalValues[$key] = $exampleValues[$key]
  }

  if ($mode -eq "E") {
    foreach ($key in $existingValues.Keys) {
      $finalValues[$key] = $existingValues[$key]
    }
  }

  $branchDefault = if ($finalValues.ContainsKey("ADAPOS_SYNC_BRANCH_CODE")) { $finalValues["ADAPOS_SYNC_BRANCH_CODE"] } else { "" }
  $sqlHostDefault = if ($finalValues.ContainsKey("ADAPOS_SQLSERVER_HOST")) { $finalValues["ADAPOS_SQLSERVER_HOST"] } else { "localhost" }
  $sqlPortDefault = if ($finalValues.ContainsKey("ADAPOS_SQLSERVER_PORT")) { $finalValues["ADAPOS_SQLSERVER_PORT"] } else { "1433" }
  $sqlUserDefault = if ($finalValues.ContainsKey("ADAPOS_SQLSERVER_USER")) { $finalValues["ADAPOS_SQLSERVER_USER"] } else { "readonly_user" }
  $sqlPasswordDefault = if ($finalValues.ContainsKey("ADAPOS_SQLSERVER_PASSWORD")) { $finalValues["ADAPOS_SQLSERVER_PASSWORD"] } else { "" }
  $sqlDatabaseDefault = if ($finalValues.ContainsKey("ADAPOS_SQLSERVER_DATABASE")) { $finalValues["ADAPOS_SQLSERVER_DATABASE"] } else { "AdaAcc" }
  $apiBaseDefault = if ($finalValues.ContainsKey("ADAPOS_SYNC_API_BASE_URL")) { $finalValues["ADAPOS_SYNC_API_BASE_URL"] } else { "https://paasrtsm-project.onrender.com" }
  $tokenDefault = if ($finalValues.ContainsKey("ADAPOS_SYNC_SHARED_TOKEN")) { $finalValues["ADAPOS_SYNC_SHARED_TOKEN"] } else { "" }
  $dryRunDefault = if ($finalValues.ContainsKey("ADAPOS_SYNC_DRY_RUN")) { $finalValues["ADAPOS_SYNC_DRY_RUN"] } else { "false" }

  $finalValues["ADAPOS_SYNC_BRANCH_CODE"] = Read-RequiredValue -Prompt "ADAPOS_SYNC_BRANCH_CODE" -DefaultValue $branchDefault
  $finalValues["ADAPOS_SQLSERVER_HOST"] = Read-RequiredValue -Prompt "ADAPOS_SQLSERVER_HOST" -DefaultValue $sqlHostDefault
  $finalValues["ADAPOS_SQLSERVER_PORT"] = Read-RequiredValue -Prompt "ADAPOS_SQLSERVER_PORT" -DefaultValue $sqlPortDefault
  $finalValues["ADAPOS_SQLSERVER_USER"] = Read-RequiredValue -Prompt "ADAPOS_SQLSERVER_USER" -DefaultValue $sqlUserDefault
  $finalValues["ADAPOS_SQLSERVER_PASSWORD"] = Read-SecretValue -Prompt "ADAPOS_SQLSERVER_PASSWORD" -ExistingValue $sqlPasswordDefault
  $finalValues["ADAPOS_SQLSERVER_DATABASE"] = Read-RequiredValue -Prompt "ADAPOS_SQLSERVER_DATABASE" -DefaultValue $sqlDatabaseDefault
  $finalValues["ADAPOS_SYNC_API_BASE_URL"] = Read-RequiredValue -Prompt "ADAPOS_SYNC_API_BASE_URL" -DefaultValue $apiBaseDefault
  $finalValues["ADAPOS_SYNC_SHARED_TOKEN"] = Read-SecretValue -Prompt "ADAPOS_SYNC_SHARED_TOKEN" -ExistingValue $tokenDefault
  $finalValues["ADAPOS_SYNC_DRY_RUN"] = Read-RequiredValue -Prompt "ADAPOS_SYNC_DRY_RUN" -DefaultValue $dryRunDefault

  if (-not $finalValues.ContainsKey("ADAPOS_SYNC_INTERVAL_MINUTES") -or [string]::IsNullOrWhiteSpace($finalValues["ADAPOS_SYNC_INTERVAL_MINUTES"])) {
    $finalValues["ADAPOS_SYNC_INTERVAL_MINUTES"] = "10"
  }
  if (-not $finalValues.ContainsKey("ADAPOS_SYNC_DATE_CUTOFF") -or [string]::IsNullOrWhiteSpace($finalValues["ADAPOS_SYNC_DATE_CUTOFF"])) {
    $finalValues["ADAPOS_SYNC_DATE_CUTOFF"] = (Get-Date -Format "yyyy-MM-dd")
  }
  if (-not $finalValues.ContainsKey("ADAPOS_SYNC_DATASETS") -or [string]::IsNullOrWhiteSpace($finalValues["ADAPOS_SYNC_DATASETS"])) {
    $finalValues["ADAPOS_SYNC_DATASETS"] = "products,sales,branch_stock,transfers,transfer_lines,pending_receipts,approved_receipts"
  }
  if (-not $finalValues.ContainsKey("BRANCH_STOCK_SYNC_TOKEN") -or [string]::IsNullOrWhiteSpace($finalValues["BRANCH_STOCK_SYNC_TOKEN"])) {
    $finalValues["BRANCH_STOCK_SYNC_TOKEN"] = $finalValues["ADAPOS_SYNC_SHARED_TOKEN"]
  }
  if (-not $finalValues.ContainsKey("ADAPOS_SYNC_PRODUCT_BATCH_SIZE") -or [string]::IsNullOrWhiteSpace($finalValues["ADAPOS_SYNC_PRODUCT_BATCH_SIZE"])) {
    $finalValues["ADAPOS_SYNC_PRODUCT_BATCH_SIZE"] = "100"
  }
  if (-not $finalValues.ContainsKey("ADAPOS_SYNC_SALES_DETAIL_CHUNK_DOCS") -or [string]::IsNullOrWhiteSpace($finalValues["ADAPOS_SYNC_SALES_DETAIL_CHUNK_DOCS"])) {
    $finalValues["ADAPOS_SYNC_SALES_DETAIL_CHUNK_DOCS"] = "150"
  }
  if (-not $finalValues.ContainsKey("ADAPOS_SYNC_TRANSFER_CHUNK_DOCS") -or [string]::IsNullOrWhiteSpace($finalValues["ADAPOS_SYNC_TRANSFER_CHUNK_DOCS"])) {
    $finalValues["ADAPOS_SYNC_TRANSFER_CHUNK_DOCS"] = "30"
  }

  Write-EnvFile -Path $EnvPath -Values $finalValues
  Write-Host ".env written to $EnvPath"
}

$branchCode = $finalValues["ADAPOS_SYNC_BRANCH_CODE"]
$apiBaseUrl = $finalValues["ADAPOS_SYNC_API_BASE_URL"]
$sharedToken = $finalValues["ADAPOS_SYNC_SHARED_TOKEN"]

Write-Section "Dry-run smoke test"
$dryRunExitCode = Invoke-DryRun -BranchCode $branchCode
if ($dryRunExitCode -ne 0) {
  Write-Host "Dry-run failed with exit code $dryRunExitCode"
  $nextStep = Read-Choice -Prompt "Choose A=abort or C=continue anyway [A]" -Allowed @("A", "C") -DefaultValue "A"
  if ($nextStep -eq "A") {
    Write-Host "Installation aborted after dry-run failure."
    exit 1
  }
} else {
  Write-Host "Dry-run completed successfully."
}

Write-Section "Heartbeat endpoint test"
$heartbeat = Test-HeartbeatEndpoint -ApiBaseUrl $apiBaseUrl -Token $sharedToken -BranchCode $branchCode
Write-Host $heartbeat.Message
if ($heartbeat.StatusCode) {
  Write-Host "HTTP status: $($heartbeat.StatusCode)"
}
if ($heartbeat.Body) {
  Write-Host "Response: $($heartbeat.Body)"
}
if (-not $heartbeat.Ok) {
  if ($heartbeat.StatusCode -eq 401) {
    Write-Host "The shared token appears to be wrong."
  } elseif ($heartbeat.StatusCode) {
    Write-Host "The server responded, but not with success."
  } else {
    Write-Host "Could not reach the heartbeat endpoint. Check the API URL and network."
  }
}

Write-Section "Register scheduled task"
if (-not (Test-Path -LiteralPath $RegisterTaskPath)) {
  throw "Could not find register-task.ps1 at $RegisterTaskPath"
}
& $RegisterTaskPath -Branch $branchCode
if ($LASTEXITCODE -ne 0) {
  throw "register-task.ps1 failed with exit code $LASTEXITCODE"
}

Write-Section "Final summary"
$taskName = "AdaPOS Nightly Sync (Branch $branchCode)"
$taskSummary = Get-TaskSummary -TaskName $taskName
Write-Host "Branch code: $branchCode"
Write-Host ".env file: $EnvPath"
Write-Host "Diagnostic script: $DiagnoseBatPath"
Write-Host "Scheduled task: $taskName"
if ($taskSummary -and $taskSummary.Info) {
  Write-Host "Next run time: $($taskSummary.Info.NextRunTime)"
}
Write-Host "The sync wrapper will run every night at 22:00."
Write-Host "If anything goes wrong, run diagnose.bat and send diagnose-output.txt to the engineer."
