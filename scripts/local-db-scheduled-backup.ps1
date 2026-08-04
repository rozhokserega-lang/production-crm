param(
  [string]$VpsHost = "",
  [string]$VpsUser = "root",
  [string]$SshKeyPath = "",
  [int]$KeepDays = 14
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$dumpDir = Join-Path $repoRoot "backups/local-db"
$logFile = Join-Path $dumpDir "scheduled-backup.log"

function Write-Log([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Add-Content -Path $logFile -Value $line -Encoding UTF8
  Write-Host $line
}

New-Item -ItemType Directory -Force -Path $dumpDir | Out-Null

if (-not $VpsHost) { $VpsHost = $env:CRM_VPS_HOST }
if (-not $VpsHost) { $VpsHost = "164.215.97.254" }

Write-Log "START scheduled backup via VPS $VpsUser@${VpsHost}"

$fetchArgs = @(
  "-NoProfile", "-ExecutionPolicy", "Bypass",
  "-File", (Join-Path $scriptDir "local-db-fetch-backup-from-vps.ps1"),
  "-VpsHost", $VpsHost,
  "-VpsUser", $VpsUser,
  "-SkipRestore"
)
if ($SshKeyPath) { $fetchArgs += @("-SshKeyPath", $SshKeyPath) }

& powershell @fetchArgs
if ($LASTEXITCODE -ne 0) {
  Write-Log "FAIL exit=$LASTEXITCODE"
  exit 1
}

$cutoff = (Get-Date).AddDays(-$KeepDays)
Get-ChildItem $dumpDir -Filter "crm-prod-vps-*.dump" -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt $cutoff } |
  ForEach-Object {
    Write-Log "Prune old dump $($_.Name)"
    Remove-Item $_.FullName -Force
  }

Write-Log "OK"
