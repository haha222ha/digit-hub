#!/usr/bin/env bash
# Run on ECS after /tmp/xinxiang-web.tgz is uploaded.
# Usage: sudo bash remote_bootstrap.sh [domain]
set -euo pipefail

# Default: IP access (no DNS). Optional later: assess.xhs365.cn
DOMAIN="${1:-_}"
WEB_ROOT="/opt/digit-hub/apps/web"
API_UPSTREAM="127.0.0.1:8080"
NGINX_SITE="/etc/nginx/conf.d/assess.xinxiang.conf"
TGZ="/tmp/xinxiang-web.tgz"

echo "==> install web root"
mkdir -p "$WEB_ROOT"
if [[ -f "$TGZ" ]]; then
  tar -xzf "$TGZ" -C "$WEB_ROOT"
  echo "extracted $TGZ -> $WEB_ROOT"
else
  echo "WARN: $TGZ missing; skip extract"
fi

if [[ "$DOMAIN" == "_" || "$DOMAIN" == "ip" ]]; then
  SERVER_NAMES="_"
  LISTEN_EXTRA="default_server"
  SMOKE_HOST="127.0.0.1"
else
  SERVER_NAMES="${DOMAIN}"
  LISTEN_EXTRA=""
  SMOKE_HOST="${DOMAIN}"
fi

echo "==> write nginx (server_name=${SERVER_NAMES})"
cat > "$NGINX_SITE" <<EOF
# xinxiang assess SPA + API (managed by remote_bootstrap.sh)
# Access via http://SERVER_IP/ until DNS is ready; then add assess.xhs365.cn
server {
    listen 80 ${LISTEN_EXTRA};
    server_name ${SERVER_NAMES};

    root ${WEB_ROOT};
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, must-revalidate";
    }

    location /api/ {
        proxy_pass http://${API_UPSTREAM}/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
EOF

nginx -t
systemctl reload nginx || service nginx reload || true

echo "==> smoke (local)"
curl -sS -o /dev/null -w "home:%{http_code}\n" "http://127.0.0.1/" -H "Host: ${SMOKE_HOST}" || true
curl -sS -o /dev/null -w "api_health:%{http_code}\n" "http://${API_UPSTREAM}/api/v1/health" || true
curl -sS "http://${API_UPSTREAM}/api/v1/assess/access?sku=love_brain" | head -c 200 || true
echo
echo "DONE. Browse http://SERVER_IP/ now. DNS assess.xhs365.cn can wait."