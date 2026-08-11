#!/bin/bash
# 启用 V2 情报 Shadow 预生成 timer（不影响 Legacy xhs-daily-report.timer）
# 用法: bash /opt/xhs-cloud/cloud_deploy/scripts/ensure_insight_report_timer.sh
set -euo pipefail

ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
ENV_FILE="${XHS_ENV_FILE:-$ROOT/.env}"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
log() { echo -e "  ${CYAN}[*]${NC} $1"; }
ok() { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }

[[ -f "$ENV_FILE" ]] || { warn "缺少 $ENV_FILE"; exit 1; }
set -a && source "$ENV_FILE" && set +a

if [[ "${XHS_INSIGHT_SHADOW_TIMER:-0}" != "1" ]]; then
  warn "XHS_INSIGHT_SHADOW_TIMER!=1，跳过（Shadow 阶段请显式开启）"
  exit 0
fi

if [[ "${XHS_DATABASE_URL:-}" != postgres* ]]; then
  warn "未配置 PG，跳过 insight timer"
  exit 0
fi

chmod +x "$ROOT/cloud_deploy/scripts/run_insight_report_shadow.sh" 2>/dev/null || true

log "安装 xhs-insight-report systemd 单元"
sudo cp "$ROOT/cloud_deploy/systemd/xhs-insight-report.service" /etc/systemd/system/
sudo cp "$ROOT/cloud_deploy/systemd/xhs-insight-report.timer" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable xhs-insight-report.timer
sudo systemctl start xhs-insight-report.timer
ok "已启用 xhs-insight-report.timer（16:30 Shadow 预生成；有成功记录则跳过）"

log "下次触发:"
systemctl list-timers xhs-insight-report.timer --no-pager || true
