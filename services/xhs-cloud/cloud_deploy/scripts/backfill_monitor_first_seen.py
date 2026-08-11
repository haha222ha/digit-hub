# -*- coding: utf-8 -*-
"""
回填 monitor_goods.first_seen（真实首次发现时间）。

来源（按顺序）:
  1. report_daily_items 中各 goods_id 最早的 first_seen
  2. 可选 JSON 文件（由 tools/export_goods_first_seen.py 从 SQLite 导出）

用法:
  python cloud_deploy/scripts/backfill_monitor_first_seen.py
  python cloud_deploy/scripts/backfill_monitor_first_seen.py --json /path/first_seen.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUD_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if CLOUD_ROOT not in sys.path:
    sys.path.insert(0, CLOUD_ROOT)


def _log(msg: str) -> None:
    print(f"[backfill-first-seen] {msg}", flush=True)


def backfill_from_report_items(conn) -> int:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute("ALTER TABLE monitor_goods ADD COLUMN IF NOT EXISTS first_seen TIMESTAMPTZ")
        c.execute(
            """
            UPDATE monitor_goods m
            SET first_seen = sub.fs
            FROM (
                SELECT goods_id, MIN(first_seen) AS fs
                FROM report_daily_items
                WHERE first_seen IS NOT NULL
                GROUP BY goods_id
            ) sub
            WHERE m.goods_id = sub.goods_id
              AND (m.first_seen IS NULL OR m.first_seen > sub.fs)
            """
        )
        n = c.rowcount
    conn.commit()
    return int(n or 0)


def backfill_from_json(conn, path: str, batch: int = 5000) -> int:
    with open(path, "r", encoding="utf-8") as f:
        rows = json.load(f)
    if not isinstance(rows, list):
        raise ValueError("JSON 应为 [{goods_id, first_seen}, ...]")

    total = 0
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute("ALTER TABLE monitor_goods ADD COLUMN IF NOT EXISTS first_seen TIMESTAMPTZ")
        buf = []
        for row in rows:
            gid = str(row.get("goods_id") or "").strip()
            fs = str(row.get("first_seen") or "").strip()
            if not gid or len(fs) < 10:
                continue
            buf.append((fs[:19], gid, fs[:19]))
            if len(buf) >= batch:
                c.executemany(
                    """UPDATE monitor_goods
                       SET first_seen = %s::timestamptz
                       WHERE goods_id = %s
                         AND (first_seen IS NULL OR first_seen > %s::timestamptz)""",
                    buf,
                )
                total += c.rowcount
                buf.clear()
        if buf:
            c.executemany(
                """UPDATE monitor_goods
                   SET first_seen = %s::timestamptz
                   WHERE goods_id = %s
                     AND (first_seen IS NULL OR first_seen > %s::timestamptz)""",
                buf,
            )
            total += c.rowcount
    conn.commit()
    return int(total or 0)


def stats(conn) -> dict:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute("SELECT COUNT(*) FROM monitor_goods")
        total = int(c.fetchone()[0] or 0)
        c.execute("SELECT COUNT(*) FROM monitor_goods WHERE first_seen IS NOT NULL")
        with_fs = int(c.fetchone()[0] or 0)
        c.execute(
            """SELECT COUNT(*) FROM monitor_goods
               WHERE first_seen IS NOT NULL
                 AND first_seen::date = CURRENT_DATE - INTERVAL '1 day'"""
        )
        yesterday = int(c.fetchone()[0] or 0)
    return {"total": total, "with_first_seen": with_fs, "first_seen_yesterday": yesterday}


def main():
    from cloud_deploy.scripts.bootstrap_env import bootstrap
    from cloud_deploy.cloud_api.database_pg import _conn, init_db

    ap = argparse.ArgumentParser(description="回填 monitor_goods.first_seen")
    ap.add_argument("--json", default="", help="SQLite 导出的 first_seen.json")
    args = ap.parse_args()

    bootstrap()
    init_db()
    conn = _conn()
    try:
        before = stats(conn)
        _log(f"回填前: {before}")
        n1 = backfill_from_report_items(conn)
        _log(f"从 report_daily_items 更新 {n1} 行")
        n2 = 0
        if args.json and os.path.isfile(args.json):
            n2 = backfill_from_json(conn, args.json)
            _log(f"从 JSON 更新 {n2} 行")
        after = stats(conn)
        _log(f"回填后: {after}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
