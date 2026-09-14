param(
  [string]$OutDir = "",
  [switch]$DataOnly,
  [switch]$IncludeAuth
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$frontedEnv = Join-Path $repoRoot "fronted/.env.local"

function Read-EnvDbUrl([string]$Key) {
  if ($Key -eq "SUPABASE_DB_URL" -and $env:SUPABASE_DB_URL) {
    return $env:SUPABASE_DB_URL.Trim()
  }
  if ($Key -eq "SUPABASE_DB_DIRECT_URL" -and $env:SUPABASE_DB_DIRECT_URL) {
    return $env:SUPABASE_DB_DIRECT_URL.Trim()
  }
  if (-not (Test-Path $frontedEnv)) { return "" }
  foreach ($line in Get-Content $frontedEnv) {
    if ($line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.+)\s*$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return ""
}

function Ensure-SslMode([string]$Url) {
  if ($Url -match '[?&]sslmode=') { return $Url }
  if ($Url -match '\?') { return "$Url&sslmode=require" }
  return "$Url?sslmode=require"
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
  return @{ User = $user; Password = $pass; Host = $dbHost; Port = $port; Database = $db }
}

function Get-DbUrlCandidates([string]$PrimaryUrl) {
  $list = New-Object System.Collections.Generic.List[string]
  $primary = Ensure-SslMode $PrimaryUrl
  if ($primary) { $list.Add($primary) | Out-Null }

  $direct = Read-EnvDbUrl "SUPABASE_DB_DIRECT_URL"
  if ($direct) { $list.Add((Ensure-SslMode $direct)) | Out-Null }

  $ref = $null
  if ($primary -match 'postgres\.([a-z0-9]+)[:@]') {
    $ref = $Matches[1]
  }
  if ($ref -and $primary -match '@([^/?]+)') {
    $hostName = $Matches[1]
    if ($hostName -match 'pooler\.supabase\.com') {
      $built = $primary -replace [regex]::Escape($hostName), "db.$ref.supabase.co"
      $built = $built -replace 'postgres\.[a-z0-9]+:', 'postgres:'
      if (-not $list.Contains($built)) { $list.Add($built) | Out-Null }
    }
  }

  return @($list | Select-Object -Unique)
}

function Invoke-PgDump([string]$DbUrl, [string]$OutPath, [switch]$DataOnly, [switch]$PublicDns) {
  $parsed = Parse-PostgresUrl $DbUrl
  if (-not $parsed) {
    Write-Host "[local-db] Could not parse DB URL" -ForegroundColor Red
    return 1
  }

  # Встроенный резолвер Docker Desktop обычно работает; принудительный 8.8.8.8
  # недоступен в сетях, где исходящий UDP/53 наружу закрыт (VPN, корп. фильтр),
  # и тогда pg_dump падает на "Temporary failure in name resolution".
  # Поэтому сначала пробуем DNS по умолчанию, а публичный — только как фолбэк.
  $dnsArgs = @()
  if ($PublicDns) { $dnsArgs = @("--dns", "8.8.8.8", "--dns", "8.8.4.4") }

  $dumpArgs = @("run", "--rm") + $dnsArgs + @(
    "-e", "PGPASSWORD=$($parsed.Password)",
    "-e", "PGSSLMODE=require",
    "-v", "${OutDir}:/out",
    "postgres:17",
    "pg_dump",
    "-h", $parsed.Host,
    "-p", $parsed.Port,
    "-U", $parsed.User,
    "-d", $parsed.Database,
    "--no-password",
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--schema=public"
  )
  if ($DataOnly) { $dumpArgs += "--data-only" }
  $dumpArgs += "-f", "/out/$(Split-Path -Leaf $OutPath)"
  & docker @dumpArgs
  return $LASTEXITCODE
}

# Пользователи GoTrue лежат в схеме auth, а основной дамп берёт только public.
# Для переезда на self-hosted они обязательны: public.crm_user_roles связан с
# auth.users по user_id (UUID), и без совпадения UUID роли перестанут применяться.
# Плейн-SQL data-only: схему auth на новом сервере создаёт сам GoTrue своими
# миграциями, переносим только строки (включая bcrypt-хеши паролей).
function Invoke-PgDumpAuth([string]$DbUrl, [string]$OutPath, [switch]$PublicDns) {
  $parsed = Parse-PostgresUrl $DbUrl
  if (-not $parsed) {
    Write-Host "[local-db] Could not parse DB URL for auth dump" -ForegroundColor Red
    return 1
  }

  $dnsArgs = @()
  if ($PublicDns) { $dnsArgs = @("--dns", "8.8.8.8", "--dns", "8.8.4.4") }

  $dumpArgs = @("run", "--rm") + $dnsArgs + @(
    "-e", "PGPASSWORD=$($parsed.Password)",
    "-e", "PGSSLMODE=require",
    "-v", "${OutDir}:/out",
    "postgres:17",
    "pg_dump",
    "-h", $parsed.Host,
    "-p", $parsed.Port,
    "-U", $parsed.User,
    "-d", $parsed.Database,
    "--no-password",
    "--format=plain",
    "--no-owner",
    "--no-privileges",
    "--data-only",
    "--table=auth.users",
    "--table=auth.identities",
    "-f", "/out/$(Split-Path -Leaf $OutPath)"
  )
  & docker @dumpArgs
  return $LASTEXITCODE
}

$primaryUrl = Read-EnvDbUrl "SUPABASE_DB_URL"
if (-not $primaryUrl) {
  Write-Host "Set SUPABASE_DB_URL in fronted/.env.local (or SUPABASE_DB_DIRECT_URL for pg_dump)" -ForegroundColor Red
  exit 1
}

if (-not $OutDir) {
  $OutDir = Join-Path $repoRoot "backups/local-db"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outFile = Join-Path $OutDir "crm-prod-$stamp.dump"
$candidates = Get-DbUrlCandidates $primaryUrl

Write-Host "[local-db] Backup prod -> $outFile" -ForegroundColor Cyan
Write-Host "[local-db] pg_dump tries: $($candidates.Count) connection variant(s)" -ForegroundColor DarkGray

$ok = $false
$okUrl = ""
$okPublicDns = $false
foreach ($url in $candidates) {
  $safeHost = if ($url -match '@([^/?]+)') { $Matches[1] } else { "?" }
  Write-Host "[local-db] Trying host: $safeHost (Docker DNS)" -ForegroundColor DarkGray
  if ((Invoke-PgDump -DbUrl $url -OutPath $outFile -DataOnly:$DataOnly) -eq 0) {
    $ok = $true; $okUrl = $url
    break
  }
  Write-Host "[local-db] Retry host: $safeHost (public DNS 8.8.8.8)" -ForegroundColor DarkGray
  if ((Invoke-PgDump -DbUrl $url -OutPath $outFile -DataOnly:$DataOnly -PublicDns) -eq 0) {
    $ok = $true; $okUrl = $url; $okPublicDns = $true
    break
  }
}

if (-not $ok) {
  Write-Host "[local-db] pg_dump failed. Free plan: scripts/local-db-fetch-backup-from-vps.ps1 -VpsHost <crm-v175 VPS>. Or try: local-db-sync-prod.ps1 -DataOnly after local-db-up.ps1" -ForegroundColor Red
  exit 1
}

Write-Host "[local-db] OK: $outFile" -ForegroundColor Green

if ($IncludeAuth) {
  $authFile = Join-Path $OutDir "crm-prod-auth-$stamp.sql"
  Write-Host "[local-db] Auth dump (auth.users, auth.identities) -> $authFile" -ForegroundColor Cyan
  if ((Invoke-PgDumpAuth -DbUrl $okUrl -OutPath $authFile -PublicDns:$okPublicDns) -eq 0) {
    Write-Host "[local-db] OK: $authFile" -ForegroundColor Green
  } else {
    Write-Host "[local-db] WARNING: auth dump failed; public dump is still valid." -ForegroundColor Yellow
  }
}
Write-Host "[local-db] backups/ is gitignored; do not commit dumps." -ForegroundColor DarkGray
