#!/bin/bash
set -e
cd /opt/xhs-cloud
python3 <<'PYEOF'
import os, json
os.environ.setdefault("XHS_DATABASE_URL", "postgresql://saas_user:MI3gS1wvsonmySwdC2KvagqDfTYXyTWE@localhost:5432/vuemonitor")
from cloud_deploy.cloud_api.insight_settings import resolve_runtime_config, get_public_config
from cloud_deploy.cloud_api.database_pg import _conn, init_db
init_db()
c = _conn()
try:
    pub = get_public_config(c)
    rt = resolve_runtime_config(c)
    print("public:", json.dumps(pub, ensure_ascii=False, indent=2, default=str))
    print("runtime enabled:", rt.get("enabled"))
    print("runtime api_key_set:", bool(rt.get("api_key")))
    print("runtime model:", rt.get("model"))
finally:
    c.close()
PYEOF
