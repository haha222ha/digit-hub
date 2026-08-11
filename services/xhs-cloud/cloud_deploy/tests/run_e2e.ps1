# E2E 测试运行脚本 (Windows)
# 完整 PG 测试: 先安装 PostgreSQL 或 Docker，再设置 E2E_DATABASE_URL
#
#   $env:E2E_DATABASE_URL="postgresql://xhs_monitor_user:pass@127.0.0.1:5432/vuemonitor"
#   .\cloud_deploy\tests\run_e2e.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path "$Root\cloud_deploy\cloud_api\main.py")) {
    $Root = Split-Path $PSScriptRoot -Parent | Split-Path -Parent
}

Set-Location $Root
$env:PYTHONPATH = $Root
$env:XHS_CLOUD_ROOT = $Root
$env:PYTHONIOENCODING = "utf-8"

Write-Host "xhs-cloud E2E from $Root"
python "$Root\cloud_deploy\tests\e2e_test.py"
exit $LASTEXITCODE
