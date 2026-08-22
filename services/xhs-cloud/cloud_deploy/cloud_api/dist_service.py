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
# allocate 库存不足时自动生成条数（与发货助手默认补货一致，单次上限 50）
_ALLOCATE_AUTOTOPUP_COUNT = max(
    1, min(int(os.environ.get("XHS_DIST_ALLOCATE_AUTOTOPUP", "50")), 50)
)


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


def unlimited_session_urls(test_code: str, token: str, origin: str | None = None) -> dict[str, str]:
    """生成免费测试 / 结果直显相关 URL（商家后台与 API 共用）。"""
    from urllib.parse import quote

    base = (origin or os.environ.get("XHS_PUBLIC_ORIGIN") or "https://psy.xhs365.cn").rstrip("/")
    code = (test_code or "").strip()
    tok = quote(token or "", safe="")
    q = f"unlimited=true&token={tok}"
    return {
        "quiz_url": f"{base}/tests/{code}/index.html?{q}",
        "preview_url": f"{base}/preview/?test={code}&{q}",
        "preview_variant_url_template": f"{base}/preview/?test={code}&variant={{variant}}&{q}",
    }


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
                "show_on_homepage": True,
                "display_order": i + 1,
                "page_path": f"/tests/{code}/index.html",
                "preview_supported": bool((t.get("preview") or {}).get("supported")),
                "preview_renderer": (t.get("preview") or {}).get("renderer"),
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


def homepage_stats() -> dict[str, Any]:
    """C 端营销首页：展示测题 + 公开统计。"""
    all_tests = list_tests()
    homepage_tests = [t for t in all_tests if t.get("show_on_homepage", True)]
    counts = dist_db.public_homepage_counts()
    site_name = "心象测"
    try:
        from cloud_deploy.cloud_api import dist_ops

        site_name = (dist_ops.get_config().get("site_name") or site_name).strip() or site_name
    except Exception:
        pass
    return {
        "site_name": site_name,
        "tests": homepage_tests,
        "total": len(homepage_tests),
        "stats": {
            "tests_catalog": len(all_tests),
            "tests_homepage": len(homepage_tests),
            "links_total": int(counts.get("links_total") or 0),
            "completions_total": int(counts.get("completions_total") or 0),
            "merchants_total": int(counts.get("merchants_total") or 0),
        },
    }


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
    try:
        from cloud_deploy.cloud_api import dist_ops

        dist_ops.maybe_unlock_tutorial(user_id, redeem_quota=quota_amount)
    except Exception:
        pass
    return {"added": quota_amount, "quota": dist["quota"], "remaining_quota": dist["remaining_quota"]}


def generate_links(user_id: int, test_code: str, count: int) -> dict:
    meta = _test_meta(test_code)
    if not meta:
        raise ValueError("测试项目不存在")
    links = dist_db.generate_links(user_id, test_code, count, max_uses=_LINK_MAX_USES)
    return {"links": links, "generatedCount": len(links)}


def _resolve_test_code_for_allocate(user_id: int, order_id: str, product_id: str = "") -> str:
    """从绑定/已见订单解析测题代码，供 allocate 自愈补货使用。"""
    pid = (product_id or "").strip()
    if not pid:
        seen = dist_db._get_seen_order(order_id)  # noqa: SLF001 — 同包内部
        if seen:
            pid = str(seen.get("product_id") or "").strip()
    if not pid:
        return ""
    binding = dist_db._get_binding(int(user_id), pid)  # noqa: SLF001
    if not binding:
        return ""
    return str(binding.get("test_code") or "").strip()


def allocate_for_order_with_autotopup(
    user_id: int,
    order_id: str,
    *,
    channel: str = "im",
    require_seen: bool = False,
    product_id: str = "",
) -> dict:
    """IM/发货助手 allocate：库存不足时自动 generate（扣额度）再分配一次。

    环境变量 XHS_DIST_ALLOCATE_AUTOTOPUP 控制补货条数（默认 50，上限 50）。
    额度不足时仍抛出原错误语义（带额度提示）。
    """
    try:
        return dist_db.allocate_link_for_order(
            user_id,
            order_id,
            channel=channel,
            require_seen=require_seen,
            product_id=product_id,
        )
    except ValueError as e:
        msg = str(e or "")
        if "库存不足" not in msg:
            raise
        tc = _resolve_test_code_for_allocate(user_id, order_id, product_id)
        if not tc:
            raise
        dist = dist_db.ensure_distributor(int(user_id))
        rem = int(dist.get("remaining_quota") or 0)
        if rem <= 0:
            raise ValueError(f"测评链接库存不足，且账户额度不足（剩余 0），请先兑换额度") from e
        n = min(_ALLOCATE_AUTOTOPUP_COUNT, rem)
        gen = generate_links(int(user_id), tc, n)
        out = dist_db.allocate_link_for_order(
            user_id,
            order_id,
            channel=channel,
            require_seen=require_seen,
            product_id=product_id,
        )
        out["auto_generated"] = True
        out["auto_generated_count"] = int(gen.get("generatedCount") or n)
        return out


