#!/bin/bash
# 启用 AI 顾问每日健康检查 timer（08:15）
set -euo pipefail

ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
log() { echo -e "  ${CYAN}[*]${NC} $1"; }
ok() { echo -e "  ${GREEN}✓${NC} $1"; }

log "安装 xhs-advisor-health systemd 单元"
sudo cp "$ROOT/cloud_deploy/systemd/xhs-advisor-health.service" /etc/systemd/system/
sudo cp "$ROOT/cloud_deploy/systemd/xhs-advisor-health.timer" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable xhs-advisor-health.timer
sudo systemctl start xhs-advisor-health.timer
ok "已启用 xhs-advisor-health.timer（每天 08:15）"
systemctl list-timers xhs-advisor-health.timer --no-pager || true
