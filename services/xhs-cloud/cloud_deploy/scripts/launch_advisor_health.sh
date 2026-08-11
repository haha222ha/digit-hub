#!/bin/bash
# 顾问每日三问：advice / timer / keyword_goods_mapping
set -euo pipefail
ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
cd "$ROOT"
if [[ -f "$ROOT/.env" ]]; then
  set -a && source "$ROOT/.env" && set +a
fi
exec "$ROOT/venv/bin/python" "$ROOT/cloud_deploy/scripts/daily_advisor_health_check.py" "$@"
