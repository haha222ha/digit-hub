# Push digit-hub web to ECS and bootstrap nginx.
# Requires: ssh Host xhs365-wipe working (pubkey on server).
$ErrorActionPreference = "Stop"
$Hub = Split-Path $PSScriptRoot -Parent
$SshHost = if ($env:XHS_SSH_HOST) { $env:XHS_SSH_HOST } else { "xhs365-wipe" }
# Default: IP / default_server (no DNS). Set XINXIANG_DOMAIN=assess.xhs365.cn when ready.
$Domain = if ($env:XINXIANG_DOMAIN) { $env:XINXIANG_DOMAIN } else { "ip" }
$RemoteTgz = "/tmp/xinxiang-web.tgz"
$RemoteScript = "/tmp/remote_bootstrap.sh"

Write-Host "==> probe SSH $SshHost"
$probe = ssh -o BatchMode=yes -o ConnectTimeout=15 $SshHost "echo OK && whoami && hostname" 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host $probe
  Write-Host ""
  Write-Host "SSH 失败。请先按 deploy/MIGRATE_STATUS.md 把公钥写入 ECS，再重跑本脚本。"
  exit 1
}
Write-Host $probe

Write-Host "==> pack web"
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "pack_web.ps1")
$LocalTgz = Join-Path $PSScriptRoot "dist\xinxiang-web.tgz"
$LocalBoot = Join-Path $PSScriptRoot "remote_bootstrap.sh"

Write-Host "==> upload"
scp $LocalTgz "${SshHost}:${RemoteTgz}"
scp $LocalBoot "${SshHost}:${RemoteScript}"

Write-Host "==> remote bootstrap"
ssh $SshHost "sudo bash $RemoteScript $Domain"

Write-Host "==> remote layout check"
ssh $SshHost @"
echo '--- web ---';ls -la /opt/digit-hub/apps/web/index.html 2>/dev/null || echo MISSING_WEB
echo '--- nginx ---'
sudo nginx -t 2>&1 | tail -5
echo '--- listen ---'
ss -lntp 2>/dev/null | grep -E ':80|:8080|:8000' || netstat -lntp 2>/dev/null | grep -E ':80|:8080|:8000' || true
echo '--- xhs-cloud ---'
ls /opt/xhs-cloud 2>/dev/null | head -5 || ls /opt/vuemonitor 2>/dev/null | head -5 || echo 'NO_CLOUD_DIR'
curl -sS -m 3 http://127.0.0.1:8080/api/v1/health || curl -sS -m 3 http://127.0.0.1:8000/api/v1/health || echo 'API_DOWN'
"@

Write-Host ""
Write-Host "前端已推。若 API 未起，需在 ECS 安装/启动 xhs-cloud（见 packages/cloud-api + D:\vuemonitor\xhs-cloud）。"
Write-Host "公网测: http://$Domain/  （DNS A 记录指向 47.239.181.111）"
Write-Host "Live API: http://$Domain/?api=live"
