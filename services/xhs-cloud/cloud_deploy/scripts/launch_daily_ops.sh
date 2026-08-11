#!/bin/bash
# 每日运维一键：health + shadow journal + timer 状态
set -euo pipefail

ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
echo "=== $(date -Iseconds) V2 daily ops ==="

curl -sf "http://127.0.0.1:${XHS_CLOUD_PORT:-8080}/api/v1/health" && echo " API ok" || echo " API FAIL"

if [[ -f "$ROOT/cloud_deploy/scripts/shadow_t0_health_check.sh" ]]; then
  bash "$ROOT/cloud_deploy/scripts/shadow_t0_health_check.sh" || true
fi

echo "--- insight timer (last 3 runs) ---"
journalctl -u xhs-insight-report.service -n 20 --no-pager 2>/dev/null | tail -8 || true

echo "--- due workflow reminders ---"
if [[ -f "$ROOT/.env" ]]; then
  set -a && source "$ROOT/.env" && set +a
fi
if [[ "${XHS_DATABASE_URL:-}" == postgres* ]]; then
  psql "$XHS_DATABASE_URL" -t -c "
    SET search_path TO xhs_monitor, public;
    SELECT user_id, category, remind_at FROM member_insight_workflow
    WHERE remind_at IS NOT NULL AND remind_at <= CURRENT_DATE
    ORDER BY remind_at LIMIT 20;
  " 2>/dev/null || echo "(workflow 表未迁移或无到期)"
fi

if [[ -f "$ROOT/cloud_deploy/scripts/launch_advisor_health.sh" ]]; then
  echo "--- advisor three-question health ---"
  bash "$ROOT/cloud_deploy/scripts/launch_advisor_health.sh" || true
fi

echo "=== done ==="
