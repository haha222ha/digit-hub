# -*- coding: utf-8 -*-
"""选品会员在线购买套餐（Web / PC 共用）。

定价（2026-07）：体验 9.9/3天 · 月 39 · 季 99 · 半年 188 · 年 299
定制分析（按次）：会员 ¥9.9 · 非会员 ¥29.9
"""
from __future__ import annotations

import json
import os

# 统一 AI 会员权益（支付 / 授权码 / 会员阅读）
AI_MEMBER_ENTITLEMENTS: dict = {
    "insight_enabled": True,
    "insight_only": True,
    "insight_categories_per_day": 5,
    "insight_compare": True,
    "insight_timeline_days": 30,
    "insight_workflow": True,
    "insight_pdf_export": True,
    "insight_llm_tokens_per_day": 40_000,
    "advisor_read": True,
    "advisor_directions_per_day": 28,
    "advisor_history_days": 365,
    "advisor_chat_daily": 10,
    "legacy_zip_enabled": False,
}

# 体验卡：3 天 · 只读预生成，不含动态 LLM / 顾问对话
EXPERIENCE_3D_ENTITLEMENTS: dict = {
    "insight_enabled": True,
    "insight_only": True,
    "insight_categories_per_day": 3,
    "insight_compare": False,
    "insight_timeline_days": 7,
    "insight_workflow": False,
    "insight_pdf_export": False,
    "insight_llm_tokens_per_day": 0,
    "advisor_read": True,
    "advisor_directions_per_day": 8,
    "advisor_history_days": 30,
    "advisor_chat_daily": 0,
    "legacy_zip_enabled": False,
}

# 定制分析（按次加购，不延长会员天数）
CUSTOM_ANALYSIS_PRICING: dict = {
    "label": "定制分析",
    "summary": "定向词库分析 · 一次交付 · PC 端提交需求",
    "member_price_yuan": 9.9,
    "guest_price_yuan": 29.9,
    "unit": "次",
}

CUSTOM_ANALYSIS_ENTITLEMENTS: dict = {
    "addon": "custom_analysis",
    "custom_analysis_credit": 1,
    "extends_membership": False,
}

PAYMENT_ADDON_PLANS: tuple[dict, ...] = (
    {
        "plan_code": "custom_analysis_member",
        "label": "定制分析（会员价）",
        "duration_days": 0,
        "amount": "9.90",
        "price_yuan": 9.9,
        "summary": "会员专享 · 定向词库分析 1 次",
        "plan_type": "addon",
        "requires_active_member": True,
        "entitlements_template": CUSTOM_ANALYSIS_ENTITLEMENTS,
    },
    {
        "plan_code": "custom_analysis_guest",
        "label": "定制分析",
        "duration_days": 0,
        "amount": "29.90",
        "price_yuan": 29.9,
        "summary": "非会员 · 定向词库分析 1 次",
        "plan_type": "addon",
        "requires_active_member": False,
        "entitlements_template": CUSTOM_ANALYSIS_ENTITLEMENTS,
    },
)

# 心象测 / digit-hub 测评权益（与选品 insight 分离；不进入选品主收银台）
ASSESS_SINGLE_ENTITLEMENTS: dict = {
    "assess_enabled": True,
    "insight_enabled": False,
    "legacy_zip_enabled": False,
    "products": {
        "assess": {"enabled": True, "quota_per_month": 1, "skins": ["*"]},
        "faka": {"enabled": False, "download_per_day": 0},
        "push": {"enabled": False},
    },
}

ASSESS_MONTHLY_ENTITLEMENTS: dict = {
    "assess_enabled": True,
    "insight_enabled": False,
    "legacy_zip_enabled": False,
    "products": {
        "assess": {"enabled": True, "quota_per_month": 30, "skins": ["*"]},
        "faka": {"enabled": False, "download_per_day": 0},
        "push": {"enabled": False},
    },
}

ASSESS_PAYMENT_PLANS: tuple[dict, ...] = (
    {
        "plan_code": "assess_single",
        "label": "心象测·单次报告",
        "duration_days": 7,
        "amount": "1.99",
        "price_yuan": 1.99,
        "summary": "7 天 · 1 份完整报告解锁",
        "product": "assess",
        "entitlements_template": ASSESS_SINGLE_ENTITLEMENTS,
    },
    {
        "plan_code": "assess_monthly",
        "label": "心象测·月度会员",
        "duration_days": 30,
        "amount": "29.90",
        "price_yuan": 29.9,
        "summary": "30 天 · 测评报告额度 30",
        "product": "assess",
        "entitlements_template": ASSESS_MONTHLY_ENTITLEMENTS,
    },
)

PAYMENT_PLANS: tuple[dict, ...] = (
    {
        "plan_code": "experience_3d",
        "label": "体验卡",
        "duration_days": 3,
        "amount": "9.90",
        "price_yuan": 9.9,
        "summary": "3 天 · 预生成报告阅读",
        "entitlements_template": EXPERIENCE_3D_ENTITLEMENTS,
    },
    {
        "plan_code": "monthly",
        "label": "月度会员",
        "duration_days": 30,
        "amount": "39.00",
        "price_yuan": 39,
        "summary": "30 天 · AI 选品顾问 + 类目情报",
        "entitlements_template": AI_MEMBER_ENTITLEMENTS,
    },
    {
        "plan_code": "quarterly",
        "label": "季度会员",
        "duration_days": 90,
        "amount": "99.00",
        "price_yuan": 99,
        "summary": "90 天 · 约合 ¥33/月",
        "entitlements_template": AI_MEMBER_ENTITLEMENTS,
    },
    {
        "plan_code": "halfyear",
        "label": "半年会员",
        "duration_days": 183,
        "amount": "188.00",
        "price_yuan": 188,
        "summary": "183 天 · 约合 ¥31/月",
        "entitlements_template": AI_MEMBER_ENTITLEMENTS,
    },
    {
        "plan_code": "yearly",
        "label": "年度会员",
        "duration_days": 365,
        "amount": "299.00",
        "price_yuan": 299,
        "summary": "365 天 · 最划算 · 约合 ¥25/月",
        "recommended": True,
        "entitlements_template": AI_MEMBER_ENTITLEMENTS,
    },
)

