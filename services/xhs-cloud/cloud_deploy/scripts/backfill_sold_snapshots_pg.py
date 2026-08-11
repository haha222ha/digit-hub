# -*- coding: utf-8 -*-
"""监控池 sold_snapshots → PG goods_sold_snapshots（retention=0 时全量导入）。"""
from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from datetime import datetime, timedelta

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUD_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if CLOUD_ROOT not in sys.path:
    sys.path.insert(0, CLOUD_ROOT)

from cloud_deploy.cloud_api.config import get_settings
from cloud_deploy.cloud_api.database_pg import _conn, init_db
from cloud_deploy.cloud_api.retention_policy import snapshot_retention_days
from cloud_deploy.cloud_api.sync_service import apply_sold_snapshots_batch


def _log(msg: str) -> None:
    print(f"[backfill-snapshots] {msg}", flush=True)


def _pending_goods(conn, limit: int) -> list[str]:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            """SELECT goods_id FROM goods_sync_state
               WHERE sold_snapshots_backfill_done = FALSE
               ORDER BY updated_at ASC LIMIT %s""",
            (limit,),
        )
        return [r[0] for r in c.fetchall()]


def _fetch_snapshots(main_db: str, goods_ids: list[str], since: str) -> list[dict]:
    if not goods_ids:
        return []
    conn = sqlite3.connect(f"file:{main_db}?mode=ro", uri=True, timeout=120)
    c = conn.cursor()
    rows = []
    chunk = 100
    for i in range(0, len(goods_ids), chunk):
        part = goods_ids[i : i + chunk]
        placeholders = ",".join("?" * len(part))
        c.execute(
            f"""SELECT goods_id, snapshot_time, sold_num, data_source
                FROM sold_snapshots
                WHERE goods_id IN ({placeholders}) AND snapshot_time >= ?
                ORDER BY goods_id, snapshot_time""",
            (*part, since),
        )
        for gid, snap, sold, src in c.fetchall():
            rows.append(
                {
                    "goods_id": gid,
                    "snapshot_time": snap,
                    "sold_num": sold,
                    "data_source": src or "local_sold_snapshots",
                }
            )
    conn.close()
    return rows


def _mark_done(conn, goods_ids: list[str]) -> None:
    if not goods_ids:
        return
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            """UPDATE goods_sync_state SET
                   sold_snapshots_backfill_done = TRUE,
                   last_backfill_at = NOW(),
                   updated_at = NOW()
               WHERE goods_id = ANY(%s)""",
            (goods_ids,),
        )
    conn.commit()


def backfill_sold_snapshots(main_db: str, batch_goods: int = 20, retention_days: int | None = None) -> dict:
    s = get_settings()
    if not s.xhs_database_url.startswith("postgres"):
        return {"skipped": True}

    days = retention_days if retention_days is not None else snapshot_retention_days()
    since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d 00:00:00")

    init_db()
    pg = _conn()
    total_rows = 0
    total_goods = 0
    try:
        while True:
            goods_ids = _pending_goods(pg, batch_goods)
            if not goods_ids:
                break
            rows = _fetch_snapshots(main_db, goods_ids, since)
            n = apply_sold_snapshots_batch(pg, rows)
            # 90 天窗口内无快照也视为完成（本地无数据或均已过期）
            _mark_done(pg, goods_ids)
            total_rows += n
            total_goods += len(goods_ids)
            _log(f"已回补 {len(goods_ids)} 商品 / {n} 行 snapshots（≥{since[:10]}）")
    finally:
        pg.close()

    result = {"goods_backfilled": total_goods, "rows_upserted": total_rows, "retention_days": days}
    _log(f"完成: {result}")
    return result


def main():
    ap = argparse.ArgumentParser(description="监控池 sold_snapshots(90d) → PG")
    ap.add_argument("--main-db", default=os.environ.get("XHS_DB_PATH", ""))
    ap.add_argument("--batch-goods", type=int, default=20)
    ap.add_argument("--retention-days", type=int, default=0)
    args = ap.parse_args()
    if not args.main_db:
        ap.error("请指定 --main-db 或设置 XHS_DB_PATH")
    backfill_sold_snapshots(
        args.main_db,
        batch_goods=args.batch_goods,
        retention_days=args.retention_days or None,
    )


if __name__ == "__main__":
    main()
