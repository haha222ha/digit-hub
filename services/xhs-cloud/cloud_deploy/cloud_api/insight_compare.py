# -*- coding: utf-8 -*-
"""类目对比工作台（Q2 · 读 daily_category_metrics，无实时 LLM）。"""
from __future__ import annotations

from typing import Any

from cloud_deploy.cloud_api.insight_pg import set_search_path, table_exists


def _latest_report_date(conn) -> str | None:
    if not table_exists(conn, "daily_category_metrics"):
        return None
    set_search_path(conn)
    with conn.cursor() as cur:
        cur.execute("SELECT MAX(report_date) FROM daily_category_metrics")
        row = cur.fetchone()
    if not row:
        return None
    val = row[0] if not isinstance(row, dict) else row.get("max")
    return str(val)[:10] if val else None


def _load_category_metrics(conn, report_date: str, category: str) -> dict[str, Any] | None:
    set_search_path(conn)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT category, growth_rate_pct, blue_ocean_score, competition_index,
                   heat_score, trend_label, price_band, sample_size
            FROM daily_category_metrics
            WHERE report_date = %s AND category = %s
            ORDER BY sub_category
            LIMIT 1
            """,
            (report_date, category),
        )
        row = cur.fetchone()
    if not row:
        return None
    if isinstance(row, dict):
        return {
            "category": row.get("category"),
            "growth_rate_pct": float(row.get("growth_rate_pct") or 0),
            "blue_ocean_score": int(row.get("blue_ocean_score") or 0),
            "competition_index": int(row.get("competition_index") or 0),
            "heat_score": int(row.get("heat_score") or 0),
            "trend_label": row.get("trend_label") or "",
            "price_band": row.get("price_band") or "",
            "sample_size": int(row.get("sample_size") or 0),
        }
    return {
        "category": row[0],
        "growth_rate_pct": float(row[1] or 0),
        "blue_ocean_score": int(row[2] or 0),
        "competition_index": int(row[3] or 0),
        "heat_score": int(row[4] or 0),
        "trend_label": row[5] or "",
        "price_band": row[6] or "",
        "sample_size": int(row[7] or 0),
    }


def build_category_compare(conn, categories: list[str]) -> dict[str, Any]:
    report_date = _latest_report_date(conn) or ""
    rows: list[dict[str, Any]] = []
    for cat in categories:
        m = _load_category_metrics(conn, report_date, cat) if report_date else None
        if m:
            rows.append(m)
        else:
            rows.append(
                {
                    "category": cat,
                    "growth_rate_pct": 0,
                    "blue_ocean_score": 0,
                    "competition_index": 0,
                    "heat_score": 0,
                    "trend_label": "无数据",
                    "price_band": "",
                    "sample_size": 0,
                }
            )

    order = sorted(
        [r["category"] for r in rows],
        key=lambda c: next((x["blue_ocean_score"] for x in rows if x["category"] == c), 0),
        reverse=True,
    )
    top = order[0] if order else ""
    ai_summary = (
        f"基于 {report_date or '最新'} 类目指标：「{top}」蓝海指数相对最高，"
        f"建议优先阅读其预生成情报；对比仅含聚合指标，不含单品。"
        if top
        else "暂无足够 PG 指标，请等待夜间预生成。"
    )

    return {
        "report_date": report_date,
        "categories": rows,
        "recommendation_order": order,
        "radar_labels": ["增速", "蓝海", "竞争", "热度"],
        "ai_summary": ai_summary,
    }
