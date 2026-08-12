# -*- coding: utf-8 -*-
"""首次粘贴授权码自动开通（发卡网 / 码登录统一路径）。"""
from __future__ import annotations

import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
os.environ.pop("XHS_DATABASE_URL", None)
os.environ["XHS_CLOUD_API_DB"] = tempfile.mktemp(suffix=".db")

from cloud_deploy.cloud_api import database as db
from cloud_deploy.cloud_api.auth import login_member_by_code

db.init_db()
db.ensure_admin()
code = db.generate_auth_codes(count=1, plan_code="assess_single", duration_days=7)[0]

res = login_member_by_code(code, "web:test-device", "pytest")
assert res["login_method"] == "auth_code_redeem"
assert res["auth_code"] == code
assert res["membership"]["username"] == code

res2 = login_member_by_code(code, "web:test-device-2", "pytest")
assert res2["login_method"] == "auth_code"
assert res2["membership"]["username"] == code

print("OK: auth code first-time redeem + re-login")
