# -*- coding: utf-8 -*-
"""类目趋势时间轴（Q2 · 读 daily_category_metrics 序列）。"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from cloud_deploy.cloud_api.insight_pg import set_search_path, table_exists


def build_category_timeline(
    conn,
    category: str,
    *,
    days: int = 7,
) -> dict[str, Any]:
    days = max(2, min(int(days or 7), 30))
    if not table_exists(conn, "daily_category_metrics"):
        return {"category": category, "days": days, "points": [], "ai_weekly": "指标表未就绪"}

    set_search_path(conn)
    end = date.today()
    start = end - timedelta(days=days - 1)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT report_date, growth_rate_pct, blue_ocean_score, competition_index,
                   heat_score, trend_label, price_band
            FROM daily_category_metrics
            WHERE category = %s AND report_date >= %s AND report_date <= %s
            ORDER BY report_date ASC
            """,
            (category, start.isoformat(), end.isoformat()),
        )
        rows = cur.fetchall()

    points: list[dict[str, Any]] = []
    for row in rows:
        if isinstance(row, dict):
            rd = row.get("report_date")
            points.append(
                {
                    "date": rd.isoformat()[:10] if hasattr(rd, "isoformat") else str(rd)[:10],
                    "growth_rate_pct": float(row.get("growth_rate_pct") or 0),
                    "blue_ocean_score": int(row.get("blue_ocean_score") or 0),
                    "competition_index": int(row.get("competition_index") or 0),
                    "heat_score": int(row.get("heat_score") or 0),
                    "trend_label": row.get("trend_label") or "",
                    "price_band": row.get("price_band") or "",
                }
            )
        else:
            rd = row[0]
            points.append(
                {
                    "date": rd.isoformat()[:10] if hasattr(rd, "isoformat") else str(rd)[:10],
                    "growth_rate_pct": float(row[1] or 0),
                    "blue_ocean_score": int(row[2] or 0),
                    "competition_index": int(row[3] or 0),
                    "heat_score": int(row[4] or 0),
                    "trend_label": row[5] or "",
                    "price_band": row[6] or "",
                }
            )

    ai_weekly = ""
    if len(points) >= 2:
        g0 = points[0]["growth_rate_pct"]
        g1 = points[-1]["growth_rate_pct"]
        b0 = points[0]["blue_ocean_score"]
        b1 = points[-1]["blue_ocean_score"]
        trend_word = "上升" if g1 > g0 else ("下降" if g1 < g0 else "持平")
        ai_weekly = (
            f"近 {len(points)} 日「{category}」增速由 {g0:.0f}% {trend_word}至 {g1:.0f}%，"
            f"蓝海指数 {b0}→{b1}。以上为类目聚合指标，供趋势参考。"
        )
    elif len(points) == 1:
        p = points[0]
        ai_weekly = (
            f"仅有 {p['date']} 单日快照：增速 {p['growth_rate_pct']:.0f}%，"
            f"蓝海 {p['blue_ocean_score']}。连续多日后可观察趋势。"
        )
    else:
        ai_weekly = "暂无历史指标序列，请等待每日预生成积累。"

    return {"category": category, "days": days, "points": points, "ai_weekly": ai_weekly}
