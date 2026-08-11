#!/bin/bash
# pgvector 扩展 + category_embeddings 表 + 首次嵌入批处理
# 用法: bash /opt/xhs-cloud/cloud_deploy/scripts/ensure_pgvector.sh
set -euo pipefail

ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
ENV_FILE="${XHS_ENV_FILE:-$ROOT/.env}"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log() { echo -e "  ${CYAN}[*]${NC} $1"; }
ok() { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; exit 1; }

[[ -f "$ENV_FILE" ]] || fail "缺少 $ENV_FILE"
set -a && source "$ENV_FILE" && set +a
[[ "${XHS_DATABASE_URL:-}" == postgres* ]] || fail "需要 XHS_DATABASE_URL (PostgreSQL)"

PGV="$ROOT/cloud_deploy/database/10_pgvector_embeddings.sql"
[[ -f "$PGV" ]] || fail "缺少 $PGV"

_db_name_from_url() {
  local url="$1"
  url="${url#postgresql://}"
  url="${url#postgres://}"
  url="${url#*@}"
  url="${url#*/}"
  url="${url%%\?*}"
  url="${url%%/*}"
  echo "$url"
}

_vector_installed() {
  psql "$XHS_DATABASE_URL" -tAc "SELECT 1 FROM pg_extension WHERE extname = 'vector'" 2>/dev/null | grep -q 1
}

_suggest_pgvector_apt() {
  local major=""
  if command -v psql &>/dev/null; then
    major="$(psql "$XHS_DATABASE_URL" -tAc "SHOW server_version" 2>/dev/null | grep -oE '[0-9]+' | head -1 || true)"
  fi
  if [[ -z "$major" ]] && command -v postgres &>/dev/null; then
    major="$(postgres --version 2>/dev/null | grep -oE '[0-9]+' | head -1 || true)"
  fi
  if [[ -n "$major" ]]; then
    echo "sudo apt-get update && sudo apt-get install -y postgresql-${major}-pgvector"
  else
    echo "sudo apt-get install -y postgresql-14-pgvector   # 按 psql --version 改主版本号"
  fi
}

_ensure_vector_extension() {
  if _vector_installed; then
    ok "pgvector 扩展已就绪"
    return 0
  fi

  log "CREATE EXTENSION vector（应用账号）"
  if psql "$XHS_DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null; then
    ok "pgvector 扩展已就绪（应用账号）"
    return 0
  fi

  local db_name
  db_name="$(_db_name_from_url "$XHS_DATABASE_URL")"
  [[ -n "$db_name" ]] || db_name="vuemonitor"

  if command -v sudo &>/dev/null && id postgres &>/dev/null 2>&1; then
    log "尝试 postgres 超级用户: sudo -u postgres psql -d ${db_name}"
    if sudo -u postgres psql -d "$db_name" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null; then
      if _vector_installed; then
        ok "pgvector 扩展已就绪（postgres 超级用户）"
        return 0
      fi
    fi
  fi

  warn "CREATE EXTENSION 失败 — 常见原因：未安装 pgvector 系统包，或 RDS 未开扩展"
  warn "本机 ECS 可先安装: $(_suggest_pgvector_apt)"
  warn "安装后执行: sudo -u postgres psql -d ${db_name} -c \"CREATE EXTENSION IF NOT EXISTS vector;\""
  warn "RDS 请在控制台「插件 / Extensions」启用 vector 后重跑本脚本"
  return 1
}

_ensure_vector_extension || exit 1

log "应用 10_pgvector_embeddings.sql"
psql "$XHS_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$PGV"
ok "category_embeddings 表已就绪"

log "运行类目嵌入批处理"
export PYTHONPATH="$ROOT"
export PYTHONUNBUFFERED=1
PY="${ROOT}/venv/bin/python"
if [[ ! -x "$PY" ]]; then
  PY=python3
  warn "未找到 $ROOT/venv，使用系统 python3（可能缺 psycopg2）"
fi
if "$PY" "$ROOT/cloud_deploy/scripts/run_category_embeddings.py"; then
  ok "嵌入批处理完成"
else
  warn "嵌入批处理未完全成功（可能缺 INSIGHT_LLM_API_KEY 或 embedding 模型不可用）"
  warn "表结构已就绪，可稍后重跑: cd $ROOT && PYTHONPATH=$ROOT ./venv/bin/python cloud_deploy/scripts/run_category_embeddings.py"
fi
