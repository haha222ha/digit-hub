#!/bin/bash
# 连续 3 批 ok=0 且 fail>=100 时自动重启 xhs-daemon（dp 僵死自愈）
set -euo pipefail

ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
ENV_FILE="${XHS_ENV_FILE:-$ROOT/.env}"
[[ -f "$ENV_FILE" ]] || exit 0

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
export PYTHONPATH="${PYTHONPATH:-$ROOT}"

ACTION=$("$ROOT/venv/bin/python" - <<'PY'
from cloud_deploy.scripts.bootstrap_env import bootstrap
bootstrap()
from cloud_deploy.cloud_api.database_pg import _conn

conn = _conn()
try:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute("SELECT ok, fail FROM daemon_scan_stats ORDER BY id DESC LIMIT 3")
        rows = c.fetchall()
finally:
    conn.close()

def _batch_dead(ok, fail):
    total = ok + fail
    if total < 100:
        return False
    return ok < max(10, int(total * 0.01)) and fail >= int(total * 0.9)

if len(rows) == 3 and all(_batch_dead(r[0], r[1]) for r in rows):
    print("RESTART")
else:
    print("OK")
PY
)

if [[ "$ACTION" == "RESTART" ]]; then
  echo "[daemon-watchdog] 最近 3 批全失败，重启 xhs-daemon $(date -Iseconds)"
  systemctl restart xhs-daemon
fi
