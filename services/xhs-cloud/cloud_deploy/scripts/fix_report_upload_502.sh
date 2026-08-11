#!/bin/bash
# 服务器一键修复 report-upload 502（OOM / 超时）
# 用法: cd /opt/xhs-cloud && bash cloud_deploy/scripts/fix_report_upload_502.sh
set -euo pipefail
ROOT="${DEPLOY_ROOT:-/opt/xhs-cloud}"
cd "$ROOT"
echo "=== fix report-upload 502 ==="
sudo cp cloud_deploy/systemd/xhs-cloud-api.service /etc/systemd/system/
sudo cp cloud_deploy/deploy/nginx-xhs-monitor.conf /etc/nginx/sites-available/xhs-monitor.conf
sudo systemctl daemon-reload
sudo systemctl restart xhs-cloud-api
if command -v nginx &>/dev/null; then
  sudo nginx -t && sudo systemctl reload nginx
fi
grep MemoryMax /etc/systemd/system/xhs-cloud-api.service || true
systemctl is-active xhs-cloud-api
echo "=== done ==="
