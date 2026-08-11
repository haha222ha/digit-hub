#!/bin/bash
# 立即生成今日选品日报并发布到会员 archives（纯线上 PG → zip）
# 用法: bash /opt/xhs-cloud/cloud_deploy/scripts/generate_today_report.sh
set -euo pipefail

ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
ENV_FILE="${XHS_ENV_FILE:-$ROOT/.env}"
LOG_DIR="${XHS_DATA_DIR:-$ROOT/data}/logs"
mkdir -p "$LOG_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)
LOG="$LOG_DIR/generate_report_${STAMP}.log"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
log() { echo -e "${CYAN}[*]${NC} $1" | tee -a "$LOG"; }
ok() { echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG"; }
warn() { echo -e "${YELLOW}!${NC} $1" | tee -a "$LOG"; }
fail() { echo -e "${RED}✗${NC} $1" | tee -a "$LOG"; exit 1; }

[[ -f "$ENV_FILE" ]] || fail "缺少 $ENV_FILE"
set -a && source "$ENV_FILE" && set +a
export PYTHONPATH="$ROOT"

TODAY=$(date +%Y-%m-%d)
MMDD=$(date +%m%d)
AR="${XHS_REPORT_ARCHIVE_DIR:-$ROOT/data/report_archives}"

log "生成今日报告 $TODAY (全量${MMDD}) ..."
log "日志: $LOG"

if [[ "${XHS_DATABASE_URL:-}" != postgres* ]]; then
  fail "需要 XHS_DATABASE_URL=postgresql://..."
fi

cd "$ROOT"
if ! ./venv/bin/python cloud_deploy/scripts/run_full_pipeline.py full --date "$TODAY" 2>&1 | tee -a "$LOG"; then
  warn "full 失败，尝试 generate 模式..."
  ./venv/bin/python cloud_deploy/scripts/run_full_pipeline.py generate --date "$TODAY" 2>&1 | tee -a "$LOG" \
    || fail "报告生成失败，见 $LOG"
fi

# 检查 archives 是否出现今日 zip
LATEST=$(ls -t "$AR"/全量*.zip 2>/dev/null | head -1 || true)
if [[ -z "$LATEST" ]]; then
  fail "archives 无 zip，见 $LOG"
fi
ok "最新归档: $LATEST ($(du -h "$LATEST" | awk '{print $1}'))"

# 尝试 PG 登记
if command -v psql &>/dev/null && [[ -n "${XHS_DATABASE_URL:-}" ]]; then
  psql "$XHS_DATABASE_URL" -t -c \
    "SELECT archive_type, report_date, file_name, created_at::text
     FROM xhs_monitor.report_archives
     WHERE report_date='$TODAY' OR file_name LIKE '%${MMDD}%'
     ORDER BY created_at DESC LIMIT 3;" 2>/dev/null | tee -a "$LOG" || true
fi

ok "今日报告已生成。会员页: https://monitor.xhs365.cn/member"
echo "完整日志: $LOG"
