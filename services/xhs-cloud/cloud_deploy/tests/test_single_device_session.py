# -*- coding: utf-8 -*-
"""PC + Web dual-slot active sessions per member account."""
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

code = db.generate_auth_codes(count=1, plan_code="monthly", duration_days=30)[0]
profile = db.register_with_auth_code("deviceuser", "pass123456", code)
uid = profile["id"]

dev_pc_a = "pc:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
dev_pc_b = "pc:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
dev_web_a = "web:CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC"
dev_web_b = "web:DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD"

sv_pc_a = db.bind_member_session(uid, dev_pc_a, "PC-A")
sv_web_a = db.bind_member_session(uid, dev_web_a, "Web-A")
assert db.verify_member_session(uid, dev_pc_a, sv_pc_a)
assert db.verify_member_session(uid, dev_web_a, sv_web_a)

sv_pc_b = db.bind_member_session(uid, dev_pc_b, "PC-B")
assert sv_pc_b > sv_pc_a
assert not db.verify_member_session(uid, dev_pc_a, sv_pc_a)
assert db.verify_member_session(uid, dev_pc_b, sv_pc_b)
assert db.verify_member_session(uid, dev_web_a, sv_web_a), "web session should stay valid when another PC logs in"

sv_web_b = db.bind_member_session(uid, dev_web_b, "Web-B")
assert sv_web_b > sv_web_a
assert not db.verify_member_session(uid, dev_web_a, sv_web_a)
assert db.verify_member_session(uid, dev_web_b, sv_web_b)
assert db.verify_member_session(uid, dev_pc_b, sv_pc_b), "pc session should stay valid when another browser logs in"

sessions = db.get_member_session(uid)
assert sessions["pc"]["device_id"] == dev_pc_b
assert sessions["web"]["device_id"] == dev_web_b

try:
    db.bind_member_session(uid, "bad", "x")
    raise AssertionError("expected invalid device_id")
except ValueError as e:
    assert "device_id" in str(e)

print("OK: dual-slot pc+web session bind + kick")
