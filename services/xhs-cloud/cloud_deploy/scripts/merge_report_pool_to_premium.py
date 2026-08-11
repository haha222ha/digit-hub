# -*- coding: utf-8 -*-
"""
云 PG：报告轨 → 精品轨 合并（同 goods_id UPSERT）

  monitor_goods + report_daily_items  → premium_goods
  goods_sold_daily                    → premium_goods_daily

cd /opt/xhs-cloud && set -a && source .env && set +a && export PYTHONPATH=/opt/xhs-cloud
./venv/bin/python cloud_deploy/scripts/merge_report_pool_to_premium.py --dry-run
"""
from __future__ import annotations

import argparse
import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)


def _log(msg: str) -> None:
    print(f"[merge-report→premium] {msg}", flush=True)


def _stats(conn) -> dict:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        out = {}
        for name, sql in (
            ("monitor_goods", "SELECT COUNT(*) FROM monitor_goods"),
            ("report_daily_items", "SELECT COUNT(*) FROM report_daily_items"),
            ("goods_sold_daily_rows", "SELECT COUNT(*) FROM goods_sold_daily"),
            ("premium_goods", "SELECT COUNT(*) FROM premium_goods"),
            ("premium_goods_daily", "SELECT COUNT(*) FROM premium_goods_daily"),
        ):
            try:
                c.execute(sql)
                out[name] = int(c.fetchone()[0] or 0)
            except Exception as e:
                out[name] = f"err:{e}"
        c.execute(
            """
            SELECT COUNT(DISTINCT m.goods_id)
            FROM monitor_goods m
            INNER JOIN report_daily_items r ON r.goods_id = m.goods_id
            """
        )
        out["monitor∩report_items"] = int(c.fetchone()[0] or 0)
        return out


def merge_goods(conn, dry_run: bool = False) -> int:
    sql = """
    INSERT INTO premium_goods (
        goods_id, title, tier, lifecycle, primary_keyword,
        store_id, store_name, deal_price, sold_num,
        velocity_1d, actual_velocity_1d, burst_score,
        report_count, first_report_date, last_report_date,
        scan_priority, shop_fans, shop_sales, is_virtual,
        last_metric_scan, last_scan_engine, updated_at
    )
    SELECT
        m.goods_id,
        COALESCE(NULLIF(m.title, ''), ''),
        COALESCE(NULLIF(m.tier, ''), 'B'),
        0,
        '',
        COALESCE(m.store_id, ''),
        COALESCE(m.store_name, ''),
        0,
        COALESCE(m.last_sold, 0),
        COALESCE(m.last_v1d, 0),
        COALESCE(m.last_actual_v1d, 0),
        0,
        COALESCE(rc.report_count, 0),
        COALESCE(rc.first_report_date, ''),
        COALESCE(rc.last_report_date, ''),
        LEAST(100, GREATEST(10, COALESCE(m.priority_score, 50)::int)),
        0,
        0,
        CASE WHEN m.is_virtual THEN 1 ELSE 0 END,
        to_char(COALESCE(m.updated_at, NOW()), 'YYYY-MM-DD HH24:MI:SS'),
        'cloud_report_pool',
        to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')
    FROM monitor_goods m
    LEFT JOIN (
        SELECT
            goods_id,
            COUNT(DISTINCT report_date)::int AS report_count,
            MIN(report_date)::text AS first_report_date,
            MAX(report_date)::text AS last_report_date
        FROM report_daily_items
        GROUP BY goods_id
    ) rc ON rc.goods_id = m.goods_id
    WHERE m.monitor_status IN ('active', 'idle', 'watch')
       OR rc.goods_id IS NOT NULL
    ON CONFLICT (goods_id) DO UPDATE SET
        title = CASE
            WHEN EXCLUDED.title <> '' THEN EXCLUDED.title
            ELSE premium_goods.title
        END,
        report_count = GREATEST(COALESCE(premium_goods.report_count, 0), EXCLUDED.report_count),
        first_report_date = CASE
            WHEN premium_goods.first_report_date IS NULL OR premium_goods.first_report_date = ''
                THEN EXCLUDED.first_report_date
            WHEN EXCLUDED.first_report_date IS NOT NULL AND EXCLUDED.first_report_date <> ''
                 AND EXCLUDED.first_report_date < premium_goods.first_report_date
                THEN EXCLUDED.first_report_date
            ELSE premium_goods.first_report_date
        END,
        last_report_date = GREATEST(
            COALESCE(NULLIF(premium_goods.last_report_date, ''), '1970-01-01'),
            COALESCE(NULLIF(EXCLUDED.last_report_date, ''), '1970-01-01')
        ),
        sold_num = CASE
            WHEN COALESCE(premium_goods.sold_num, 0) = 0 THEN EXCLUDED.sold_num
            ELSE premium_goods.sold_num
        END,
        velocity_1d = CASE
            WHEN COALESCE(premium_goods.velocity_1d, 0) = 0 THEN EXCLUDED.velocity_1d
            ELSE premium_goods.velocity_1d
        END,
        actual_velocity_1d = CASE
            WHEN COALESCE(premium_goods.actual_velocity_1d, 0) = 0 THEN EXCLUDED.actual_velocity_1d
            ELSE premium_goods.actual_velocity_1d
        END,
        store_id = CASE
            WHEN COALESCE(premium_goods.store_id, '') = '' THEN EXCLUDED.store_id
            ELSE premium_goods.store_id
        END,
        store_name = CASE
            WHEN COALESCE(premium_goods.store_name, '') = '' THEN EXCLUDED.store_name
            ELSE premium_goods.store_name
        END,
        is_virtual = COALESCE(premium_goods.is_virtual, EXCLUDED.is_virtual),
        updated_at = EXCLUDED.updated_at
    """
    if dry_run:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """
                SELECT COUNT(*) FROM monitor_goods m
                LEFT JOIN (
                    SELECT goods_id FROM report_daily_items GROUP BY goods_id
                ) rc ON rc.goods_id = m.goods_id
                WHERE m.monitor_status IN ('active', 'idle', 'watch') OR rc.goods_id IS NOT NULL
                """
            )
            return int(c.fetchone()[0] or 0)
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(sql)
        return c.rowcount


