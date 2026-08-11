# -*- coding: utf-8 -*-
"""机会雷达 — 读 daily_category_metrics 或 Shadow 磁盘摘要（REQ-RET-001）。"""
from __future__ import annotations

from datetime import date
from typing import Any, Callable

from cloud_deploy.cloud_api.insight_pg import set_search_path, table_exists


def load_radar_from_pg(conn, *, report_date: str | None = None, limit: int = 5) -> dict[str, Any] | None:
    if not table_exists(conn, "daily_category_metrics"):
        return None
    set_search_path(conn)
    with conn.cursor() as cur:
        if not report_date:
            cur.execute("SELECT MAX(report_date) FROM daily_category_metrics")
            row = cur.fetchone()
            if not row or not row[0]:
                return None
            report_date = str(row[0])[:10]

        cur.execute(
            """
            SELECT category, growth_rate_pct, blue_ocean_score, heat_score,
                   competition_index, trend_label
            FROM daily_category_metrics
            WHERE report_date = %s
            ORDER BY blue_ocean_score DESC, growth_rate_pct DESC
            LIMIT 50
            """,
            (report_date,),
        )
        rows = cur.fetchall()

    if not rows:
        return None

    items: list[dict[str, Any]] = []
    for row in rows:
        if isinstance(row, dict):
            items.append(
                {
                    "category": row.get("category"),
                    "growth_rate_pct": float(row.get("growth_rate_pct") or 0),
                    "blue_ocean_score": int(row.get("blue_ocean_score") or 0),
                    "heat_score": int(row.get("heat_score") or 0),
                    "competition_index": int(row.get("competition_index") or 0),
                    "trend_label": row.get("trend_label") or "",
                }
            )
        else:
            items.append(
                {
                    "category": row[0],
                    "growth_rate_pct": float(row[1] or 0),
                    "blue_ocean_score": int(row[2] or 0),
                    "heat_score": int(row[3] or 0),
                    "competition_index": int(row[4] or 0),
                    "trend_label": row[5] or "",
                }
            )

    blue_break = sum(1 for it in items if it["blue_ocean_score"] >= 75)
    high_growth = sum(1 for it in items if it["growth_rate_pct"] >= 20)
    highlights = sorted(
        items,
        key=lambda x: (-x["blue_ocean_score"], -x["growth_rate_pct"]),
    )[:limit]

    return {
        "report_date": report_date,
        "source": "pg",
        "summary": {
            "categories_tracked": len(items),
            "blue_ocean_breakthrough": blue_break,
            "high_growth": high_growth,
        },
        "highlights": highlights,
        "message": f"今日 {blue_break} 个类目蓝海指数≥75，{high_growth} 个类目增速≥20%",
    }


def load_radar_from_disk(list_items_fn: Callable[[], list[dict]], *, limit: int = 5) -> dict[str, Any]:
    items = list_items_fn()
    if not items:
        today = date.today().isoformat()
        return {
            "report_date": today,
            "source": "shadow_disk",
            "summary": {"categories_tracked": 0, "blue_ocean_breakthrough": 0, "high_growth": 0},
            "highlights": [],
            "message": "暂无预生成情报，请等待夜间批处理",
        }

    latest = str(items[0].get("report_date") or "")[:10]
    day_items = [it for it in items if str(it.get("report_date") or "")[:10] == latest]
    highlights = []
    for it in day_items[:limit]:
        stars = int(it.get("stars") or 3)
        highlights.append(
            {
                "category": it.get("category"),
                "growth_rate_pct": 0,
                "blue_ocean_score": min(100, stars * 20),
                "heat_score": stars * 15,
                "competition_index": 50,
                "trend_label": "预生成",
                "stars": stars,
            }
        )

    return {
        "report_date": latest,
        "source": "shadow_disk",
        "summary": {
            "categories_tracked": len(day_items),
            "blue_ocean_breakthrough": sum(1 for h in highlights if h["blue_ocean_score"] >= 75),
            "high_growth": 0,
        },
        "highlights": highlights,
        "message": f"Shadow 库 {latest} 共 {len(day_items)} 份预生成情报",
    }


def build_opportunity_radar(conn, list_items_fn: Callable[[], list[dict]], *, limit: int = 5) -> dict[str, Any]:
    pg = load_radar_from_pg(conn, limit=limit)
    if pg and pg.get("highlights"):
        return pg
    return load_radar_from_disk(list_items_fn, limit=limit)
