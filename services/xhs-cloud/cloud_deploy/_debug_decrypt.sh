#!/bin/bash
set -e
cd /opt/xhs-cloud
if [ -f .env ]; then
    set -a
    . ./.env
    set +a
fi
/opt/xhs-cloud/venv/bin/python <<'PYEOF'
import os
from cloud_deploy.cloud_api.insight_settings import _encryption_secret, _decrypt, _load_raw
from cloud_deploy.cloud_api.database_pg import _conn, init_db
print("secret source env vars:")
print("  XHS_SETTINGS_SECRET:", repr(os.environ.get("XHS_SETTINGS_SECRET")))
print("  XHS_CLOUD_JWT_SECRET:", repr(os.environ.get("XHS_CLOUD_JWT_SECRET"))[:30] + "..." if os.environ.get("XHS_CLOUD_JWT_SECRET") else "None")
print("  XHS_CLOUD_SYNC_KEY:", repr(os.environ.get("XHS_CLOUD_SYNC_KEY"))[:30] + "..." if os.environ.get("XHS_CLOUD_SYNC_KEY") else "None")
print("  _encryption_secret() returns:", repr(_encryption_secret())[:30] + "...")
init_db()
c = _conn()
try:
    raw = _load_raw(c)
    print("raw api_key_enc (first 20 chars):", repr(str(raw.get("api_key_enc") or "")[:20]))
    try:
        decrypted = _decrypt(str(raw.get("api_key_enc") or ""))
        print("decrypted api_key (first 10 chars):", repr(decrypted[:10]) if decrypted else "(empty)")
        print("decrypted len:", len(decrypted))
    except Exception as e:
        print("decrypt exception:", type(e).__name__, str(e))
finally:
    c.close()
PYEOF
