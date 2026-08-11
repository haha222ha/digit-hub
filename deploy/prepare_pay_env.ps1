# Build /tmp/xhs_cloud.env content from wipe backup (local only; NOT committed).
# Output: deploy/secrets/xhs_cloud.env  (gitignored)
$ErrorActionPreference = "Stop"
$Wipe = "D:\backups\wipe-20260810_193549\extracted\wipe-cfg-fixed\env\xhs_cloud.env"
$OutDir = Join-Path $PSScriptRoot "secrets"
$Out = Join-Path $OutDir "xhs_cloud.env"
if (-not (Test-Path $Wipe)) { throw "missing wipe env: $Wipe" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Parse wipe for pay keys only
$map = @{}
Get-Content $Wipe -Encoding UTF8 | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#") -or $line -notmatch "=") { return }
  $i = $line.IndexOf("=")
  $k = $line.Substring(0, $i).Trim()
  $v = $line.Substring($i + 1).Trim()
  $map[$k] = $v
}

$need = @(
  "XHS_PAY_API_URL","XHS_PAY_PID","XHS_PAY_KEY",
  "XHS_PAY_ALIPAY_API_URL","XHS_PAY_ALIPAY_PID","XHS_PAY_ALIPAY_KEY"
)
foreach ($k in $need) {
  if (-not $map.ContainsKey($k) -or [string]::IsNullOrWhiteSpace($map[$k])) {
    throw "wipe missing $k"
  }
}

$lines = @(
  "# Generated from wipe backup — paste to host /tmp/xhs_cloud.env before api_fresh_install",
  "XHS_PAY_API_URL=$($map['XHS_PAY_API_URL'])",
  "XHS_PAY_PID=$($map['XHS_PAY_PID'])",
  "XHS_PAY_KEY=$($map['XHS_PAY_KEY'])",
  "XHS_PAY_ALIPAY_API_URL=$($map['XHS_PAY_ALIPAY_API_URL'])",
  "XHS_PAY_ALIPAY_PID=$($map['XHS_PAY_ALIPAY_PID'])",
  "XHS_PAY_ALIPAY_KEY=$($map['XHS_PAY_ALIPAY_KEY'])",
  "XHS_PAY_NOTIFY_BASE=https://monitor.xhs365.cn",
  "XHS_PAY_ENABLE_TEST_PLAN=0"
)
[IO.File]::WriteAllLines($Out, $lines)
Write-Host "Wrote $Out"
Write-Host "Host: scp or paste -> /tmp/xhs_cloud.env then sudo bash api_fresh_install.sh"
