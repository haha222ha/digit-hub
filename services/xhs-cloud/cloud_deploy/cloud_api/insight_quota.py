# -*- coding: utf-8 -*-
"""情报类目日配额（insight_daily_usage，REQ-QUOTA-001）。"""
from __future__ import annotations

import json
from datetime import date
from typing import Any


def _table_exists(conn) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = current_schema() AND table_name = 'insight_daily_usage'
            LIMIT 1
            """
        )
        return cur.fetchone() is not None


def _row_to_usage(row) -> dict[str, Any]:
    if not row:
        return {"generated_count": 0, "categories": [], "usage_date": date.today().isoformat()}
    if isinstance(row, dict):
        cats = row.get("categories") or []
        if isinstance(cats, str):
            cats = json.loads(cats)
        return {
            "generated_count": int(row.get("generated_count") or 0),
            "categories": list(cats) if isinstance(cats, list) else [],
            "usage_date": str(row.get("usage_date") or date.today())[:10],
        }
    cats = row[1] or []
    if isinstance(cats, str):
        cats = json.loads(cats)
    rd = row[2] if len(row) > 2 else date.today()
    return {
        "generated_count": int(row[0] or 0),
        "categories": list(cats) if isinstance(cats, list) else [],
        "usage_date": str(rd)[:10],
    }


def get_usage_today(conn, user_id: int) -> dict[str, Any]:
    if not _table_exists(conn):
        return {"generated_count": 0, "categories": [], "usage_date": date.today().isoformat()}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT generated_count, categories, usage_date
            FROM insight_daily_usage
            WHERE user_id = %s AND usage_date = CURRENT_DATE
            """,
            (user_id,),
        )
        row = cur.fetchone()
    return _row_to_usage(row)


def try_reserve_category(
    conn,
    user_id: int,
    category: str,
    daily_limit: int,
) -> tuple[bool, str, dict[str, Any]]:
    """
    原子预留 1 类目配额；同一类目同日重复请求不增计数。
    返回 (ok, message, usage_snapshot)。
    """
    category = (category or "").strip()
    if not category:
        return False, "类目不能为空", get_usage_today(conn, user_id)

    if not _table_exists(conn):
        return True, "ok", {"generated_count": 0, "categories": [category], "usage_date": date.today().isoformat()}

    daily_limit = max(int(daily_limit or 1), 1)

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT generated_count, categories
                FROM insight_daily_usage
                WHERE user_id = %s AND usage_date = CURRENT_DATE
                FOR UPDATE
                """,
                (user_id,),
            )
            row = cur.fetchone()

            if row is None:
                if daily_limit < 1:
                    conn.rollback()
                    return False, "今日情报额度已用完", get_usage_today(conn, user_id)
                snap = {
                    "generated_count": 1,
                    "categories": [category],
                    "usage_date": date.today().isoformat(),
                }
                cur.execute(
                    """
                    INSERT INTO insight_daily_usage (user_id, usage_date, generated_count, categories)
                    VALUES (%s, CURRENT_DATE, 1, %s::jsonb)
                    """,
                    (user_id, json.dumps([category], ensure_ascii=False)),
                )
                conn.commit()
                return True, "ok", snap

            usage = _row_to_usage(row)
            cats: list[str] = list(usage.get("categories") or [])
            count = int(usage.get("generated_count") or 0)

            if category in cats:
                conn.commit()
                return True, "ok", {**usage, "already": True}

            if count >= daily_limit:
                conn.rollback()
                return False, f"今日情报额度已用完（{daily_limit} 类目/日）", usage

            new_cats = cats + [category]
            new_count = count + 1
            cur.execute(
                """
                UPDATE insight_daily_usage
                SET generated_count = %s, categories = %s::jsonb, updated_at = NOW()
                WHERE user_id = %s AND usage_date = CURRENT_DATE
                """,
                (new_count, json.dumps(new_cats, ensure_ascii=False), user_id),
            )
        conn.commit()
        return True, "ok", {
            "generated_count": new_count,
            "categories": new_cats,
            "usage_date": date.today().isoformat(),
        }
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return False, f"配额记录失败: {e}", get_usage_today(conn, user_id)
