#!/bin/bash
# 选品云端独立部署 — git pull 后一键更新
# 仓库: https://github.com/haha222ha/vuemonitor  目录: xhs-cloud/
#
# 【服务器一键 — 选品云端】
#   cd /opt/vuemonitor && git fetch origin main && git reset --hard origin/main
#   rsync -a /opt/vuemonitor/xhs-cloud/cloud_deploy/ /opt/xhs-cloud/cloud_deploy/ --delete
#   cd /opt/xhs-cloud && bash cloud_deploy/scripts/host-update.sh
#
# 【vuemonitor 现网 — 不变】
#   cd /opt/vuemonitor && git fetch origin main && git reset --hard origin/main && bash scripts/host-update.sh
#
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

ROOT="${DEPLOY_ROOT:-/opt/xhs-cloud}"
if [ -d "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)" ]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi
cd "$ROOT"

log() { echo -e "  ${CYAN}[*]${NC} $1"; }
ok() { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; exit 1; }

echo ""
echo "  ========================================"
echo "  |   XHS Monitor 云端更新 (2G 优化)     |"
echo "  ========================================"
echo "  目录: $ROOT"
echo ""

if command -v free &>/dev/null; then
  AVAIL=$(free -m | awk '/^Mem:/{print $7}')
  log "可用内存: ${AVAIL}MB"
  if [ "$AVAIL" -lt 150 ]; then
    warn "内存紧张，跳过非必要步骤"
  fi
fi

ENV_FILE="${XHS_ENV_FILE:-$ROOT/.env}"
if [ ! -f "$ENV_FILE" ]; then
  fail "缺少 $ENV_FILE，请先运行 install.sh"
fi

log "Python 依赖"
if [ ! -x "$ROOT/venv/bin/pip" ]; then
  python3 -m venv "$ROOT/venv"
fi
"$ROOT/venv/bin/pip" install -q -U pip
"$ROOT/venv/bin/pip" install -q -r "$ROOT/cloud_deploy/requirements-cloud.txt"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

log "爬虫运行时（git 内置 ⑥补缺 daemon，约 180KB）"
CRAWLER_SRC="$ROOT/cloud_deploy/crawler_runtime"
CRAWLER_DST="${XHS_CRAWLER_ROOT:-/opt/xhs/crawler}"
if [ -d "$CRAWLER_SRC" ] && [ -f "$CRAWLER_SRC/xhs_full_sold_daemon.py" ]; then
  sudo mkdir -p "$CRAWLER_DST"
  rsync -a "$CRAWLER_SRC/" "$CRAWLER_DST/" --exclude 'crawl_data/*' --exclude '*.db' --exclude '*.db-*'
  sudo mkdir -p "$CRAWLER_DST/crawl_data"
  sudo chown -R "${SUDO_USER:-$USER}:${SUDO_USER:-$USER}" "$CRAWLER_DST" 2>/dev/null || true
  ok "已同步 crawler → $CRAWLER_DST"
else
  warn "未找到 $CRAWLER_SRC，跳过爬虫同步（可手动 scp 或设置 XHS_CRAWLER_ROOT）"
fi

log "PG schema（若已配置 XHS_DATABASE_URL）"
if [[ "${XHS_DATABASE_URL:-}" == postgres* ]]; then
  "$ROOT/venv/bin/python" - <<'PY' || warn "PG init 失败，请检查 XHS_DATABASE_URL"
