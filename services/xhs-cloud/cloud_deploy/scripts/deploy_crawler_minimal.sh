#!/bin/bash
# 本地同步精简爬虫到香港（或任意 SSH 主机）
# 用法: bash cloud_deploy/scripts/deploy_crawler_minimal.sh admin@香港IP
set -euo pipefail

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "用法: $0 user@host"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SRC="$REPO_ROOT/cloud_deploy/crawler_runtime"
REMOTE="${XHS_CRAWLER_REMOTE:-/opt/xhs/crawler}"

FILES=(
  xhs_full_sold_fetch.py
  xhs_web_fallback_module.py
  xhs_shelf_time_module.py
  xhs_paths.py
  shop_collectors.py
)

echo "[deploy] → $TARGET:$REMOTE"
ssh "$TARGET" "mkdir -p '$REMOTE/crawl_data'"
for f in "${FILES[@]}"; do
  if [[ ! -f "$SRC/$f" ]]; then
    echo "缺少 $SRC/$f"
    exit 1
  fi
  scp "$SRC/$f" "$TARGET:$REMOTE/"
  echo "  ✓ $f"
done
echo "[deploy] 完成。服务器: sudo systemctl restart xhs-daemon"
