#!/usr/bin/env bash
# 在 ECS Workbench 执行：写入本机 deploy 公钥，恢复 admin SSH
# 通常由 remote_quick_update.sh 自动调用；也可单独跑：
#   curl -fsSL https://raw.githubusercontent.com/haha222ha/digit-hub/main/deploy/bootstrap_ssh_admin.sh | sudo bash
set -euo pipefail

PUBKEY="${XHS_DEPLOY_PUBKEY:-ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIA1hYpQ/4GIu8iE1w8+gds9FFUkiLfp0ueZTt0Rhl/Gx xhs365-deploy-cursor}"
ADMIN_HOME="${ADMIN_HOME:-/home/admin}"

if ! id admin >/dev/null 2>&1; then
  echo "WARN: user admin not found — skip SSH bootstrap"
  exit 0
fi

install -d -m 700 -o admin -g admin "${ADMIN_HOME}/.ssh"
AUTH="${ADMIN_HOME}/.ssh/authorized_keys"
touch "${AUTH}"
chown admin:admin "${AUTH}"
chmod 600 "${AUTH}"

if grep -qF "${PUBKEY}" "${AUTH}" 2>/dev/null; then
  echo "SSH key already present for admin"
else
  printf '%s\n' "${PUBKEY}" >> "${AUTH}"
  echo "Added deploy SSH key for admin"
fi

echo "DONE bootstrap_ssh_admin"
