# -*- coding: utf-8 -*-
"""Quick test for auth-code login and password change (SQLite)."""
from __future__ import annotations

import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
os.environ.pop("XHS_DATABASE_URL", None)
os.environ["XHS_CLOUD_API_DB"] = tempfile.mktemp(suffix=".db")

from cloud_deploy.cloud_api import database as db

db.init_db()
db.ensure_admin()
codes = db.generate_auth_codes(count=1, plan_code="monthly", duration_days=30)
code = codes[0]
profile = db.register_with_auth_code("testuser1", "oldpass123", code)
assert profile["username"] == "testuser1"

profile2 = db.login_with_auth_code(code)
assert profile2["username"] == "testuser1"

db.change_password(profile["id"], "newpass456")
user = db.authenticate("testuser1", "newpass456")
assert user and user["username"] == "testuser1"

try:
    db.login_with_auth_code("INVALID-CODE-XXXX")
    raise AssertionError("expected ValueError")
except ValueError as e:
    assert "授权码" in str(e)

print("OK: auth code login + password change")
