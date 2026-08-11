# -*- coding: utf-8 -*-
"""会员 V2 权益解析 — PR-1 合并骨架，供 profile / insight API / legacy_gate 共用。"""
from __future__ import annotations

import os

from fastapi import HTTPException

from cloud_deploy.cloud_api import database as db
from cloud_deploy.cloud_api.entitlements_v2 import merge_entitlements, portal_route
from cloud_deploy.cloud_api.legacy_gate import insight_enabled, legacy_zip_enabled

LEGACY_ZIP_DENIED = "当前套餐不含 Legacy 数据包下载，请开通 AI 选品情报或联系客服"
LEGACY_ZIP_OFFLINE_DETAIL = "表格数据包已下线，请使用 AI 选品分析中心阅读最新报告"
LEGACY_ZIP_MIGRATION_URL = "/member#today"


def legacy_zip_globally_disabled() -> bool:
    return os.environ.get("XHS_LEGACY_ZIP_DISABLED", "1") == "1"


def resolve_entitlements(user_id: int, profile: dict | None) -> dict:
    """合并 auth_codes.note 与 memberships.plan_code 为规范 entitlements。"""
    profile = profile or {}
    raw = db.get_member_entitlements(user_id)
    plan = (profile.get("plan_code") or (raw or {}).get("plan_code") or "").strip()
    if raw is None:
        raw = {"plan_code": plan} if plan else {}
    else:
        raw = dict(raw)
        raw.setdefault("plan_code", plan)
    return merge_entitlements(raw, plan or None)


def enrich_member_profile(profile: dict | None, user_id: int) -> dict | None:
    """扩展 GET /api/v1/member/profile — Doc 21 PR-1 验收字段。"""
    if not profile:
        return profile
    ent = resolve_entitlements(user_id, profile)
    plan = profile.get("plan_code") or ent.get("plan_code") or ""
    expires = profile.get("expires_at")
    out = dict(profile)
    out["entitlements"] = ent
    out["portal_route"] = portal_route(ent)
    out["legacy_zip_enabled"] = legacy_zip_enabled(
        plan_code=plan,
        expires_at=expires,
        entitlements=ent,
    )
    out["insight_enabled"] = insight_enabled(
        plan_code=plan,
        expires_at=expires,
        entitlements=ent,
    )
    try:
        out["custom_analysis_credits"] = db.get_addon_credits(user_id, "custom_analysis")
    except Exception:
        out["custom_analysis_credits"] = 0
    return out


def assess_access_for_user(user_id: int, skin_id: str = "") -> dict:
    """心象测完整报告门控。"""
    profile = db.get_member_profile(user_id)
    if not profile:
        return {"allowed": False, "reason": "user_not_found", "entitlements": {}}
    enriched = enrich_member_profile(profile, user_id) or {}
    ent = enriched.get("entitlements") or {}
    products = ent.get("products") if isinstance(ent.get("products"), dict) else {}
    assess = products.get("assess") if isinstance(products.get("assess"), dict) else {}
    enabled = bool(ent.get("assess_enabled") or assess.get("enabled"))
    if not enabled:
        return {"allowed": False, "reason": "no_assess_entitlement", "entitlements": ent, "skin_id": skin_id}
    skins = list(assess.get("skins") or ["*"])
    if skin_id and ("*" not in skins) and (skin_id not in skins):
        return {"allowed": False, "reason": "skin_not_covered", "entitlements": ent, "skin_id": skin_id}
    return {"allowed": True, "reason": "ok", "entitlements": ent, "skin_id": skin_id}


def assert_insight_allowed(user_id: int) -> dict:
    """情报 API 门控；返回 entitlements。"""
    profile = db.get_member_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="用户不存在")
    enriched = enrich_member_profile(profile, user_id)
    if not enriched or not enriched.get("insight_enabled"):
        raise HTTPException(status_code=403, detail="当前账号不含 AI 选品情报权益")
    return enriched.get("entitlements") or {}


def assert_advisor_allowed(user_id: int, report_date: str | None = None) -> dict:
    """顾问 API 门控；返回 entitlements。"""
    profile = db.get_member_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="用户不存在")
    if not profile.get("is_active"):
        raise HTTPException(status_code=402, detail="会员已过期，请续费后阅读 AI 分析")
    enriched = enrich_member_profile(profile, user_id)
    ent = enriched.get("entitlements") or resolve_entitlements(user_id, profile)
    if ent.get("advisor_read") is False:
        raise HTTPException(status_code=403, detail="当前套餐不含 AI 选品顾问阅读")
    if report_date and ent.get("advisor_history_days"):
        try:
            from datetime import datetime, timezone

            limit = int(ent.get("advisor_history_days") or 0)
            if limit > 0:
                dt = datetime.strptime(report_date[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                days = (datetime.now(timezone.utc) - dt).days
                if days > limit:
                    raise HTTPException(status_code=403, detail=f"当前套餐仅可阅读近 {limit} 天报告")
        except ValueError:
            raise HTTPException(status_code=400, detail="无效 report_date") from None
    return ent
