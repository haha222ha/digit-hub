#!/bin/bash
# 香港云主机安装 cloud_daemon（systemd + PG 迁移）
set -euo pipefail

ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
cd "$ROOT"

echo "[install] PG 迁移 cloud_daemon 字段..."
if [[ -f "$ROOT/cloud_deploy/database/migrate_cloud_daemon.sql" ]]; then
  if [[ -n "${XHS_DATABASE_URL:-}" ]]; then
    "$ROOT/venv/bin/python" - <<'PY'
import os, sys
sys.path.insert(0, os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud"))
from cloud_deploy.scripts.bootstrap_env import bootstrap
bootstrap()
from cloud_deploy.cloud_api.database import init_db
init_db()
print("init_db OK (含 last_scan_* / daemon_scan_stats)")
PY
  else
    echo "  跳过: 未配置 XHS_DATABASE_URL"
  fi
fi

echo "[install] systemd xhs-daemon..."
sudo cp "$ROOT/cloud_deploy/systemd/xhs-daemon.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable xhs-daemon.service
echo "[install] 完成。启动: sudo systemctl restart xhs-daemon"
