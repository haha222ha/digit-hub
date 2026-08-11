#!/bin/bash
# 启用 daily_category_metrics 独立聚合 timer（02:00，早于 insight shadow 02:30）
set -euo pipefail

ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
ENV_FILE="${XHS_ENV_FILE:-$ROOT/.env}"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
log() { echo -e "  ${CYAN}[*]${NC} $1"; }
ok() { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }

[[ -f "$ENV_FILE" ]] || { warn "缺少 $ENV_FILE"; exit 0; }
set -a && source "$ENV_FILE" && set +a

if [[ "${XHS_DATABASE_URL:-}" != postgres* ]]; then
  warn "未配置 PG，跳过 aggregate timer"
  exit 0
fi

if [[ "${XHS_AGGREGATE_METRICS_TIMER:-1}" == "0" ]]; then
  warn "XHS_AGGREGATE_METRICS_TIMER=0，跳过"
  exit 0
fi

log "安装 xhs-aggregate-metrics systemd 单元"
sudo cp "$ROOT/cloud_deploy/systemd/xhs-aggregate-metrics.service" /etc/systemd/system/
sudo cp "$ROOT/cloud_deploy/systemd/xhs-aggregate-metrics.timer" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable xhs-aggregate-metrics.timer
sudo systemctl start xhs-aggregate-metrics.timer
ok "已启用 xhs-aggregate-metrics.timer（02:00）"
systemctl list-timers xhs-aggregate-metrics.timer --no-pager || true
