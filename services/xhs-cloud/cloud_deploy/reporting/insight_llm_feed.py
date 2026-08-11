# -*- coding: utf-8 -*-
"""
选品报告 → AI 投喂包（LLM Feed v1）

V2 情报默认读 pg_reader.fetch_items_from_scan_delta（云 PG goods_sold_daily，非精品库）。

在类目聚合后生成 llm_feed.json + llm_feed.md，再交给 5 Agent。

禁止字段：goods_id、store_id、store_name、商品链接、完整 title 列表。
"""
from __future__ import annotations

import json
import statistics
from datetime import datetime, timezone
from typing import Any

from cloud_deploy.reporting.category_taxonomy import (
    category_equivalent,
    infer_category,
    normalize_category_tag,
)
from cloud_deploy.reporting.insight_metric_engine import InsightMetrics

FEED_SCHEMA_VERSION = "feed-v1.1"


def _median(values: list[float]) -> float | None:
    if not values:
        return None
    return float(statistics.median(values))


def filter_rows_for_category(all_rows: list[dict[str, Any]], category: str) -> list[dict[str, Any]]:
    """与 aggregate 同源：优先 category_tag，再标题推断；异名经 normalize 对齐。"""
    cat = normalize_category_tag(category) or (category or "").strip()
    if not cat:
        return []
    out: list[dict[str, Any]] = []
    for row in all_rows:
        raw_tag = str(row.get("category_tag") or row.get("category") or "").strip()
        if raw_tag and category_equivalent(raw_tag, cat):
            out.append(row)
            continue
        inferred, _sub = infer_category(
            str(row.get("title") or ""),
            behavior=str(row.get("behavior") or ""),
            is_virtual=row.get("is_virtual") if "is_virtual" in row else None,
        )
        if category_equivalent(inferred, cat) or inferred == cat:
            out.append(row)
    return out


def _extract_growth_direction_hints(
    category_rows: list[dict[str, Any]],
    *,
    top_pct: float = 0.05,
    min_top: int = 5,
    max_top: int = 30,
    max_keywords: int = 8,
) -> dict[str, Any]:
    """
    从类目内增速最高切片提炼产品方向词（不输出标题/goods_id）。
    9 万行先在 SQL/内存聚合到类目，再对每类目取 top 5% 增量行做词频。
    """
    from cloud_deploy.reporting.insight_metric_engine import _extract_keywords

    if not category_rows:
        return {}
    ranked = sorted(
        category_rows,
        key=lambda r: (
            -float(r.get("delta") or 0),
            -float(r.get("gr") or 0),
        ),
    )
    n_top = max(min_top, min(max_top, int(len(ranked) * top_pct)))
    top_slice = ranked[:n_top]
    titles = [str(r.get("title") or "") for r in top_slice if r.get("title")]
    keywords = _extract_keywords(titles, limit=max_keywords)
    if not keywords:
        return {}
    avg_inc = sum(float(r.get("delta") or 0) for r in top_slice) / len(top_slice)
    med_price_vals = [float(r.get("price") or 0) for r in top_slice if float(r.get("price") or 0) > 0]
    med_price = _median(med_price_vals)
    return {
        "top_slice_size": len(top_slice),
        "top_slice_pct": round(len(top_slice) / len(ranked) * 100.0, 1),
        "avg_increment_in_slice": round(avg_inc, 2),
        "median_price_in_slice": med_price,
        "product_direction_keywords": keywords,
    }


def _selection_summary(category_rows: list[dict[str, Any]]) -> dict[str, Any]:
    n = len(category_rows)
    if n <= 0:
        return {"sample_size": 0}
    virtual = sum(1 for r in category_rows if r.get("is_virtual"))
    new_cnt = sum(1 for r in category_rows if r.get("is_new"))
    prices = [float(r.get("price") or 0) for r in category_rows if float(r.get("price") or 0) > 0]
    deltas = [float(r.get("delta") or 0) for r in category_rows]
    growths = [float(r.get("gr") or 0) for r in category_rows]
    behaviors: dict[str, int] = {}
    for r in category_rows:
        b = str(r.get("behavior") or "unknown").strip() or "unknown"
        behaviors[b] = behaviors.get(b, 0) + 1
    behavior_mix = {k: round(v / n * 100.0, 1) for k, v in sorted(behaviors.items(), key=lambda x: -x[1])[:6]}
    return {
        "sample_size": n,
        "virtual_ratio_pct": round(virtual / n * 100.0, 1),
        "physical_ratio_pct": round((n - virtual) / n * 100.0, 1),
        "new_listing_ratio_pct": round(new_cnt / n * 100.0, 1),
        "median_price": _median(prices),
        "avg_price": round(sum(prices) / len(prices), 2) if prices else None,
        "avg_daily_increment": round(sum(deltas) / n, 2),
        "avg_growth_rate_pct": round(sum(growths) / n * 100.0, 2),
        "behavior_mix_pct": behavior_mix,
    }


