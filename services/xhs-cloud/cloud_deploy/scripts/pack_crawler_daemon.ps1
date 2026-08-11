# 打包 ⑥补缺挂机 所需最小爬虫文件（约几 MB，不含 crawl_data / system_backups）
# 仓库已内置: xhs-cloud/cloud_deploy/crawler_runtime/（git push → 服务器 pull + host-update 自动同步）
# 本脚本仅用于从本地完整爬虫目录刷新上述目录，或离线 scp 上传。
# 用法:
#   powershell -File xhs-cloud\cloud_deploy\scripts\pack_crawler_daemon.ps1
#   scp $env:TEMP\xhs-crawler-daemon.tgz admin@服务器:/tmp/
#
param(
    [string]$Source = "D:\0619xhs备份\jiekoufenxi\小红书多设备爬虫",
    [string]$OutFile = "$env:TEMP\xhs-crawler-daemon.tgz"
)

$ErrorActionPreference = "Stop"
$files = @(
    "xhs_full_sold_daemon.py",
    "xhs_full_sold_fetch.py",
    "xhs_full_sold_queue_db.py",
    "xhs_web_sold_sync_write.py",
    "xhs_web_risk_cooldown_log.py",
    "xhs_detail_enrich_db.py",
    "xhs_sold_snapshot_skip.py",
    "xhs_shelf_time_module.py",
    "xhs_web_fallback_module.py",
    "xhs_report_scope.py",
    "xhs_sold_velocity.py",
    "xhs_sold_sanity.py",
    "xhs_goods_risk_registry.py",
    "xhs_db_idle.py",
    "shop_collectors.py",
    "xhs_paths.py"
)

if (-not (Test-Path $Source)) {
    Write-Host "源目录不存在: $Source" -ForegroundColor Red
    exit 1
}

$staging = Join-Path $env:TEMP ("xhs-crawler-staging-" + [guid]::NewGuid().ToString("n"))
New-Item -ItemType Directory -Path $staging -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $staging "crawl_data") -Force | Out-Null

$missing = @()
foreach ($f in $files) {
    $src = Join-Path $Source $f
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $staging $f)
    } else {
        $missing += $f
    }
}

if ($missing.Count -gt 0) {
    Write-Host "缺少文件: $($missing -join ', ')" -ForegroundColor Red
    Remove-Item $staging -Recurse -Force
    exit 1
}

if (Test-Path $OutFile) { Remove-Item $OutFile -Force }
Push-Location $staging
try {
    tar -czf $OutFile .
} finally {
    Pop-Location
}
Remove-Item $staging -Recurse -Force

$mb = [math]::Round((Get-Item $OutFile).Length / 1MB, 2)
Write-Host "已生成: $OutFile (${mb} MB)" -ForegroundColor Green
Write-Host ""
Write-Host "上传到服务器:"
Write-Host "  scp $OutFile admin@你的服务器IP:/tmp/xhs-crawler-daemon.tgz"
Write-Host ""
Write-Host "服务器解压:"
Write-Host "  sudo mkdir -p /opt/xhs/crawler && sudo chown -R `$USER:`$USER /opt/xhs/crawler"
Write-Host "  tar -xzf /tmp/xhs-crawler-daemon.tgz -C /opt/xhs/crawler"
Write-Host "  bash /opt/xhs-cloud/cloud_deploy/scripts/check_crawler.sh"
Write-Host "  sudo systemctl restart xhs-daemon"
