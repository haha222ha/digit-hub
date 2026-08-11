# -*- coding: utf-8 -*-
"""顾问对话日配额（advisor_chat_daily_usage）。"""
from __future__ import annotations

from datetime import date
from typing import Any


def _table_exists(conn) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = current_schema() AND table_name = 'advisor_chat_daily_usage'
            LIMIT 1
            """
        )
        return cur.fetchone() is not None


def get_usage_today(conn, user_id: int) -> dict[str, Any]:
    if not _table_exists(conn):
        return {"chat_count": 0, "usage_date": date.today().isoformat()}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT chat_count, usage_date
            FROM advisor_chat_daily_usage
            WHERE user_id = %s AND usage_date = CURRENT_DATE
            """,
            (user_id,),
        )
        row = cur.fetchone()
    if not row:
        return {"chat_count": 0, "usage_date": date.today().isoformat()}
    if isinstance(row, dict):
        return {
            "chat_count": int(row.get("chat_count") or 0),
            "usage_date": str(row.get("usage_date") or date.today())[:10],
        }
    return {"chat_count": int(row[0] or 0), "usage_date": str(row[1])[:10]}


def try_consume_chat(conn, user_id: int, daily_limit: int) -> tuple[bool, str, dict[str, Any]]:
    daily_limit = max(int(daily_limit or 0), 0)
    if daily_limit <= 0:
        return False, "当前套餐不含 AI 对话", get_usage_today(conn, user_id)

    if not _table_exists(conn):
        return True, "ok", {"chat_count": 1, "usage_date": date.today().isoformat()}

    usage = get_usage_today(conn, user_id)
    if int(usage.get("chat_count") or 0) >= daily_limit:
        return False, "今日 AI 对话次数已用完，请明日再试", usage

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO advisor_chat_daily_usage (user_id, usage_date, chat_count)
            VALUES (%s, CURRENT_DATE, 1)
            ON CONFLICT (user_id, usage_date)
            DO UPDATE SET chat_count = advisor_chat_daily_usage.chat_count + 1
            RETURNING chat_count, usage_date
            """,
            (user_id,),
        )
        row = cur.fetchone()
    if isinstance(row, dict):
        snap = {
            "chat_count": int(row.get("chat_count") or 0),
            "usage_date": str(row.get("usage_date") or date.today())[:10],
        }
    else:
        snap = {"chat_count": int(row[0] or 0), "usage_date": str(row[1])[:10]}
    return True, "ok", snap
