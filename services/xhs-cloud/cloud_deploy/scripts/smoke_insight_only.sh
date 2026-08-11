#!/bin/bash
# T1 体验码 / insight_only 账号验收（需已登录 JWT）
#
# 用法:
#   export XHS_MEMBER_TOKEN='eyJ...'   # 体验码激活后的 token
#   bash /opt/xhs-cloud/cloud_deploy/scripts/smoke_insight_only.sh
#
set -euo pipefail

ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
if [[ ! -d "$ROOT/cloud_deploy" && -d /opt/xhs-cloud/cloud_deploy ]]; then
  ROOT="/opt/xhs-cloud"
fi

if [[ -z "${XHS_MEMBER_TOKEN:-}" ]]; then
  echo "请设置 XHS_MEMBER_TOKEN（体验码账号登录后从会员页 localStorage 或 Network 获取）" >&2
  exit 1
fi

export XHS_SMOKE_EXPECT=insight_only
bash "$ROOT/cloud_deploy/scripts/insight_shadow_smoke.sh"
