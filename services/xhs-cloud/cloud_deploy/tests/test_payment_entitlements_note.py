# -*- coding: utf-8 -*-
"""W2-1：支付回调写入 insight entitlements note。"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]


def _load(rel: str):
    spec = importlib.util.spec_from_file_location("_mod", _ROOT / rel)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_entitlements_note_for_insight_pro():
    v2 = _load("cloud_api/payment_plans_v2.py")
    raw = v2.entitlements_note_for_plan("insight_pro_monthly")
    data = json.loads(raw)
    ent = data["entitlements"]
    assert ent["insight_enabled"] is True
    assert ent["legacy_zip_enabled"] is False
    assert ent["insight_only"] is True
    assert ent["plan_code"] == "insight_pro_monthly"


def test_payment_fulfillment_note():
    pay = _load("cloud_api/payment_service.py")
    note = pay._payment_fulfillment_note("ORD1", "wxpay", "insight_monthly")
    data = json.loads(note)
    assert data["entitlements"]["insight_enabled"] is True
    assert data["entitlements"]["legacy_zip_enabled"] is False


if __name__ == "__main__":
    test_entitlements_note_for_insight_pro()
    test_payment_fulfillment_note()
    print("test_payment_entitlements_note OK")
