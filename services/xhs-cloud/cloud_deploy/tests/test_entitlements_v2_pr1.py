# -*- coding: utf-8 -*-
"""PR-1 权益与 legacy_gate 单元测试（无 PG 也可跑）。"""
from __future__ import annotations

import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]


def _load(name: str, rel: str):
    spec = importlib.util.spec_from_file_location(name, _ROOT / rel)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_insight_pro_no_legacy_zip():
    gate = _load("legacy_gate", "cloud_api/legacy_gate.py")
    future = datetime.now(timezone.utc) + timedelta(days=30)
    assert gate.legacy_zip_enabled(plan_code="insight_pro_monthly", expires_at=future) is False
    assert gate.insight_enabled(plan_code="insight_pro_monthly", expires_at=future) is True


def test_monthly_legacy_dual_in_period():
    gate = _load("legacy_gate", "cloud_api/legacy_gate.py")
    ent = _load("entitlements_v2", "cloud_api/entitlements_v2.py")
    future = datetime.now(timezone.utc) + timedelta(days=10)
    assert gate.legacy_zip_enabled(plan_code="monthly", expires_at=future) is True
    assert gate.insight_enabled(plan_code="monthly", expires_at=future) is True
    merged = ent.merge_entitlements({"plan_code": "monthly"})
    assert merged["legacy_zip_enabled"] is True
    assert merged["insight_enabled"] is True
    assert ent.portal_route(merged) == "legacy_dual"


def test_monthly_legacy_zip_in_period():
    test_monthly_legacy_dual_in_period()


def test_merge_entitlements_pro_timeline():
    ent = _load("entitlements_v2", "cloud_api/entitlements_v2.py")
    merged = ent.merge_entitlements({"plan_code": "insight_pro_monthly", "insight_enabled": True})
    assert merged["insight_timeline_days"] == 30
    assert merged["insight_compare"] is True


def test_portal_route_insight_only():
    ent = _load("entitlements_v2", "cloud_api/entitlements_v2.py")
    raw = {"insight_enabled": True, "insight_only": True, "legacy_zip_enabled": False}
    assert ent.portal_route(raw) == "insight_only"


if __name__ == "__main__":
    test_insight_pro_no_legacy_zip()
    test_monthly_legacy_dual_in_period()
    test_merge_entitlements_pro_timeline()
    test_portal_route_insight_only()
    print("test_entitlements_v2_pr1 OK")
