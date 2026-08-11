# -*- coding: utf-8 -*-
"""用户行为埋点（best-effort；表未迁移时静默跳过）。"""
from __future__ import annotations

import json
from typing import Any


def log_user_behavior(
    conn,
    user_id: int,
    action: str,
    *,
    category: str | None = None,
    report_date: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = current_schema() AND table_name = 'user_behavior'
                LIMIT 1
                """
            )
            if not cur.fetchone():
                return
            cur.execute(
                """
                INSERT INTO user_behavior (user_id, action, category, report_date, metadata)
                VALUES (%s, %s, %s, %s, %s::jsonb)
                """,
                (
                    user_id,
                    action,
                    category,
                    report_date[:10] if report_date else None,
                    json.dumps(metadata or {}, ensure_ascii=False),
                ),
            )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
