#!/bin/bash
# 将快照策略设为「永久积累」并关闭自动清理 timer
set -euo pipefail

ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
ENV_FILE="${XHS_ENV_FILE:-$ROOT/.env}"

[[ -f "$ENV_FILE" ]] || { echo "缺少 $ENV_FILE"; exit 1; }

set_kv() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s/^${key}=.*/${key}=${val}/" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

set_kv XHS_SNAPSHOT_RETENTION_DAYS 0
set_kv XHS_ENABLE_SNAPSHOT_PRUNE 0

sudo systemctl disable --now xhs-prune-snapshots.timer 2>/dev/null || true

echo "已设置永久保留快照："
grep -E '^XHS_SNAPSHOT_RETENTION|^XHS_ENABLE_SNAPSHOT' "$ENV_FILE" || true
echo ""
echo "当前表规模："
"$ROOT/venv/bin/python" "$ROOT/cloud_deploy/scripts/storage_stats.py"
