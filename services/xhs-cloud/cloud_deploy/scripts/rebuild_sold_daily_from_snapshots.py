# -*- coding: utf-8 -*-
"""从 PG 历史快照回滚重建指定日期的 goods_sold_daily / goods_metrics_daily。"""
from __future__ import annotations

import argparse
import sys
from datetime import date, datetime, timedelta

SCRIPT_DIR = __file__.rsplit("/", 1)[0] if "/" in __file__ else __file__.rsplit("\\", 1)[0]
import os

CLOUD_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if CLOUD_ROOT not in sys.path:
    sys.path.insert(0, CLOUD_ROOT)

from cloud_deploy.scripts.bootstrap_env import bootstrap


def _log(msg: str) -> None:
    print(f"[rebuild-sold-daily] {msg}", flush=True)


def _upsert_metrics(c, yesterday: str, today: str) -> int:
    c.execute(
        """
        WITH d AS (
            SELECT sd.goods_id, sd.delta, sd.sold_num,
                   sp.sold_num AS prev_sold
            FROM goods_sold_daily sd
            LEFT JOIN goods_sold_daily sp
                   ON sp.goods_id = sd.goods_id AND sp.snapshot_date = %s::date
            WHERE sd.snapshot_date = %s::date
        )
        INSERT INTO goods_metrics_daily (goods_id, metric_date, v1d, actual_v1d, gr, burst, pool)
        SELECT m.goods_id,
               %s::date,
               d.delta,
               d.delta,
               CASE WHEN COALESCE(d.prev_sold, 0) > 0
                    THEN ROUND(d.delta::numeric / d.prev_sold * 100, 4)
                    ELSE 0 END,
               0,
               m.pool
        FROM d
        JOIN monitor_goods m ON m.goods_id = d.goods_id
        WHERE m.monitor_status IN ('active', 'idle')
        ON CONFLICT (goods_id, metric_date) DO UPDATE SET
            v1d = EXCLUDED.v1d,
            actual_v1d = EXCLUDED.actual_v1d,
            gr = EXCLUDED.gr
        """,
        (yesterday, today, today),
    )
    return c.rowcount


def rebuild_sold_daily_from_history(
    report_date: str = "",
    data_source: str = "daily_history_rollup",
) -> dict:
    """用 goods_sold_daily 最新日快照对比上一有效日快照，回写报告日增量。"""
    bootstrap()
    from cloud_deploy.cloud_api.database_pg import _conn, init_db

    d = date.fromisoformat(report_date) if report_date else datetime.now().date()
    today = d.isoformat()
    yesterday = (d - timedelta(days=1)).isoformat()

    init_db()
    conn = _conn()
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            _log(f"rollup {today} from goods_sold_daily history ...")
            c.execute(
                """
                WITH latest AS (
                    SELECT DISTINCT ON (goods_id)
                           goods_id, sold_num, snapshot_date
                    FROM goods_sold_daily
                    WHERE snapshot_date <= %s::date
                    ORDER BY goods_id, snapshot_date DESC
                ),
                prev AS (
                    SELECT DISTINCT ON (sd.goods_id)
                           sd.goods_id, sd.sold_num
                    FROM goods_sold_daily sd
                    JOIN latest l ON l.goods_id = sd.goods_id
                    WHERE sd.snapshot_date < l.snapshot_date
                    ORDER BY sd.goods_id, sd.snapshot_date DESC
                ),
                upsert AS (
                    INSERT INTO goods_sold_daily (goods_id, snapshot_date, sold_num, delta, source)
                    SELECT l.goods_id,
                           %s::date,
                           l.sold_num,
                           GREATEST(0, l.sold_num - COALESCE(p.sold_num, 0)),
                           %s
                    FROM latest l
                    LEFT JOIN prev p ON p.goods_id = l.goods_id
                    JOIN monitor_goods m ON m.goods_id = l.goods_id
                    WHERE m.monitor_status IN ('active', 'idle')
                      AND l.sold_num > 0
                    ON CONFLICT (goods_id, snapshot_date) DO UPDATE SET
                        sold_num = EXCLUDED.sold_num,
                        delta = EXCLUDED.delta,
                        source = EXCLUDED.source
                    RETURNING goods_id, sold_num, delta
                )
                SELECT COUNT(*) AS n,
                       COUNT(*) FILTER (WHERE delta > 0) AS n_incr
                FROM upsert
                """,
                (today, today, data_source),
            )
            sold_n, sold_incr = c.fetchone()
            metrics_n = _upsert_metrics(c, yesterday, today)
        conn.commit()
        out = {
            "report_date": today,
            "sold_daily_rows": int(sold_n or 0),
            "sold_daily_incr": int(sold_incr or 0),
            "metrics_rows": int(metrics_n or 0),
            "mode": "daily_history",
        }
        _log(f"done: {out}")
        return out
    finally:
        conn.close()


