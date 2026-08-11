#!/bin/bash
# 加载 .env 后再跑
set -e
cd /opt/xhs-cloud
if [ -f .env ]; then
    set -a
    . ./.env
    set +a
fi
/opt/xhs-cloud/venv/bin/python <<'PYEOF'
import os, json
from cloud_deploy.cloud_api.database_pg import _conn, init_db
init_db()
c = _conn()
try:
    with c.cursor() as cur:
        cur.execute("SET search_path TO xhs_monitor, public")
        cur.execute("SELECT key, value_json FROM system_settings WHERE key LIKE '%llm%' OR key LIKE '%insight%'")
        rows = cur.fetchall()
        for k, v in rows:
            print("KEY:", k)
            if isinstance(v, dict):
                print("  enabled:", v.get("enabled"))
                print("  has api_key_enc:", bool(v.get("api_key_enc")))
                print("  api_key_enc_len:", len(str(v.get("api_key_enc") or "")))
                print("  provider:", v.get("provider"))
                print("  model:", v.get("model"))
                print("  updated_at:", v.get("updated_at"))
            else:
                print("  raw:", v)
finally:
    c.close()
PYEOF
