# -*- coding: utf-8 -*-
"""类目树加载、异名归一与标题推断（Q1-A）。"""
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Any

_TAXONOMY_PATH = Path(__file__).resolve().parents[1] / "config" / "category_taxonomy.yaml"

_BUILTIN_RULES: list[tuple[str, str, str]] = [
    (r"小学|语文|数学|英语|教辅|暑假|衔接", "小学资料", "K12"),
    (r"美甲|穿戴甲|甲片", "美妆护肤", "美业"),
    (r"收纳|置物|整理", "家居生活", "家居"),
    (r"宠物|猫|狗", "宠物用品", "宠物"),
]

# 内置异名（yaml 不可用时）；yaml aliases 优先生效
_BUILTIN_ALIASES: dict[str, str] = {
    "小学教辅": "小学资料",
    "幼教启蒙": "小学资料",
    "家居收纳": "家居生活",
    "家纺床品": "家居生活",
    "家居软装": "家居生活",
    "美甲美睫": "美妆护肤",
    "彩妆": "美妆护肤",
    "美妆": "美妆护肤",
    "食品轻食": "食品生鲜",
    "水产肉类": "食品生鲜",
    "粮油调味": "食品生鲜",
    "零食": "食品生鲜",
    "文创文具": "文具教具",
    "文具电教": "文具教具",
    "洗护清洁剂": "家清日用",
    "教育培训": "网盘课程",
    "数字素材": "设计素材",
    "电子资源": "网盘课程",
    "虚拟商品": "其他虚拟",
    "虚拟综合": "其他虚拟",
    "带货笔记": "未分类",
    "收纳整理": "家居生活",
    "女装": "女装服饰",
    "男装": "男装服饰",
    "服装": "女装服饰",
    "书籍": "图书文教",
    "宠物": "宠物用品",
    "家居": "家居生活",
    "玩具": "潮玩玩具",
    "模玩": "潮玩玩具",
    "厨房": "厨房用品",
    "厨房电器": "厨房用品",
    "户外": "户外露营",
    "数码": "数码配件",
    "数码相机": "数码配件",
    "母婴": "童装母婴",
    "婴童用品": "童装母婴",
    "女士内衣": "内衣配饰",
    "女鞋": "鞋靴箱包",
    "流行男鞋": "鞋靴箱包",
    "箱包皮具": "鞋靴箱包",
    "包包": "鞋靴箱包",
    "家居饰品": "家居生活",
}

_EMPTYISH = frozenset({"", "未分类", "综合类目", "其他", "其他虚拟"})


@lru_cache(maxsize=1)
def load_taxonomy() -> dict[str, Any]:
    fallback = {"category": "综合类目", "sub_category": "其他"}
    rules: list[tuple[str, str, str]] = []
    aliases: dict[str, str] = dict(_BUILTIN_ALIASES)
    if not _TAXONOMY_PATH.is_file():
        return {"fallback": fallback, "rules": _BUILTIN_RULES, "aliases": aliases}
    try:
        import yaml

        raw = yaml.safe_load(_TAXONOMY_PATH.read_text(encoding="utf-8")) or {}
        fallback = raw.get("fallback") or fallback
        for item in raw.get("rules") or []:
            if not isinstance(item, dict):
                continue
            pat = str(item.get("pattern") or "").strip()
            cat = str(item.get("category") or "").strip()
            sub = str(item.get("sub_category") or "").strip()
            if pat and cat:
                rules.append((pat, cat, sub or "其他"))
        for k, v in (raw.get("aliases") or {}).items():
            ks, vs = str(k or "").strip(), str(v or "").strip()
            if ks and vs:
                aliases[ks] = vs
    except Exception:
        rules = list(_BUILTIN_RULES)
    if not rules:
        rules = list(_BUILTIN_RULES)
    return {"fallback": fallback, "rules": rules, "aliases": aliases}


def clear_taxonomy_cache() -> None:
    load_taxonomy.cache_clear()


def normalize_category_tag(tag: str) -> str:
    """异名 → 规范名（与日报 category_tag / lexicon 对齐）。"""
    t = str(tag or "").strip()
    if not t:
        return ""
    aliases = load_taxonomy().get("aliases") or {}
    # 最多两跳，避免环
    seen: set[str] = set()
    while t in aliases and t not in seen:
        seen.add(t)
        nxt = str(aliases[t] or "").strip()
        if not nxt or nxt == t:
            break
        t = nxt
    return t


def category_equivalent(a: str, b: str) -> bool:
    """两标签在归一后是否同一类目。"""
    na, nb = normalize_category_tag(a), normalize_category_tag(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    # 一方为未分类等空语义时不互认
    if na in _EMPTYISH or nb in _EMPTYISH:
        return False
    return False


def infer_category(
    title: str,
    *,
    behavior: str = "",
    is_virtual: bool | None = None,
    normalize: bool = True,
) -> tuple[str, str]:
    """标题 + 可选行为标签 → (category, sub_category)。"""
    t = (title or "").strip()
    ctx = f"{t} {behavior or ''}"
    tax = load_taxonomy()
    for pattern, cat, sub in tax["rules"]:
        if re.search(pattern, ctx, flags=re.IGNORECASE):
            out_cat = normalize_category_tag(cat) if normalize else cat
            return out_cat, sub
    fb = tax.get("fallback") or {}
    cat = str(fb.get("category") or "综合类目")
    sub = str(fb.get("sub_category") or "其他")
    if is_virtual is True and cat == "综合类目":
        cat = "其他虚拟" if normalize else "虚拟综合"
        sub = "虚拟"
    elif normalize:
        cat = normalize_category_tag(cat) or cat
    return cat, sub
