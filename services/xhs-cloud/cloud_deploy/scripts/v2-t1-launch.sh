#!/bin/bash
# T1 开流量：XHS_V2_LAUNCH=1 + 全链路部署 + 验收
#
# 用法:
#   export XHS_MEMBER_TOKEN='...'   # legacy_dual 老用户验收
#   bash /opt/vuemonitor/xhs-cloud/cloud_deploy/scripts/v2-t1-launch.sh
#
# 新 insight_only 用户验收（体验码账号）:
#   export XHS_MEMBER_TOKEN='...'
#   export XHS_SMOKE_EXPECT=insight_only
#   bash .../v2-t1-launch.sh
#
set -euo pipefail

VM_REPO="${VM_REPO:-/opt/vuemonitor}"
ENV_FILE="${XHS_ENV_FILE:-/opt/xhs-cloud/.env}"

echo ""
echo "  ================================================"
echo "  |  T1 开流量：XHS_V2_LAUNCH=1                  |"
echo "  ================================================"

cd "$VM_REPO"
git fetch origin main
git reset --hard origin/main

if [[ ! -f "$ENV_FILE" ]]; then
  echo "缺少 $ENV_FILE" >&2
  exit 1
fi

if grep -q '^XHS_V2_LAUNCH=' "$ENV_FILE" 2>/dev/null; then
  sudo sed -i 's/^XHS_V2_LAUNCH=.*/XHS_V2_LAUNCH=1/' "$ENV_FILE"
else
  echo 'XHS_V2_LAUNCH=1' | sudo tee -a "$ENV_FILE" >/dev/null
fi
echo "  ✓ XHS_V2_LAUNCH=1 已写入 $ENV_FILE"

export XHS_SMOKE_EXPECT="${XHS_SMOKE_EXPECT:-legacy_dual}"
bash "${VM_REPO}/xhs-cloud/cloud_deploy/scripts/v2-oneclick-deploy.sh"

echo ""
echo "  --- 支付页 SKU 验收 ---"
PORT="${XHS_CLOUD_PORT:-8080}"
python3 <<PY
import json, os, urllib.request
port = os.environ.get("XHS_CLOUD_PORT", "8080")
try:
    d = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/api/v1/payment/plans", timeout=10))
except Exception as e:
    print(f"  ! plans API: {e}")
    raise SystemExit(0)
plans = d.get("plans") or []
codes = [p.get("plan_code") for p in plans]
legacy = set(codes) & {"monthly", "quarterly", "yearly", "halfyear", "weekly"}
insight = [c for c in codes if str(c).startswith("insight_")]
print("  plans:", codes)
if insight and not legacy:
    print("  ✓ 支付页仅 insight SKU (T1)")
else:
    print("  ! 仍有 Legacy SKU 或未找到 insight_* — 检查 XHS_V2_LAUNCH=1 并重启 API")
PY

echo ""
echo "  T1 完成。新用户仅 insight；在期老月卡仍 legacy_dual。"
echo "  体验码：admin → 选品会员 → AI 情报体验 (7天)"
echo "  insight_only 验收: export XHS_MEMBER_TOKEN='...' && bash ${VM_REPO}/xhs-cloud/cloud_deploy/scripts/smoke_insight_only.sh"
echo "  文档：projects/ai-market-intelligence-v2/docs/30-T1-LAUNCH-CHECKLIST.md"
echo ""
