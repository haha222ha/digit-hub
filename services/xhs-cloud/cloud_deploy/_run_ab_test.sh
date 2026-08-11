#!/bin/bash
# 手动 source .env 后跑 A/B 测试
set -e
cd /opt/xhs-cloud
if [ -f .env ]; then
    set -a
    . ./.env
    set +a
fi
echo "XHS_DATABASE_URL set: $([ -n "$XHS_DATABASE_URL" ] && echo yes || echo no)"
echo "XHS_CLOUD_SYNC_KEY set: $([ -n "$XHS_CLOUD_SYNC_KEY" ] && echo yes || echo no)"
# 先验证 LLM 配置能加载
/opt/xhs-cloud/venv/bin/python - <<'PYEOF'
from cloud_deploy.scripts.bootstrap_env import bootstrap
bootstrap()
from cloud_deploy.scripts.insight_llm_runtime import apply_admin_insight_llm
cfg = apply_admin_insight_llm(log_prefix="advisor-verify")
print("LLM enabled:", cfg.get("enabled"))
print("LLM api_key_set:", bool(cfg.get("api_key")))
print("LLM model:", cfg.get("model"))
PYEOF
echo "---- 开始 A/B 测试 ----"
/opt/xhs-cloud/venv/bin/python cloud_deploy/scripts/advisor_cloud_generate.py --ab-test --date 2026-07-14
