#!/usr/bin/env bash
# 写入 XHS_SMS_HOOK_TOKEN 并重启 API（不改其它 .env）。
# 用法:
#   sudo bash /opt/digit-hub/deploy/set_sms_hook_token.sh '你的长随机串'
set -euo pipefail

TOKEN="${1:-}"
ENV_FILE="${XHS_ENV_FILE:-/opt/xhs-cloud/.env}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: 请用 sudo 运行"
  echo "  sudo bash /opt/digit-hub/deploy/set_sms_hook_token.sh '你的TOKEN'"
  exit 1
fi

if [[ -z "$TOKEN" || "$TOKEN" == "change-me-sms-hook-long-random" ]]; then
  echo "ERROR: 请传入真实 token，例如:"
  echo "  sudo bash /opt/digit-hub/deploy/set_sms_hook_token.sh \"\$(openssl rand -hex 24)\""
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: 缺少 $ENV_FILE — 先跑过 api 安装 / quick_update"
  exit 1
fi

if grep -q '^XHS_SMS_HOOK_TOKEN=' "$ENV_FILE"; then
  sed -i "s|^XHS_SMS_HOOK_TOKEN=.*|XHS_SMS_HOOK_TOKEN=${TOKEN}|" "$ENV_FILE"
else
  printf '\nXHS_SMS_HOOK_TOKEN=%s\n' "$TOKEN" >> "$ENV_FILE"
fi

systemctl restart xhs-cloud-api
for _ in $(seq 1 20); do
  if systemctl is-active --quiet xhs-cloud-api; then
    break
  fi
  sleep 1
done
systemctl is-active xhs-cloud-api

code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 \
  "http://127.0.0.1:8080/api/v1/hooks/sms-code/latest?token=${TOKEN}&consume=0" || true)"
echo "sms-code/latest HTTP ${code} (401=token错/未生效; 200/404=路由在)"
echo "DONE — 本机 order_config.json 的 sms_hook_token 请写成同一值"
echo "手机 SMS Forward POST: https://monitor.xhs365.cn/api/v1/hooks/sms-forward?token=${TOKEN}"
