#!/bin/bash
# 启用 AI 顾问 context 拾取 timer（需本地 ingest 上传 context_*.ready）
# 用法: bash /opt/xhs-cloud/cloud_deploy/scripts/ensure_advisor_generate_timer.sh
set -euo pipefail

ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
ENV_FILE="${XHS_ENV_FILE:-$ROOT/.env}"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
log() { echo -e "  ${CYAN}[*]${NC} $1"; }
ok() { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }

[[ -f "$ENV_FILE" ]] || { warn "缺少 $ENV_FILE"; exit 0; }
set -a && source "$ENV_FILE" && set +a

if [[ "${XHS_ADVISOR_GENERATE_TIMER:-0}" != "1" ]]; then
  warn "XHS_ADVISOR_GENERATE_TIMER!=1，跳过 advisor generate timer"
  exit 0
fi

log "安装 xhs-advisor-generate systemd 单元"
sudo cp "$ROOT/cloud_deploy/systemd/xhs-advisor-generate.service" /etc/systemd/system/
sudo cp "$ROOT/cloud_deploy/systemd/xhs-advisor-generate.timer" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable xhs-advisor-generate.timer
sudo systemctl start xhs-advisor-generate.timer
ok "已启用 xhs-advisor-generate.timer（每 5 分钟拾取 context）"

log "下次触发:"
systemctl list-timers xhs-advisor-generate.timer --no-pager || true
