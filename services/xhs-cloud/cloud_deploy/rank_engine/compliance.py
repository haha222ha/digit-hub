# -*- coding: utf-8 -*-
"""顾问输出合规裁剪（与本地 doc 49 黑/灰名单对齐）。"""
from __future__ import annotations

import re
from typing import Any

_SENSITIVE_KEYS = frozenset({
    "goods_id",
    "product_id",
    "store_id",
    "shop_id",
    "store_name",
    "shop_name",
    "goods_url",
    "product_url",
    "detail_url",
    "product_title",
    "raw_title",
    "goods_title",
})

_GOODS_ID_RE = re.compile(r"\b(?:[0-9a-f]{20,24}|\d{15,20})\b", re.I)
_URL_RE = re.compile(r"https?://|xiaohongshu\.com|xhslink\.com", re.I)
_TITLE_SLICE_RE = re.compile(r"[·•]\s*[\u4e00-\u9fffA-Za-z]{8,}")

OPPORTUNITY_WHITELIST = frozenset({
    "opportunity_id", "concept_name", "core_direction", "decision_verdict", "fulfillment_mode",
    "category_cluster", "entity_class",
    "opportunity_score", "competition_level", "lifecycle_stage", "trend_label",
    "signal_track", "growth_band", "accel_band",
    "price_band", "suggested_entry_window", "suggested_seller_profile",
    "why_now", "how_to_act", "risks", "confidence", "evidence_摘要",
    "cluster_key",
})


def sanitize_context(context: dict[str, Any]) -> dict[str, Any]:
    """移除 context 中不应进入 LLM 的标识字段。"""
    if not isinstance(context, dict):
        return {}
    out: dict[str, Any] = {}
    for k, v in context.items():
        if k in _SENSITIVE_KEYS:
            continue
        # research 主路径：丢弃旧 rankings 明细，避免喂标题切片
        if k == "rankings" and (context.get("research_pack") or context.get("opportunity_cards")):
            continue
        if isinstance(v, list):
            out[k] = [sanitize_context(x) if isinstance(x, dict) else x for x in v[:200]]
        elif isinstance(v, dict):
            out[k] = sanitize_context(v)
        else:
            out[k] = v
    return out


def validate_advisory_output(advice: dict[str, Any]) -> None:
    """发布前扫描 advice 是否含 goods_id / 店铺名 / URL 等。"""
    blob = str(advice)
    if _GOODS_ID_RE.search(blob):
        raise ValueError("advice 含疑似 goods_id")
    for key in _SENSITIVE_KEYS:
        if f'"{key}"' in blob or f"'{key}'" in blob:
            raise ValueError(f"advice 含敏感字段 {key}")
    if _URL_RE.search(blob):
        raise ValueError("advice 含 URL/平台域名")
    contents = []
    ov = advice.get("daily_overview") or {}
    contents.append(str(ov.get("content") or ""))
    for d in advice.get("direction_advices") or []:
        if isinstance(d, dict):
            contents.append(str(d.get("content") or ""))
    joined = "\n".join(contents)
    if _TITLE_SLICE_RE.search(joined):
        raise ValueError("advice 正文疑似标题切片")


def public_trim_advice(advice: dict[str, Any]) -> dict[str, Any]:
    """会员可读裁剪（保留机会卡）。"""
    if not isinstance(advice, dict):
        return {}
    out = dict(advice)
    out.pop("rankings", None)
    out.pop("context", None)
    cards = []
    for c in out.get("opportunity_cards") or []:
        if isinstance(c, dict):
            cards.append({k: c[k] for k in OPPORTUNITY_WHITELIST if k in c})
    if cards:
        out["opportunity_cards"] = cards
        meta = dict(out.get("meta") or {})
        meta.setdefault("pack_type", "research_v1")
        meta.setdefault("schema_version", meta.get("schema_version") or "2.0")
        meta["opportunity_count"] = len(cards)
        out["meta"] = meta
    validate_advisory_output(out)
    return out
