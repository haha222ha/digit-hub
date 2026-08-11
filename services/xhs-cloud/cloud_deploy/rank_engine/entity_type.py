# -*- coding: utf-8 -*-
"""方向/榜单实体类型推断：physical | virtual | mixed。"""
from __future__ import annotations

from typing import Any

_PHYSICAL_KEYS = frozenset({
    "physical_increment", "physical", "entity_physical",
})
_VIRTUAL_KEYS = frozenset({
    "virtual_increment", "virtual", "entity_virtual",
})

# 类目标签 → 虚实启发（与选品日报规范名对齐）
_VIRTUAL_TAGS = frozenset({
    "小学资料", "初中资料", "高中资料", "公考资料", "考研资料", "考证资料",
    "充值卡", "游戏陪玩", "账号会员", "设计素材", "网盘课程", "文案写作",
    "其他虚拟", "教育培训", "数字素材", "电子资源",
})
_PHYSICAL_TAGS = frozenset({
    "美妆护肤", "家清日用", "家居生活", "文具教具", "图书文教", "食品生鲜",
    "宠物用品", "女装服饰", "男装服饰", "厨房用品", "潮玩玩具", "数码配件",
    "童装母婴", "户外露营", "节庆用品", "手工艺", "鞋靴箱包", "内衣配饰",
    "家居收纳", "美甲美睫",
})


def _norm_ct(v: str) -> str:
    t = (v or "").strip().lower()
    if t in ("physical", "实体", "实体商品"):
        return "physical"
    if t in ("virtual", "虚拟", "虚拟商品"):
        return "virtual"
    if t in ("mixed", "混合"):
        return "mixed"
    return ""


def infer_from_ranking_key(key: str, entity_filter: str = "") -> str:
    ef = (entity_filter or "").strip().lower()
    if ef in ("physical", "virtual"):
        return ef
    k = (key or "").strip().lower()
    if k in _PHYSICAL_KEYS or k.startswith("physical_"):
        return "physical"
    if k in _VIRTUAL_KEYS or k.startswith("virtual_"):
        return "virtual"
    return ""


def infer_from_title(title: str) -> str:
    t = title or ""
    if "实体" in t and "虚拟" not in t:
        return "physical"
    if "虚拟" in t and "实体" not in t:
        return "virtual"
    return ""


def infer_from_items(items: list[dict[str, Any]] | None) -> str:
    """根据脱敏条目的 entity_type_label / category_tag 多数决。"""
    if not items:
        return ""
    phys = virt = 0
    for it in items[:80]:
        if not isinstance(it, dict):
            continue
        label = str(it.get("entity_type_label") or it.get("entity_type") or "").strip()
        nt = _norm_ct(label)
        if nt == "physical":
            phys += 1
            continue
        if nt == "virtual":
            virt += 1
            continue
        tag = str(it.get("category_tag") or "").strip()
        if tag in _VIRTUAL_TAGS:
            virt += 1
        elif tag in _PHYSICAL_TAGS:
            phys += 1
    total = phys + virt
    if total < 3:
        return ""
    if phys / total >= 0.65:
        return "physical"
    if virt / total >= 0.65:
        return "virtual"
    return "mixed"


def infer_category_type(
    *,
    key: str = "",
    entity_filter: str = "",
    items: list[dict[str, Any]] | None = None,
    existing: str = "",
    title: str = "",
) -> str:
    """综合推断；优先保留明确的 physical/virtual existing。"""
    ex = _norm_ct(existing)
    if ex in ("physical", "virtual"):
        return ex
    by_key = infer_from_ranking_key(key, entity_filter)
    if by_key:
        return by_key
    by_title = infer_from_title(title)
    if by_title:
        return by_title
    by_items = infer_from_items(items)
    if by_items:
        return by_items
    return ex or "mixed"


def enrich_direction(
    direction: dict[str, Any],
    *,
    ranking: dict[str, Any] | None = None,
    entity_filter: str = "",
) -> dict[str, Any]:
    d = dict(direction or {})
    key = str(d.get("key") or (ranking or {}).get("key") or (ranking or {}).get("ranking_key") or "")
    items = None
    if ranking and isinstance(ranking.get("items"), list):
        items = ranking["items"]
    ct = infer_category_type(
        key=key,
        entity_filter=entity_filter,
        items=items,
        existing=str(d.get("category_type") or ""),
        title=str(d.get("title") or (ranking or {}).get("ranking_title") or ""),
    )
    d["key"] = key or d.get("key") or ""
    d["category_type"] = ct
    return d


def enrich_advice_directions(
    advice: dict[str, Any],
    *,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """给 advice.direction_advices 补齐 category_type，并按实体→虚拟→混合排序。"""
    out = dict(advice or {})
    rankings = (context or {}).get("rankings") or {}
    dirs = list(out.get("direction_advices") or [])
    enriched = []
    for d in dirs:
        if not isinstance(d, dict):
            continue
        key = str(d.get("key") or "")
        board = rankings.get(key) if isinstance(rankings, dict) else None
        ef = ""
        if isinstance(board, dict):
            ef = str(board.get("entity_filter") or "")
        enriched.append(enrich_direction(d, ranking=board if isinstance(board, dict) else None, entity_filter=ef))

    order = {"physical": 0, "virtual": 1, "mixed": 2}

    def _sort_key(x: dict[str, Any]):
        return (order.get(str(x.get("category_type") or "mixed"), 9), str(x.get("key") or ""))

    enriched.sort(key=_sort_key)
    out["direction_advices"] = enriched
    meta = dict(out.get("meta") or {})
    meta["physical_count"] = sum(1 for x in enriched if x.get("category_type") == "physical")
    meta["virtual_count"] = sum(1 for x in enriched if x.get("category_type") == "virtual")
    meta["mixed_count"] = sum(1 for x in enriched if x.get("category_type") == "mixed")
    out["meta"] = meta
    return out
