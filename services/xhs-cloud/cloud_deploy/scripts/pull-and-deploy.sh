#!/bin/bash
# 云主机一键：拉取 vuemonitor 最新 main → 同步 xhs-cloud → 执行 host-update
#
# 用法（在服务器上）:
#   curl -fsSL https://raw.githubusercontent.com/haha222ha/vuemonitor/main/xhs-cloud/cloud_deploy/scripts/pull-and-deploy.sh | bash
# 或已 clone 后:
#   bash /opt/vuemonitor/xhs-cloud/cloud_deploy/scripts/pull-and-deploy.sh
#
set -euo pipefail

VM_REPO="${VM_REPO:-/opt/vuemonitor}"
XHS_ROOT="${XHS_ROOT:-/opt/xhs-cloud}"
BRANCH="${BRANCH:-main}"

echo "==> git fetch ${BRANCH} @ ${VM_REPO}"
cd "$VM_REPO"
git fetch origin "$BRANCH"
git reset --hard "origin/${BRANCH}"

echo "==> rsync cloud_deploy → ${XHS_ROOT}"
mkdir -p "$XHS_ROOT"
rsync -a "${VM_REPO}/xhs-cloud/cloud_deploy/" "${XHS_ROOT}/cloud_deploy/" --delete

echo "==> host-update"
cd "$XHS_ROOT"
bash cloud_deploy/scripts/host-update.sh

ONECLICK="${XHS_ROOT}/cloud_deploy/scripts/v2-oneclick-deploy.sh"
if [[ -f "$ONECLICK" && "${USE_LEGACY_PULL_ONLY:-}" != "1" ]]; then
  echo "==> 提示: 完整链路请用 v2-oneclick-deploy.sh（含迁移+冒烟）"
  echo "    export XHS_MEMBER_TOKEN='...' && bash $ONECLICK"
fi

echo "==> 完成。会员页请 Ctrl+F5 强刷: \${XHS_PAY_NOTIFY_BASE:-https://monitor.xhs365.cn}/member"
