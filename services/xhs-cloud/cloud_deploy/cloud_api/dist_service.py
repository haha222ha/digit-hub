# -*- coding: utf-8 -*-
"""心理测评分销 · 业务层（灵博兼容 + xhs-cloud 底座）。"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from cloud_deploy.cloud_api import database as db
from cloud_deploy.cloud_api import dist_db

_CATALOG_PATH = Path(__file__).resolve().parents[4] / "packages" / "psy-dist" / "tests-catalog.json"
_DEFAULT_QUOTA = int(os.environ.get("XHS_DIST_DEFAULT_QUOTA", "5"))
_LINK_MAX_USES = int(os.environ.get("XHS_DIST_LINK_MAX_USES", "3"))


def _load_catalog() -> dict:
    if _CATALOG_PATH.is_file():
        return json.loads(_CATALOG_PATH.read_text(encoding="utf-8"))
    return {"tests": []}


def list_tests() -> list[dict]:
    raw = _load_catalog().get("tests") or []
    out = []
    for t in raw:
        code = t.get("code") or t.get("test_code")
        if not code:
            continue
        out.append(
            {
                "test_code": code,
                "test_name": t.get("name") or code,
                "question_count": int(t.get("questions") or 0),
                "duration_minutes": int(t.get("duration_min") or 0),
                "is_enabled": True,
                "is_hot": bool(t.get("hot")),
                "is_dual_perspective": bool(t.get("dual_perspective")),
                "page_path": f"/tests/{code}/index.html",
            }
        )
    return out


def _test_meta(test_code: str) -> dict | None:
    for t in list_tests():
        if t["test_code"] == test_code:
            return t
    return None


def map_user_for_dist(user_id: int) -> dict:
    dist = dist_db.ensure_distributor(user_id, default_quota=_DEFAULT_QUOTA)
    return dist


def quota_info(user_id: int) -> dict:
    dist = dist_db.ensure_distributor(user_id, default_quota=_DEFAULT_QUOTA)
    return {
        "quota": dist["quota"],
        "used_quota": dist["used_quota"],
        "remaining_quota": dist["remaining_quota"],
    }


def redeem_quota_code(user_id: int, code: str) -> dict:
    code = (code or "").strip()
    if not code:
        raise ValueError("请输入兑换码")
    dist_db.ensure_distributor(user_id, default_quota=_DEFAULT_QUOTA)
    from cloud_deploy.cloud_api.payment_plans import get_plan, is_psy_dist_plan

    row = db.get_auth_code_row(code)
    if not row:
        raise ValueError("兑换码无效或已使用")
    plan = (row.get("plan_code") or "").strip()
    if not is_psy_dist_plan(plan):
        raise ValueError("该码不是分销额度码")
    if (row.get("status") or "") == "revoked":
        raise ValueError("兑换码已被吊销")
    if int(row.get("current_activations") or 0) >= int(row.get("max_activations") or 1):
        raise ValueError("兑换码已使用")
    note_raw = row.get("note") or ""
    quota_amount = 0
    try:
        note = json.loads(note_raw) if note_raw else {}
        quota_amount = int(note.get("quota_amount") or 0)
    except Exception:
        quota_amount = 0
    if quota_amount <= 0:
        plan_row = get_plan(plan) or {}
        quota_amount = int(plan_row.get("quota_amount") or 0)
    if quota_amount <= 0:
        raise ValueError("兑换码配置异常，请联系管理员")
    db.redeem_dist_quota_code(user_id, code, quota_amount)
    dist = dist_db.add_quota(user_id, quota_amount, change_type="redeem", remark=f"兑换码 {code}")
    return {"added": quota_amount, "quota": dist["quota"], "remaining_quota": dist["remaining_quota"]}


def generate_links(user_id: int, test_code: str, count: int) -> dict:
    meta = _test_meta(test_code)
    if not meta:
        raise ValueError("测试项目不存在")
    links = dist_db.generate_links(user_id, test_code, count, max_uses=_LINK_MAX_USES)
    return {"links": links, "generatedCount": len(links)}


def validate_token(token: str, test_code: str | None = None) -> dict:
    out = dist_db.validate_link_token(token)
    if not out.get("valid"):
        return out
    meta = _test_meta(out.get("testCode") or test_code or "")
    out["is_dual_perspective"] = bool(meta and meta.get("is_dual_perspective"))
    if test_code and out.get("testCode") and out["testCode"] != test_code:
        return {"valid": False, "message": "链接与测题不匹配"}
    return out


def start_test(token: str) -> dict:
    dist_db.start_link_test(token)
    return {"success": True}


def complete_test(token: str, *, result_data: Any = None, perspective: str | None = None) -> dict:
    return dist_db.complete_link_test(token, result_data=result_data, perspective=perspective)


def fulfill_quota_from_payment(user_id: int, plan_code: str, order_no: str) -> None:
    from cloud_deploy.cloud_api.payment_plans import get_plan

    plan = get_plan(plan_code) or {}
    amount = int(plan.get("quota_amount") or 0)
    if amount <= 0:
        return
    dist_db.add_quota(user_id, amount, change_type="purchase", remark=f"订单 {order_no}")


def list_packages() -> list[dict]:
    from cloud_deploy.cloud_api.payment_plans import list_psy_dist_plans

    out = []
    for i, p in enumerate(list_psy_dist_plans(), start=1):
        price_yuan = float(p.get("price_yuan") or p.get("amount") or 0)
        features = (p.get("summary") or "").split("·")
        features = [x.strip() for x in features if x.strip()]
        out.append(
            {
                "id": i,
                "name": p["label"],
                "price": int(round(price_yuan * 100)),
                "quota": int(p.get("quota_amount") or 0),
                "quota_amount": int(p.get("quota_amount") or 0),
                "is_enabled": True,
                "display_order": i,
                "created_at": "2026-01-01T00:00:00Z",
                "subtitle": p.get("summary") or "",
                "features": features or [p.get("summary") or ""],
                "plan_code": p["plan_code"],
                "recommended": bool(p.get("recommended")),
            }
        )
    return out
