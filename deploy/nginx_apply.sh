#!/usr/bin/env bash
# 写入/更新 digit-hub 相关 nginx 站点（含 /admin/ 授权码后台）
# Usage: sudo bash /opt/digit-hub/deploy/nginx_apply.sh
set -euo pipefail

WEB_ROOT="${WEB_ROOT:-/opt/digit-hub/apps/web}"
ADMIN_DIR="${ADMIN_DIR:-/opt/digit-hub/apps/admin}"
CONF_D="${CONF_D:-/etc/nginx/conf.d}"
MONITOR_DOMAIN="${MONITOR_DOMAIN:-monitor.xhs365.cn}"
MONITOR_CONF="${CONF_D}/monitor.xhs365.cn.conf"

MARKER="# digit-hub managed locations"
ADMIN_LOCATIONS='    location = /admin {
        return 302 /admin/;
    }

    location ^~ /admin/ {
        alias ADMIN_DIR_PLACEHOLDER/;
        index index.html;
        add_header Cache-Control "no-cache, must-revalidate";
    }'

write_web_server() {
  local outfile="$1"
  local listen="$2"
  local server_name="$3"
  local ssl_block="${4:-}"
  local admin_block="${ADMIN_LOCATIONS//ADMIN_DIR_PLACEHOLDER/${ADMIN_DIR}}"

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

${admin_block}
}
NGX
}

write_monitor_ssl_server() {
  local ssl_extra="$1"
  cat > "${MONITOR_CONF}" <<NGX
server {
    listen 443 ssl http2;
    server_name ${MONITOR_DOMAIN};
    root ${WEB_ROOT};
    index index.html;

    ssl_certificate ${SSL_CERT};
    ssl_certificate_key ${SSL_KEY};${ssl_extra}

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
        alias ${ADMIN_DIR}/;
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
}

purge_stale_monitor_configs() {
  echo "==> purge stale nginx configs for ${MONITOR_DOMAIN}"
  local dir f
  for dir in /etc/nginx/sites-enabled /etc/nginx/sites-available "${CONF_D}"; do
    [[ -d "$dir" ]] || continue
    for f in "$dir"/*; do
      [[ -f "$f" ]] || continue
      [[ "$f" == "${MONITOR_CONF}" ]] && continue
      if grep -q "${MONITOR_DOMAIN}" "$f" 2>/dev/null; then
        echo "  remove $f"
        rm -f "$f"
      fi
    done
  done
  for f in \
    "${CONF_D}/${MONITOR_DOMAIN}-le-ssl.conf" \
    "${CONF_D}/monitor.xhs365.cn-le-ssl.conf" \
    /etc/nginx/sites-enabled/default; do
    [[ -e "$f" ]] || continue
    echo "  remove $f"
    rm -f "$f"
  done
}

smoke_admin() {
  local scheme="$1"
  local url="$2"
  local label="$3"
  local curl_opts=(-sS -H "Host: ${MONITOR_DOMAIN}")
  [[ "${scheme}" == "https" ]] && curl_opts+=(-k)
  local code size
  code=$(curl "${curl_opts[@]}" -o /dev/null -w '%{http_code}' "${url}" 2>/dev/null || echo "000")
  size=$(curl "${curl_opts[@]}" "${url}" 2>/dev/null | wc -c | tr -d ' ')
  echo "${label}: code=${code} bytes=${size}"
  if [[ "${code}" != "200" ]]; then
    echo "ERROR: ${label} returned ${code}"
    tail -n 8 /var/log/nginx/error.log 2>/dev/null || true
    return 1
  fi
  if [[ "${size}" -lt 5000 ]]; then
    echo "ERROR: ${label} too small (${size})"
    return 1
  fi
}

echo "==> ensure admin static exists"
test -f "${ADMIN_DIR}/index.html" || {
  echo "ERROR: missing ${ADMIN_DIR}/index.html — git pull digit-hub first"
  exit 1
}

purge_stale_monitor_configs

echo "==> write ${CONF_D}/assess.xinxiang.conf (default_server :80)"
write_web_server "${CONF_D}/assess.xinxiang.conf" "80 default_server" "_"

SSL_CERT="/etc/letsencrypt/live/${MONITOR_DOMAIN}/fullchain.pem"
SSL_KEY="/etc/letsencrypt/live/${MONITOR_DOMAIN}/privkey.pem"

if [[ -f "${SSL_CERT}" && -f "${SSL_KEY}" ]]; then
  echo "==> write ${MONITOR_CONF} (:443 ssl + :80 redirect)"
  SSL_EXTRA=""
  if [[ -f /etc/letsencrypt/options-ssl-nginx.conf ]]; then
    SSL_EXTRA="
    include /etc/letsencrypt/options-ssl-nginx.conf;"
  fi
  if [[ -f /etc/letsencrypt/ssl-dhparams.pem ]]; then
    SSL_EXTRA="${SSL_EXTRA}
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"
  fi
  write_monitor_ssl_server "${SSL_EXTRA}"
else
  echo "==> write ${MONITOR_CONF} (:80 only, no cert yet)"
  write_web_server "${MONITOR_CONF}" "80" "${MONITOR_DOMAIN}"
fi

nginx -t
systemctl reload nginx

echo "==> smoke (match browser paths)"
ADMIN_BYTES=$(wc -c < "${ADMIN_DIR}/index.html" | tr -d ' ')
echo "admin file bytes on disk: ${ADMIN_BYTES}"

smoke_admin http "http://127.0.0.1/admin/" "admin_http_slash"
smoke_admin http "http://127.0.0.1/admin/index.html" "admin_http_index"

if command -v ss >/dev/null 2>&1 && ss -tln | grep -q ':443 '; then
  smoke_admin https "https://127.0.0.1/admin/" "admin_https_slash" || {
    echo "HINT: browser uses HTTPS; stale :443 vhost may still exist — re-run this script after purge"
    exit 1
  }
fi

echo "DONE nginx_apply -> https://${MONITOR_DOMAIN}/admin/"
