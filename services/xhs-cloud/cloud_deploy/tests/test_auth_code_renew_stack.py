# -*- coding: utf-8 -*-
"""Auth code renewal with remaining-days stacking (SQLite)."""
from __future__ import annotations

import os
import sys
import tempfile
from datetime import datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
os.environ.pop("XHS_DATABASE_URL", None)
os.environ["XHS_CLOUD_API_DB"] = tempfile.mktemp(suffix=".db")

from cloud_deploy.cloud_api import database as db
from cloud_deploy.cloud_api import database_sqlite as dbs

db.init_db()
db.ensure_admin()

code1 = db.generate_auth_codes(count=1, plan_code="monthly", duration_days=30)[0]
profile = db.register_with_auth_code("stackuser", "pass123456", code1)
uid = profile["id"]

conn = dbs._conn()
c = conn.cursor()
future = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d %H:%M:%S")
c.execute(
    "UPDATE memberships SET expires_at=? WHERE user_id=?",
    (future, uid),
)
conn.commit()
conn.close()

code2 = db.generate_auth_codes(count=1, plan_code="monthly", duration_days=30)[0]
renewed = db.renew_with_auth_code(uid, code2)
stack = renewed.get("renew_stack") or {}

assert stack.get("stacked") is True
assert 4 <= int(stack.get("previous_days_remaining") or 0) <= 5
assert stack.get("days_added") == 30
assert int(renewed.get("days_remaining") or 0) >= 34

try:
    db.renew_with_auth_code(uid, code2)
    raise AssertionError("expected duplicate code error")
except ValueError as e:
    assert "已使用过" in str(e) or "最大激活" in str(e)

cred_renew = db.renew_with_credentials("stackuser", "pass123456", db.generate_auth_codes(count=1, duration_days=7)[0])
assert cred_renew.get("is_active") is True

expired_login = db.authenticate_user("stackuser", "pass123456")
assert expired_login and expired_login["username"] == "stackuser"

print("OK: auth code renew stack + renew_with_credentials")
