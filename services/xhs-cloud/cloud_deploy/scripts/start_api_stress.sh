#!/bin/bash
# 纯 API 24h 压测 — 启动前自动停 xhs-daemon，避免与生产抢 PG/dp
set -euo pipefail

ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
ENV_FILE="${XHS_ENV_FILE:-$ROOT/.env}"
LOG="${ROOT}/data/api_stress.log"
JSON="${ROOT}/data/api_stress_summary.json"
DURATION="${1:-24}"
BATCH="${2:-800}"
CONC="${3:-3}"
COOLDOWN="${4:-30}"

[[ -f "$ENV_FILE" ]] || { echo "缺少 $ENV_FILE"; exit 1; }

echo "[api-stress] 停止生产 xhs-daemon ..."
sudo systemctl stop xhs-daemon || true

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
export PYTHONPATH="${PYTHONPATH:-$ROOT}"
export XHS_CRAWLER_ROOT="${XHS_CRAWLER_ROOT:-/opt/xhs/crawler}"
export XHS_ENABLE_PLAYWRIGHT=0

mkdir -p "$ROOT/data"
echo "[api-stress] 启动 ${DURATION}h batch=${BATCH} conc=${CONC} cooldown=${COOLDOWN}s"
echo "[api-stress] 日志: $LOG"

nohup "$ROOT/venv/bin/python" "$ROOT/cloud_deploy/scripts/api_stress_scan.py" \
  --duration-hours "$DURATION" \
  --batch-size "$BATCH" \
  --concurrency "$CONC" \
  --cooldown "$COOLDOWN" \
  --write-pg \
  --skip-today \
  --json-out "$JSON" \
  >> "$LOG" 2>&1 &

echo $! > "$ROOT/data/api_stress.pid"
echo "[api-stress] PID=$(cat "$ROOT/data/api_stress.pid")"
echo "[api-stress] tail -f $LOG"
echo "[api-stress] 结束后恢复: sudo systemctl start xhs-daemon"
