#!/bin/bash
# GA：Legacy 日报 zip timer 安全停用（最后 Legacy expires_at 之后执行）
# 用法: CONFIRM=1 bash .../disable_legacy_report_timer.sh
set -euo pipefail

if [[ "${CONFIRM:-}" != "1" ]]; then
  echo "将 disable: xhs-daily-report.timer xhs-weekly-report.timer xhs-monthly-report.timer"
  echo "并设置 XHS_LEGACY_ZIP_GENERATION=0 到 /opt/xhs-cloud/.env"
  echo "确认后执行: CONFIRM=1 bash $0"
  exit 1
fi

ENV_FILE="${XHS_ENV_FILE:-/opt/xhs-cloud/.env}"
for t in xhs-daily-report xhs-weekly-report xhs-monthly-report; do
  if systemctl is-enabled "${t}.timer" &>/dev/null; then
    sudo systemctl disable --now "${t}.timer"
    echo "disabled ${t}.timer"
  fi
done

if [[ -f "$ENV_FILE" ]]; then
  if grep -q '^XHS_LEGACY_ZIP_GENERATION=' "$ENV_FILE"; then
    sed -i 's/^XHS_LEGACY_ZIP_GENERATION=.*/XHS_LEGACY_ZIP_GENERATION=0/' "$ENV_FILE"
  else
    echo 'XHS_LEGACY_ZIP_GENERATION=0' >> "$ENV_FILE"
  fi
  echo "updated $ENV_FILE"
fi

echo "Legacy zip generation stopped. V2 insight timer 不受影响."
