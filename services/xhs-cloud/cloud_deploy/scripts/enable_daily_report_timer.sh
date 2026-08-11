#!/bin/bash
# 混合模式：启用云端 17:00 日报 timer（本地 16:30 推 PG，云端打 zip）
# 用法: sudo bash cloud_deploy/scripts/enable_daily_report_timer.sh

set -euo pipefail

echo "启用 xhs-daily-report.timer (17:00 PG→zip) …"
systemctl enable xhs-daily-report.timer
systemctl start xhs-daily-report.timer

echo "可选: 若在用 SCP ingest 混合，可关闭 HTTP 已替代的 ingest timer"
if systemctl is-enabled xhs-ingest-report.timer &>/dev/null; then
  echo "  xhs-ingest-report.timer 当前 enabled（本地 HTTP 推云时可 disable）"
fi

systemctl list-timers xhs-daily-report.timer --no-pager
echo "完成"
