#!/bin/bash
# 非交互：daemon 已启用时自动打开日/周/月报 timer（修复「timer 未 enable」）
# 用法: bash /opt/xhs-cloud/cloud_deploy/scripts/ensure_report_timers.sh
set -euo pipefail

ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
ENV_FILE="${XHS_ENV_FILE:-$ROOT/.env}"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
log() { echo -e "  ${CYAN}[*]${NC} $1"; }
ok() { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }

[[ -f "$ENV_FILE" ]] || { warn "缺少 $ENV_FILE"; exit 1; }
set -a && source "$ENV_FILE" && set +a

if [[ "${XHS_DATABASE_URL:-}" != postgres* ]]; then
  warn "未配置 PG，跳过纯线上 timer"
  exit 0
fi

log "同步 systemd 单元"
sudo cp "$ROOT/cloud_deploy/systemd/"*.service /etc/systemd/system/ 2>/dev/null || true
sudo cp "$ROOT/cloud_deploy/systemd/"*.timer /etc/systemd/system/ 2>/dev/null || true
sudo systemctl daemon-reload

# 纯线上：关 ingest，开 daily/weekly/monthly
if systemctl is-enabled xhs-daemon.service &>/dev/null || [[ "${XHS_AUTO_ENABLE_REPORT_TIMERS:-1}" == "1" ]]; then
  sudo systemctl disable --now xhs-ingest-report.timer 2>/dev/null || true
  for u in xhs-daemon xhs-cloud-api; do
    sudo systemctl enable "$u" 2>/dev/null || true
  done
  for t in xhs-daemon-watchdog xhs-daily-report xhs-weekly-report xhs-monthly-report; do
    sudo systemctl enable "$t.timer" 2>/dev/null || true
    sudo systemctl start "$t.timer" 2>/dev/null || true
  done
  ok "已启用 xhs-daily-report / weekly / monthly / watchdog timer"
else
  warn "xhs-daemon 未 enable，仅同步 unit 文件"
fi

if [[ "${XHS_SNAPSHOT_RETENTION_DAYS:-0}" =~ ^[1-9][0-9]*$ ]] \
   && [[ "${XHS_ENABLE_SNAPSHOT_PRUNE:-auto}" != "0" ]]; then
  sudo systemctl enable xhs-prune-snapshots.timer 2>/dev/null || true
  sudo systemctl start xhs-prune-snapshots.timer 2>/dev/null || true
fi

echo ""
systemctl list-timers --no-pager 'xhs-*' 2>/dev/null || true
ok "timer 检查完成"