def rebuild_sold_daily_from_snapshots(
    report_date: str = "",
    lookback_days: int = 7,
    data_source: str = "snapshot_rollup",
) -> dict:
    bootstrap()
    from cloud_deploy.cloud_api.database_pg import _conn, init_db

    d = date.fromisoformat(report_date) if report_date else datetime.now().date()
    today = d.isoformat()
    yesterday = (d - timedelta(days=1)).isoformat()
    since = (d - timedelta(days=max(1, lookback_days))).isoformat()
    end_ts = (d + timedelta(days=1)).isoformat()

    init_db()
    conn = _conn()
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            _log(f"rollup {today}: latest snapshot since {since} vs prior daily baseline ...")
            c.execute(
                """
                WITH latest AS (
                    SELECT DISTINCT ON (goods_id)
                           goods_id, sold_num, snapshot_time
                    FROM goods_sold_snapshots
                    WHERE snapshot_time >= %s::timestamptz
                      AND snapshot_time < %s::timestamptz
                    ORDER BY goods_id, snapshot_time DESC
                ),
                prev AS (
                    SELECT DISTINCT ON (goods_id)
                           goods_id, sold_num
                    FROM goods_sold_daily
                    WHERE snapshot_date < %s::date
                    ORDER BY goods_id, snapshot_date DESC
                ),
                upsert AS (
                    INSERT INTO goods_sold_daily (goods_id, snapshot_date, sold_num, delta, source)
                    SELECT l.goods_id,
                           %s::date,
                           l.sold_num,
                           GREATEST(0, l.sold_num - COALESCE(p.sold_num, 0)),
                           %s
                    FROM latest l
                    LEFT JOIN prev p ON p.goods_id = l.goods_id
                    JOIN monitor_goods m ON m.goods_id = l.goods_id
                    WHERE m.monitor_status IN ('active', 'idle')
                    ON CONFLICT (goods_id, snapshot_date) DO UPDATE SET
                        sold_num = EXCLUDED.sold_num,
                        delta = EXCLUDED.delta,
                        source = EXCLUDED.source
                    RETURNING goods_id, sold_num, delta
                )
                SELECT COUNT(*) AS n,
                       COUNT(*) FILTER (WHERE delta > 0) AS n_incr
                FROM upsert
                """,
                (since, end_ts, today, today, data_source),
            )
            sold_n, sold_incr = c.fetchone()
            metrics_n = _upsert_metrics(c, yesterday, today)
        conn.commit()
        out = {
            "report_date": today,
            "sold_daily_rows": int(sold_n or 0),
            "sold_daily_incr": int(sold_incr or 0),
            "metrics_rows": int(metrics_n or 0),
            "lookback_days": lookback_days,
            "mode": "snapshots",
        }
        _log(f"done: {out}")
        return out
    finally:
        conn.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="从 PG 回滚重建 sold_daily")
    ap.add_argument("--date", default="", help="YYYY-MM-DD，默认今天")
    ap.add_argument("--mode", choices=("history", "snapshots"), default="history")
    ap.add_argument("--lookback-days", type=int, default=7)
    args = ap.parse_args()
    if args.mode == "history":
        rebuild_sold_daily_from_history(args.date)
    else:
        rebuild_sold_daily_from_snapshots(args.date, args.lookback_days)


if __name__ == "__main__":
    main()
