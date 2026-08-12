#!/usr/bin/env bash
# 写入/更新 digit-hub 相关 nginx 站点（含 /admin/ 授权码后台）
# Usage: sudo bash /opt/digit-hub/deploy/nginx_apply.sh
set -euo pipefail

PSY_DIST_ROOT="${PSY_DIST_ROOT:-/opt/digit-hub/apps/psy-dist}"
PSY_DOMAIN="${PSY_DOMAIN:-psy.xhs365.cn}"
WEB_ROOT="${WEB_ROOT:-/opt/digit-hub/apps/web}"
ADMIN_DIR="${ADMIN_DIR:-/opt/digit-hub/apps/admin}"
# 防止误设 ADMIN_DIR=.../index.html 导致 index.htmlindex.html
ADMIN_DIR="${ADMIN_DIR%/index.html}"
ADMIN_DIR="${ADMIN_DIR%/}"
ADMIN_INDEX="${ADMIN_DIR}/index.html"
CONF_D="${CONF_D:-/etc/nginx/conf.d}"
MONITOR_DOMAIN="${MONITOR_DOMAIN:-monitor.xhs365.cn}"
MONITOR_CONF="${CONF_D}/monitor.xhs365.cn.conf"

MARKER="# digit-hub managed locations"
GZIP_DIRECTIVES='    gzip on;
    gzip_vary on;
    gzip_min_length 256;
    gzip_types text/plain text/css application/json application/javascript application/xml image/svg+xml;'
API_ASSETS_LOCATIONS='    client_max_body_size 16m;

    location /api/v1/auth/ {
        limit_req zone=digit_hub_auth burst=5 nodelay;
        client_max_body_size 16m;
        proxy_pass http://127.0.0.1:8080/api/v1/auth/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location = /api/v1/payment/orders {
        limit_req zone=digit_hub_pay burst=3 nodelay;
        client_max_body_size 16m;
        proxy_pass http://127.0.0.1:8080/api/v1/payment/orders;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location /assets/ {
        proxy_pass http://127.0.0.1:8080/assets/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/ {
        client_max_body_size 16m;
        proxy_pass http://127.0.0.1:8080/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }'
# psy-dist：/assets/ 是 Vue 打包产物，禁止反代到 API（否则首页空白）
PSY_API_LOCATIONS='    client_max_body_size 16m;

    location /api/v1/auth/ {
        limit_req zone=digit_hub_auth burst=5 nodelay;
        client_max_body_size 16m;
        proxy_pass http://127.0.0.1:8080/api/v1/auth/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location = /api/v1/payment/orders {
        limit_req zone=digit_hub_pay burst=3 nodelay;
        client_max_body_size 16m;
        proxy_pass http://127.0.0.1:8080/api/v1/payment/orders;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location /api/ {
        client_max_body_size 16m;
        proxy_pass http://127.0.0.1:8080/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }'
# 精确匹配 + alias 单文件；禁止在该 location 内使用 index 指令（nginx 1.18 会拼成 index.htmlindex.html）
ADMIN_LOCATIONS='    location = /admin {
        return 302 /admin/index.html;
    }

    location = /admin/ {
        return 302 /admin/index.html;
    }

    location = /admin/index.html {
        alias ADMIN_INDEX_PLACEHOLDER;
        default_type text/html;
        add_header Cache-Control "no-cache, must-revalidate";
    }'

write_psy_dist_server() {
  local outfile="${CONF_D}/psy.xhs365.cn.conf"
  echo "==> write ${outfile} (psy-dist SPA + tests; static /assets/)"
  cat > "${outfile}" <<NGX
server {
    listen 80;
    server_name ${PSY_DOMAIN};

    ${MARKER}

${GZIP_DIRECTIVES}

    root ${PSY_DIST_ROOT};
    index index.html;

    # Vue / 测题静态资源必须走磁盘，不能 proxy 到 xhs-cloud /assets/
    location /assets/ {
        try_files \$uri =404;
        # 仿站资源常原地改 hash 同名文件；禁止 immutable 长缓存，避免 CF/浏览器卡旧品牌文案
        add_header Cache-Control "no-cache, must-revalidate";
    }
    location /tests/ {
        try_files \$uri \$uri/ =404;
    }
    location /static/ {
        try_files \$uri =404;
    }
    location /images/ {
        try_files \$uri =404;
    }
    location /uploads/ {
        try_files \$uri =404;
    }

    location ~ ^/test/([^/]+)/([^/]+)$ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, must-revalidate";
    }

${PSY_API_LOCATIONS}
}
NGX
}

write_web_server() {
  local outfile="$1"
  local listen="$2"
  local server_name="$3"
  local ssl_block="${4:-}"
  local admin_block="${ADMIN_LOCATIONS//ADMIN_INDEX_PLACEHOLDER/${ADMIN_INDEX}}"

  cat > "${outfile}" <<NGX
server {
    listen ${listen}${ssl_block};
    server_name ${server_name};
    root ${WEB_ROOT};
    index index.html;

    ${MARKER}

${GZIP_DIRECTIVES}

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, must-revalidate";
    }

${API_ASSETS_LOCATIONS}

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

${GZIP_DIRECTIVES}

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, must-revalidate";
    }

