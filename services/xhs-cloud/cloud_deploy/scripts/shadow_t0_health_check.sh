#!/bin/bash
# T0 出口验收：Shadow D1-D7 journal + LLM 类目数 + timer 状态
# 用法: bash /opt/xhs-cloud/cloud_deploy/scripts/shadow_t0_health_check.sh
set -euo pipefail

ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
ENV_FILE="${XHS_ENV_FILE:-$ROOT/.env}"
DAYS="${SHADOW_HEALTH_DAYS:-7}"
MIN_CATS="${SHADOW_MIN_CATEGORIES:-4}"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok() { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; FAIL=1; }

FAIL=0
echo ""
echo "  ================================================"
echo "  |  T0 Shadow 健康检查 (D1-D${DAYS})            |"
echo "  ================================================"

# --- timer 状态 ---
for unit in xhs-insight-report.timer xhs-aggregate-metrics.timer; do
  if systemctl is-enabled "$unit" &>/dev/null; then
    ok "$unit enabled"
    NEXT=$(systemctl list-timers "$unit" --no-pager 2>/dev/null | awk 'NR==2{print $1, $2, $3}' || true)
    [[ -n "$NEXT" ]] && ok "  next: $NEXT"
  else
    warn "$unit 未 enable"
  fi
done

# --- journal ERROR（近 N 天）---
if systemctl list-units --type=service --all 2>/dev/null | grep -q xhs-insight-report.service; then
  ERRS=$(journalctl -u xhs-insight-report.service --since "${DAYS} days ago" --no-pager 2>/dev/null | grep -ciE 'error|traceback|failed' || true)
  if [[ "${ERRS:-0}" -eq 0 ]]; then
    ok "insight-report journal 近 ${DAYS} 天无 ERROR"
  else
    fail "insight-report journal 近 ${DAYS} 天 ERROR 行数: $ERRS"
    journalctl -u xhs-insight-report.service --since "${DAYS} days ago" --no-pager 2>/dev/null | grep -iE 'error|traceback|failed' | tail -5 || true
  fi
else
  warn "xhs-insight-report.service 未安装"
fi

# --- pipeline 输出：LLM on 时至少 1 天 >= MIN_CATS ---
SHADOW_DIR="$ROOT/data/insight_shadow"
if [[ -d "$SHADOW_DIR" ]]; then
  BEST=0
  BEST_DAY=""
  for summary in "$SHADOW_DIR"/insight_*/pipeline_summary.json; do
    [[ -f "$summary" ]] || continue
    N=$(python3 -c "import json; d=json.load(open('$summary')); print(d.get('categories',0))" 2>/dev/null || echo 0)
    if [[ "$N" -gt "$BEST" ]]; then
      BEST=$N
      BEST_DAY=$(basename "$(dirname "$summary")")
    fi
  done
  if [[ "$BEST" -ge "$MIN_CATS" ]]; then
    ok "Shadow 最佳日 $BEST_DAY 类目数=$BEST (>= $MIN_CATS)"
  else
    fail "Shadow 最佳类目数=$BEST (< $MIN_CATS)，请检查 LLM/PG 数据"
  fi
else
  warn "无 $SHADOW_DIR"
fi

# --- timer 7 天成功率（近 N 次触发）---
if command -v journalctl &>/dev/null; then
  RUNS=$(journalctl -u xhs-insight-report.service --since "${DAYS} days ago" --no-pager 2>/dev/null | grep -c 'Finished xhs-insight-report.service' || true)
  FAILS=$(journalctl -u xhs-insight-report.service --since "${DAYS} days ago" --no-pager 2>/dev/null | grep -c 'Failed with result' || true)
  if [[ "${RUNS:-0}" -gt 0 && "${FAILS:-0}" -eq 0 ]]; then
    ok "insight timer 近 ${DAYS} 天成功 ${RUNS} 次，失败 0"
  elif [[ "${RUNS:-0}" -eq 0 ]]; then
    warn "近 ${DAYS} 天无 insight timer 完成记录（Shadow 未满 ${DAYS} 天属正常）"
  else
    fail "insight timer 失败 ${FAILS} 次 / 成功 ${RUNS} 次"
  fi
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  ok "T0 健康检查 PASS"
  exit 0
fi
fail "T0 健康检查 FAIL — 见上方明细"
exit 1
