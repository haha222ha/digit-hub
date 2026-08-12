#!/usr/bin/env bash
# 为 psy.xhs365.cn 申请/续签 Let's Encrypt 证书（DNS 已指向本机后执行）
# Usage: sudo bash deploy/certbot_psy.sh
set -euo pipefail

PSY_DOMAIN="${PSY_DOMAIN:-psy.xhs365.cn}"
EMAIL="${CERTBOT_EMAIL:-admin@xhs365.cn}"
DIGIT_HUB="${DIGIT_HUB:-/opt/digit-hub}"

echo "==> domain=${PSY_DOMAIN} email=${EMAIL}"
echo "==> ensure nginx HTTP config exists (certbot webroot/nginx plugin)"
bash "${DIGIT_HUB}/deploy/nginx_apply.sh"

if ! command -v certbot >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y certbot python3-certbot-nginx
fi

# 先确保 80 可访问；certbot --nginx 会改配置，随后用我们的模板覆盖回可控状态
certbot --nginx \
  -d "${PSY_DOMAIN}" \
  --non-interactive \
  --agree-tos \
  -m "${EMAIL}" \
  --redirect \
  || certbot --nginx -d "${PSY_DOMAIN}"

echo "==> re-apply digit-hub nginx (pick up live cert paths)"
bash "${DIGIT_HUB}/deploy/nginx_apply.sh"

echo "==> smoke https://${PSY_DOMAIN}/"
curl -fsSI "https://${PSY_DOMAIN}/" | head -n 8 || true
echo "DONE certbot_psy — open https://${PSY_DOMAIN}/admin/"
