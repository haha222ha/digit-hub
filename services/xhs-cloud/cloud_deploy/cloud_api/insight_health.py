# -*- coding: utf-8 -*-
"""用户健康度评分（REQ-RET-030 骨架）。"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from cloud_deploy.cloud_api.insight_pg import set_search_path, table_exists


def compute_health_score(conn, user_id: int) -> dict[str, Any]:
    """0–100 分；&lt;40 为流失风险。"""
    if not table_exists(conn, "user_behavior"):
        return {"score": 50, "band": "unknown", "factors": {}, "at_risk": False}
    set_search_path(conn)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT action, COUNT(*) AS n, MAX(created_at) AS last_at
            FROM user_behavior
            WHERE user_id = %s AND created_at >= NOW() - INTERVAL '30 days'
            GROUP BY action
            """,
            (user_id,),
        )
        rows = cur.fetchall()

    counts: dict[str, int] = {}
    last_any = None
    for row in rows:
        if isinstance(row, dict):
            act, n, last_at = row.get("action"), int(row.get("n") or 0), row.get("last_at")
        else:
            act, n, last_at = row[0], int(row[1] or 0), row[2]
        counts[str(act)] = n
        if last_at and (last_any is None or last_at > last_any):
            last_any = last_at

    views = counts.get("view", 0) + counts.get("library", 0)
    generates = counts.get("generate", 0)
    radar = counts.get("radar", 0)

    score = 20
    score += min(views * 5, 25)
    score += min(generates * 10, 30)
    score += min(radar * 3, 10)
    if last_any:
        try:
            days_idle = (date.today() - last_any.date()).days
        except Exception:
            days_idle = 0
        if days_idle <= 1:
            score += 15
        elif days_idle <= 7:
            score += 8
        else:
            score -= min(days_idle, 20)

    score = max(0, min(100, score))
    band = "healthy" if score >= 70 else ("watch" if score >= 40 else "at_risk")

    return {
        "score": score,
        "band": band,
        "at_risk": score < 40,
        "factors": {
            "views_30d": views,
            "generates_30d": generates,
            "radar_30d": radar,
        },
    }
