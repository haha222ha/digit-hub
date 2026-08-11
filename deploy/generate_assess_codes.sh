#!/usr/bin/env bash
# 批量生成心象测发卡授权码（小红书 / 闲鱼 / 阿奇索等导入）
# 用法（ECS /opt/xhs-cloud）:
#   sudo bash deploy/generate_assess_codes.sh 50 xianyu-batch-001
set -euo pipefail

COUNT="${1:-10}"
NOTE="${2:-assess-faka}"
XHS_ROOT="${XHS_ROOT:-/opt/xhs-cloud}"
PLAN="${ASSESS_CODE_PLAN:-assess_single}"

cd "$XHS_ROOT"
export PYTHONPATH="$XHS_ROOT"

echo "==> 生成 ${COUNT} 个 ${PLAN} 授权码（备注: ${NOTE}）"
"$XHS_ROOT/venv/bin/python" cloud_deploy/scripts/manage_auth_codes.py generate \
  --plan "$PLAN" \
  --count "$COUNT" \
  --note "$NOTE"

echo ""
echo "发卡链接模板（替换 CODE）："
echo "  https://monitor.xhs365.cn/?api=live&code=CODE"