${API_ASSETS_LOCATIONS}

    location = /admin {
        return 302 /admin/index.html;
    }

    location = /admin/ {
        return 302 /admin/index.html;
    }

    location = /admin/index.html {
        alias ${ADMIN_INDEX};
        default_type text/html;
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

write_rate_limit_zone() {
  echo "==> write ${CONF_D}/digit-hub-rate-limit.conf"
  cat > "${CONF_D}/digit-hub-rate-limit.conf" <<'NGX'
# digit-hub managed — limit auth code brute-force + payment create spam
limit_req_zone $binary_remote_addr zone=digit_hub_auth:10m rate=10r/m;
limit_req_zone $binary_remote_addr zone=digit_hub_pay:10m rate=6r/m;
limit_req_status 429;
NGX
}

verify_written_config() {
  echo "==> verify ${MONITOR_CONF} admin block"
  grep -n 'admin' "${MONITOR_CONF}" || true
  if grep -E 'location.*/admin/' "${MONITOR_CONF}" | grep -qv 'return 302'; then
    if grep -A3 'location.*/admin/' "${MONITOR_CONF}" | grep -q 'index index.html'; then
      echo "ERROR: /admin/ location must not use index directive (causes index.htmlindex.html on nginx 1.18)"
      exit 1
    fi
  fi
  if grep -q 'index.htmlindex.html' /var/log/nginx/error.log 2>/dev/null; then
    echo "WARN: error.log still mentions index.htmlindex.html — will reload nginx"
  fi
}

smoke_admin() {
  local scheme="$1"
  local url="$2"
  local label="$3"
  local expect_code="${4:-200}"
  local curl_opts=(-sS -H "Host: ${MONITOR_DOMAIN}")
  [[ "${scheme}" == "https" ]] && curl_opts+=(-k)
  local code size
  code=$(curl "${curl_opts[@]}" -o /dev/null -w '%{http_code}' "${url}" 2>/dev/null || echo "000")
  size=$(curl "${curl_opts[@]}" "${url}" 2>/dev/null | wc -c | tr -d ' ')
  echo "${label}: code=${code} bytes=${size}"
  if [[ "${code}" != "${expect_code}" ]]; then
    echo "ERROR: ${label} expected ${expect_code}, got ${code}"
    echo "==> nginx -T (admin snippets)"
    nginx -T 2>/dev/null | grep -n -A5 -B2 'admin' | head -60 || true
    tail -n 8 /var/log/nginx/error.log 2>/dev/null || true
    return 1
  fi
  if [[ "${expect_code}" == "200" && "${size}" -lt 5000 ]]; then
    echo "ERROR: ${label} too small (${size})"
    return 1
  fi
}

echo "==> ensure admin static exists"
test -f "${ADMIN_INDEX}" || {
  echo "ERROR: missing ${ADMIN_INDEX} — git pull digit-hub first"
  exit 1
}

purge_stale_monitor_configs

write_rate_limit_zone

echo "==> write ${CONF_D}/assess.xinxiang.conf (default_server :80)"
write_web_server "${CONF_D}/assess.xinxiang.conf" "80 default_server" "_"

if [[ -d "${PSY_DIST_ROOT}" && -f "${PSY_DIST_ROOT}/index.html" ]]; then
  write_psy_dist_server
else
  echo "WARN: skip psy-dist nginx — missing ${PSY_DIST_ROOT}/index.html"
fi

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

verify_written_config
nginx -t
systemctl reload nginx

echo "==> smoke (match browser paths)"
ADMIN_BYTES=$(wc -c < "${ADMIN_INDEX}" | tr -d ' ')
echo "admin file bytes on disk: ${ADMIN_BYTES}"

smoke_admin http "http://127.0.0.1/admin/index.html" "admin_http_index" 200
slash_code=$(curl -sS -o /dev/null -w '%{http_code}' -H "Host: ${MONITOR_DOMAIN}" http://127.0.0.1/admin/ 2>/dev/null || echo "000")
slash_size=$(curl -sS -H "Host: ${MONITOR_DOMAIN}" http://127.0.0.1/admin/ 2>/dev/null | wc -c | tr -d ' ')
echo "admin_http_slash: code=${slash_code} bytes=${slash_size}"
if [[ "${slash_code}" == "302" ]]; then
  code=$(curl -sS -o /dev/null -w '%{http_code}' -L -H "Host: ${MONITOR_DOMAIN}" http://127.0.0.1/admin/ 2>/dev/null || echo "000")
  size=$(curl -sS -L -H "Host: ${MONITOR_DOMAIN}" http://127.0.0.1/admin/ 2>/dev/null | wc -c | tr -d ' ')
  echo "admin_http_slash_follow: code=${code} bytes=${size}"
  [[ "${code}" == "200" && "${size}" -ge 5000 ]] || { echo "ERROR: follow /admin/ failed"; exit 1; }
elif [[ "${slash_code}" == "200" && "${slash_size}" -ge 5000 ]]; then
  echo "admin_http_slash: direct 200 OK"
else
  echo "ERROR: /admin/ expected 200 or 302, got ${slash_code} (${slash_size} bytes)"
  nginx -T 2>/dev/null | grep -n -A5 -B2 'admin' | head -60 || true
  tail -n 8 /var/log/nginx/error.log 2>/dev/null || true
  exit 1
fi

if command -v ss >/dev/null 2>&1 && ss -tln | grep -q ':443 '; then
  smoke_admin https "https://127.0.0.1/admin/index.html" "admin_https_index" 200 || exit 1
fi

echo "DONE nginx_apply -> https://${MONITOR_DOMAIN}/admin/"