def build_llm_feed(
    insight: InsightMetrics,
    category_rows: list[dict[str, Any]],
    *,
    raw_selection_rows: int,
    pg_source: str = "scan_delta",
    k_anonymity_min: int = 5,
    enriched: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """从类目 InsightMetrics + 选品行（已过滤到单类目）构建投喂包。"""
    enriched = enriched or {}
    public = insight.to_public_dict()
    if enriched:
        for k, v in enriched.items():
            if k not in public and k not in ("disclaimer",):
                public[k] = v

    selection_rule = (enriched or {}).get("selection_rule")
    if not selection_rule and pg_source in ("local_delta", "local"):
        selection_rule = (
            "local premium_goods_daily.delta>=1 (delta_only), "
            "category aggregate → top-growth keyword slice"
        )
    elif not selection_rule and pg_source in ("scan_delta", "delta", "insight"):
        selection_rule = (
            "goods_sold_daily.delta>=1 (delta_only), "
            "scanned within last 1 day, unique per product"
        )
    elif not selection_rule and pg_source == "auto":
        selection_rule = "fetch_items_auto (Legacy 选品池，monitor_incr + premium_daily)"

    feed: dict[str, Any] = {
        "schema_version": FEED_SCHEMA_VERSION,
        "report_date": insight.report_date,
        "category": insight.category,
        "sub_category": insight.sub_category or "",
        "provenance": {
            "description": (
                "当日扫描唯一商品，相对上次 snapshot 销量 delta 正增长（AI 观察池）"
                if pg_source in ("scan_delta", "delta", "insight")
                else "与 cloud_gen_report 同源 PG 选品池，经类目聚合与 k-匿名后生成"
            ),
            "selection_report_script": (
                "cloud_deploy/reporting/pg_reader.fetch_items_from_scan_delta (goods_sold_daily)"
                if pg_source in ("scan_delta", "delta", "insight")
                else "cloud_deploy/scripts/cloud_gen_report.py --source auto"
            ),
            "intelligence_script": "cloud_deploy/scripts/cloud_insight_report.py --playbook full",
            "pg_source": pg_source,
            "selection_rule": selection_rule,
            "report_date": insight.report_date,
            "raw_selection_rows": int(raw_selection_rows),
            "category_rows": len(category_rows),
            "k_anonymity_min": int(k_anonymity_min),
            "k_anonymity_passed": insight.sample_size >= k_anonymity_min,
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "selection_summary": _selection_summary(category_rows),
        "indices": {
            "window_days": insight.window_days,
            "growth_rate_pct": insight.growth_rate_pct,
            "competition_index": insight.competition_index,
            "blue_ocean_score": insight.blue_ocean_score,
            "heat_score": insight.heat_score,
            "new_product_score": insight.new_product_score,
            "lifecycle_stage": insight.lifecycle_stage,
            "season_score": insight.season_score,
            "price_band": insight.price_band,
            "trend_label": insight.trend_label,
            "price_distribution_pct": insight.price_distribution or public.get("price_distribution"),
        },
        "trends": {
            "trend_label": insight.trend_label,
            "trend_7d": public.get("trend_7d") or enriched.get("trend_7d"),
        },
        "context": {
            "keyword_themes": insight.top_keywords[:8],
            "growth_direction_hints": _extract_growth_direction_hints(category_rows),
            "similar_categories": public.get("similar_categories") or enriched.get("similar_categories") or [],
            "season_note": _season_note(insight.category, insight.report_date, insight.season_score),
        },
        "compliance": {
            "disclaimer": public.get("disclaimer")
            or "本报告基于公开市场趋势归纳，不构成对特定商品或店铺的建议。",
            "forbidden_outputs": ["goods_id", "store_id", "store_name", "product_url", "raw_title_list"],
            "aggregation_level": "category",
        },
    }
    return feed


def _format_growth_hints(hints: dict[str, Any] | None) -> str:
    if not hints:
        return "—"
    kws = hints.get("product_direction_keywords") or []
    if not kws:
        return "—"
    parts = [
        f"top {hints.get('top_slice_size')} ({hints.get('top_slice_pct')}%)",
        f"均增量 {hints.get('avg_increment_in_slice')}",
    ]
    if hints.get("median_price_in_slice") is not None:
        parts.append(f"切片中位价 {hints.get('median_price_in_slice')}")
    return "; ".join(parts) + " → " + ", ".join(kws)


def _season_note(category: str, report_date: str, season_score: int) -> str:
    try:
        month = int(str(report_date).split("-")[1])
    except (ValueError, IndexError):
        month = 0
    if season_score >= 4:
        return f"{category} 当前处于季节窗口（{month} 月，season_score={season_score}）"
    if season_score <= 2:
        return f"{category} 非典型旺季（{month} 月，season_score={season_score}）"
    return f"{category} 季节因子中性（season_score={season_score}）"


def feed_to_agent_metrics(feed: dict[str, Any]) -> dict[str, Any]:
    """扁平化为 Agent Prompt 使用的指标 JSON（兼容 insight_agent_graph）。"""
    indices = feed.get("indices") or {}
    trends = feed.get("trends") or {}
    context = feed.get("context") or {}
    out: dict[str, Any] = {
        "report_date": feed.get("report_date"),
        "category": feed.get("category"),
        "sub_category": feed.get("sub_category") or "",
        "window_days": indices.get("window_days", 7),
        "growth_rate_pct": indices.get("growth_rate_pct"),
        "competition_index": indices.get("competition_index"),
        "blue_ocean_score": indices.get("blue_ocean_score"),
        "heat_score": indices.get("heat_score"),
        "new_product_score": indices.get("new_product_score"),
        "lifecycle_stage": indices.get("lifecycle_stage"),
        "season_score": indices.get("season_score"),
        "price_band": indices.get("price_band"),
        "trend_label": indices.get("trend_label") or trends.get("trend_label"),
        "disclaimer": (feed.get("compliance") or {}).get("disclaimer"),
    }
    if indices.get("price_distribution_pct"):
        out["price_distribution"] = indices["price_distribution_pct"]
    if trends.get("trend_7d"):
        out["trend_7d"] = trends["trend_7d"]
    if context.get("similar_categories"):
        out["similar_categories"] = context["similar_categories"]
    if context.get("keyword_themes"):
        out["keyword_themes"] = context["keyword_themes"]
    hints = context.get("growth_direction_hints") or {}
    if hints.get("product_direction_keywords"):
        out["growth_direction_hints"] = hints
    sel = feed.get("selection_summary") or {}
    if sel.get("sample_size"):
        out["selection_summary"] = {
            k: sel[k]
            for k in (
                "virtual_ratio_pct",
                "new_listing_ratio_pct",
                "median_price",
                "avg_daily_increment",
                "behavior_mix_pct",
            )
            if k in sel
        }
    return {k: v for k, v in out.items() if v is not None and v != ""}


def render_llm_feed_md(feed: dict[str, Any]) -> str:
    """人类可读的投喂摘要（运维/审计用，不含单品）。"""
    prov = feed.get("provenance") or {}
    sel = feed.get("selection_summary") or {}
    idx = feed.get("indices") or {}
    ctx = feed.get("context") or {}
    lines = [
        f"# LLM Feed · {feed.get('category')} · {feed.get('report_date')}",
        "",
        f"- schema: `{feed.get('schema_version')}`",
        f"- 选品池: `{prov.get('pg_source')}` raw={prov.get('raw_selection_rows')} → category={prov.get('category_rows')}",
        f"- 筛选规则: {prov.get('selection_rule') or '—'}",
        f"- k-匿名: min={prov.get('k_anonymity_min')} passed={prov.get('k_anonymity_passed')}",
        "",
        "## 选品摘要（类目聚合）",
        "",
        f"- 样本: {sel.get('sample_size')} · 虚拟占比 {sel.get('virtual_ratio_pct')}% · 新品占比 {sel.get('new_listing_ratio_pct')}%",
        f"- 中位价 {sel.get('median_price')} · 均增量 {sel.get('avg_daily_increment')}",
        "",
        "## 指数",
        "",
        f"- 增速 {idx.get('growth_rate_pct')}% · 蓝海 {idx.get('blue_ocean_score')} · 竞争 {idx.get('competition_index')} · 热度 {idx.get('heat_score')}",
        f"- 价格带 {idx.get('price_band')} · 趋势 {idx.get('trend_label')}",
        "",
        "## 主题词",
        "",
        ", ".join(ctx.get("keyword_themes") or []) or "—",
        "",
        "## 增速最高切片 · 产品方向词",
        "",
        _format_growth_hints(ctx.get("growth_direction_hints")),
        "",
        "## 相关赛道",
        "",
        ", ".join(ctx.get("similar_categories") or []) or "—",
        "",
        "---",
        "",
        (feed.get("compliance") or {}).get("disclaimer", ""),
    ]
    return "\n".join(lines)


def write_llm_feed_files(bundle_dir: str | Any, feed: dict[str, Any]) -> None:
    from pathlib import Path

    root = Path(bundle_dir)
    root.mkdir(parents=True, exist_ok=True)
    (root / "llm_feed.json").write_text(
        json.dumps(feed, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (root / "llm_feed.md").write_text(render_llm_feed_md(feed), encoding="utf-8")
