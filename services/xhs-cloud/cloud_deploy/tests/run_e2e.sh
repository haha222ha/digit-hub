#!/bin/bash
# 服务器端完整 E2E（需已部署 PG + xhs_monitor schema）
set -euo pipefail
ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
cd "$ROOT"
export PYTHONPATH="$ROOT"
export PYTHONIOENCODING=utf-8
export E2E_DATABASE_URL="${E2E_DATABASE_URL:-$XHS_DATABASE_URL}"
echo "E2E PG: ${E2E_DATABASE_URL:-<none>}"
exec "$ROOT/venv/bin/python" "$ROOT/cloud_deploy/tests/e2e_test.py"
