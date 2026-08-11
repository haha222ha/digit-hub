#!/bin/bash
# W1-5 Shadow 验收冒烟（profile + insight library + view）
# 用法见 insight_shadow_smoke.py 文件头
set -euo pipefail

ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
PY="${ROOT}/venv/bin/python"
SCRIPT="${ROOT}/cloud_deploy/scripts/insight_shadow_smoke.py"

if [[ ! -x "$PY" ]]; then
  PY=python3
fi
if [[ ! -f "$SCRIPT" ]]; then
  echo "[smoke] missing $SCRIPT" >&2
  exit 1
fi

cd "$ROOT"
export PYTHONPATH="${ROOT}:${PYTHONPATH:-}"
export XHS_SMOKE_BASE="${XHS_SMOKE_BASE:-http://127.0.0.1:${XHS_CLOUD_PORT:-8080}}"

exec "$PY" "$SCRIPT" "$@"
