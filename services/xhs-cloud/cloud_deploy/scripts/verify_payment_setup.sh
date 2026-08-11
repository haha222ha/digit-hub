#!/bin/bash
# 选品会员支付配置自检（服务器上运行，不打印密钥明文）
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/opt/xhs-cloud}"
ENV_FILE="${XHS_ENV_FILE:-$ROOT/.env}"
PORT="${XHS_CLOUD_PORT:-8080}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok() { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }

echo ""
echo "========== 选品会员支付自检 =========="

if [ ! -f "$ENV_FILE" ]; then
  fail "缺少 $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
set -a && source "$ENV_FILE" && set +a

check_var() {
  local name="$1"
  local val="${!name:-}"
  if [ -n "$val" ]; then
    ok "$name 已设置（长度 ${#val}）"
  else
    fail "$name 未设置"
    return 1
  fi
}

echo ""
echo "[.env]"
check_var XHS_PAY_PID || true
check_var XHS_PAY_KEY || true
check_var XHS_PAY_NOTIFY_BASE || true
check_var XHS_PAY_ALIPAY_PID || true
check_var XHS_PAY_ALIPAY_KEY || true

NOTIFY_BASE="${XHS_PAY_NOTIFY_BASE:-https://monitor.xhs365.cn}"
NOTIFY_URL="${NOTIFY_BASE%/}/api/v1/payment/notify/hwxun"
echo ""
echo "  下单 notify_url: $NOTIFY_URL"
echo "  （商户后台异步通知也请填此地址）"

echo ""
echo "[API 健康]"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/v1/health" || echo "000")
if [ "$CODE" = "200" ]; then ok "health HTTP 200"; else fail "health HTTP $CODE"; fi

echo ""
echo "[支付通道]"
CH=$(curl -s "http://127.0.0.1:${PORT}/api/v1/payment/channels" || echo "")
echo "  $CH"
echo "$CH" | grep -q wxpay && ok "微信通道可用" || warn "微信通道未就绪"
echo "$CH" | grep -q alipay && ok "支付宝通道可用" || warn "支付宝未配置或 PID/KEY 缺失"

echo ""
echo "[回调路由]"
NF=$(curl -s "http://127.0.0.1:${PORT}/api/v1/payment/notify/hwxun" || echo "")
if [ "$NF" = "fail" ]; then
  ok "本地回调路由正常（无签名参数返回 fail 为预期）"
else
  warn "回调返回: $NF"
fi

if command -v curl >/dev/null && [ -n "${NOTIFY_BASE#http}" ]; then
  PUB=$(curl -s -m 10 "${NOTIFY_URL}" 2>/dev/null || echo "timeout")
  if [ "$PUB" = "fail" ]; then
    ok "公网回调可达: $NOTIFY_URL"
  else
    warn "公网回调: $PUB（检查 nginx / Cloudflare）"
  fi
fi

echo ""
echo "========== 商户后台（需网页手动配置，无法 git push）=========="
echo "  微信: https://pay.hwxun.cn/"
echo "  支付宝: https://xapay.hwxun.cn/user/"
echo "  签名: MD5 + RSA 兼容"
echo "  通知: $NOTIFY_URL"
echo "  支付宝若报「没有可用支付账号」→ 在 xapay 后台启用「支付宝云端免挂」通道"
echo ""
