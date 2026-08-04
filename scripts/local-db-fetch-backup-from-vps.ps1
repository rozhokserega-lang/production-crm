param(
  [string]$VpsHost = "",
  [string]$VpsUser = "root",
  [string]$SshKeyPath = "",
  [switch]$DataOnly,
  [switch]$SkipRestore,
  [switch]$PreferPooler
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$frontedEnv = Join-Path $repoRoot "fronted/.env.local"
$dumpDir = Join-Path $repoRoot "backups/local-db"
$remoteScript = Join-Path $scriptDir "local-db-backup-on-vps.sh"

function Read-EnvDbUrl([string]$Key) {
  if (-not (Test-Path $frontedEnv)) { return "" }
  foreach ($line in Get-Content $frontedEnv) {
    if ($line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.+)\s*$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return ""
}

function Parse-PostgresUrl([string]$Url) {
  if ($Url -notmatch '^postgres(?:ql)?://([^@]+)@(.+)$') { return $null }
  $userInfo = $Matches[1]
  $tail = $Matches[2]
  $colon = $userInfo.IndexOf(':')
  if ($colon -lt 1) { return $null }
  $user = [uri]::UnescapeDataString($userInfo.Substring(0, $colon))
  $pass = [uri]::UnescapeDataString($userInfo.Substring($colon + 1))
  $pathAndQuery = $tail
  $hostPort = $pathAndQuery
  $db = "postgres"
  if ($pathAndQuery -match '^([^/]+)/([^?]+)') {
    $hostPort = $Matches[1]
    $db = $Matches[2]
  }
  $dbHost = $hostPort
  $port = "5432"
  if ($hostPort -match '^(.+):(\d+)$') {
    $dbHost = $Matches[1]
    $port = $Matches[2]
  }
  return @{
    User = $user; Password = $pass; Host = $dbHost; Port = $port; Database = $db
  }
}

function Escape-SshSingle([string]$s) {
  return ($s -replace "'", "'\\''")
}

if (-not $VpsHost) { $VpsHost = $env:CRM_VPS_HOST }
if (-not $VpsHost) {
  Write-Host "Set -VpsHost or env CRM_VPS_HOST (VPS с crm-v175.ru)." -ForegroundColor Red
  exit 1
}

# Автоопределение SSH-ключа: на машинах с кириллическим именем пользователя
# (C:\Users\ПК\.ssh) OpenSSH не находит ключ сам — передаём путь явно.
if (-not $SshKeyPath) {
  $sshDir = Join-Path $env:USERPROFILE ".ssh"
  foreach ($candidate in @("id_ed25519", "id_rsa", "id_ecdsa")) {
    $p = Join-Path $sshDir $candidate
    if (Test-Path -LiteralPath $p) { $SshKeyPath = $p; break }
  }
  if ($SshKeyPath) {
    Write-Host "[local-db] SSH key auto-detected: $SshKeyPath" -ForegroundColor DarkGray
  }
}

$pooler = Read-EnvDbUrl "SUPABASE_DB_URL"
$direct = Read-EnvDbUrl "SUPABASE_DB_DIRECT_URL"
$candidates = @()
if ($pooler) { $candidates += $pooler }
if ($direct) { $candidates += $direct }
if ($candidates.Count -eq 0) {
  Write-Host "Need SUPABASE_DB_URL or SUPABASE_DB_DIRECT_URL in fronted/.env.local" -ForegroundColor Red
  exit 1
}

New-Item -ItemType Directory -Force -Path $dumpDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$localDump = Join-Path $dumpDir "crm-prod-vps-$stamp.dump"
$remoteDump = "/tmp/crm-prod-$stamp.dump"

$sshArgs = @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new")
if ($SshKeyPath) { $sshArgs += @("-i", $SshKeyPath) }
$target = "${VpsUser}@${VpsHost}"

& scp @sshArgs $remoteScript "${target}:/tmp/crm-local-db-backup.sh" | Out-Null
if ($LASTEXITCODE -ne 0) { exit 1 }

$ok = $false
foreach ($url in $candidates) {
  $p = Parse-PostgresUrl $url
  if (-not $p) { continue }
  Write-Host "[local-db] VPS pg_dump via $($p.Host):$($p.Port) user=$($p.User)..." -ForegroundColor Cyan
  $envBlock = @(
    "PGHOST='$(Escape-SshSingle $p.Host)'",
    "PGPORT='$(Escape-SshSingle $p.Port)'",
    "PGUSER='$(Escape-SshSingle $p.User)'",
    "PGPASSWORD='$(Escape-SshSingle $p.Password)'",
    "PGDATABASE='$(Escape-SshSingle $p.Database)'"
  )
  if ($DataOnly) { $envBlock += "CRM_DUMP_DATA_ONLY=1" }
  $remoteCmd = "sed -i 's/\r$//' /tmp/crm-local-db-backup.sh 2>/dev/null || true; chmod +x /tmp/crm-local-db-backup.sh; $($envBlock -join ' ') bash /tmp/crm-local-db-backup.sh '$(Escape-SshSingle $remoteDump)'"
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $remoteOut = & ssh @sshArgs $target $remoteCmd 2>&1 | ForEach-Object { $_.ToString() }
  $ErrorActionPreference = $prevEap
  $remoteOut | ForEach-Object { Write-Host $_ }
  $sshExit = $LASTEXITCODE
  if ($sshExit -eq 0) {
    $ok = $true
    break
  }
}

if (-not $ok) {
  Write-Host "[local-db] VPS backup failed (need Docker on VPS + SSH access)." -ForegroundColor Red
  exit 1
}

Write-Host "[local-db] Download -> $localDump" -ForegroundColor Cyan
& scp @sshArgs "${target}:${remoteDump}" $localDump
if ($LASTEXITCODE -ne 0) { exit 1 }
& ssh @sshArgs $target "rm -f '$remoteDump' /tmp/crm-local-db-backup.sh" | Out-Null

$size = (Get-Item $localDump).Length
if ($size -le 0) {
  Write-Host "[local-db] Dump is empty." -ForegroundColor Red
  exit 1
}
Write-Host "[local-db] OK: $localDump ($size bytes)" -ForegroundColor Green

if ($SkipRestore) { exit 0 }

& (Join-Path $scriptDir "local-db-up.ps1") -NoPull
if ($LASTEXITCODE -ne 0) { exit 1 }
& (Join-Path $scriptDir "local-db-restore.ps1") -DumpPath $localDump -DataOnly
