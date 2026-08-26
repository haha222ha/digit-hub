#!/usr/bin/env bash
# 在 ECS Workbench / VNC 执行：恢复 SSH + 拉最新 digit-hub + quick_update
#   curl -fsSL https://raw.githubusercontent.com/haha222ha/digit-hub/main/deploy/remote_quick_update.sh | sudo bash
set -euo pipefail
DIGIT_HUB="${DIGIT_HUB:-/opt/digit-hub}"
PSY_DOMAIN="${PSY_DOMAIN:-psy.xhs365.cn}"

echo "==> bootstrap admin SSH (for Cursor deploy scripts)"
bash "${DIGIT_HUB}/deploy/bootstrap_ssh_admin.sh" 2>/dev/null \
  || curl -fsSL https://raw.githubusercontent.com/haha222ha/digit-hub/main/deploy/bootstrap_ssh_admin.sh | bash

if [[ ! -d "${DIGIT_HUB}/.git" ]]; then
  echo "ERROR: ${DIGIT_HUB} is not a git repo"
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

echo "==> post-smoke (public routes via nginx)"
for path in /login /member /assets/member_theme.css /tests/fandom_xp/index.html; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1${path}" -H "Host: ${PSY_DOMAIN}" 2>/dev/null || echo "000")
  echo "${PSY_DOMAIN}${path}:${code}"
done

member_bytes=$(curl -sS "http://127.0.0.1/member" -H "Host: ${PSY_DOMAIN}" 2>/dev/null | wc -c | tr -d ' ')
echo "member_html_bytes:${member_bytes}"
if [[ "${member_bytes}" -lt 50000 ]]; then
  echo "ERROR: /member portal still too small — check nginx_apply logs"
  exit 1
fi

echo "DONE remote_quick_update — retry: ssh xhs365-wipe 'echo OK'"
