#!/bin/bash
# 选品云端首次安装 — 仓库 https://github.com/haha222ha/vuemonitor/xhs-cloud
set -euo pipefail

XHS_ROOT="${XHS_ROOT:-/opt/xhs-cloud}"
SRC="${1:-}"

if [[ -z "$SRC" ]]; then
  # 默认: /opt/xhs-cloud/cloud_deploy 或 vuemonitor 内的 xhs-cloud
  if [[ -d "/opt/vuemonitor/xhs-cloud/cloud_deploy" ]]; then
    SRC="/opt/vuemonitor/xhs-cloud"
  else
    SRC="$(cd "$(dirname "$0")/.." && pwd)"
  fi
fi

PKG="$SRC/cloud_deploy"
if [[ ! -d "$PKG" ]]; then
  PKG="$SRC"
fi
if [[ ! -f "$PKG/install.sh" && -f "$SRC/install.sh" ]]; then
  PKG="$SRC"
fi

echo "==> 部署到 $XHS_ROOT (from $PKG)"
mkdir -p "$XHS_ROOT"/{cloud_deploy,data/incoming,data/report_archives,venv}

if [[ -d "$PKG/cloud_api" || -d "$PKG/scripts" ]]; then
  rsync -a --delete \
    --exclude venv --exclude data --exclude .env --exclude __pycache__ \
    "$PKG/" "$XHS_ROOT/cloud_deploy/"
elif [[ -d "$SRC/cloud_deploy" ]]; then
  rsync -a --delete \
    --exclude venv --exclude data --exclude .env --exclude __pycache__ \
    "$SRC/cloud_deploy/" "$XHS_ROOT/cloud_deploy/"
fi

if [[ ! -f "$XHS_ROOT/.env" ]]; then
  cp "$XHS_ROOT/cloud_deploy/.env.example" "$XHS_ROOT/.env"
  echo "请编辑 $XHS_ROOT/.env（PG 密码、SYNC_KEY、JWT_SECRET）"
fi

echo "==> Python venv"
if [[ ! -x "$XHS_ROOT/venv/bin/python" ]]; then
  python3 -m venv "$XHS_ROOT/venv"
fi
"$XHS_ROOT/venv/bin/pip" install -U pip
"$XHS_ROOT/venv/bin/pip" install -r "$XHS_ROOT/cloud_deploy/requirements-cloud.txt"

echo "==> 数据目录"
mkdir -p "$XHS_ROOT/data/incoming" "$XHS_ROOT/data/report_archives"

echo "==> systemd"
cp "$XHS_ROOT/cloud_deploy/systemd/"*.service /etc/systemd/system/
cp "$XHS_ROOT/cloud_deploy/systemd/"*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable xhs-cloud-api.service xhs-prune-snapshots.timer
# 纯线上全自动（推荐）:
# systemctl enable xhs-daily-report.timer xhs-daemon.service
# 混合模式（本地 gen_report + scp）:
# systemctl enable xhs-ingest-report.timer

echo "==> 完成。下一步:"
echo "  1. sudo -u postgres psql -d vuemonitor -f $XHS_ROOT/cloud_deploy/database/init_xhs_monitor.sql"
echo "  2. nano $XHS_ROOT/.env"
echo "  3. sudo systemctl start xhs-cloud-api"
echo "  4. 可选: sudo cp $XHS_ROOT/cloud_deploy/deploy/nginx-xhs-monitor.conf /etc/nginx/sites-available/"
echo "     sudo ln -sf /etc/nginx/sites-available/nginx-xhs-monitor.conf /etc/nginx/sites-enabled/"
echo "  5. 本地 gen_report 后: scp 全量MMDD 到 $XHS_ROOT/data/incoming/"
