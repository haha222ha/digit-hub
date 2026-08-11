#!/bin/bash
# V2 全链路一键部署 + 验收（云主机）
#
# 用法（推荐 — 即使 /opt/xhs-cloud 尚未同步也可用）:
#   bash /opt/vuemonitor/xhs-cloud/cloud_deploy/scripts/v2-oneclick-deploy.sh
#
# 或同步后:
#   bash /opt/xhs-cloud/cloud_deploy/scripts/v2-oneclick-deploy.sh
#   export XHS_MEMBER_TOKEN='eyJ...'   # 或 XHS_SMOKE_USER + XHS_SMOKE_PASS
#   export XHS_SMOKE_EXPECT=legacy_dual
#   bash /opt/xhs-cloud/cloud_deploy/scripts/v2-oneclick-deploy.sh
#
# 环境变量:
#   VM_REPO=/opt/vuemonitor          git 克隆目录
#   XHS_ROOT=/opt/xhs-cloud          运行目录
#   BRANCH=main
#   SKIP_MIGRATE=1                   跳过 PG 迁移
#   SKIP_SMOKE=1                     跳过 HTTP 冒烟
#   SKIP_AGGREGATE=1                 跳过 daily_category_metrics 预聚合
#   RUN_SHADOW_NOW=1                 部署后立即跑当日 Shadow（可选）
#
set -euo pipefail

VM_REPO="${VM_REPO:-/opt/vuemonitor}"
XHS_ROOT="${XHS_ROOT:-/opt/xhs-cloud}"
BRANCH="${BRANCH:-main}"
PORT="${XHS_CLOUD_PORT:-8080}"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()  { echo -e "  ${GREEN}✓${NC} $1"; }
warn(){ echo -e "  ${YELLOW}!${NC} $1"; }
fail(){ echo -e "  ${RED}✗${NC} $1"; exit 1; }
step(){ echo -e "\n${CYAN}==>${NC} $1"; }

echo ""
echo "  ================================================"
echo "  |  V2 全链路一键部署 (pull → migrate → smoke)  |"
echo "  ================================================"

# --- 1. PULL ---
step "1/6 git pull @ ${VM_REPO}"
cd "$VM_REPO"
git fetch origin "$BRANCH"
git reset --hard "origin/${BRANCH}"
COMMIT=$(git log -1 --oneline)
ok "HEAD ${COMMIT}"

# --- 2. SYNC ---
step "2/6 rsync xhs-cloud → ${XHS_ROOT}"
mkdir -p "$XHS_ROOT"
rsync -a "${VM_REPO}/xhs-cloud/" "${XHS_ROOT}/" \
  --delete \
  --exclude data \
  --exclude venv \
  --exclude .env
ok "cloud_deploy + assets 已同步"

# --- 3. MIGRATE ---
if [[ "${SKIP_MIGRATE:-}" != "1" ]]; then
  step "3/6 PG 迁移 (08 + 09)"
  ENV_FILE="${XHS_ENV_FILE:-${XHS_ROOT}/.env}"
  if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    set -a && source "$ENV_FILE" && set +a
  fi
  if [[ "${XHS_DATABASE_URL:-}" == postgres* ]]; then
    for sql in 08_insight_v2_tables.sql 09_retention_pg_schema.sql 11_insight_workflow_schema.sql 12_member_broadcast.sql; do
      f="${XHS_ROOT}/cloud_deploy/database/${sql}"
      if [[ -f "$f" ]]; then
        psql "$XHS_DATABASE_URL" -f "$f" && ok "applied ${sql}" || warn "${sql} 有告警（可能已存在）"
      fi
    done
    PGV="${XHS_ROOT}/cloud_deploy/database/10_pgvector_embeddings.sql"
    if [[ -f "$PGV" ]]; then
      if psql "$XHS_DATABASE_URL" -tAc "SELECT 1 FROM pg_extension WHERE extname='vector'" 2>/dev/null | grep -q 1; then
        psql "$XHS_DATABASE_URL" -f "$PGV" && ok "applied 10_pgvector_embeddings.sql" || warn "pgvector 迁移告警"
      else
        warn "未安装 pgvector 扩展，跳过 10_pgvector_embeddings.sql（T2 可选）"
      fi
    fi
    psql "$XHS_DATABASE_URL" -c "SET search_path TO xhs_monitor, public; SELECT tablename FROM pg_tables WHERE schemaname='xhs_monitor' AND tablename IN ('insight_daily_usage','daily_category_metrics','user_behavior');" 2>/dev/null | head -10 || true
  else
    warn "未配置 XHS_DATABASE_URL，跳过 PG 迁移"
  fi