import os, sys
sys.path.insert(0, os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud"))
from cloud_deploy.scripts.bootstrap_env import bootstrap
bootstrap()
from cloud_deploy.cloud_api.database import init_db, ensure_admin
init_db()
ensure_admin()
print("PG schema OK")
PY
else
  warn "未配置 XHS_DATABASE_URL，跳过 PG init"
fi

if [[ "${XHS_DATABASE_URL:-}" == postgres* ]]; then
  bash "$ROOT/cloud_deploy/scripts/ensure_insight_pg_schema.sh" 2>/dev/null && ok "V2 情报 PG 迁移" || warn "V2 PG 迁移跳过"
fi

log "systemd"
if [ -d "$ROOT/cloud_deploy/systemd" ]; then
  sudo cp "$ROOT/cloud_deploy/systemd/"*.service /etc/systemd/system/ 2>/dev/null || true
  sudo cp "$ROOT/cloud_deploy/systemd/"*.timer /etc/systemd/system/ 2>/dev/null || true
  sudo systemctl daemon-reload
fi

# daemon 已启用但日报 timer 未开时自动修复（常见：只装了 daemon 没跑 enable_pure_online）
if systemctl is-enabled xhs-daemon.service &>/dev/null; then
  if ! systemctl is-enabled xhs-daily-report.timer &>/dev/null; then
    warn "xhs-daily-report.timer 未启用，自动修复..."
    bash "$ROOT/cloud_deploy/scripts/ensure_report_timers.sh" || true
  fi
fi

if systemctl is-enabled xhs-cloud-api.service &>/dev/null; then
  log "重启 xhs-cloud-api"
  sudo systemctl restart xhs-cloud-api.service
else
  warn "xhs-cloud-api 未 enable，跳过 restart"
fi

if systemctl is-enabled xhs-daemon.service &>/dev/null; then
  log "重启 xhs-daemon"
  sudo systemctl restart xhs-daemon.service || true
fi

if systemctl is-enabled xhs-ingest-report.timer &>/dev/null; then
  sudo systemctl restart xhs-ingest-report.timer || true
fi

for t in xhs-daemon-watchdog xhs-daily-report xhs-weekly-report xhs-monthly-report xhs-prune-snapshots xhs-aggregate-metrics xhs-v2-daily-ops; do
  if systemctl is-enabled "${t}.timer" &>/dev/null; then
    sudo systemctl restart "${t}.timer" || true
  fi
done

if [[ "${XHS_DATABASE_URL:-}" == postgres* ]]; then
  bash "$ROOT/cloud_deploy/scripts/ensure_aggregate_metrics_timer.sh" 2>/dev/null || true
  if [[ "${XHS_INSIGHT_SHADOW_TIMER:-0}" == "1" ]]; then
    bash "$ROOT/cloud_deploy/scripts/ensure_insight_report_timer.sh" 2>/dev/null || true
    bash "$ROOT/cloud_deploy/scripts/ensure_advisor_generate_timer.sh" 2>/dev/null || true
    bash "$ROOT/cloud_deploy/scripts/ensure_advisor_health_timer.sh" 2>/dev/null || true
  fi
  if [[ "${XHS_V2_LAUNCH:-0}" == "1" ]] || [[ "${XHS_V2_DAILY_OPS:-1}" == "1" ]]; then
    bash "$ROOT/cloud_deploy/scripts/ensure_v2_daily_ops_timer.sh" 2>/dev/null || true
    bash "$ROOT/cloud_deploy/scripts/ensure_advisor_health_timer.sh" 2>/dev/null || true
  fi
fi

if command -v nginx &>/dev/null && [[ -f /opt/vuemonitor/nginx/snippets/insight-limits.conf ]]; then
  bash "$ROOT/cloud_deploy/scripts/ensure_nginx_insight_limits.sh" 2>/dev/null && ok "nginx insight 限流" || warn "nginx 限流未更新"
fi

if [[ "${XHS_SNAPSHOT_RETENTION_DAYS:-0}" == "0" ]] \
   || [[ "${XHS_ENABLE_SNAPSHOT_PRUNE:-auto}" == "0" ]] \
   || [[ "${XHS_ENABLE_SNAPSHOT_PRUNE:-auto}" == "false" ]]; then
  if systemctl is-enabled xhs-prune-snapshots.timer &>/dev/null; then
    warn "关闭 xhs-prune-snapshots.timer（快照永久保留）"
    sudo systemctl disable --now xhs-prune-snapshots.timer || true
  fi
fi

log "健康检查"
PORT="${XHS_CLOUD_PORT:-8080}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/v1/health"
HEALTH_OK=0
# 2G 主机 API 冷启动较慢：重启后先等 systemd active，再轮询最多约 90s
sleep 3
for i in $(seq 1 30); do
  if systemctl is-active --quiet xhs-cloud-api.service 2>/dev/null; then
    CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
    CODE="${CODE//$'\n'/}"
    if [ "$CODE" = "200" ]; then
      ok "API $HEALTH_URL HTTP 200 (${i} 次尝试)"
      HEALTH_OK=1
      break
    fi
  fi
  sleep 3
done
if [ "$HEALTH_OK" != 1 ]; then
  warn "API 未响应（已等待约 90s），请 systemctl status xhs-cloud-api"
  sudo systemctl status xhs-cloud-api --no-pager -l 2>/dev/null | tail -12 || true
fi

if command -v nginx &>/dev/null && [ -f /etc/nginx/sites-enabled/xhs-monitor.conf ]; then
  sudo nginx -t && sudo systemctl reload nginx && ok "nginx reload"
fi

ok "更新完成"
echo ""
