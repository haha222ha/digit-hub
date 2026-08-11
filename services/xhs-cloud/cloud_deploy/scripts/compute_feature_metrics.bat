@echo off
REM Feature Engine PG 计算定时任务 — 每日 03:00 执行
REM 计算增速/加速度/连续上榜天数，写入 goods_feature_metrics 表
REM 对应需求文档 48 §P2

set XHS_PREMIUM_DATABASE_URL=postgresql://xhs:xhs@127.0.0.1:5432/xhs_monitor
cd /d e:\vuemonitor\xhs-cloud
python cloud_deploy\scripts\compute_feature_metrics.py >> e:\vuemonitor\xhs-cloud\logs\feature_metrics.log 2>&1
