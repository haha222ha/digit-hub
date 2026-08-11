@echo off
REM 关键词统计与去重优化 — 每日 03:30 执行（在 Feature Engine 03:00 之后）
REM 1. Jaccard 重叠率计算 2. 贪心集合覆盖去重
REM 对应需求文档 48 §6

set XHS_PREMIUM_DATABASE_URL=postgresql://xhs:xhs@127.0.0.1:5432/xhs_monitor
cd /d e:\vuemonitor\xhs-cloud
echo === keyword overlap compute === >> logs\keyword_optimize.log
python cloud_deploy\scripts\compute_keyword_overlap.py --threshold 0.8 >> logs\keyword_optimize.log 2>&1
echo === greedy optimize === >> logs\keyword_optimize.log
python cloud_deploy\scripts\optimize_keywords.py --threshold 0.8 >> logs\keyword_optimize.log 2>&1
