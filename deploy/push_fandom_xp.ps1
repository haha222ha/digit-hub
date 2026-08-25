# 将 fandom_xp 测题 + catalog 热更新到 ECS（需 SSH Host xhs365-wipe 可用）
# Usage: powershell -ExecutionPolicy Bypass -File deploy/push_fandom_xp.ps1
$ErrorActionPreference = "Stop"
$Hub = Split-Path $PSScriptRoot -Parent
$SshHost = if ($env:XHS_SSH_HOST) { $env:XHS_SSH_HOST } else { "xhs365-wipe" }
$RemoteTgz = "/tmp/fandom_xp_deploy.tgz"

Write-Host "==> probe SSH $SshHost"
$probe = ssh -o BatchMode=yes -o ConnectTimeout=15 $SshHost "echo OK && whoami && hostname" 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host $probe
  Write-Host ""
  Write-Host "SSH failed. See deploy/MIGRATE_STATUS.md to add your public key, then retry."
  exit 1
}
Write-Host $probe

Write-Host "==> pack fandom_xp + catalog"
$staging = Join-Path $env:TEMP "fandom_xp_deploy"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null
Copy-Item (Join-Path $Hub "apps\psy-dist\tests\fandom_xp") (Join-Path $staging "fandom_xp") -Recurse
New-Item -ItemType Directory -Path (Join-Path $staging "packages\psy-dist") -Force | Out-Null
Copy-Item (Join-Path $Hub "packages\psy-dist\tests-catalog.json") (Join-Path $staging "packages\psy-dist\tests-catalog.json")

$LocalTgz = Join-Path $env:TEMP "fandom_xp_deploy.tgz"
if (Test-Path $LocalTgz) { Remove-Item $LocalTgz -Force }
tar -czf $LocalTgz -C $staging .
Remove-Item $staging -Recurse -Force

Write-Host "==> upload"
scp $LocalTgz "${SshHost}:${RemoteTgz}"

Write-Host "==> remote apply + quick_update"
$remoteCmd = (
  "set -e",
  "sudo mkdir -p /tmp/fandom_xp_unpack /opt/digit-hub/apps/psy-dist/tests /opt/digit-hub/packages/psy-dist",
  "sudo tar -xzf $RemoteTgz -C /tmp/fandom_xp_unpack",
  "sudo rm -rf /opt/digit-hub/apps/psy-dist/tests/fandom_xp",
  "sudo mv /tmp/fandom_xp_unpack/fandom_xp /opt/digit-hub/apps/psy-dist/tests/fandom_xp",
  "sudo cp -f /tmp/fandom_xp_unpack/packages/psy-dist/tests-catalog.json /opt/digit-hub/packages/psy-dist/tests-catalog.json",
  "sudo rm -rf /tmp/fandom_xp_unpack $RemoteTgz",
  "sudo bash /opt/digit-hub/deploy/quick_update.sh",
  "curl -sS -o /dev/null -w 'fandom_xp_index:%{http_code}\n' http://127.0.0.1/tests/fandom_xp/index.html -H 'Host: psy.xhs365.cn' || true"
) -join "; "
ssh $SshHost $remoteCmd

Write-Host ""
Write-Host "DONE. Open: https://psy.xhs365.cn/tests/fandom_xp/index.html?token=YOUR_TOKEN"
