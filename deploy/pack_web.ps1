# Pack apps/web into deploy/dist/xinxiang-web.tgz
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -ErrorAction SilentlyContinue
# deploy/ is under digit-hub
$Hub = Split-Path $PSScriptRoot -Parent
$Web = Join-Path $Hub "apps\web"
$OutDir = Join-Path $PSScriptRoot "dist"
$OutTar = Join-Path $OutDir "xinxiang-web.tgz"

if (-not (Test-Path (Join-Path $Web "index.html"))) {
  throw "Missing apps/web/index.html under $Hub"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
if (Test-Path $OutTar) { Remove-Item -Force $OutTar }

# Prefer tar (Windows 10+)
Push-Location $Web
try {
  tar -czf $OutTar `
    --exclude=.git `
    --exclude=node_modules `
    --exclude=__pycache__ `
    .
} finally {
  Pop-Location
}

$size = (Get-Item $OutTar).Length
Write-Host "OK: $OutTar ($([math]::Round($size/1KB,1)) KB)"