def plan_fill_missing_links(
    user_id: int,
    *,
    default_count: int = 10,
    counts: dict[str, int] | None = None,
    only_missing: bool = True,
) -> dict:
    """计算一键补齐计划：哪些测题要生成多少条。"""
    default_count = max(1, min(int(default_count or 10), 200))
    overrides = {
        str(k).strip(): max(0, min(int(v or 0), 200))
        for k, v in (counts or {}).items()
        if str(k).strip()
    }
    existing = dist_db.link_counts_by_test(user_id)
    tests = list_tests(include_disabled=False)
    items: list[dict] = []
    need_total = 0
    for t in tests:
        code = str(t.get("test_code") or t.get("code") or "").strip()
        if not code:
            continue
        have = int(existing.get(code) or 0)
        target = overrides.get(code, default_count)
        if only_missing:
            to_gen = target if have == 0 else 0
        else:
            to_gen = max(0, target - have)
        if to_gen <= 0:
            continue
        items.append(
            {
                "test_code": code,
                "test_name": t.get("test_name") or t.get("name") or code,
                "have": have,
                "target": target,
                "to_generate": to_gen,
            }
        )
        need_total += to_gen
    dist = dist_db.ensure_distributor(user_id)
    remaining = int(dist.get("remaining_quota") or 0)
    return {
        "only_missing": only_missing,
        "default_count": default_count,
        "items": items,
        "tests_to_fill": len(items),
        "links_to_generate": need_total,
        "remaining_quota": remaining,
        "quota_ok": remaining >= need_total,
    }


def generate_missing_links(
    user_id: int,
    *,
    default_count: int = 10,
    counts: dict[str, int] | None = None,
    only_missing: bool = True,
    dry_run: bool = False,
) -> dict:
    """一键为尚未生成（或未达到目标条数）的测题批量生成链接。"""
    plan = plan_fill_missing_links(
        user_id,
        default_count=default_count,
        counts=counts,
        only_missing=only_missing,
    )
    if dry_run:
        return {**plan, "dry_run": True, "generated": [], "generated_count": 0}
    if plan["links_to_generate"] <= 0:
        return {**plan, "dry_run": False, "generated": [], "generated_count": 0, "message": "没有需要补齐的测题"}
    if not plan["quota_ok"]:
        raise ValueError(
            f"可用额度不足：需要 {plan['links_to_generate']}，当前剩余 {plan['remaining_quota']}"
        )
    generated: list[dict] = []
    total = 0
    for it in plan["items"]:
        code = it["test_code"]
        n = int(it["to_generate"])
        # generate_links clamps to 50 per call — chunk
        while n > 0:
            chunk = min(n, 50)
            res = generate_links(user_id, code, chunk)
            links = res.get("links") or []
            generated.append(
                {
                    "test_code": code,
                    "test_name": it.get("test_name"),
                    "count": len(links),
                    "links": links,
                }
            )
            total += len(links)
            n -= len(links)
            if len(links) < chunk:
                break
    dist = dist_db.ensure_distributor(user_id)
    return {
        **plan,
        "dry_run": False,
        "generated": generated,
        "generated_count": total,
        "remaining_quota": int(dist.get("remaining_quota") or 0),
        "message": f"已为 {len(generated)} 个测题生成 {total} 条链接",
    }


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
        from cloud_deploy.cloud_api import dist_ops

        price_yuan = float(plan.get("price_yuan") or plan.get("amount") or 0)
        dist_ops.maybe_unlock_tutorial(user_id, purchase_yuan=price_yuan)
    except Exception:
        pass
    try:
        dist_db.apply_first_purchase_invite_rebate(user_id, amount, order_no)
    except Exception:
        pass


def list_packages() -> list[dict]:
    from cloud_deploy.cloud_api import dist_ops

    return dist_ops.list_packages_merged()
