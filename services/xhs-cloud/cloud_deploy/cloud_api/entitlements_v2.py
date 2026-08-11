# -*- coding: utf-8 -*-
"""
V2 权益解析 — 合并进 database_pg.get_member_entitlements() 的扩展逻辑。

现网已支持 auth_codes.note JSON；本模块定义 V2 字段约定与合并规则。
"""
from __future__ import annotations

from typing import Any

# 各套餐默认权益（merge 时补全缺失字段，避免 None 歧义）
PLAN_ENTITLEMENT_DEFAULTS: dict[str, dict[str, Any]] = {
    "insight_monthly": {
        "insight_categories_per_day": 3,
        "insight_compare": False,
        "insight_timeline_days": 0,
        "insight_workflow": False,
        "insight_pdf_export": False,
        "insight_llm_tokens_per_day": 20_000,
    },
    "insight_pro_monthly": {
        "insight_categories_per_day": 5,
        "insight_compare": True,
        "insight_timeline_days": 30,
        "insight_workflow": True,
        "insight_pdf_export": True,
        "insight_llm_tokens_per_day": 40_000,
    },
    "insight_team_monthly": {
        "insight_categories_per_day": 20,
        "insight_compare": True,
        "insight_timeline_days": 30,
        "insight_workflow": True,
        "insight_pdf_export": True,
        "insight_team_seats": 5,
        "insight_llm_tokens_per_day": 150_000,
    },
}

# 体验会员 + AI 情报（V2 专用，无 zip）
EXPERIENCE_ENTITLEMENTS_V2_ONLY: dict[str, Any] = {
    "plan_code": "experience",
    "insight_enabled": True,
    "insight_only": True,
    "insight_categories_per_day": 1,
    "insight_compare": False,
    "insight_pdf_export": False,
    "insight_timeline_days": 7,
    "legacy_zip_enabled": False,
}

# 历史兼容：体验码可带有限 zip 白名单（仅旧活动码，新码勿用）
EXPERIENCE_ENTITLEMENTS_INSIGHT: dict[str, Any] = {
    "plan_code": "experience",
    "insight_enabled": True,
    "insight_categories_per_day": 1,
    "insight_compare": False,
    "insight_pdf_export": False,
    "insight_timeline_days": 7,
    "legacy_report_download_limited": True,
    "legacy_zip_enabled": False,
    "allowed_archive_types": [],
    "allowed_report_dates": [],
}

# 老会员在期 + 中旬 V2 预览（仍保留 Legacy 至 expires_at）
PREVIEW_ENTITLEMENTS_LEGACY: dict[str, Any] = {
    "plan_code": "monthly",
    "insight_enabled": True,
    "insight_preview": True,
    "insight_categories_per_day": 1,
    "insight_compare": False,
    "insight_pdf_export": False,
    "insight_timeline_days": 7,
    "legacy_zip_enabled": True,
    "legacy_only": False,
}

# 纯 Legacy 在期（无情报）
LEGACY_ONLY_ENTITLEMENTS: dict[str, Any] = {
    "plan_code": "monthly",
    "insight_enabled": False,
    "legacy_zip_enabled": True,
}

# 字段说明（写入 PRD / 管理端发码表单）
ENTITLEMENT_FIELD_GUIDE: dict[str, str] = {
    "insight_enabled": "是否可访问 AI 情报 Tab/API",
    "insight_categories_per_day": "每日可生成/阅读情报类目数",
    "insight_compare": "类目对比工作台",
    "insight_timeline_days": "趋势时间轴最大天数 (7/14/30)",
    "insight_pdf_export": "PDF 摘要导出",
    "insight_workflow": "决策工作流 Kanban",
    "insight_team_seats": "团队席位数（仅 team）",
    "legacy_zip_enabled": "是否可下载 Legacy zip",
    "insight_preview": "老用户 V2 预览（非正式开通）",
    "insight_only": "仅 V2 门户，无 Legacy Tab",
    "allowed_report_dates": "体验会员可见报告日期白名单",
    "allowed_archive_types": "体验会员可见 archive 类型",
    "insight_llm_tokens_per_day": "每日 LLM Token 预算上限",
}


