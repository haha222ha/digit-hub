#!/bin/bash
# 自动安装 monitor nginx 限流（无需手改 nginx.conf）
# 用法: bash /opt/xhs-cloud/cloud_deploy/scripts/ensure_nginx_insight_limits.sh
set -euo pipefail

VM_REPO="${VM_REPO:-/opt/vuemonitor}"
SNIP_SRC="${VM_REPO}/nginx/snippets/insight-limits.conf"
MON_SRC="${VM_REPO}/nginx/monitor.conf"
NGINX_CONF="${NGINX_CONF:-/etc/nginx/nginx.conf}"

if ! command -v nginx &>/dev/null; then
  echo "[nginx] nginx 未安装，跳过"
  exit 0
fi

if [[ ! -f "$SNIP_SRC" ]]; then
  echo "[nginx] 缺少 $SNIP_SRC，跳过"
  exit 0
fi

sudo mkdir -p /etc/nginx/snippets
sudo cp "$SNIP_SRC" /etc/nginx/snippets/insight-limits.conf

if [[ -f "$MON_SRC" ]]; then
  sudo cp "$MON_SRC" /etc/nginx/sites-available/monitor.conf
  sudo ln -sf /etc/nginx/sites-available/monitor.conf /etc/nginx/sites-enabled/monitor.conf 2>/dev/null || true
fi

if [[ -f "$NGINX_CONF" ]] && ! grep -q 'insight-limits.conf' "$NGINX_CONF" 2>/dev/null; then
  # 在 http { 下一行自动插入 include（Ubuntu/Debian 默认结构）
  sudo sed -i '/^[[:space:]]*http[[:space:]]*{/a \    include /etc/nginx/snippets/insight-limits.conf;' "$NGINX_CONF"
  echo "[nginx] 已在 $NGINX_CONF 的 http{} 内添加 insight-limits include"
fi

sudo nginx -t
sudo systemctl reload nginx
echo "[nginx] monitor 限流已生效"
