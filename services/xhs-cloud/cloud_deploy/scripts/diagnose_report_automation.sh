#!/bin/bash
# 选品报告自动化诊断：timer / daemon / 流水线脚本 / 数据目录
# 用法: bash /opt/xhs-cloud/cloud_deploy/scripts/diagnose_report_automation.sh
set -euo pipefail

ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
ENV_FILE="${XHS_ENV_FILE:-$ROOT/.env}"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok() { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }

echo ""
echo "========== 选品报告自动化诊断 =========="
echo "时间: $(date '+%Y-%m-%d %H:%M:%S %z')"
echo ""

[[ -f "$ENV_FILE" ]] || { fail "缺少 $ENV_FILE"; exit 1; }
set -a && source "$ENV_FILE" && set +a
export PYTHONPATH="$ROOT"

echo "[1] 关键脚本是否存在"
for f in \
  cloud_deploy/scripts/run_full_pipeline.py \
  cloud_deploy/scripts/cloud_gen_report.py \
  cloud_deploy/scripts/run_daily_pipeline.py \
  cloud_deploy/reporting/pg_reader.py \
  cloud_deploy/reporting/data_js_builder.py \
  cloud_deploy/daemon/cloud_daemon.py; do
  if [[ -f "$ROOT/$f" ]]; then ok "$f"; else fail "缺少 $ROOT/$f — 请 git pull + rsync"; fi
done

echo ""
echo "[2] systemd 单元"
for u in xhs-cloud-api xhs-daemon xhs-daily-report xhs-ingest-report; do
  if systemctl list-unit-files "${u}.service" &>/dev/null; then
    st=$(systemctl is-active "${u}.service" 2>/dev/null || echo inactive)
    en=$(systemctl is-enabled "${u}.service" 2>/dev/null || echo disabled)
    echo "  ${u}.service  active=$st  enabled=$en"
  else
    warn "未安装 ${u}.service"
  fi
done

echo ""
echo "[3] 定时器（下次触发时间）"
systemctl list-timers --no-pager 'xhs-*' 2>/dev/null || warn "无 xhs-* timer"

echo ""
echo "[4] 今日 timer / 报告服务日志（最近 30 行）"
for u in xhs-daily-report xhs-ingest-report xhs-daemon; do
  echo -e "  ${CYAN}--- journalctl -u $u ---${NC}"
  sudo journalctl -u "$u" --since today -n 30 --no-pager 2>/dev/null | tail -15 || echo "  (无日志)"
done

echo ""
echo "[5] 数据目录"
IN="${XHS_REPORT_INCOMING_DIR:-$ROOT/data/incoming}"
AR="${XHS_REPORT_ARCHIVE_DIR:-$ROOT/data/report_archives}"
echo "  incoming: $IN"
ls -lt "$IN" 2>/dev/null | head -6 || warn "incoming 为空或不存在"
echo "  archives: $AR"
ls -lt "$AR" 2>/dev/null | head -6 || warn "archives 为空或不存在"

echo ""
echo "[6] PG 快查（需 XHS_DATABASE_URL）"
if [[ "${XHS_DATABASE_URL:-}" == postgres* ]]; then
  sudo -u postgres psql "$XHS_DATABASE_URL" -t -c \
    "SELECT COUNT(*) AS report_daily_items FROM xhs_monitor.report_daily_items;" 2>/dev/null | xargs echo "  report_daily_items:" || warn "PG 查询失败"
  sudo -u postgres psql "$XHS_DATABASE_URL" -t -c \
    "SELECT archive_type, report_date, created_at::date FROM xhs_monitor.report_archives ORDER BY created_at DESC LIMIT 3;" 2>/dev/null || true
else
  warn "未配置 postgres XHS_DATABASE_URL"
fi

echo ""
echo "[7] API 会员报告列表"
curl -sf "http://127.0.0.1:${XHS_CLOUD_PORT:-8080}/api/v1/health" >/dev/null && ok "API health" || fail "API 未响应"

echo ""
echo "========== 模式判断 =========="
if systemctl is-enabled xhs-ingest-report.timer &>/dev/null; then
  echo "  当前倾向: 混合模式（本地 gen_report → incoming → 20:00 ingest）"
  echo "  若云主机空: 检查本地是否已推送到 $IN"
elif systemctl is-enabled xhs-daily-report.timer &>/dev/null; then
  echo "  当前倾向: 纯线上模式（daemon 扫池 → 17:00 PG 生成日报）"
  echo "  若云主机空: 检查 xhs-daemon 是否在跑、PG 是否有 sold/premium 数据"
else
  warn "未启用 xhs-ingest-report 或 xhs-daily-report timer"
fi

echo ""
echo "========== 手动补救 =========="
echo "  纯线上立即生成今日报告:"
echo "    cd $ROOT && ./venv/bin/python cloud_deploy/scripts/run_full_pipeline.py full"
echo "  混合模式（incoming 已有 全量MMDD）:"
echo "    cd $ROOT && ./venv/bin/python cloud_deploy/scripts/run_daily_pipeline.py"
echo "  重装 timer + daemon:"
echo "    bash $ROOT/cloud_deploy/scripts/ensure_report_timers.sh"
echo "    bash $ROOT/cloud_deploy/scripts/generate_today_report.sh"
echo "    bash $ROOT/cloud_deploy/scripts/enable_pure_online.sh"
echo ""