def merge_daily(conn, dry_run: bool = False, max_days: int = 0) -> int:
    day_filter = ""
    params: list = []
    if max_days > 0:
        day_filter = " AND g.snapshot_date >= (CURRENT_DATE - %s::int)"
        params.append(max_days)
    sql = f"""
    INSERT INTO premium_goods_daily (
        goods_id, snap_date, sold_num, deal_price, delta, actual_delta,
        velocity_1d, source, created_at
    )
    SELECT
        g.goods_id,
        g.snapshot_date::text,
        g.sold_num,
        COALESCE(g.deal_price, 0),
        COALESCE(g.delta, 0),
        COALESCE(g.delta, 0),
        COALESCE(g.delta, 0),
        'cloud_report_pool',
        to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')
    FROM goods_sold_daily g
    INNER JOIN premium_goods p ON p.goods_id = g.goods_id
    WHERE 1=1 {day_filter}
    ON CONFLICT (goods_id, snap_date) DO UPDATE SET
        sold_num = EXCLUDED.sold_num,
        deal_price = EXCLUDED.deal_price,
        delta = EXCLUDED.delta,
        actual_delta = EXCLUDED.actual_delta,
        velocity_1d = CASE
            WHEN premium_goods_daily.source = 'cloud_report_pool' THEN EXCLUDED.velocity_1d
            WHEN COALESCE(premium_goods_daily.velocity_1d, 0) = 0 THEN EXCLUDED.velocity_1d
            ELSE premium_goods_daily.velocity_1d
        END
    """
    if dry_run:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                f"""
                SELECT COUNT(*) FROM goods_sold_daily g
                INNER JOIN premium_goods p ON p.goods_id = g.goods_id
                WHERE 1=1 {day_filter}
                """,
                params,
            )
            return int(c.fetchone()[0] or 0)
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(sql, params)
        return c.rowcount


def mark_sync_state(conn, dry_run: bool = False) -> int:
    sql = """
    INSERT INTO premium_sync_state (goods_id, snapshots_backfill_done, snapshots_backfill_rows, updated_at)
    SELECT
        p.goods_id,
        1,
        COALESCE(d.cnt, 0),
        to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')
    FROM premium_goods p
    LEFT JOIN (
        SELECT goods_id, COUNT(*)::int AS cnt FROM premium_goods_daily GROUP BY goods_id
    ) d ON d.goods_id = p.goods_id
    WHERE COALESCE(d.cnt, 0) > 0
    ON CONFLICT (goods_id) DO UPDATE SET
        snapshots_backfill_done = 1,
        snapshots_backfill_rows = GREATEST(
            COALESCE(premium_sync_state.snapshots_backfill_rows, 0),
            EXCLUDED.snapshots_backfill_rows
        ),
        updated_at = EXCLUDED.updated_at
    """
    if dry_run:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """
                SELECT COUNT(DISTINCT p.goods_id)
                FROM premium_goods p
                INNER JOIN premium_goods_daily d ON d.goods_id = p.goods_id
                """
            )
            return int(c.fetchone()[0] or 0)
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(sql)
        return c.rowcount


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="报告轨 → 精品轨 合并（云 PG）")
    ap.add_argument("--dry-run", action="store_true", help="只统计，不写入")
    ap.add_argument("--skip-goods", action="store_true")
    ap.add_argument("--skip-daily", action="store_true")
    ap.add_argument("--max-days", type=int, default=0, help="daily 仅合并近 N 天，0=全部")
    args = ap.parse_args(argv)

    db_url = os.environ.get("XHS_DATABASE_URL", "")
    if not db_url.startswith("postgres"):
        _log("需要 XHS_DATABASE_URL（postgres），请在云服务器 /opt/xhs-cloud/.env 下执行")
        return 1

    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.premium_schema_pg import init_premium_pg_schema

    bootstrap = __import__(
        "cloud_deploy.scripts.bootstrap_env", fromlist=["bootstrap"]
    ).bootstrap
    bootstrap()
    init_db()
    conn = _conn()
    try:
        init_premium_pg_schema(conn)
        before = _stats(conn)
        _log(f"合并前: {before}")

        n_goods = 0 if args.skip_goods else merge_goods(conn, dry_run=args.dry_run)
        n_daily = 0 if args.skip_daily else merge_daily(
            conn, dry_run=args.dry_run, max_days=args.max_days
        )
        n_state = 0 if args.dry_run or args.skip_daily else mark_sync_state(conn)

        if not args.dry_run:
            conn.commit()
            after = _stats(conn)
            _log(f"合并后: {after}")
        else:
            _log(f"[dry-run] 将合并 premium_goods 来源行≈{n_goods:,}")
            _log(f"[dry-run] 将合并 premium_goods_daily 行≈{n_daily:,}")
            _log(f"[dry-run] 将标记 sync_state 商品≈{mark_sync_state(conn, dry_run=True):,}")

        _log(
            f"完成 goods={n_goods:,} daily_rows={n_daily:,} sync_state={n_state:,}"
            + (" (dry-run)" if args.dry_run else "")
        )
    except Exception as e:
        conn.rollback()
        _log(f"失败: {e}")
        raise
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
