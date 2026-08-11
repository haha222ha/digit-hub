# -*- coding: utf-8
"""已在池商品 sold_history 增量同步（新日期）。"""
from __future__ import annotations

import argparse
import os
import sqlite3
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUD_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if CLOUD_ROOT not in sys.path:
    sys.path.insert(0, CLOUD_ROOT)

from cloud_deploy.cloud_api.config import get_settings
from cloud_deploy.cloud_api.database_pg import _conn, init_db
from cloud_deploy.cloud_api.sync_service import apply_sold_history_batch


def _log(msg: str) -> None:
    print(f"[sync-incr-daily] {msg}", flush=True)


def _active_goods_with_cursor(conn, limit: int, offset: int) -> list[tuple[str, str]]:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            """
            SELECT m.goods_id,
                   COALESCE(MAX(sd.snapshot_date)::text, '1970-01-01') AS last_date
            FROM monitor_goods m
            LEFT JOIN goods_sold_daily sd ON sd.goods_id = m.goods_id
            WHERE m.monitor_status IN ('active','idle')
            GROUP BY m.goods_id
            ORDER BY last_date ASC, m.goods_id ASC
            LIMIT %s OFFSET %s
            """,
            (limit, offset),
        )
        return [(r[0], r[1]) for r in c.fetchall()]


def _count_active_goods(conn) -> int:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute("SELECT COUNT(*) FROM monitor_goods WHERE monitor_status IN ('active','idle')")
        return int(c.fetchone()[0])


def _fetch_new_history(main_db: str, goods_id: str, after_date: str) -> list[dict]:
    conn = sqlite3.connect(f"file:{main_db}?mode=ro", uri=True, timeout=120)
    c = conn.cursor()
    c.execute(
        """SELECT goods_id, snapshot_date, sold_num, delta
           FROM sold_history
           WHERE goods_id=? AND snapshot_date > ?
           ORDER BY snapshot_date""",
        (goods_id, after_date),
    )
    rows = [
        {
            "goods_id": gid,
            "snapshot_date": snap,
            "sold_num": sold,
            "delta": delta,
            "source": "local_incr_sync",
        }
        for gid, snap, sold, delta in c.fetchall()
    ]
    conn.close()
    return rows


def sync_incremental_sold_daily(main_db: str, batch_goods: int = 100) -> dict:
    s = get_settings()
    if not s.xhs_database_url.startswith("postgres"):
        return {"skipped": True}

    init_db()
    pg = _conn()
    total_rows = 0
    total_goods = 0
    offset = 0
    pool_size = _count_active_goods(pg)
    try:
        while offset < pool_size:
            batch = _active_goods_with_cursor(pg, batch_goods, offset)
            if not batch:
                break
            for gid, last_date in batch:
                rows = _fetch_new_history(main_db, gid, last_date)
                if not rows:
                    continue
                n = apply_sold_history_batch(pg, rows)
                total_rows += n
                total_goods += 1
                _log(f"{gid}: +{n} 行 (after {last_date})")
            offset += batch_goods
    finally:
        pg.close()

    result = {"goods_synced": total_goods, "rows_upserted": total_rows, "pool_size": pool_size}
    _log(f"完成: {result}")
    return result


def main():
    ap = argparse.ArgumentParser(description="监控池 sold_history 增量同步")
    ap.add_argument("--main-db", default=os.environ.get("XHS_DB_PATH", ""))
    ap.add_argument("--batch-goods", type=int, default=100)
    args = ap.parse_args()
    if not args.main_db:
        ap.error("请指定 --main-db 或设置 XHS_DB_PATH")
    sync_incremental_sold_daily(args.main_db, batch_goods=args.batch_goods)


if __name__ == "__main__":
    main()
