param(
  [string]$VpsHost = "",
  [string]$VpsUser = "root",
  [string]$SshKeyPath = "",
  [string]$DumpPath = "",
  [switch]$ProdOnly
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$frontedEnv = Join-Path $repoRoot "fronted/.env.local"
$dumpDir = Join-Path $repoRoot "backups/local-db"
$reportPath = Join-Path $dumpDir "verify-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"

# Автоопределение SSH-ключа (кириллический путь Users\ПК\.ssh ломает auto-discovery).
if (-not $SshKeyPath) {
  $sshDir = Join-Path $env:USERPROFILE ".ssh"
  foreach ($candidate in @("id_ed25519", "id_rsa", "id_ecdsa")) {
    $p = Join-Path $sshDir $candidate
    if (Test-Path -LiteralPath $p) { $SshKeyPath = $p; break }
  }
  if ($SshKeyPath) {
    Write-Host "[verify] SSH key auto-detected: $SshKeyPath" -ForegroundColor DarkGray
  }
}

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
  return @{ User = $user; Password = $pass; Host = $dbHost; Port = $port; Database = $db }
}

function Escape-SshSingle([string]$s) {
  return ($s -replace "'", "'\\''")
}

function Get-ProdCountsViaVps {
  param($VpsHost, $VpsUser, $SshKeyPath, $PoolerUrl)

  $p = Parse-PostgresUrl $PoolerUrl
  if (-not $p) { throw "Cannot parse SUPABASE_DB_URL" }

  $remoteSh = Join-Path $scriptDir "local-db-prod-table-counts.sh"
  $sshArgs = @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new")
  if ($SshKeyPath) { $sshArgs += @("-i", $SshKeyPath) }
  $target = "${VpsUser}@${VpsHost}"

  & scp @sshArgs $remoteSh "${target}:/tmp/crm-table-counts.sh" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "scp to VPS failed" }

  $envBlock = @(
    "PGHOST='$(Escape-SshSingle $p.Host)'",
    "PGPORT='$(Escape-SshSingle $p.Port)'",
    "PGUSER='$(Escape-SshSingle $p.User)'",
    "PGPASSWORD='$(Escape-SshSingle $p.Password)'",
    "PGDATABASE='$(Escape-SshSingle $p.Database)'"
  ) -join " "
  $cmd = "sed -i 's/\r$//' /tmp/crm-table-counts.sh 2>/dev/null; chmod +x /tmp/crm-table-counts.sh; $envBlock bash /tmp/crm-table-counts.sh"

  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $lines = & ssh @sshArgs $target $cmd 2>&1 | ForEach-Object { $_.ToString() }
  $ErrorActionPreference = $prevEap
  if ($LASTEXITCODE -ne 0) {
    throw "SSH/SQL on VPS failed:`n$($lines -join "`n")"
  }

  $map = @{}
  foreach ($line in $lines) {
    if ($line -match '^([^\t]+)\t(\d+)$') {
      $map[$Matches[1]] = [long]$Matches[2]
    }
  }
  return $map
}

function Get-LocalCounts {
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $null = & docker exec crm-local-postgres psql -U postgres -d postgres -tAc "select 1" 2>$null
  $ErrorActionPreference = $prevEap
  if ($LASTEXITCODE -ne 0) {
    throw "crm-local-postgres is not running. Start local-db-up.ps1 first."
  }

  $sql = @"
SELECT c.relname || E'\t' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', 'public', c.relname), false, true, '')))[1]::text::bigint
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;
"@
  $lines = & docker exec crm-local-postgres psql -U postgres -d postgres -At -c $sql 2>&1
  $map = @{}
  foreach ($line in $lines) {
    if ($line -match '^([^\t]+)\t(\d+)$') {
      $map[$Matches[1]] = [long]$Matches[2]
    }
  }
  return $map
}

function Get-DumpTableList([string]$AbsDump) {
  $dir = (Resolve-Path (Split-Path -Parent $AbsDump)).Path
  $leaf = Split-Path -Leaf $AbsDump
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $list = & docker run --rm -v "${dir}:/d:ro" postgres:17 pg_restore -l "/d/$leaf" 2>&1
  $ErrorActionPreference = $prevEap
  $tables = New-Object System.Collections.Generic.HashSet[string]
  foreach ($line in $list) {
    if ($line -match 'TABLE DATA public (\S+)') {
      [void]$tables.Add($Matches[1])
    }
  }
  return $tables
}

if (-not $VpsHost) { $VpsHost = $env:CRM_VPS_HOST }
if (-not $VpsHost) { $VpsHost = "164.215.97.254" }

$pooler = Read-EnvDbUrl "SUPABASE_DB_URL"
if (-not $pooler) {
  Write-Host "Need SUPABASE_DB_URL in fronted/.env.local" -ForegroundColor Red
  exit 1
}

if (-not $DumpPath) {
  $latest = Get-ChildItem $dumpDir -Filter "*.dump" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($latest) { $DumpPath = $latest.FullName }
}

New-Item -ItemType Directory -Force -Path $dumpDir | Out-Null
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("CRM dump verify $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
[void]$sb.AppendLine("VPS: ${VpsUser}@${VpsHost}")
[void]$sb.AppendLine("")

  Write-Host "[verify] Prod table counts (exact COUNT via VPS)..." -ForegroundColor Cyan
  $prod = Get-ProdCountsViaVps -VpsHost $VpsHost -VpsUser $VpsUser -SshKeyPath $SshKeyPath -PoolerUrl $pooler
[void]$sb.AppendLine("PROD public tables: $($prod.Count)")

$local = $null
if (-not $ProdOnly) {
  Write-Host "[verify] Local table counts..." -ForegroundColor Cyan
  try {
    $local = Get-LocalCounts
    [void]$sb.AppendLine("LOCAL public tables: $($local.Count)")
  } catch {
    [void]$sb.AppendLine("LOCAL: $($_.Exception.Message)")
  }
}

$dumpTables = $null
if ($DumpPath -and (Test-Path $DumpPath)) {
  Write-Host "[verify] Dump file: $DumpPath" -ForegroundColor Cyan
  $dumpTables = Get-DumpTableList (Resolve-Path $DumpPath).Path
  [void]$sb.AppendLine("DUMP TABLE DATA entries: $($dumpTables.Count)")
  [void]$sb.AppendLine("")
}

[void]$sb.AppendLine("table`tprod_rows`tlocal_rows`tstatus")
[void]$sb.AppendLine("----`t--------`t----------`t------")

$allNames = ($prod.Keys + @($local.Keys) + @($dumpTables)) | Select-Object -Unique | Sort-Object
$match = 0
$diff = 0
$missingLocal = 0
$missingDump = 0

foreach ($name in $allNames) {
  $pr = if ($prod.ContainsKey($name)) { $prod[$name] } else { $null }
  $lr = if ($local -and $local.ContainsKey($name)) { $local[$name] } else { $null }
  $inDump = if ($dumpTables) { $dumpTables.Contains($name) } else { $null }

  $status = "ok"
  if ($null -eq $pr) { $status = "no_prod?" }
  elseif ($local -ne $null) {
    if ($null -eq $lr) { $status = "missing_local_table"; $missingLocal++ }
    elseif ($lr -ne $pr) { $status = "row_mismatch"; $diff++ }
    else { $match++ }
  }
  if ($dumpTables -and $pr -gt 0 -and -not $inDump) { $status = "not_in_dump"; $missingDump++ }

  [void]$sb.AppendLine("$name`t$pr`t$lr`t$status")
}

[void]$sb.AppendLine("")
[void]$sb.AppendLine("Summary:")
[void]$sb.AppendLine("  match prod=local rows: $match")
[void]$sb.AppendLine("  row_mismatch: $diff")
[void]$sb.AppendLine("  missing_local_table: $missingLocal")
if ($dumpTables) { [void]$sb.AppendLine("  prod rows>0 but not in dump: $missingDump") }
[void]$sb.AppendLine("")
[void]$sb.AppendLine("Note: dump is schema=public only (no auth.users). reltuples estimate not used; prod uses exact COUNT.")
[void]$sb.AppendLine("Triggers/FK on restore can leave local < prod even when dump is complete.")

$text = $sb.ToString()
$text | Out-File -FilePath $reportPath -Encoding UTF8
Write-Host $text
Write-Host "[verify] Report: $reportPath" -ForegroundColor Green

if ($diff -gt 0 -or $missingLocal -gt 0) { exit 2 }
exit 0
