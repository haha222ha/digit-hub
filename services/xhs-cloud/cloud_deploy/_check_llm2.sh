#!/bin/bash
set -e
cd /opt/xhs-cloud
/opt/xhs-cloud/venv/bin/python <<'PYEOF'
from cloud_deploy.cloud_api.insight_settings import resolve_runtime_config
rt = resolve_runtime_config()
print("enabled:", rt.get("enabled"))
print("model:", rt.get("model"))
print("api_key_set:", bool(rt.get("api_key")))
print("base_url:", rt.get("base_url"))
PYEOF
