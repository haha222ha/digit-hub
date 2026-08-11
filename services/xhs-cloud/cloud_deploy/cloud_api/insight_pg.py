# -*- coding: utf-8 -*-
"""xhs_monitor schema 辅助（Q2 统一 search_path）。"""
from __future__ import annotations

MONITOR_SCHEMA = "xhs_monitor"


def set_search_path(conn) -> None:
    with conn.cursor() as cur:
        cur.execute("SET search_path TO xhs_monitor, public")


def table_exists(conn, table: str, *, schema: str = MONITOR_SCHEMA) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = %s AND table_name = %s
            LIMIT 1
            """,
            (schema, table),
        )
        return cur.fetchone() is not None
