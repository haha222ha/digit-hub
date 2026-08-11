# -*- coding: utf-8 -*-
"""
V2 套餐 — 与 payment_plans.PAYMENT_PLANS 对齐（月 39 / 季 99 / 半年 188 / 年 299）。

保留 insight_* plan_code 别名，供历史订单 / 授权码兼容。
"""
from __future__ import annotations

import json

from cloud_deploy.cloud_api.payment_plans import (
    AI_MEMBER_ENTITLEMENTS,
    PAYMENT_PLANS,
    entitlements_note_for_payment_plan,
)

# 历史 SKU 别名 → 统一定价（月卡等价）
INSIGHT_PAYMENT_PLANS: tuple[dict, ...] = (
    {
        "plan_code": "insight_monthly",
        "label": "AI 选品月卡",
        "duration_days": 30,
        "amount": "39.00",
        "price_yuan": 39,
        "summary": "同月度会员 · AI 选品顾问 + 类目情报",
        "product_line": "v2",
        "entitlements_template": AI_MEMBER_ENTITLEMENTS,
    },
    {
        "plan_code": "insight_pro_monthly",
        "label": "AI 选品 Pro",
        "duration_days": 30,
        "amount": "39.00",
        "price_yuan": 39,
        "summary": "同月度会员（Pro 权益已合并进标准版）",
        "product_line": "v2",
        "recommended": True,
        "entitlements_template": AI_MEMBER_ENTITLEMENTS,
    },
)

INSIGHT_PLAN_BY_CODE = {p["plan_code"]: p for p in INSIGHT_PAYMENT_PLANS}


def list_active_plans_v2_only() -> list[dict]:
    """V2 上线后：展示四档周期套餐（与 PAYMENT_PLANS 相同）。"""
    return list(PAYMENT_PLANS)


def list_active_plans_legacy_hidden() -> list[dict]:
    return list_active_plans_v2_only()


def entitlements_note_for_plan(plan_code: str) -> str:
    """支付回调生成授权码时写入 auth_codes.note。"""
    code = str(plan_code or "").strip()
    note = entitlements_note_for_payment_plan(code)
    if note:
        return note
    tpl = INSIGHT_PLAN_BY_CODE.get(code, {}).get("entitlements_template") or {}
    if tpl:
        return json.dumps({"entitlements": {**tpl, "plan_code": code}}, ensure_ascii=False)
    return json.dumps({"entitlements": {"plan_code": code}}, ensure_ascii=False)
