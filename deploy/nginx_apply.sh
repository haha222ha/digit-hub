#!/usr/bin/env bash
# 写入/更新 digit-hub 相关 nginx 站点（含 /admin/ 授权码后台）
# Usage: sudo bash /opt/digit-hub/deploy/nginx_apply.sh
set -euo pipefail

WEB_ROOT="${WEB_ROOT:-/opt/digit-hub/apps/web}"
ADMIN_DIR="${ADMIN_DIR:-/opt/digit-hub/apps/admin}"
CONF_D="${CONF_D:-/etc/nginx/conf.d}"
MONITOR_DOMAIN="${MONITOR_DOMAIN:-monitor.xhs365.cn}"

MARKER="# digit-hub managed locations"

write_web_server() {
  local outfile="$1"
  local listen="$2"
  local server_name="$3"
  local ssl_block="${4:-}"

  cat > "${outfile}" <<NGX
server {
    listen ${listen}${ssl_block};
    server_name ${server_name};
    root ${WEB_ROOT};
    index index.html;

    ${MARKER}

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, must-revalidate";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location = /admin {
        return 302 /admin/;
    }

    location ^~ /admin/ {
        root ${WEB_ROOT%/web};
        index index.html;
        add_header Cache-Control "no-cache, must-revalidate";
    }
}
NGX
}

echo "==> ensure admin static exists"
test -f "${ADMIN_DIR}/index.html" || {
  echo "ERROR: missing ${ADMIN_DIR}/index.html — git pull digit-hub first"
  exit 1
}

echo "==> write ${CONF_D}/assess.xinxiang.conf (default_server :80)"
write_web_server "${CONF_D}/assess.xinxiang.conf" "80 default_server" "_"

SSL_CERT="/etc/letsencrypt/live/${MONITOR_DOMAIN}/fullchain.pem"
SSL_KEY="/etc/letsencrypt/live/${MONITOR_DOMAIN}/privkey.pem"

if [[ -f "${SSL_CERT}" && -f "${SSL_KEY}" ]]; then
  echo "==> write ${CONF_D}/monitor.xhs365.cn.conf (:443 ssl + :80 redirect)"
  SSL_EXTRA=""
  if [[ -f /etc/letsencrypt/options-ssl-nginx.conf ]]; then
    SSL_EXTRA="
    include /etc/letsencrypt/options-ssl-nginx.conf;"
  fi
  if [[ -f /etc/letsencrypt/ssl-dhparams.pem ]]; then
    SSL_EXTRA="${SSL_EXTRA}
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"
  fi
  cat > "${CONF_D}/monitor.xhs365.cn.conf" <<NGX
server {
    listen 443 ssl http2;
    server_name ${MONITOR_DOMAIN};
    root ${WEB_ROOT};
    index index.html;

    ssl_certificate ${SSL_CERT};
    ssl_certificate_key ${SSL_KEY};${SSL_EXTRA}

    ${MARKER}

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, must-revalidate";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location = /admin {
        return 302 /admin/;
    }

    location ^~ /admin/ {
        root ${WEB_ROOT%/web};
        index index.html;
        add_header Cache-Control "no-cache, must-revalidate";
    }
}

server {
    listen 80;
    server_name ${MONITOR_DOMAIN};
    return 301 https://\$host\$request_uri;
}
NGX
else
  echo "==> write ${CONF_D}/monitor.xhs365.cn.conf (:80 only, no cert yet)"
  write_web_server "${CONF_D}/monitor.xhs365.cn.conf" "80" "${MONITOR_DOMAIN}"
fi

rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
nginx -t
systemctl reload nginx

echo "==> smoke"
ADMIN_CODE=$(curl -sS -o /dev/null -w '%{http_code}' -H "Host: ${MONITOR_DOMAIN}" http://127.0.0.1/admin/ || echo "000")
ADMIN_SIZE=$(curl -sS -H "Host: ${MONITOR_DOMAIN}" http://127.0.0.1/admin/ 2>/dev/null | wc -c | tr -d ' ')
echo "admin_local: code=${ADMIN_CODE} bytes=${ADMIN_SIZE}"
ADMIN_BYTES=$(wc -c < "${ADMIN_DIR}/index.html" | tr -d ' ')
echo "admin file bytes on disk: ${ADMIN_BYTES}"
if [[ "${ADMIN_CODE}" != "200" ]]; then
  echo "ERROR: /admin/ returned ${ADMIN_CODE} — check nginx error.log"
  tail -n 5 /var/log/nginx/error.log 2>/dev/null || true
  exit 1
fi
if [[ "${ADMIN_SIZE}" -lt 5000 ]]; then
  echo "ERROR: /admin/ too small (${ADMIN_SIZE}), likely wrong index"
  exit 1
fi
echo "DONE nginx_apply -> https://${MONITOR_DOMAIN}/admin/"
