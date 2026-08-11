#!/bin/bash
# 从 vuemonitor 已有配置一键生成 /opt/xhs-cloud/.env（免手填 nano）
set -euo pipefail

VUE_ENV="${VUE_ENV:-/opt/vuemonitor/server/.env}"
XHS_ENV="${XHS_ENV:-/opt/xhs-cloud/.env}"
XHS_ROOT="${XHS_ROOT:-/opt/xhs-cloud}"

if [[ ! -f "$VUE_ENV" ]]; then
  echo "找不到 $VUE_ENV"
  exit 1
fi

read_env() {
  local key="$1"
  grep -E "^${key}=" "$VUE_ENV" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//'
}

DB_HOST="$(read_env DB_HOST)"
DB_PORT="$(read_env DB_PORT)"
DB_NAME="$(read_env DB_NAME)"
DB_USER="$(read_env DB_USER)"
DB_PASSWORD="$(read_env DB_PASSWORD)"

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-vuemonitor}"
DB_USER="${DB_USER:-saas_user}"

if [[ -z "$DB_PASSWORD" ]]; then
  echo "server/.env 中 DB_PASSWORD 为空，请先配置数据库密码"
  exit 1
fi

gen_secret() {
  python3 -c "import secrets; print(secrets.token_urlsafe(32))"
}

if [[ -f "$XHS_ENV" ]]; then
  EXISTING_SYNC="$(grep -E '^XHS_CLOUD_SYNC_KEY=' "$XHS_ENV" | cut -d= -f2- || true)"
  EXISTING_JWT="$(grep -E '^XHS_CLOUD_JWT_SECRET=' "$XHS_ENV" | cut -d= -f2- || true)"
  EXISTING_ADMIN_PASS="$(grep -E '^XHS_CLOUD_ADMIN_PASS=' "$XHS_ENV" | cut -d= -f2- || true)"
fi

_is_placeholder() {
  local v="${1:-}"
  [[ -z "$v" || "$v" == change-me* || "$v" == CHANGE_ME* ]]
}

if _is_placeholder "$EXISTING_SYNC"; then EXISTING_SYNC=""; fi
if _is_placeholder "$EXISTING_JWT"; then EXISTING_JWT=""; fi
if _is_placeholder "$EXISTING_ADMIN_PASS"; then EXISTING_ADMIN_PASS=""; fi

SYNC_KEY="${EXISTING_SYNC:-$(gen_secret)}"
JWT_SECRET="${EXISTING_JWT:-$(gen_secret)}"
ADMIN_PASS="${EXISTING_ADMIN_PASS:-$(python3 -c "import secrets; print(secrets.token_urlsafe(12))")}"

mkdir -p "$XHS_ROOT/data/incoming" "$XHS_ROOT/data/report_archives"

cat > "$XHS_ENV" <<EOF
XHS_CLOUD_ROOT=$XHS_ROOT
XHS_ENV_FILE=$XHS_ENV
XHS_DATA_DIR=$XHS_ROOT/data
XHS_REPORT_INCOMING_DIR=$XHS_ROOT/data/incoming
XHS_REPORT_ARCHIVE_DIR=$XHS_ROOT/data/report_archives
XHS_CLOUD_API_DB=$XHS_ROOT/data/cloud_api.db
XHS_CLOUD_HOST=127.0.0.1
XHS_CLOUD_PORT=8080
XHS_CLOUD_SYNC_KEY=$SYNC_KEY
XHS_CLOUD_JWT_SECRET=$JWT_SECRET
XHS_CLOUD_JWT_TTL_DAYS=30
XHS_CLOUD_ADMIN_USER=admin
XHS_CLOUD_ADMIN_PASS=$ADMIN_PASS
XHS_DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}
XHS_CRAWLER_ROOT=/opt/xhs/crawler
EOF

echo ""
echo "==> 已写入 $XHS_ENV"
echo ""
echo "请将以下两行追加到 $VUE_ENV（admin 后台对接用）："
echo "XHS_CLOUD_API_URL=http://127.0.0.1:8080"
echo "XHS_CLOUD_SYNC_KEY=$SYNC_KEY"
echo ""
echo "可选会员页链接："
echo "XHS_CLOUD_MEMBER_PORTAL_URL=http://你的公网IP:8080/member"
echo ""
echo "下一步："
echo "  cd $XHS_ROOT && bash cloud_deploy/scripts/host-update.sh"
echo "  sudo systemctl enable --now xhs-cloud-api"
echo "  curl http://127.0.0.1:8080/api/v1/health"
echo "  1. git pull + host-update 会自动同步 cloud_deploy/crawler_runtime → /opt/xhs/crawler"
echo "  2. bash $XHS_ROOT/cloud_deploy/scripts/enable_pure_online.sh"
