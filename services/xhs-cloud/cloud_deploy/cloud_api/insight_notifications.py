# -*- coding: utf-8 -*-
"""站内提醒 — 工作流到期 + 关注类目阈值（Q3-5 骨架）。"""
from __future__ import annotations

import os
from datetime import date
from typing import Any

from cloud_deploy.cloud_api.insight_pg import set_search_path, table_exists
from cloud_deploy.cloud_api.insight_recommend import watchlist_categories


def _blue_threshold() -> int:
    try:
        return int(os.environ.get("INSIGHT_NOTIF_BLUE_MIN", "75"))
    except ValueError:
        return 75


def _growth_threshold() -> float:
    try:
        return float(os.environ.get("INSIGHT_NOTIF_GROWTH_MIN", "25"))
    except ValueError:
        return 25.0


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


def _workflow_reminders(conn, user_id: int) -> list[dict[str, Any]]:
    if not table_exists(conn, "member_insight_workflow"):
        return []
    set_search_path(conn)
    today = date.today().isoformat()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, category, report_date, status, remind_at
            FROM member_insight_workflow
            WHERE user_id = %s AND remind_at IS NOT NULL AND remind_at <= CURRENT_DATE
            ORDER BY remind_at ASC
            LIMIT 10
            """,
            (user_id,),
        )
        rows = cur.fetchall()
    out: list[dict[str, Any]] = []
    for row in rows:
        if isinstance(row, dict):
            wid, cat, rd, status, remind = (
                row.get("id"),
                row.get("category"),
                row.get("report_date"),
                row.get("status"),
                row.get("remind_at"),
            )
        else:
            wid, cat, rd, status, remind = row[0], row[1], row[2], row[3], row[4]
        out.append(
            {
                "id": f"wf-{wid}",
                "type": "workflow_reminder",
                "title": f"跟进提醒 · {cat}",
                "body": f"您于 {str(rd or '')[:10] or '—'} 记录「{status or '决策'}」，已到复盘日（{str(remind)[:10]}）。",
                "category": str(cat or ""),
                "report_date": str(rd or "")[:10] or None,
                "priority": "normal",
            }
        )
    return out


def _watchlist_alerts(conn, user_id: int, *, report_date: str) -> list[dict[str, Any]]:
    cats = watchlist_categories(conn, user_id, limit=30)
    if not cats or not table_exists(conn, "daily_category_metrics"):
        return []
    blue_min = _blue_threshold()
    growth_min = _growth_threshold()
    set_search_path(conn)
    out: list[dict[str, Any]] = []
    with conn.cursor() as cur:
        for cat in cats:
            cur.execute(
                """
                SELECT growth_rate_pct, blue_ocean_score, competition_index, trend_label
                FROM daily_category_metrics
                WHERE report_date = %s AND category = %s
                ORDER BY sub_category
                LIMIT 1
                """,
                (report_date, cat),
            )
            row = cur.fetchone()
            if not row:
                continue
            if isinstance(row, dict):
                growth = float(row.get("growth_rate_pct") or 0)
                blue = int(row.get("blue_ocean_score") or 0)
                comp = int(row.get("competition_index") or 0)
                trend = row.get("trend_label") or ""
            else:
                growth, blue, comp, trend = float(row[0] or 0), int(row[1] or 0), int(row[2] or 0), row[3] or ""
            if blue >= blue_min:
                out.append(
                    {
                        "id": f"watch-blue-{cat}-{report_date}",
                        "type": "opportunity",
                        "title": f"关注赛道「{cat}」蓝海 {blue}",
                        "body": f"今日蓝海指数 ≥ {blue_min}，增速 {growth:.0f}%，趋势 {trend}。",
                        "category": cat,
                        "report_date": report_date,
                        "priority": "high" if blue >= 85 else "normal",
                    }
                )
            elif growth >= growth_min:
                out.append(
                    {
                        "id": f"watch-growth-{cat}-{report_date}",
                        "type": "trend",
                        "title": f"关注赛道「{cat}」增速 {growth:.0f}%",
                        "body": f"增速 ≥ {growth_min:.0f}%，竞争指数 {comp}，建议查看预生成情报。",
                        "category": cat,
                        "report_date": report_date,
                        "priority": "normal",
                    }
                )
    return out


def build_insight_notifications(conn, user_id: int) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    items.extend(_workflow_reminders(conn, user_id))
    report_date = _latest_report_date(conn)
    if report_date:
        items.extend(_watchlist_alerts(conn, user_id, report_date=report_date))
    # 去重 id
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for it in items:
        iid = str(it.get("id") or "")
        if iid and iid in seen:
            continue
        if iid:
            seen.add(iid)
        deduped.append(it)
    return {
        "items": deduped[:15],
        "count": len(deduped),
        "report_date": report_date,
        "thresholds": {"blue_ocean_min": _blue_threshold(), "growth_pct_min": _growth_threshold()},
    }
