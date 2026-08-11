#!/usr/bin/env bash
# 统一授权码批量生成（所有 product 共用）
# Usage:
#   sudo bash /opt/digit-hub/deploy/generate_auth_codes.sh <product> <sku> <count> [channel]
# Example:
#   sudo bash /opt/digit-hub/deploy/generate_auth_codes.sh assess card 50 xianyu-batch-001
#   sudo bash /opt/digit-hub/deploy/generate_auth_codes.sh insight monthly 10 agent-a
set -euo pipefail

PRODUCT="${1:?用法: $0 <product> <sku> <count> [channel]}"
SKU="${2:?用法: $0 <product> <sku> <count> [channel]}"
COUNT="${3:?用法: $0 <product> <sku> <count> [channel]}"
CHANNEL="${4:-}"

XHS_ROOT="${XHS_ROOT:-/opt/xhs-cloud}"
cd "$XHS_ROOT"
export PYTHONPATH="$XHS_ROOT"

ARGS=(generate --product "$PRODUCT" --sku "$SKU" --count "$COUNT" --export)
if [[ -n "$CHANNEL" ]]; then
  ARGS+=(--channel "$CHANNEL")
fi

"$XHS_ROOT/venv/bin/python" cloud_deploy/scripts/manage_auth_codes.py "${ARGS[@]}"
