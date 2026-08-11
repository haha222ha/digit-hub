# -*- coding: utf-8 -*-
"""云端爬虫引擎策略：分层路由 + 降级链（2G 机器默认无 playwright）。"""
from __future__ import annotations

import os


def cloud_engine_chain() -> tuple[str, ...]:
    base = ("api", "drissionpage")
    if os.environ.get("XHS_ENABLE_PLAYWRIGHT", "0").strip().lower() in ("1", "true", "yes"):
        return base + ("playwright",)
    return base


def pick_start_engine(goods: dict, config: dict) -> str:
    min_sold = int(config.get("tier_dp_min_sold", 500) or 500)
    min_v1d = float(config.get("tier_dp_min_v1d", 0) or 0)
    tier = str(goods.get("tier") or "").lower()
    pool = str(goods.get("pool") or "").lower()
    if float(goods.get("last_v1d") or 0) > min_v1d:
        return "drissionpage"
    if int(goods.get("last_sold") or 0) >= min_sold:
        return "drissionpage"
    if tier in ("burst", "high", "hot") or pool in ("burst", "high"):
        return "drissionpage"
    if float(goods.get("priority_score") or 0) >= float(
        config.get("tier_dp_min_priority", 80) or 80
    ):
        return "drissionpage"
    return str(config.get("shop_engine", "api") or "api")


def build_fallback_chain(start_engine: str, config: dict) -> tuple[str, ...]:
    """先试 start_engine，再试链上其余引擎（dp 失败须能降级 api）。"""
    del config
    chain = cloud_engine_chain()
    if start_engine not in chain:
        return (start_engine,) + chain
    idx = chain.index(start_engine)
    ordered = chain[idx:] + chain[:idx]
    seen: set[str] = set()
    out: list[str] = []
    for eng in ordered:
        if eng not in seen:
            seen.add(eng)
            out.append(eng)
    return tuple(out)
