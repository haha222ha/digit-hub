#!/bin/bash
# A/B 测试每日运行脚本
# - 自动加载 /opt/xhs-cloud/.env
# - 检查今天的 context 是否存在，不存在则跳过
# - 自动创建 .ready 标记（如果缺失）
# - 跑 A/B 测试并写入 ab_test_metrics 表
set -e
cd /opt/xhs-cloud
if [ -f .env ]; then
    set -a
    . ./.env
    set +a
fi

TODAY=$(date +%Y-%m-%d)
INCOMING_DIR="/opt/xhs-cloud/data/incoming/advisor"
CONTEXT_FILE="$INCOMING_DIR/context_${TODAY}.json"
READY_FILE="$INCOMING_DIR/context_${TODAY}.ready"

if [ ! -f "$CONTEXT_FILE" ]; then
    echo "[ab-test] $(date): 今日 context 不存在 ($CONTEXT_FILE)，跳过"
    exit 0
fi

# 如果 .ready 不存在但 context.json 存在，自动创建 .ready
if [ ! -f "$READY_FILE" ]; then
    touch "$READY_FILE"
    echo "[ab-test] $(date): 自动创建 .ready 标记"
fi

echo "[ab-test] $(date): 开始 A/B 测试 $TODAY"
/opt/xhs-cloud/venv/bin/python cloud_deploy/scripts/advisor_cloud_generate.py --ab-test --date "$TODAY"
echo "[ab-test] $(date): A/B 测试完成"
