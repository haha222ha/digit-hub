#!/bin/bash
# 检查 /opt/xhs/crawler 是否就绪（上传爬虫后执行）
set -euo pipefail

ENV_FILE="${XHS_ENV_FILE:-/opt/xhs-cloud/.env}"
[[ -f "$ENV_FILE" ]] && set -a && source "$ENV_FILE" && set +a

CRAWLER="${XHS_CRAWLER_ROOT:-/opt/xhs/crawler}"
echo "XHS_CRAWLER_ROOT=$CRAWLER"
echo ""

if [[ ! -d "$CRAWLER" ]]; then
  echo "✗ 目录不存在。推荐 git pull 后自动同步："
  echo "  cd /opt/vuemonitor && git pull"
  echo "  rsync -a /opt/vuemonitor/xhs-cloud/cloud_deploy/ /opt/xhs-cloud/cloud_deploy/ --delete"
  echo "  bash /opt/xhs-cloud/cloud_deploy/scripts/host-update.sh"
  echo ""
  echo "或手动 scp: powershell -File xhs-cloud/cloud_deploy/scripts/upload_crawler.ps1 -Server admin@服务器IP"
  exit 1
fi

MISS=0
for f in xhs_full_sold_daemon.py xhs_full_sold_fetch.py xhs_full_sold_queue_db.py xhs_web_sold_sync_write.py shop_collectors.py xhs_paths.py; do
  if [[ -f "$CRAWLER/$f" ]]; then
    echo "✓ $f"
  else
    echo "✗ 缺少 $f"
    MISS=1
  fi
done

echo ""
ls -la "$CRAWLER" | head -15

if [[ "$MISS" -ne 0 ]]; then
  exit 1
fi

echo ""
echo "✓ 爬虫目录就绪。可执行: sudo systemctl restart xhs-daemon"
