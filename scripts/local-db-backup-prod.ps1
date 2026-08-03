param(
  [string]$OutDir = "",
  [switch]$DataOnly
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

function Get-DirectDbUrlCandidates([string]$PrimaryUrl) {
  $list = New-Object System.Collections.Generic.List[string]
  $direct = Read-EnvDbUrl "SUPABASE_DB_DIRECT_URL"
  if ($direct) { $list.Add((Ensure-SslMode $direct)) | Out-Null }

  $primary = Ensure-SslMode $PrimaryUrl
  if ($primary) { $list.Add($primary) | Out-Null }

  $ref = $null
  if ($primary -match 'postgres\.([a-z0-9]+):') {
    $ref = $Matches[1]
  }
  if ($ref -and $primary -match '@([^/?]+)') {
    $hostName = $Matches[1]
    if ($hostName -match 'pooler\.supabase\.com') {
      $built = $primary -replace [regex]::Escape($hostName), "db.$ref.supabase.co"
      if (-not $list.Contains($built)) { $list.Add($built) | Out-Null }
    }
  }

  return @($list | Select-Object -Unique)
}

function Invoke-PgDump([string]$DbUrl, [string]$OutPath, [switch]$DataOnly) {
  $dumpArgs = @(
    "run", "--rm",
    "--dns", "8.8.8.8",
    "--dns", "8.8.4.4",
    "-v", "${OutDir}:/out",
    "postgres:17",
    "pg_dump",
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--schema=public"
  )
  if ($DataOnly) { $dumpArgs += "--data-only" }
  $dumpArgs += "-f", "/out/$(Split-Path -Leaf $OutPath)", $DbUrl
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
$candidates = Get-DirectDbUrlCandidates $primaryUrl

Write-Host "[local-db] Backup prod -> $outFile" -ForegroundColor Cyan
Write-Host "[local-db] pg_dump tries: $($candidates.Count) connection variant(s)" -ForegroundColor DarkGray

$ok = $false
foreach ($url in $candidates) {
  $safeHost = if ($url -match '@([^/?]+)') { $Matches[1] } else { "?" }
  Write-Host "[local-db] Trying host: $safeHost" -ForegroundColor DarkGray
  if ((Invoke-PgDump -DbUrl $url -OutPath $outFile -DataOnly:$DataOnly) -eq 0) {
    $ok = $true
    break
  }
}

if (-not $ok) {
  Write-Host "[local-db] pg_dump failed. In Supabase Dashboard -> Database -> use Direct connection URI as SUPABASE_DB_DIRECT_URL in .env.local" -ForegroundColor Red
  exit 1
}

Write-Host "[local-db] OK: $outFile" -ForegroundColor Green
Write-Host "[local-db] backups/ is gitignored; do not commit dumps." -ForegroundColor DarkGray
