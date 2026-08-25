#!/usr/bin/env bash
# 在 ECS Workbench / VNC 执行：拉最新 digit-hub 并 quick_update
#   curl -fsSL https://raw.githubusercontent.com/haha222ha/digit-hub/main/deploy/remote_quick_update.sh | sudo bash
set -euo pipefail
DIGIT_HUB="${DIGIT_HUB:-/opt/digit-hub}"
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
curl -sS -o /dev/null -w 'fandom_xp_index:%{http_code}\n' \
  http://127.0.0.1/tests/fandom_xp/index.html -H 'Host: psy.xhs365.cn' || true
echo "DONE remote_quick_update"
