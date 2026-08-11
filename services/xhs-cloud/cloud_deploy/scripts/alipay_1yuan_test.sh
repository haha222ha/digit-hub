#!/bin/bash
# 支付宝 1 元联调：临时开启 pay_test 套餐 → 下单 → 打印二维码链接
set -euo pipefail

ENV_FILE="${XHS_ENV_FILE:-/opt/xhs-cloud/.env}"
PORT="${XHS_CLOUD_PORT:-8080}"
API="http://127.0.0.1:${PORT}"

if [ ! -f "$ENV_FILE" ]; then
  echo "缺少 $ENV_FILE"
  exit 1
fi

# 开启 1 元测试套餐（若尚未设置）
if grep -q '^XHS_PAY_ENABLE_TEST_PLAN=' "$ENV_FILE" 2>/dev/null; then
  sudo sed -i 's/^XHS_PAY_ENABLE_TEST_PLAN=.*/XHS_PAY_ENABLE_TEST_PLAN=1/' "$ENV_FILE"
else
  echo 'XHS_PAY_ENABLE_TEST_PLAN=1' | sudo tee -a "$ENV_FILE" >/dev/null
fi

echo "==> 已设置 XHS_PAY_ENABLE_TEST_PLAN=1，重启 API..."
sudo systemctl restart xhs-cloud-api

for i in $(seq 1 30); do
  if curl -sf "${API}/api/v1/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo ""
echo "==> 套餐列表（应含 pay_test）"
curl -s "${API}/api/v1/payment/plans" | python3 -m json.tool 2>/dev/null || curl -s "${API}/api/v1/payment/plans"
echo ""

echo "==> 创建支付宝 1 元测试订单..."
RESP=$(curl -s -X POST "${API}/api/v1/payment/orders" \
  -H 'Content-Type: application/json' \
  -d '{"plan_code":"pay_test","channel":"alipay"}')

echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP"
echo ""

ORDER_NO=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('order_no',''))" 2>/dev/null || true)
QRCODE=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('qrcode') or d.get('payurl') or '')" 2>/dev/null || true)

if [ -z "$ORDER_NO" ]; then
  echo "下单失败，请检查上方 JSON 中的 detail/msg"
  exit 1
fi

echo "=========================================="
echo "订单号: $ORDER_NO"
if [ -n "$QRCODE" ]; then
  echo "支付链接/二维码内容:"
  echo "  $QRCODE"
fi
echo ""
echo "请用支付宝扫码支付 1 元。"
echo "支付完成后查询订单:"
echo "  curl -s ${API}/api/v1/payment/orders/${ORDER_NO}"
echo ""
echo "会员页也可选「支付测试」套餐: https://monitor.xhs365.cn/member"
echo "联调结束后可关闭测试套餐:"
echo "  sudo sed -i 's/^XHS_PAY_ENABLE_TEST_PLAN=.*/XHS_PAY_ENABLE_TEST_PLAN=0/' $ENV_FILE"
echo "  sudo systemctl restart xhs-cloud-api"
echo "=========================================="
