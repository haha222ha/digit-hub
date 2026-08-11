# 上传爬虫到服务器 /opt/xhs/crawler（⑥补缺挂机）
# 用法（PowerShell）:
#   cd D:\vuemonitor
#   powershell -ExecutionPolicy Bypass -File xhs-cloud\cloud_deploy\scripts\upload_crawler.ps1 `
#     -Server admin@你的服务器IP `
#     -Source "D:\0619xhs备份\jiekoufenxi\小红书多设备爬虫"
#
param(
    [string]$Server = "admin@iZj6c9ezz80pofi8fjyxuoZ",
    [string]$Source = "D:\0619xhs备份\jiekoufenxi\小红书多设备爬虫",
    [string]$RemoteDir = "/opt/xhs/crawler"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $Source)) {
    Write-Host "源目录不存在: $Source" -ForegroundColor Red
    exit 1
}

$ssh = Get-Command ssh -ErrorAction SilentlyContinue
$scp = Get-Command scp -ErrorAction SilentlyContinue
if (-not $ssh -or -not $scp) {
    Write-Host "需要 OpenSSH 客户端 (ssh/scp)" -ForegroundColor Red
    exit 1
}

Write-Host ">>> 创建远程目录 $RemoteDir"
& ssh $Server "sudo mkdir -p $RemoteDir && sudo chown -R `$USER:`$USER $RemoteDir"

Write-Host ">>> 打包上传（排除大目录 crawl_data / venv / db / node_modules 等）"
$temp = Join-Path $env:TEMP ("xhs-crawler-" + [guid]::NewGuid().ToString("n") + ".tar.gz")
Push-Location $Source
try {
    if (Get-Command tar -ErrorAction SilentlyContinue) {
        tar `
            --exclude=crawl_data `
            --exclude=venv `
            --exclude=__pycache__ `
            --exclude=*.db `
            --exclude=.git `
            --exclude=node_modules `
            --exclude=backup `
            --exclude=backups `
            --exclude=dist `
            --exclude=build `
            --exclude=*.zip `
            --exclude=*.7z `
            --exclude=*.rar `
            -czf $temp .
        $sizeMb = [math]::Round((Get-Item $temp).Length / 1MB, 1)
        Write-Host "  包大小: ${sizeMb} MB"
        if ($sizeMb -gt 800) {
            Write-Host "  警告: 包仍较大，请检查 Source 是否含 crawl_data 等大目录" -ForegroundColor Yellow
        }
    } else {
        Write-Host "未找到 tar，改用 scp 整目录（较慢）" -ForegroundColor Yellow
        & scp -r * "${Server}:${RemoteDir}/"
        Pop-Location
        Write-Host ">>> 完成。服务器执行: bash /opt/xhs-cloud/cloud_deploy/scripts/enable_pure_online.sh"
        exit 0
    }
} finally {
    Pop-Location
}

& scp $temp "${Server}:/tmp/xhs-crawler.tgz"
Remove-Item $temp -Force -ErrorAction SilentlyContinue

& ssh $Server @"
set -e
mkdir -p $RemoteDir
tar -xzf /tmp/xhs-crawler.tgz -C $RemoteDir
rm -f /tmp/xhs-crawler.tgz
ls -la $RemoteDir/xhs_full_sold_daemon.py $RemoteDir/xhs_full_sold_fetch.py 2>/dev/null || ls $RemoteDir | head
"@

Write-Host ""
Write-Host ">>> 上传完成。请在服务器执行:" -ForegroundColor Green
Write-Host "  rsync -a /opt/vuemonitor/xhs-cloud/cloud_deploy/ /opt/xhs-cloud/cloud_deploy/ --delete --exclude data --exclude venv --exclude .env"
Write-Host "  bash /opt/xhs-cloud/cloud_deploy/scripts/enable_pure_online.sh"
