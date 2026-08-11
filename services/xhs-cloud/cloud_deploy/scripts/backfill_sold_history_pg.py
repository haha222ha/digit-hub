# -*- coding: utf-8 -*-
"""
从本地 SQLite 主库 sold_history 回补 PG goods_sold_daily（仅监控池商品）。
对齐需求规格书 v2 FR-M02：新入池商品全量日级历史 + 已在池每日增量。
"""
from __future__ import annotations

import argparse
import os
import sqlite3
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUD_DEPLOY = os.path.dirname(SCRIPT_DIR)
CRAWLER_ROOT = os.path.dirname(CLOUD_DEPLOY)
if CRAWLER_ROOT not in sys.path:
    sys.path.insert(0, CRAWLER_ROOT)

from cloud_deploy.cloud_api.config import get_settings
from cloud_deploy.cloud_api.database_pg import _conn, init_db
from cloud_deploy.cloud_api.sync_service import apply_sold_history_batch


def _log(msg: str) -> None:
    print(f"[backfill-sold] {msg}", flush=True)


def _pending_goods(conn, limit: int) -> list[str]:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            """SELECT goods_id FROM goods_sync_state
               WHERE sold_daily_backfill_done = FALSE
               ORDER BY updated_at ASC
               LIMIT %s""",
            (limit,),
        )
        return [r[0] for r in c.fetchall()]


def _fetch_sold_history(main_db: str, goods_ids: list[str]) -> list[dict]:
    if not goods_ids:
        return []
    conn = sqlite3.connect(f"file:{main_db}?mode=ro", uri=True, timeout=120)
    c = conn.cursor()
    rows = []
    chunk = 200
    for i in range(0, len(goods_ids), chunk):
        part = goods_ids[i : i + chunk]
        placeholders = ",".join("?" * len(part))
        c.execute(
            f"""SELECT goods_id, snapshot_date, sold_num, delta
                FROM sold_history WHERE goods_id IN ({placeholders})
                ORDER BY goods_id, snapshot_date""",
            part,
        )
        for gid, snap, sold, delta in c.fetchall():
            rows.append(
                {
                    "goods_id": gid,
                    "snapshot_date": snap,
                    "sold_num": sold,
                    "delta": delta,
                    "source": "local_sold_history",
                }
            )
    conn.close()
    return rows


def _count_local_history(main_db: str, goods_id: str) -> int:
    conn = sqlite3.connect(f"file:{main_db}?mode=ro", uri=True, timeout=60)
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM sold_history WHERE goods_id=?", (goods_id,))
    n = int(c.fetchone()[0])
    conn.close()
    return n


def _mark_done(conn, goods_ids: list[str]) -> None:
    if not goods_ids:
        return
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            """UPDATE goods_sync_state SET
                   sold_daily_backfill_done = TRUE,
                   last_backfill_at = NOW(),
                   updated_at = NOW()
               WHERE goods_id = ANY(%s)""",
            (goods_ids,),
        )
    conn.commit()


def backfill_sold_history(main_db: str, batch_goods: int = 50) -> dict:
    s = get_settings()
    if not s.xhs_database_url.startswith("postgres"):
        return {"skipped": True}

    init_db()
    pg = _conn()
    total_rows = 0
    total_goods = 0

    try:
        while True:
            goods_ids = _pending_goods(pg, batch_goods)
            if not goods_ids:
                break
            rows = _fetch_sold_history(main_db, goods_ids)
            n = apply_sold_history_batch(pg, rows)
            if rows:
                _mark_done(pg, goods_ids)
            else:
                empty = [g for g in goods_ids if _count_local_history(main_db, g) == 0]
                if empty:
                    _mark_done(pg, empty)
            total_rows += n
            total_goods += len(goods_ids)
            _log(f"已回补 {len(goods_ids)} 商品 / {n} 行 sold_history")
    finally:
        pg.close()

    result = {"goods_backfilled": total_goods, "rows_upserted": total_rows}
    _log(f"完成: {result}")
    return result


def main():
    ap = argparse.ArgumentParser(description="监控池 sold_history → PG goods_sold_daily")
    ap.add_argument(
        "--main-db",
        default=os.environ.get("XHS_DB_PATH", ""),
        help="SQLite 主库路径（默认 XHS_DB_PATH）",
    )
    ap.add_argument("--batch-goods", type=int, default=50)
    args = ap.parse_args()
    if not args.main_db:
        ap.error("请指定 --main-db 或设置 XHS_DB_PATH")
    backfill_sold_history(args.main_db, batch_goods=args.batch_goods)


if __name__ == "__main__":
    main()
