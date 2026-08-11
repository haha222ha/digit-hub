# -*- coding: utf-8 -*-
"""基于 user_behavior + PG 雷达的「为你推荐」（Q2 v2）。"""
from __future__ import annotations

from typing import Any, Callable

from cloud_deploy.cloud_api.insight_pg import set_search_path, table_exists

REASON_LABELS: dict[str, str] = {
    "watchlist": "您关注的赛道",
    "based_on_history": "基于您的浏览记录",
    "trending": "今日蓝海指数较高",
    "library": "情报库热门",
}


def watchlist_categories(conn, user_id: int, *, limit: int = 10) -> list[str]:
    if not table_exists(conn, "member_insight_watchlist"):
        return []
    set_search_path(conn)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT category FROM member_insight_watchlist
            WHERE user_id = %s
            ORDER BY sort_order, id
            LIMIT %s
            """,
            (user_id, limit),
        )
        rows = cur.fetchall()
    out: list[str] = []
    for row in rows:
        cat = row[0] if not isinstance(row, dict) else row.get("category")
        if cat and str(cat) not in out:
            out.append(str(cat))
    return out


def top_categories_for_user(conn, user_id: int, *, limit: int = 5) -> list[str]:
    if not table_exists(conn, "user_behavior"):
        return []
    set_search_path(conn)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT category, COUNT(*) AS n
            FROM user_behavior
            WHERE user_id = %s AND category IS NOT NULL AND category <> ''
              AND action IN ('view', 'generate', 'library')
            GROUP BY category
            ORDER BY n DESC, MAX(created_at) DESC
            LIMIT %s
            """,
            (user_id, limit),
        )
        rows = cur.fetchall()
    out: list[str] = []
    for row in rows:
        cat = row[0] if not isinstance(row, dict) else row.get("category")
        if cat and cat not in out:
            out.append(str(cat))
    return out


def trending_categories_from_pg(conn, *, limit: int = 20) -> list[str]:
    if not table_exists(conn, "daily_category_metrics"):
        return []
    set_search_path(conn)
    with conn.cursor() as cur:
        cur.execute("SELECT MAX(report_date) FROM daily_category_metrics")
        row = cur.fetchone()
        if not row:
            return []
        rd = row[0] if not isinstance(row, dict) else row.get("max")
        if not rd:
            return []
        report_date = str(rd)[:10]
        cur.execute(
            """
            SELECT category
            FROM daily_category_metrics
            WHERE report_date = %s
            ORDER BY blue_ocean_score DESC, growth_rate_pct DESC
            LIMIT %s
            """,
            (report_date, limit),
        )
        rows = cur.fetchall()
    out: list[str] = []
    for row in rows:
        cat = row[0] if not isinstance(row, dict) else row.get("category")
        if cat and cat not in out:
            out.append(str(cat))
    return out


def build_recommendations(
    conn,
    user_id: int,
    list_disk_items: Callable[[], list[dict]],
    *,
    limit: int = 4,
) -> dict[str, Any]:
    preferred = top_categories_for_user(conn, user_id, limit=limit)
    watched = watchlist_categories(conn, user_id, limit=limit * 2)
    trending = trending_categories_from_pg(conn, limit=30)
    items = list_disk_items()
    by_cat: dict[str, dict] = {}
    for it in items:
        cat = str(it.get("category") or "")
        if cat and cat not in by_cat:
            by_cat[cat] = it

    recs: list[dict] = []
    seen: set[str] = set()

    def _append(cat: str, reason: str) -> None:
        if cat in seen or cat not in by_cat or len(recs) >= limit:
            return
        seen.add(cat)
        recs.append(
            {
                **by_cat[cat],
                "reason": reason,
                "reason_label": REASON_LABELS.get(reason, reason),
            }
        )

    for cat in watched:
        _append(cat, "watchlist")

    for cat in preferred:
        _append(cat, "based_on_history")

    for cat in trending:
        _append(cat, "trending")

    if len(recs) < limit:
        for it in items:
            _append(str(it.get("category") or ""), "library")

    source = "watchlist" if watched else ("user_behavior" if preferred else ("pg_radar" if trending else "library"))
    return {"items": recs[:limit], "source": source}
