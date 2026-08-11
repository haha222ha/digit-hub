# -*- coding: utf-8 -*-
"""
服务器离线导入本地导出的监控池 sold_history / sold_snapshots。

前提：已运行 import_historical_reports.py 写入 report_daily_items + monitor_goods。

用法:
  python cloud_deploy/scripts/import_monitor_pool_offline.py \\
    --pack /opt/xhs-cloud/data/import_batch/monitor_pool
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUD_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if CLOUD_ROOT not in sys.path:
    sys.path.insert(0, CLOUD_ROOT)

from cloud_deploy.scripts.bootstrap_env import bootstrap
from cloud_deploy.cloud_api.database_pg import _conn, init_db
from cloud_deploy.cloud_api.sync_service import (
    apply_sold_history_batch,
    apply_sold_snapshots_batch,
)


def _log(msg: str) -> None:
    print(f"[import-monitor-pool] {msg}", flush=True)


def _read_jsonl_gz(path: str) -> list[dict]:
    rows = []
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def _mark_sold_daily_done(conn, goods_ids: list[str]) -> None:
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


def _mark_snapshots_done(conn, goods_ids: list[str]) -> None:
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


def import_monitor_pool_pack(pack_dir: str, batch_rows: int = 5000) -> dict:
    bootstrap()
    hist_dir = os.path.join(pack_dir, "sold_history")
    snap_dir = os.path.join(pack_dir, "sold_snapshots")
    manifest_path = os.path.join(pack_dir, "export_manifest.json")

    if not os.path.isdir(hist_dir):
        raise FileNotFoundError(f"缺少 sold_history 目录: {hist_dir}")

    init_db()
    conn = _conn()
    hist_files = sorted(
        f for f in os.listdir(hist_dir) if f.endswith(".jsonl.gz")
    )
    total_hist_rows = 0
    goods_touched: set[str] = set()

    try:
        for fname in hist_files:
            path = os.path.join(hist_dir, fname)
            rows = _read_jsonl_gz(path)
            for i in range(0, len(rows), batch_rows):
                chunk = rows[i : i + batch_rows]
                n = apply_sold_history_batch(conn, chunk)
                total_hist_rows += n
                for r in chunk:
                    gid = str(r.get("goods_id") or "").strip()
                    if gid:
                        goods_touched.add(gid)
            _log(f"sold_history {fname}: {len(rows)} 行")

        ids_path = os.path.join(pack_dir, "monitor_goods_ids.json")
        if os.path.isfile(ids_path):
            with open(ids_path, encoding="utf-8") as f:
                all_ids = json.load(f)
            _mark_sold_daily_done(conn, all_ids)
        elif goods_touched:
            _mark_sold_daily_done(conn, sorted(goods_touched))

        total_snap_rows = 0
        if os.path.isdir(snap_dir):
            snap_files = sorted(
                f for f in os.listdir(snap_dir) if f.endswith(".jsonl.gz")
            )
            snap_goods: set[str] = set()
            for fname in snap_files:
                path = os.path.join(snap_dir, fname)
                rows = _read_jsonl_gz(path)
                for i in range(0, len(rows), batch_rows):
                    chunk = rows[i : i + batch_rows]
                    n = apply_sold_snapshots_batch(conn, chunk)
                    total_snap_rows += n
                    for r in chunk:
                        gid = str(r.get("goods_id") or "").strip()
                        if gid:
                            snap_goods.add(gid)
                _log(f"sold_snapshots {fname}: {len(rows)} 行")
            if snap_goods:
                _mark_snapshots_done(conn, sorted(snap_goods))
    finally:
        conn.close()

    result = {
        "pack_dir": pack_dir,
        "sold_history_files": len(hist_files),
        "sold_history_rows": total_hist_rows,
        "sold_snapshots_rows": total_snap_rows if os.path.isdir(snap_dir) else 0,
        "goods_marked_done": len(goods_touched),
    }
    if os.path.isfile(manifest_path):
        result["export_manifest"] = manifest_path
    _log(f"完成: {result}")
    return result


def main():
    ap = argparse.ArgumentParser(description="离线导入监控池 sold_history")
    ap.add_argument("--pack", required=True, help="monitor_pool 数据包目录")
    ap.add_argument("--batch-rows", type=int, default=5000)
    args = ap.parse_args()
    import_monitor_pool_pack(args.pack, batch_rows=args.batch_rows)


if __name__ == "__main__":
    main()
