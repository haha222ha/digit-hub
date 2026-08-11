#!/bin/bash
# 支付回调排查：日志 + 公网 notify 探测 + 可选本地模拟回调
set -euo pipefail

ORDER_NO="${1:-}"
ENV_FILE="${XHS_ENV_FILE:-/opt/xhs-cloud/.env}"
PORT="${XHS_CLOUD_PORT:-8080}"
ROOT="${DEPLOY_ROOT:-/opt/xhs-cloud}"

echo "========== 支付回调排查 =========="
echo ""

if [ -n "$ORDER_NO" ]; then
  echo "[订单 $ORDER_NO]"
  curl -s "http://127.0.0.1:${PORT}/api/v1/payment/orders/${ORDER_NO}" | python3 -m json.tool 2>/dev/null || true
  echo ""
fi

echo "[最近 API 日志（含 notify 相关）]"
sudo journalctl -u xhs-cloud-api -n 80 --no-pager 2>/dev/null | tail -40 || true
echo ""

echo "[公网 notify 探测（无参应返回 fail）]"
curl -s -m 10 "https://monitor.xhs365.cn/api/v1/payment/notify/hwxun" || echo "timeout"
echo ""
echo ""

if [ -n "$ORDER_NO" ]; then
  echo "若 xapay 后台显示该单已支付，但上面仍是 pending，可本地模拟回调补单:"
  echo "  cd $ROOT && ./venv/bin/python cloud_deploy/scripts/simulate_hwxun_notify.py $ORDER_NO"
  echo ""
  echo "仅查看将要发送的签名参数:"
  echo "  cd $ROOT && ./venv/bin/python cloud_deploy/scripts/simulate_hwxun_notify.py $ORDER_NO --dry-run"
fi

echo ""
echo "常见原因:"
echo "  1. 尚未在支付宝完成 1 元付款"
echo "  2. xapay 商户后台未填异步通知 URL"
echo "  3. xapay 后台订单「通知状态」失败（密钥/PID 与 .env 不一致）"
echo "  通知 URL: https://monitor.xhs365.cn/api/v1/payment/notify/hwxun"