else
  step "3/6 PG 迁移 — 已跳过 (SKIP_MIGRATE=1)"
fi

# --- 4. DEPLOY ---
step "4/6 host-update（依赖 / venv / systemd / API 重启）"
cd "$XHS_ROOT"
bash cloud_deploy/scripts/host-update.sh

NGINX_SCRIPT="${XHS_ROOT}/cloud_deploy/scripts/ensure_nginx_insight_limits.sh"
if [[ -f "$NGINX_SCRIPT" ]]; then
  bash "$NGINX_SCRIPT" && ok "nginx insight 限流" || warn "nginx 限流跳过（见 ensure_nginx_insight_limits.sh）"
fi

# --- 5. VERIFY ---
step "5/6 静态资源 + 健康检查"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/v1/health" || echo "000")
[[ "$CODE" == "200" ]] && ok "health HTTP 200" || fail "health HTTP ${CODE}"

JS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/assets/member_insight.js" || echo "000")
[[ "$JS_CODE" == "200" ]] && ok "member_insight.js HTTP 200" || fail "member_insight.js HTTP ${JS_CODE}"

if grep -q "loadHealthScore" "${XHS_ROOT}/cloud_deploy/assets/member_insight.js" 2>/dev/null; then
  ok "member_insight.js 含 loadHealthScore"
else
  warn "member_insight.js 可能为旧缓存版本"
fi

if [[ "${SKIP_AGGREGATE:-}" != "1" && "${XHS_DATABASE_URL:-}" == postgres* ]]; then
  PY="${XHS_ROOT}/venv/bin/python"
  AGG="${XHS_ROOT}/cloud_deploy/scripts/aggregate_daily_category_metrics.py"
  if [[ -x "$PY" && -f "$AGG" ]]; then
    TODAY=$(date +%F)
    (cd "$XHS_ROOT" && PYTHONPATH="$XHS_ROOT" "$PY" "$AGG" "$TODAY") && ok "daily_category_metrics ${TODAY}" || warn "预聚合跳过（可能无当日 PG 数据）"
  fi
fi

if [[ "${RUN_SHADOW_NOW:-}" == "1" ]]; then
  SHADOW="${XHS_ROOT}/cloud_deploy/scripts/run_insight_report_shadow.sh"
  if [[ -f "$SHADOW" ]]; then
    bash "$SHADOW" "$(date +%F)" && ok "Shadow 手动试跑完成" || warn "Shadow 试跑失败"
  fi
fi

# --- 6. SMOKE ---
step "6/6 冒烟验收"
if [[ "${SKIP_SMOKE:-}" == "1" ]]; then
  warn "SKIP_SMOKE=1，跳过 insight_shadow_smoke"
elif [[ -n "${XHS_MEMBER_TOKEN:-}" || ( -n "${XHS_SMOKE_USER:-}" && -n "${XHS_SMOKE_PASS:-}" ) ]]; then
  export XHS_CLOUD_ROOT="$XHS_ROOT"
  export XHS_SMOKE_BASE="${XHS_SMOKE_BASE:-http://127.0.0.1:${PORT}}"
  export XHS_SMOKE_EXPECT="${XHS_SMOKE_EXPECT:-legacy_dual}"
  bash "${XHS_ROOT}/cloud_deploy/scripts/insight_shadow_smoke.sh" && ok "smoke PASS" || fail "smoke FAIL"
else
  warn "未设置 XHS_MEMBER_TOKEN 或 XHS_SMOKE_USER/PASS，跳过 smoke"
  echo "    export XHS_MEMBER_TOKEN='...' && bash ${XHS_ROOT}/cloud_deploy/scripts/insight_shadow_smoke.sh"
fi

HEALTH_SCRIPT="${XHS_ROOT}/cloud_deploy/scripts/shadow_t0_health_check.sh"
if [[ -f "$HEALTH_SCRIPT" && "${SKIP_T0_HEALTH:-}" != "1" ]]; then
  chmod +x "$HEALTH_SCRIPT" 2>/dev/null || true
  bash "$HEALTH_SCRIPT" && ok "T0 health PASS" || warn "T0 health 未通过（Shadow 未满 7 天时可忽略）"
fi

echo ""
echo "  ================================================"
ok "V2 一键部署完成"
echo ""
echo "  浏览器: https://monitor.xhs365.cn/member  → Ctrl+Shift+R → AI 选品情报"
echo "  待办跟踪: projects/ai-market-intelligence-v2/docs/28-MASTER-TODO-TRACKER.md"
echo "  全链路手册: projects/ai-market-intelligence-v2/docs/29-V2-ONECLICK-DEPLOY-RUNBOOK.md"
echo ""
