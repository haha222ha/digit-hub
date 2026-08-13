# -*- coding: utf-8 -*-
"""心理测评分销 · 业务层（分销兼容 API + xhs-cloud 底座）。"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from cloud_deploy.cloud_api import database as db
from cloud_deploy.cloud_api import dist_db

_DEFAULT_QUOTA = int(os.environ.get("XHS_DIST_DEFAULT_QUOTA", "5"))
_LINK_MAX_USES = int(os.environ.get("XHS_DIST_LINK_MAX_USES", "3"))


def _resolve_catalog_path() -> Path:
    """digit-hub monorepo 与 ECS /opt/xhs-cloud 双布局均可找到 catalog。"""
    env = (os.environ.get("XHS_PSY_DIST_CATALOG") or "").strip()
    if env:
        p = Path(env)
        if p.is_file():
            return p
    here = Path(__file__).resolve()
    # cloud_api → cloud_deploy → xhs-cloud → services → digit-hub
    monorepo = here.parents[4] / "packages" / "psy-dist" / "tests-catalog.json"
    candidates = [
        monorepo,
        Path("/opt/digit-hub/packages/psy-dist/tests-catalog.json"),
        here.parents[1] / "assets" / "psy-dist" / "tests-catalog.json",
        Path("/opt/xhs-cloud/cloud_deploy/assets/psy-dist/tests-catalog.json"),
    ]
    for p in candidates:
        if p.is_file():
            return p
    return monorepo


_CATALOG_PATH = _resolve_catalog_path()


def _load_catalog() -> dict:
    path = _resolve_catalog_path()
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"tests": []}


def list_tests(*, include_disabled: bool = False) -> list[dict]:
    raw = _load_catalog().get("tests") or []
    out = []
    for i, t in enumerate(raw):
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
                "display_order": i + 1,
                "page_path": f"/tests/{code}/index.html",
            }
        )
    try:
        from cloud_deploy.cloud_api import dist_ops

        out = dist_ops.apply_test_overrides(out)
    except Exception:
        pass
    if include_disabled:
        return out
    return [t for t in out if t.get("is_enabled", True)]


def _test_meta(test_code: str) -> dict | None:
    for t in list_tests():
        if t["test_code"] == test_code:
            return t
    return None


def map_user_for_dist(user_id: int) -> dict:
    dist = dist_db.ensure_distributor(user_id, default_quota=_DEFAULT_QUOTA)
    username = (dist.get("username") or "").strip()
    if username:
        dist_db.ensure_super_role(user_id, username)
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
    # DB 套餐覆盖额度
    try:
        from cloud_deploy.cloud_api import dist_ops

        ov = dist_ops.get_package_by_plan(plan_code)
        if ov and int(ov.get("quota_amount") or 0) > 0:
            plan = {**plan, "quota_amount": int(ov["quota_amount"])}
    except Exception:
        pass
    amount = int(plan.get("quota_amount") or 0)
    if amount <= 0:
        return
    dist_db.add_quota(user_id, amount, change_type="purchase", remark=f"订单 {order_no}")
    try:
        dist_db.apply_first_purchase_invite_rebate(user_id, amount, order_no)
    except Exception:
        pass


def list_packages() -> list[dict]:
    from cloud_deploy.cloud_api import dist_ops

    return dist_ops.list_packages_merged()
