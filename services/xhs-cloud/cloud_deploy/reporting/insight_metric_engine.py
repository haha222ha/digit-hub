# -*- coding: utf-8 -*-
"""类目级指标聚合（从 PG 报告行 → Insight 指标，无商品 ID 外泄）。"""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from typing import Any

from cloud_deploy.reporting.category_taxonomy import infer_category, normalize_category_tag


@dataclass
class InsightMetrics:
    report_date: str
    category: str
    sub_category: str = ""
    window_days: int = 7
    sample_size: int = 0
    growth_rate_pct: float = 0.0
    competition_index: int = 0
    blue_ocean_score: int = 0
    heat_score: int = 0
    new_product_score: int = 0
    lifecycle_stage: str = "成长"
    season_score: int = 3
    price_band: str = ""
    trend_label: str = "平稳"
    top_keywords: list[str] = field(default_factory=list)
    price_distribution: dict[str, float] = field(default_factory=dict)
    # 是否来自选品日报 category_tag（脱敏同源）；仅管道内用，对外输出会去掉
    from_report_tag: bool = False

    def to_public_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d.pop("sample_size", None)
        d.pop("top_keywords", None)
        d.pop("from_report_tag", None)
        if not d.get("price_distribution"):
            d.pop("price_distribution", None)
        d["disclaimer"] = (
            "本报告基于公开市场趋势归纳，不构成对特定商品或店铺的建议。"
            "禁止将本报告用于定位、抄款或批量转售原始数据。"
        )
        return d


def _clamp(n: float, lo: int = 0, hi: int = 100) -> int:
    return int(max(lo, min(hi, round(n))))


def _price_band_label(price: float) -> str:
    if price <= 0:
        return "未知"
    for upper, label in [(10, "0-10"), (20, "10-20"), (50, "20-50"), (100, "50-100"), (99999, "100+")]:
        if price <= upper:
            return label
    return "100+"


def _price_distribution(prices: list[float]) -> dict[str, float]:
    if not prices:
        return {}
    counts: dict[str, int] = defaultdict(int)
    for p in prices:
        counts[_price_band_label(p)] += 1
    total = len(prices)
    return {k: round(v / total * 100.0, 1) for k, v in sorted(counts.items(), key=lambda x: -x[1])}


def _season_score(category: str, report_date: str) -> int:
    try:
        month = int(str(report_date).split("-")[1])
    except (ValueError, IndexError):
        month = 7
    rules = {
        "教辅": {"peak": (6, 7, 8), "high": (1, 2, 9), "peak_v": 5, "high_v": 4, "low_v": 2},
        "美甲": {"peak": (11, 12, 1), "high": (), "peak_v": 4, "high_v": 3, "low_v": 3},
        "户外": {"peak": (4, 5, 6, 9, 10), "high": (), "peak_v": 4, "high_v": 3, "low_v": 2},
    }
    for key, rule in rules.items():
        if key in category:
            if month in rule["peak"]:
                return rule["peak_v"]
            if month in rule["high"]:
                return rule["high_v"]
            return rule["low_v"]
    return 3


def _extract_keywords(titles: list[str], limit: int = 8) -> list[str]:
    freq: dict[str, int] = defaultdict(int)
    stop = {"的", "了", "和", "与", "款", "新", "包邮", "现货"}
    for title in titles:
        for part in re.split(r"[\s/|·\-—]+", title):
            part = part.strip()
            if 2 <= len(part) <= 8 and part not in stop:
                freq[part] += 1
    ranked = sorted(freq.items(), key=lambda x: (-x[1], x[0]))
    return [w for w, _ in ranked[:limit]]