def merge_entitlements(raw: dict | None, membership_plan: str | None = None) -> dict[str, Any]:
    """
    将 DB 读出的 entitlements 规范为前端/insight API 可用结构。
    无 V2 字段时：Legacy 在期用户默认双轨（zip + AI 情报）；新 insight_* 仅 AI。
    """
    ent = dict(raw or {})
    plan = ent.get("plan_code") or membership_plan or ""

    if ent.get("insight_enabled") is None:
        if plan in ("monthly", "quarterly", "halfyear", "yearly", "pay_test"):
            ent.setdefault("legacy_zip_enabled", False)
            ent.setdefault("insight_enabled", True)
            ent.setdefault("advisor_read", True)
            ent.setdefault("advisor_directions_per_day", 28)
            ent.setdefault("insight_categories_per_day", 5)
            # 正式会员默认开启高级情报工具（对比/时间线/工作流/PDF）
            ent.setdefault("insight_compare", True)
            ent.setdefault("insight_timeline_days", 30)
            ent.setdefault("insight_workflow", True)
            ent.setdefault("insight_pdf_export", True)
            ent.setdefault("insight_llm_tokens_per_day", 40_000)
            ent.setdefault("advisor_history_days", 365)
            ent.setdefault("advisor_chat_daily", 10)
        elif plan == "experience_3d":
            ent.setdefault("legacy_zip_enabled", False)
            ent.setdefault("insight_enabled", True)
            ent.setdefault("insight_only", True)
            ent.setdefault("advisor_read", True)
            ent.setdefault("advisor_directions_per_day", 8)
            ent.setdefault("advisor_history_days", 30)
            ent.setdefault("advisor_chat_daily", 0)
            ent.setdefault("insight_categories_per_day", 3)
            ent.setdefault("insight_llm_tokens_per_day", 0)
            ent.setdefault("insight_compare", False)
            ent.setdefault("insight_workflow", False)
            ent.setdefault("insight_pdf_export", False)
        elif plan.startswith("insight_") or plan == "dual_monthly":
            ent.setdefault("insight_enabled", True)
            ent.setdefault("legacy_zip_enabled", plan == "dual_monthly")

    if ent.get("insight_only") is True:
        ent.setdefault("legacy_zip_enabled", False)

    defaults = PLAN_ENTITLEMENT_DEFAULTS.get(plan, {})
    for key, val in defaults.items():
        if ent.get(key) is None:
            ent[key] = val

    ent.setdefault("insight_categories_per_day", 1 if ent.get("insight_enabled") else 0)
    ent.setdefault("insight_compare", False)
    ent.setdefault("insight_timeline_days", 0)
    ent.setdefault("insight_workflow", False)
    ent.setdefault("insight_pdf_export", False)
    ent.setdefault("insight_llm_tokens_per_day", 0)

    # 心象测 assess 产品权益（嵌套 products.assess 原样保留）
    if plan in ("assess_single", "assess_monthly", "assess_code") or ent.get("assess_enabled"):
        ent.setdefault("assess_enabled", True)
        products = ent.get("products") if isinstance(ent.get("products"), dict) else {}
        assess = products.get("assess") if isinstance(products.get("assess"), dict) else {}
        assess.setdefault("enabled", True)
        assess.setdefault(
            "quota_per_month",
            30 if plan == "assess_monthly" else 1,
        )
        assess.setdefault("skins", ["*"])
        products["assess"] = assess
        products.setdefault("faka", {"enabled": False, "download_per_day": 0})
        products.setdefault("push", {"enabled": False})
        ent["products"] = products

    return ent


def can_insight_compare(ent: dict | None) -> bool:
    return bool(merge_entitlements(ent).get("insight_compare"))


def can_insight_timeline(ent: dict | None, *, days: int = 7) -> tuple[bool, str]:
    ent = merge_entitlements(ent)
    max_days = int(ent.get("insight_timeline_days") or 0)
    if max_days <= 0:
        return False, "当前套餐不支持趋势时间轴，请升级 V2-Pro"
    if days > max_days:
        return False, f"当前套餐最多查看 {max_days} 天时间轴"
    return True, "ok"


def can_insight_workflow(ent: dict | None) -> bool:
    return bool(merge_entitlements(ent).get("insight_workflow"))


def can_insight_pdf(ent: dict | None) -> bool:
    return bool(merge_entitlements(ent).get("insight_pdf_export"))


def llm_token_budget(ent: dict | None) -> int:
    return int(merge_entitlements(ent).get("insight_llm_tokens_per_day") or 0)


def portal_route(ent: dict | None) -> str:
    """返回前端路由：ai_reader | insight_only | legacy_only | legacy_with_preview."""
    ent = merge_entitlements(ent)
    if ent.get("insight_only") or (
        ent.get("insight_enabled") and not ent.get("legacy_zip_enabled")
    ):
        return "ai_reader" if ent.get("advisor_read") else "insight_only"
    if ent.get("insight_preview"):
        return "legacy_with_preview"
    if ent.get("legacy_zip_enabled") and ent.get("insight_enabled"):
        return "legacy_dual"
    if ent.get("legacy_zip_enabled"):
        return "legacy_only"
    if ent.get("insight_enabled"):
        return "insight_only"
    return "legacy_only"


def can_insight_generate(ent: dict | None, *, already_today: int) -> tuple[bool, str]:
    ent = merge_entitlements(ent)
    if not ent.get("insight_enabled"):
        return False, "当前套餐不含 AI 市场情报，请升级或激活体验码"
    limit = int(ent.get("insight_categories_per_day") or 1)
    if already_today >= limit:
        return False, f"今日情报额度已用完（{limit} 类目/日）"
    return True, "ok"


def filter_insight_library(items: list[dict], ent: dict | None) -> list[dict]:
    """体验会员按 allowed_report_dates 过滤情报库。"""
    ent = merge_entitlements(ent)
    allowed = ent.get("allowed_report_dates") or ent.get("report_dates") or []
    if not allowed:
        return items
    allowed_set = {str(d)[:10] for d in allowed}
    return [it for it in items if str(it.get("report_date", ""))[:10] in allowed_set]
