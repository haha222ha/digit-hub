#!/usr/bin/env bash
# 在 ECS Workbench 执行：拉最新代码并重启 API（修复支付宝短信误取 000001/106980）
#   curl -fsSL https://raw.githubusercontent.com/haha222ha/digit-hub/main/deploy/remote_sms_hook_update.sh | sudo bash
set -euo pipefail
DIGIT_HUB="${DIGIT_HUB:-/opt/digit-hub}"
if [[ ! -d "${DIGIT_HUB}/.git" ]]; then
  echo "ERROR: ${DIGIT_HUB} 不是 git 目录，请先 clone digit-hub"
  exit 1
fi
cd "${DIGIT_HUB}"
if id admin >/dev/null 2>&1; then
  chown -R admin:admin "${DIGIT_HUB}" 2>/dev/null || true
  sudo -u admin git fetch origin
  sudo -u admin git checkout main
  sudo -u admin git pull --ff-only origin main
else
  git fetch origin && git checkout main && git pull --ff-only origin main
fi
bash "${DIGIT_HUB}/deploy/quick_update.sh"
echo "==> smoke sms-hook"
SMS_TOKEN="$(grep -E '^XHS_SMS_HOOK_TOKEN=' /opt/xhs-cloud/.env 2>/dev/null | cut -d= -f2- | tr -d '\"')"
if [[ -n "${SMS_TOKEN}" ]]; then
  curl -fsS -H "User-Agent: smoke/1" \
    -X POST "http://127.0.0.1:8080/api/v1/hooks/sms-forward?token=${SMS_TOKEN}" \
    -H "Content-Type: text/plain; charset=utf-8" \
    --data-binary "106980095188000001【支付宝】支付宝验证码：313773，请勿向他人泄露您的验证码！唯一热线95188{{7214}}2026-08-22 20:23:42"
  curl -fsS -H "User-Agent: smoke/1" \
    "http://127.0.0.1:8080/api/v1/hooks/sms-code/latest?token=${SMS_TOKEN}&consume=0&phone_tail=7214&max_age=600"
  echo
fi
echo "DONE remote_sms_hook_update"