# 仅当 XHS_PAY_ENABLE_TEST_PLAN=1 时在 API/页面展示，用于 1 元联调
PAYMENT_TEST_PLAN: dict = {
    "plan_code": "pay_test",
    "label": "支付测试",
    "duration_days": 1,
    "amount": "1.00",
    "price_yuan": 1,
    "summary": "1 元联调（1 天会员，验证支付回调）",
    "is_test": True,
}


def test_plan_enabled() -> bool:
    return os.environ.get("XHS_PAY_ENABLE_TEST_PLAN", "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def v2_launch_enabled() -> bool:
    """T0 上线后设为 1：支付页仅展示 AI 套餐（与 PAYMENT_PLANS 一致）。"""
    return os.environ.get("XHS_V2_LAUNCH", "").strip().lower() in ("1", "true", "yes", "on")


def list_active_plans(*, include_addons: bool = False) -> list[dict]:
    plans = list(PAYMENT_PLANS)
    if test_plan_enabled():
        plans = [PAYMENT_TEST_PLAN, *plans]
    if include_addons:
        plans = [*plans, *PAYMENT_ADDON_PLANS]
    return plans


PSY_DIST_PAYMENT_PLANS: tuple[dict, ...] = (
    {
        "plan_code": "psy_quota_100",
        "label": "分销额度·100次",
        "duration_days": 365,
        "amount": "59.00",
        "price_yuan": 59,
        "quota_amount": 100,
        "summary": "100 次测评链接生成额度",
        "product": "psy_dist",
    },
    {
        "plan_code": "psy_quota_500",
        "label": "分销额度·500次",
        "duration_days": 365,
        "amount": "199.00",
        "price_yuan": 199,
        "quota_amount": 500,
        "summary": "500 次测评链接生成额度",
        "product": "psy_dist",
        "recommended": True,
    },
)


PLAN_BY_CODE = {
    p["plan_code"]: p
    for p in (*PAYMENT_PLANS, *PAYMENT_ADDON_PLANS, *ASSESS_PAYMENT_PLANS, *PSY_DIST_PAYMENT_PLANS)
}
PLAN_BY_CODE[PAYMENT_TEST_PLAN["plan_code"]] = PAYMENT_TEST_PLAN
# 第三方发卡专用 plan（不在收银台展示，仅授权码生成）
PLAN_BY_CODE["assess_code"] = {
    "plan_code": "assess_code",
    "label": "心象测·发卡码",
    "duration_days": 7,
    "amount": "0.00",
    "price_yuan": 0,
    "summary": "第三方平台发卡 · 1 份完整报告",
    "product": "assess",
    "entitlements_template": ASSESS_SINGLE_ENTITLEMENTS,
}


def list_assess_plans() -> list[dict]:
    return list(ASSESS_PAYMENT_PLANS)


def is_addon_plan(plan_code: str) -> bool:
    plan = PLAN_BY_CODE.get(str(plan_code or "").strip())
    return bool(plan and plan.get("plan_type") == "addon")


def is_assess_plan(plan_code: str) -> bool:
    code = str(plan_code or "").strip()
    return code.startswith("assess")


def is_psy_dist_plan(plan_code: str) -> bool:
    code = str(plan_code or "").strip()
    return code.startswith("psy_quota") or code.startswith("psy_dist")


def list_psy_dist_plans() -> list[dict]:
    return list(PSY_DIST_PAYMENT_PLANS)


def resolve_custom_analysis_plan(*, is_active_member: bool) -> str:
    return "custom_analysis_member" if is_active_member else "custom_analysis_guest"


def list_addon_plans() -> list[dict]:
    return list(PAYMENT_ADDON_PLANS)


def entitlements_note_for_payment_plan(plan_code: str) -> str | None:
    """支付回调写入 auth_codes.note。"""
    plan = PLAN_BY_CODE.get(str(plan_code or "").strip())
    if not plan:
        return None
    if plan.get("quota_amount"):
        payload = {"quota_amount": int(plan["quota_amount"]), "product": plan.get("product") or "psy_dist"}
        return json.dumps(payload, ensure_ascii=False)
    tpl = plan.get("entitlements_template")
    if not tpl:
        return None
    payload = {"entitlements": {**tpl, "plan_code": plan["plan_code"]}}
    return json.dumps(payload, ensure_ascii=False)


def get_plan(plan_code: str) -> dict | None:
    code = str(plan_code or "").strip()
    if code == PAYMENT_TEST_PLAN["plan_code"] and not test_plan_enabled():
        return None
    plan = PLAN_BY_CODE.get(code)
    if plan:
        return plan
    from cloud_deploy.cloud_api.payment_plans_v2 import INSIGHT_PLAN_BY_CODE

    return INSIGHT_PLAN_BY_CODE.get(code)
