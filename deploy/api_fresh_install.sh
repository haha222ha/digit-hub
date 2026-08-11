#!/usr/bin/env bash
# Fresh SWAS: Postgres + xhs-cloud API + nginx /api/ proxy (digit-hub).
# Usage: sudo bash /opt/digit-hub/deploy/api_fresh_install.sh
set -euo pipefail

DIGIT_HUB="${DIGIT_HUB:-/opt/digit-hub}"
SRC="${DIGIT_HUB}/services/xhs-cloud/cloud_deploy"
XHS_ROOT="${XHS_ROOT:-/opt/xhs-cloud}"
DB_NAME="${DB_NAME:-vuemonitor}"
DB_USER="${DB_USER:-xhs_monitor_user}"
NOTIFY_BASE="${XHS_PAY_NOTIFY_BASE:-https://monitor.xhs365.cn}"
PUBLIC_IP="${PUBLIC_IP:-47.239.181.111}"

if [[ ! -d "$SRC/cloud_api" ]]; then
  echo "ERROR: missing $SRC/cloud_api — git pull digit-hub first"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
echo "==> wait for dpkg lock (unattended-upgrades)"
for i in $(seq 1 90); do
  if ! fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 \
    && ! fuser /var/lib/dpkg/lock >/dev/null 2>&1 \
    && ! fuser /var/lib/apt/lists/lock >/dev/null 2>&1; then
    break
  fi
  echo "  dpkg busy ($i/90)..."
  sleep 10
done
dpkg --configure -a || true

echo "==> apt: postgresql python3-venv nginx curl openssl"
apt-get update -y
apt-get install -y postgresql postgresql-contrib python3-venv python3-pip nginx curl openssl rsync

echo "==> sync cloud_deploy -> $XHS_ROOT"
mkdir -p "$XHS_ROOT"/{data/incoming,data/report_archives}
rsync -a --delete \
  --exclude venv --exclude data --exclude .env --exclude '__pycache__' --exclude '*.pyc' \
  "$SRC/" "$XHS_ROOT/cloud_deploy/"
# package root for PYTHONPATH=/opt/xhs-cloud
touch "$XHS_ROOT/cloud_deploy/__init__.py" 2>/dev/null || true
# cloud_deploy is imported as top-level under PYTHONPATH=/opt/xhs-cloud
# layout: /opt/xhs-cloud/cloud_deploy/...  ✓

rand() { openssl rand -base64 32 | tr -d '\n/+' | head -c 40; }

DB_PASS=""
JWT_SECRET=""
SYNC_KEY=""
ADMIN_PASS=""
if [[ -f /tmp/xhs_cloud.env ]]; then
  echo "==> using /tmp/xhs_cloud.env as base (will merge)"
  # shellcheck disable=SC1091
  set -a && source /tmp/xhs_cloud.env && set +a
  DB_PASS="${DB_PASS:-}"
fi

if [[ -z "${DB_PASS}" ]]; then DB_PASS="$(rand)"; fi
if [[ -z "${XHS_CLOUD_JWT_SECRET:-}" ]]; then JWT_SECRET="$(rand)"; else JWT_SECRET="$XHS_CLOUD_JWT_SECRET"; fi
if [[ -z "${XHS_CLOUD_SYNC_KEY:-}" ]]; then SYNC_KEY="$(rand)"; else SYNC_KEY="$XHS_CLOUD_SYNC_KEY"; fi
if [[ -z "${XHS_CLOUD_ADMIN_PASS:-}" ]]; then ADMIN_PASS="$(rand)"; else ADMIN_PASS="$XHS_CLOUD_ADMIN_PASS"; fi

echo "==> postgres: ensure cluster + db"
systemctl enable --now postgresql
# create role/db
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL

# init schema (postgres user must read input — avoid root-only mktemp)
echo "==> postgres: init xhs_monitor schema"
sed "s/CHANGE_ME_STRONG_PASSWORD/${DB_PASS}/g" \
  "$XHS_ROOT/cloud_deploy/database/init_xhs_monitor.sql" \
  | sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -f -

sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
GRANT ALL ON SCHEMA xhs_monitor TO ${DB_USER};
GRANT ALL ON ALL TABLES IN SCHEMA xhs_monitor TO ${DB_USER};
GRANT ALL ON ALL SEQUENCES IN SCHEMA xhs_monitor TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA xhs_monitor GRANT ALL ON TABLES TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA xhs_monitor GRANT ALL ON SEQUENCES TO ${DB_USER};
SQL

