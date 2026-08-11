#!/bin/bash
# 停止 API 压测并恢复生产 daemon
set -euo pipefail

ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
PID_FILE="$ROOT/data/api_stress.pid"

if [[ -f "$PID_FILE" ]]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "[api-stress] 停止 PID=$PID"
    kill -TERM "$PID" || true
    sleep 2
    kill -0 "$PID" 2>/dev/null && kill -KILL "$PID" || true
  fi
  rm -f "$PID_FILE"
fi

echo "[api-stress] 恢复 xhs-daemon"
sudo systemctl start xhs-daemon
systemctl is-active xhs-daemon
