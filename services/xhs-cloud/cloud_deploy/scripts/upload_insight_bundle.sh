#!/bin/bash
# 方案 A：上传本地 insight_export → 云 insight_shadow（会员 AI Tab 只读）
# 用法:
#   bash cloud_deploy/scripts/upload_insight_bundle.sh 2026-07-12 root@你的ECS
#   XHS_INSIGHT_HOST=root@1.2.3.4 bash cloud_deploy/scripts/upload_insight_bundle.sh 2026-07-12
set -euo pipefail

DATE="${1:?用法: upload_insight_bundle.sh YYYY-MM-DD [user@host]}"
HOST="${2:-${XHS_INSIGHT_HOST:-}}"
if [[ -z "$HOST" ]]; then
  echo "请设置 XHS_INSIGHT_HOST 或传入第二参数 user@host" >&2
  exit 1
fi

ROOT="${XHS_CLOUD_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
DAY="${DATE//-/}"
SRC="${ROOT}/data/insight_export/insight_${DAY}"
DEST="/opt/xhs-cloud/data/insight_shadow/insight_${DAY}"

if [[ ! -d "$SRC" ]]; then
  echo "缺少本地目录: $SRC（先跑 export_local_insight_bundle.py）" >&2
  exit 1
fi

echo "[upload-insight] $SRC → $HOST:$DEST"
rsync -avz --delete "$SRC/" "$HOST:$DEST/"
echo "[upload-insight] OK — 会员页 Ctrl+F5 强刷 https://monitor.xhs365.cn/member"