def aggregate_items_to_insights(
    report_date: str,
    items: list[dict[str, Any]],
    *,
    window_days: int = 7,
    min_sample: int = 3,
) -> list[InsightMetrics]:
    buckets: dict[str, list[dict]] = defaultdict(list)
    cat_sub: dict[str, str] = {}
    cat_from_tag: dict[str, bool] = {}
    for it in items:
        # 优先用选品报告/脱敏推送已算好的 category_tag（与日报分层同源）
        raw_tag = str(it.get("category_tag") or it.get("category") or "").strip()
        norm_tag = normalize_category_tag(raw_tag) if raw_tag else ""
        from_tag = bool(norm_tag and norm_tag not in ("未分类", "综合类目", "其他", "其他虚拟"))
        if from_tag:
            cat, sub = norm_tag, str(it.get("sub_category") or "")
        else:
            cat, sub = infer_category(
                str(it.get("title") or ""),
                behavior=str(it.get("behavior") or ""),
                is_virtual=it.get("is_virtual") if "is_virtual" in it else None,
            )
            cat = normalize_category_tag(cat) or cat
        buckets[cat].append(it)
        cat_sub[cat] = sub or cat_sub.get(cat, "")
        # 同一类目若有任一行来自日报标签，记为 tagged（优先展示）
        cat_from_tag[cat] = cat_from_tag.get(cat, False) or from_tag

    out: list[InsightMetrics] = []
    for category, rows in buckets.items():
        n = len(rows)
        if n < min_sample:
            continue
        deltas = [float(r.get("delta") or 0) for r in rows]
        growths = [float(r.get("gr") or 0) for r in rows]
        prices = [float(r.get("price") or 0) for r in rows if float(r.get("price") or 0) > 0]
        new_cnt = sum(1 for r in rows if r.get("is_new") or int(r.get("first_seen_days") or 99) <= 3)

        avg_delta = sum(deltas) / max(n, 1)
        avg_gr = sum(growths) / max(n, 1)
        growth_pct = _clamp(avg_gr * 100, 0, 100)
        price_diversity = len({round(p) for p in prices}) if prices else 1
        competition = _clamp(n * 0.3 + price_diversity * 5, 0, 100)
        blue_ocean = _clamp(100 - competition * 0.6 + growth_pct * 0.4, 0, 100)
        heat = _clamp(avg_delta * 2 + growth_pct * 0.5, 0, 100)
        new_score = _clamp(new_cnt / max(n, 1) * 100 + 20, 0, 100)

        if growth_pct >= 30:
            trend, lifecycle = "连续上涨", "成长"
        elif growth_pct >= 10:
            trend, lifecycle = "温和上涨", "成长"
        elif growth_pct <= 3:
            trend, lifecycle = "平稳", "成熟"
        else:
            trend, lifecycle = "波动", "成熟"

        band = "综合"
        if prices:
            lo, hi = min(prices), max(prices)
            band = f"{int(lo)}-{int(hi)}" if hi - lo > 5 else _price_band_label(lo)

        titles = [str(r.get("title") or "") for r in rows]
        out.append(
            InsightMetrics(
                report_date=report_date,
                category=category,
                sub_category=cat_sub.get(category, ""),
                window_days=window_days,
                sample_size=n,
                growth_rate_pct=float(growth_pct),
                competition_index=competition,
                blue_ocean_score=blue_ocean,
                heat_score=heat,
                new_product_score=new_score,
                lifecycle_stage=lifecycle,
                season_score=_season_score(category, report_date),
                price_band=band,
                trend_label=trend,
                top_keywords=_extract_keywords(titles),
                price_distribution=_price_distribution(prices),
                from_report_tag=bool(cat_from_tag.get(category)),
            )
        )
    # 日报脱敏类目标签优先；标签内按样本量；推断兜底靠后
    catchall = {"综合类目", "虚拟综合", "其他", "未分类"}
    out.sort(
        key=lambda x: (
            0 if x.from_report_tag else 1,
            1 if x.category in catchall else 0,
            -x.sample_size if x.from_report_tag else 0,
            -x.blue_ocean_score,
            -x.growth_rate_pct,
            -x.sample_size,
        )
    )
    return out
