param(
  [int]$Port = 54322
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envExample = Join-Path $repoRoot "supabase/functions/.env.local.example"
$envFile = Join-Path $repoRoot "supabase/functions/.env.local"

if (-not (Test-Path $envFile)) {
  if (Test-Path $envExample) {
    Copy-Item $envExample $envFile
    Write-Host "[local-functions] Created supabase/functions/.env.local from example" -ForegroundColor Yellow
  } else {
    Write-Host "[local-functions] Missing .env.local.example" -ForegroundColor Red
    exit 1
  }
}

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  Write-Host "[local-functions] Node.js/npx required" -ForegroundColor Red
  exit 1
}

Write-Host "[local-functions] Serving supabase/functions on port $Port (via gateway :54321/functions/v1/)" -ForegroundColor Cyan
Write-Host "[local-functions] Stop with Ctrl+C" -ForegroundColor DarkGray

Set-Location $repoRoot
npx --yes supabase@2.30.4 functions serve --env-file $envFile --no-verify-jwt --port $Port