echo "==> write .env"
ENV_OUT="$XHS_ROOT/.env"
# Preserve hwxun from /tmp if present
PAY_PID="${XHS_PAY_PID:-}"
PAY_KEY="${XHS_PAY_KEY:-}"
ALI_PID="${XHS_PAY_ALIPAY_PID:-}"
ALI_KEY="${XHS_PAY_ALIPAY_KEY:-}"
PAY_API="${XHS_PAY_API_URL:-https://pay.hwxun.cn/}"
ALI_API="${XHS_PAY_ALIPAY_API_URL:-https://xapay.hwxun.cn/}"
TEST_PLAN="${XHS_PAY_ENABLE_TEST_PLAN:-1}"

cat > "$ENV_OUT" <<EOF
XHS_CLOUD_ROOT=${XHS_ROOT}
XHS_ENV_FILE=${XHS_ROOT}/.env
XHS_DATA_DIR=${XHS_ROOT}/data
XHS_REPORT_INCOMING_DIR=${XHS_ROOT}/data/incoming
XHS_REPORT_ARCHIVE_DIR=${XHS_ROOT}/data/report_archives
XHS_CLOUD_API_DB=${XHS_ROOT}/data/cloud_api.db
XHS_CLOUD_HOST=127.0.0.1
XHS_CLOUD_PORT=8080
XHS_CLOUD_SYNC_KEY=${SYNC_KEY}
XHS_CLOUD_JWT_SECRET=${JWT_SECRET}
XHS_CLOUD_JWT_TTL_DAYS=30
XHS_CLOUD_ADMIN_USER=admin
XHS_CLOUD_ADMIN_PASS=${ADMIN_PASS}
XHS_DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}
XHS_DAEMON_API_ONLY=1
XHS_PAY_API_URL=${PAY_API}
XHS_PAY_PID=${PAY_PID}
XHS_PAY_KEY=${PAY_KEY}
XHS_PAY_ALIPAY_API_URL=${ALI_API}
XHS_PAY_ALIPAY_PID=${ALI_PID}
XHS_PAY_ALIPAY_KEY=${ALI_KEY}
XHS_PAY_NOTIFY_BASE=${NOTIFY_BASE}
XHS_PAY_ENABLE_TEST_PLAN=${TEST_PLAN}
XHS_V2_LAUNCH=0
XHS_INSIGHT_SHADOW=0
XHS_PREMIUM_CLOUD_SYNC=0
EOF
chmod 600 "$ENV_OUT"
chown admin:admin "$ENV_OUT" 2>/dev/null || true

echo "==> python venv + pip"
if [[ ! -x "$XHS_ROOT/venv/bin/python" ]]; then
  python3 -m venv "$XHS_ROOT/venv"
fi
"$XHS_ROOT/venv/bin/pip" install -U pip
"$XHS_ROOT/venv/bin/pip" install -r "$XHS_ROOT/cloud_deploy/requirements-cloud.txt"

echo "==> systemd xhs-cloud-api"
# ensure User=admin exists
id admin >/dev/null 2>&1 || useradd -m -s /bin/bash admin
chown -R admin:admin "$XHS_ROOT"
cp "$XHS_ROOT/cloud_deploy/systemd/xhs-cloud-api.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable xhs-cloud-api.service
systemctl restart xhs-cloud-api.service

echo "==> nginx: IP default_server + monitor.xhs365.cn"
cat > /etc/nginx/conf.d/assess.xinxiang.conf <<'NGX'
server {
    listen 80 default_server;
    server_name _;
    root /opt/digit-hub/apps/web;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, must-revalidate";
    }
    location /api/ {
        proxy_pass http://127.0.0.1:8080/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGX

cat > /etc/nginx/conf.d/monitor.xhs365.cn.conf <<'NGX'
server {
    listen 80;
    server_name monitor.xhs365.cn;
    root /opt/digit-hub/apps/web;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, must-revalidate";
    }
    location /api/ {
        proxy_pass http://127.0.0.1:8080/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGX
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
nginx -t
systemctl reload nginx

sleep 2
echo "==> smoke"
curl -sS -o /dev/null -w "health:%{http_code}\n" http://127.0.0.1:8080/api/v1/health || true
curl -sS -o /dev/null -w "proxy_health:%{http_code}\n" http://127.0.0.1/api/v1/health || true
curl -sS http://127.0.0.1:8080/api/v1/payment/plans 2>/dev/null | head -c 400 || true
echo
echo "DONE."
echo "  Admin pass (save): $ADMIN_PASS"
echo "  Notify base: $NOTIFY_BASE"
echo "  If pay PID empty, put keys in /tmp/xhs_cloud.env and re-run, or edit $ENV_OUT"
echo "  Next: DNS monitor.xhs365.cn -> $PUBLIC_IP then certbot"
echo "  Live UI: http://${PUBLIC_IP}/?api=live"
