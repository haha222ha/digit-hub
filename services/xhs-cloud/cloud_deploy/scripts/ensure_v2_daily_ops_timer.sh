#!/bin/bash
# 启用 V2 每日运维 timer（T0 journal，无需手跑 launch_daily_ops.sh）
# 用法: bash /opt/xhs-cloud/cloud_deploy/scripts/ensure_v2_daily_ops_timer.sh
set -euo pipefail

ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
ENV_FILE="${XHS_ENV_FILE:-$ROOT/.env}"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
log() { echo -e "  ${CYAN}[*]${NC} $1"; }
ok() { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }

[[ -f "$ENV_FILE" ]] || { warn "缺少 $ENV_FILE"; exit 1; }
set -a && source "$ENV_FILE" && set +a

if [[ "${XHS_V2_DAILY_OPS:-1}" == "0" ]]; then
  warn "XHS_V2_DAILY_OPS=0，跳过 daily ops timer"
  exit 0
fi

chmod +x "$ROOT/cloud_deploy/scripts/launch_daily_ops.sh" 2>/dev/null || true

log "安装 xhs-v2-daily-ops systemd 单元"
sudo cp "$ROOT/cloud_deploy/systemd/xhs-v2-daily-ops.service" /etc/systemd/system/
sudo cp "$ROOT/cloud_deploy/systemd/xhs-v2-daily-ops.timer" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable xhs-v2-daily-ops.timer
sudo systemctl start xhs-v2-daily-ops.timer
ok "已启用 xhs-v2-daily-ops.timer（每天 08:00 自动跑 T0 journal）"

log "下次触发:"
systemctl list-timers xhs-v2-daily-ops.timer --no-pager || true
