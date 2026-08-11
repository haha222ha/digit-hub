# -*- coding: utf-8 -*-
"""
Legacy 数据包访问 Gate — 合并进 database_pg / member API。

规则（见 docs/19-LEGACY-SUNSET-AND-V2-LAUNCH.md）:
  - V2 新套餐 (insight_*): 永无 zip
  - 老套餐 (monthly/…): 仅 expires_at 之前可下载
  - 到期后自动关闭，不按自然月一刀切
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

# T0 上线日后，支付列表不再销售这些
LEGACY_PLAN_CODES = frozenset({
    "monthly", "quarterly", "halfyear", "yearly", "pay_test",
})

V2_PLAN_CODES = frozenset({
    "insight_monthly",
    "insight_pro_monthly",
    "insight_team_monthly",
    "experience",  # 体验码走 note，默认无 bulk zip
})

# 环境变量 XHS_V2_LAUNCH=1 表示新购仅 V2（合并时读 config）
V2_LAUNCH_DEFAULT = True


def _shadow_preview_all_legacy() -> bool:
    """Shadow 7 天：在期 Legacy 用户可预览 AI Tab（不影响 zip 权限）。"""
    return os.environ.get("XHS_INSIGHT_SHADOW_PREVIEW", "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def _parse_expires(expires_at: Any) -> datetime | None:
    if expires_at is None:
        return None
    if isinstance(expires_at, datetime):
        return expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=timezone.utc)
    text = str(expires_at).strip().replace(" ", "T")
    try:
        dt = datetime.fromisoformat(text)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def legacy_zip_enabled(
    *,
    plan_code: str,
    expires_at: Any,
    entitlements: dict | None = None,
    now: datetime | None = None,
) -> bool:
    """是否允许访问 Legacy zip 下载/报告库。"""
    now = now or datetime.now(timezone.utc)
    exp = _parse_expires(expires_at)
    if exp is None or exp <= now:
        return False

    plan = (plan_code or "").strip()
    ent = entitlements or {}

    if ent.get("legacy_zip_enabled") is False:
        return False
    if plan.startswith("insight_"):
        return False
    if ent.get("insight_only") is True:
        return False

    if plan in LEGACY_PLAN_CODES:
        return True

    # dual 已废弃；若历史 note 显式允许 zip
    if ent.get("legacy_zip_enabled") is True:
        allowed = ent.get("allowed_archive_types") or []
        return bool(allowed)

    return False


def insight_enabled(
    *,
    plan_code: str,
    expires_at: Any,
    entitlements: dict | None = None,
    now: datetime | None = None,
) -> bool:
    now = now or datetime.now(timezone.utc)
    exp = _parse_expires(expires_at)
    if exp is None or exp <= now:
        return False
    plan = (plan_code or "").strip()
    ent = entitlements or {}

    if ent.get("insight_enabled") is True:
        return True
    if plan.startswith("insight_"):
        return True
    if plan == "experience_3d":
        return True
    if plan == "experience" and ent.get("insight_enabled") is not False:
        return True
    # 在期 Legacy 老会员：双轨（AI 情报 + zip 报告库），至 expires_at
    if plan in LEGACY_PLAN_CODES:
        return True
    return bool(ent.get("insight_preview", False))
