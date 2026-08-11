#!/usr/bin/env bash
# Fresh SWAS/ECS after OS reset — clone digit-hub + nginx (IP, no DNS).
# Usage (Workbench as admin/root):
#   curl -fsSL https://raw.githubusercontent.com/haha222ha/digit-hub/main/deploy/fresh_install.sh | sudo bash
# Or after uploading nothing:
#   sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/haha222ha/digit-hub/main/deploy/fresh_install.sh)"
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/haha222ha/digit-hub.git}"
REPO_DIR="${REPO_DIR:-/opt/digit-hub}"
BRANCH="${BRANCH:-main}"

export DEBIAN_FRONTEND=noninteractive
echo "==> apt: git nginx"
apt-get update -y
apt-get install -y git nginx curl

if [[ -d "${REPO_DIR}/.git" ]]; then
  echo "==> pull existing ${REPO_DIR}"
  cd "${REPO_DIR}"
  git fetch origin
  git checkout "${BRANCH}"
  git reset --hard "origin/${BRANCH}"
else
  echo "==> clone ${REPO_URL} -> ${REPO_DIR}"
  rm -rf "${REPO_DIR}"
  mkdir -p "$(dirname "${REPO_DIR}")"
  git clone --branch "${BRANCH}" --depth 1 "${REPO_URL}" "${REPO_DIR}"
fi

bash "${REPO_DIR}/deploy/git_pull_deploy.sh"

echo "==> public tip: open http://$(curl -sS -m 3 ifconfig.me 2>/dev/null || echo SERVER_IP)/"
