#!/bin/bash
# 应用 V2 情报 PG 迁移（08～11 + 可选 pgvector 10）
# 用法: bash /opt/xhs-cloud/cloud_deploy/scripts/ensure_insight_pg_schema.sh
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/xhs-cloud}"
if [ -d "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)" ]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

ENV_FILE="${XHS_ENV_FILE:-$ROOT/.env}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a && source "$ENV_FILE" && set +a
fi

if [[ "${XHS_DATABASE_URL:-}" != postgres* ]]; then
  echo "[insight-schema] 未配置 XHS_DATABASE_URL，跳过"
  exit 0
fi

DB_DIR="$ROOT/cloud_deploy/database"
for sql in 08_insight_v2_tables.sql 09_retention_pg_schema.sql 11_insight_workflow_schema.sql; do
  f="$DB_DIR/$sql"
  if [[ -f "$f" ]]; then
    psql "$XHS_DATABASE_URL" -f "$f" >/dev/null && echo "[insight-schema] OK $sql" || echo "[insight-schema] warn $sql"
  fi
done

PGV="$DB_DIR/10_pgvector_embeddings.sql"
if [[ -f "$PGV" ]] && psql "$XHS_DATABASE_URL" -tAc "SELECT 1 FROM pg_extension WHERE extname='vector'" 2>/dev/null | grep -q 1; then
  psql "$XHS_DATABASE_URL" -f "$PGV" >/dev/null && echo "[insight-schema] OK 10_pgvector_embeddings.sql" || echo "[insight-schema] warn pgvector"
else
  echo "[insight-schema] pgvector 未安装，跳过 10_pgvector_embeddings.sql"
fi

echo "[insight-schema] done"
