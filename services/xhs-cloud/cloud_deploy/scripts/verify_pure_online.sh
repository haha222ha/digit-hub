#!/bin/bash
# 验证爬虫上传 + ⑥补缺挂机 + 报告 timer（git pull 后在服务器执行）
#   bash /opt/xhs-cloud/cloud_deploy/scripts/verify_pure_online.sh
set -euo pipefail

ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
ENV_FILE="${XHS_ENV_FILE:-$ROOT/.env}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
ok() { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; FAIL=1; }

FAIL=0
echo ""
echo "  ========================================"
echo "  |   选品云 · 纯线上验收               |"
echo "  ========================================"
echo ""

[[ -f "$ENV_FILE" ]] || { fail "缺少 $ENV_FILE"; exit 1; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
export PYTHONPATH="$ROOT"

CRAWLER="${XHS_CRAWLER_ROOT:-/opt/xhs/crawler}"
echo -e "  ${CYAN}[爬虫目录]${NC} $CRAWLER"
if [[ -d "$CRAWLER" ]]; then
  ok "目录存在"
else
  fail "目录不存在 — 请上传爬虫到 $CRAWLER"
fi

for f in xhs_full_sold_daemon.py xhs_full_sold_fetch.py xhs_full_sold_queue_db.py xhs_web_sold_sync_write.py shop_collectors.py; do
  if [[ -f "$CRAWLER/$f" ]]; then
    ok "$f"
  else
    fail "缺少 $f"
  fi
done

echo ""
echo -e "  ${CYAN}[shop_collectors 导入]${NC}"
SC=$("$ROOT/venv/bin/python" - <<PY 2>&1 || true
import os, sys
crawler = os.environ.get("XHS_CRAWLER_ROOT", "${CRAWLER}")
sys.path.insert(0, crawler)
try:
    from shop_collectors import _api_check_risk_control, HAS_CURL_CFFI
    print("OK", "curl_cffi" if HAS_CURL_CFFI else "requests-only")
except Exception as e:
    print("FAIL", e)
PY
)
if [[ "$SC" == OK* ]]; then
  ok "shop_collectors OK (${SC#OK })"
else
  fail "shop_collectors 不可用: $SC"
fi

echo ""
echo -e "  ${CYAN}[Python 模块加载]${NC}"
MOD=$("$ROOT/venv/bin/python" - <<PY 2>&1 || true
import os, sys
crawler = os.environ.get("XHS_CRAWLER_ROOT", "${CRAWLER}")
sys.path.insert(0, crawler)
sys.path.insert(0, "${ROOT}")
try:
    from xhs_full_sold_daemon import FullSoldSyncDaemon
    from xhs_full_sold_fetch import fetch_sold_detail, ENGINE_CHAIN
    print("OK", ENGINE_CHAIN)
except Exception as e:
    print("FAIL", e)
PY
)
if [[ "$MOD" == OK* ]]; then
  ok "⑥补缺挂机模块 OK 引擎=${MOD#OK }"
else
  fail "模块加载失败: $MOD"
fi

echo ""
echo -e "  ${CYAN}[xhs-daemon 服务]${NC}"
if systemctl is-active --quiet xhs-daemon 2>/dev/null; then
  ok "xhs-daemon active (running)"
else
  fail "xhs-daemon 未运行 — systemctl status xhs-daemon"
fi
RECENT=$(sudo journalctl -u xhs-daemon -n 8 --no-pager 2>/dev/null | tail -5 || true)
if echo "$RECENT" | grep -qE "FULL-SOLD-DAEMON|xhs-daemon|补缺"; then
  ok "近期日志有 daemon 输出"
  echo "$RECENT" | sed 's/^/    /'
else
  warn "近期日志无 daemon 活动（可能刚启动或异常）"
  echo "$RECENT" | sed 's/^/    /'
fi

echo ""
echo -e "  ${CYAN}[PG 监控池 / 补缺队列]${NC}"
PG_OUT=$("$ROOT/venv/bin/python" "$ROOT/cloud_deploy/scripts/verify_pg_pool.py" 2>&1) || PG_RC=$?
PG_RC=${PG_RC:-0}
if [[ "${PG_RC:-0}" -ne 0 ]] || [[ "$PG_OUT" == FAIL* ]]; then
  fail "PG 查询失败${PG_OUT:+: $PG_OUT}"
else
  ok "$PG_OUT"
  if echo "$PG_OUT" | grep -q "monitor_goods=0"; then
    warn "monitor_goods 为空，需先 import_monitor_pool"
  fi
  if echo "$PG_OUT" | grep -q "pending=0" && ! echo "$PG_OUT" | grep -q "monitor_goods=0"; then
    warn "队列 pending=0 — 若 daemon 空转，请确认 seed_batch_size=0 并已清空 full_sold_queue"
  fi
fi

echo ""
echo -e "  ${CYAN}[报告 timer 计划]${NC}"
for t in xhs-daily-report xhs-weekly-report xhs-monthly-report; do
  if systemctl is-enabled "${t}.timer" &>/dev/null; then
    NEXT=$(systemctl list-timers "${t}.timer" --no-pager 2>/dev/null | awk 'NR==2{print $1,$2,$3}')
    CAL=$(grep -h OnCalendar /etc/systemd/system/${t}.timer 2>/dev/null | head -1 || echo "?")
    ok "${t}.timer enabled 下次≈${NEXT:-?}  (${CAL})"
  else
    warn "${t}.timer 未 enable — bash enable_pure_online.sh"
  fi
done

PORT="${XHS_CLOUD_PORT:-8080}"
if curl -sf "http://127.0.0.1:${PORT}/api/v1/health" >/dev/null; then
  ok "xhs-cloud-api :${PORT} health OK"
else
  fail "xhs-cloud-api 未响应"
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo -e "  ${GREEN}验收通过${NC}"
else
  echo -e "  ${RED}存在 ${FAIL} 项问题，请按上方提示修复${NC}"
  exit 1
fi
echo ""
