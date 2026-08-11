# -*- coding: utf-8 -*-
"""
Feature Engine PG 改造 — 每日 03:00 定时执行

从 premium_goods_daily / premium_report_rank 计算:
  - growth_rate       增速
  - acceleration      加速度
  - consecutive_days  连续上榜天数

写入 goods_feature_metrics 表（与爬虫写表分离）。
对应需求文档 48 §P2。

用法:
  python cloud_deploy/scripts/compute_feature_metrics.py
  python cloud_deploy/scripts/compute_feature_metrics.py --dry-run
  python cloud_deploy/scripts/compute_feature_metrics.py --snap-date 2026-07-14
"""
from __future__ import annotations

import argparse
import os
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUD_DEPLOY = os.path.dirname(SCRIPT_DIR)
CLOUD_ROOT = os.path.dirname(CLOUD_DEPLOY)
if CLOUD_ROOT not in sys.path:
    sys.path.insert(0, CLOUD_ROOT)

SQL_FILE = os.path.join(SCRIPT_DIR, "goods_feature_metrics.sql")


def _log(msg: str) -> None:
    print(f"[feature-metrics] {msg}", flush=True)


def run_compute(*, dry_run: bool = False, snap_date: str | None = None) -> dict:
    """执行 PG 端 Feature Engine 计算。

    支持两种 PG 连接方式:
      1. XHS_PREMIUM_DATABASE_URL (本地爬虫 PG, 优先)
      2. XHS_DATABASE_URL (云端会员 PG, fallback)
    """
    import os
    db_url = os.environ.get("XHS_PREMIUM_DATABASE_URL") or os.environ.get("XHS_DATABASE_URL", "")
    if not db_url or not db_url.startswith("postgres"):
        # 尝试 bootstrap 加载 .env
        try:
            from cloud_deploy.scripts.bootstrap_env import bootstrap
            bootstrap()
        except Exception:
            pass
        db_url = os.environ.get("XHS_PREMIUM_DATABASE_URL") or os.environ.get("XHS_DATABASE_URL", "")
    if not db_url or not db_url.startswith("postgres"):
        raise RuntimeError("未配置 XHS_PREMIUM_DATABASE_URL 或 XHS_DATABASE_URL")

    import psycopg2

    _log(f"connecting to PostgreSQL... ({db_url.split('@')[1].split('/')[0]})")
    conn = psycopg2.connect(db_url)
    conn.set_session(isolation_level="READ COMMITTED")  # 不阻塞爬虫写入
    cur = conn.cursor()

    # 1. 建表（幂等）
    _log("step 1: ensure table goods_feature_metrics...")
    cur.execute("SET search_path TO xhs_monitor, public")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS goods_feature_metrics (
            goods_id          TEXT NOT NULL,
            snap_date         TEXT NOT NULL,
            sold_num          INTEGER DEFAULT 0,
            delta             INTEGER DEFAULT 0,
            velocity_1d       DOUBLE PRECISION DEFAULT 0,
            growth_rate       DOUBLE PRECISION DEFAULT 0,
            acceleration      DOUBLE PRECISION DEFAULT 0,
            consecutive_days  INTEGER DEFAULT 0,
            updated_at        TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
            PRIMARY KEY (goods_id, snap_date)
        )
    """)
    for idx_sql in [
        "CREATE INDEX IF NOT EXISTS idx_gfm_date ON goods_feature_metrics (snap_date)",
        "CREATE INDEX IF NOT EXISTS idx_gfm_goods ON goods_feature_metrics (goods_id, snap_date DESC)",
        "CREATE INDEX IF NOT EXISTS idx_gfm_growth ON goods_feature_metrics (snap_date, growth_rate DESC)",
        "CREATE INDEX IF NOT EXISTS idx_gfm_accel ON goods_feature_metrics (snap_date, acceleration DESC)",
        "CREATE INDEX IF NOT EXISTS idx_gfm_consec ON goods_feature_metrics (snap_date, consecutive_days DESC)",
    ]:
        cur.execute(idx_sql)
    conn.commit()
    _log("  table ready")

    if dry_run:
        _log("dry-run mode, skipping calculations")
        cur.close()
        conn.close()
        return {"dry_run": True}

    # 2. 计算增速 growth_rate
    target_date = snap_date or time.strftime("%Y-%m-%d")
    _log(f"step 2: compute growth_rate for snap_date={target_date} (delta >= 1)...")
    t0 = time.time()
    cur.execute("""
        INSERT INTO goods_feature_metrics (
            goods_id, snap_date, sold_num, delta, velocity_1d,
            growth_rate, acceleration, consecutive_days, updated_at
        )
        SELECT
            cur.goods_id,
            cur.snap_date,
            cur.sold_num,
            cur.delta,
            cur.velocity_1d,
            CASE
                WHEN prev.sold_num IS NOT NULL AND prev.sold_num > 0
                THEN ROUND(
                    (cur.sold_num - prev.sold_num)::NUMERIC / prev.sold_num, 6
                )
                ELSE 0
            END AS growth_rate,
            0 AS acceleration,
            0 AS consecutive_days,
            to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')
        FROM premium_goods_daily cur
        LEFT JOIN premium_goods_daily prev
            ON prev.goods_id = cur.goods_id
            AND prev.snap_date = to_char(
                (to_date(cur.snap_date, 'YYYY-MM-DD') - INTERVAL '1 day')::DATE,
                'YYYY-MM-DD'
            )
        WHERE cur.delta >= 1
        ON CONFLICT (goods_id, snap_date) DO UPDATE SET
            sold_num = EXCLUDED.sold_num,
            delta = EXCLUDED.delta,
            velocity_1d = EXCLUDED.velocity_1d,
            growth_rate = EXCLUDED.growth_rate,
            updated_at = EXCLUDED.updated_at
    """)
    growth_rows = cur.rowcount
    conn.commit()
    _log(f"  growth_rate computed: {growth_rows} rows ({time.time()-t0:.1f}s)")

    # 3. 计算加速度 acceleration
    _log("step 3: compute acceleration...")
    t0 = time.time()
    cur.execute("""
        UPDATE goods_feature_metrics cur
        SET acceleration = CASE
                WHEN COALESCE(prev.growth_rate, 0) != 0 AND cur.growth_rate != 0
                THEN ROUND((cur.growth_rate - prev.growth_rate)::NUMERIC, 6)
                ELSE 0
            END,
            updated_at = to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')
        FROM goods_feature_metrics prev
        WHERE prev.goods_id = cur.goods_id
            AND prev.snap_date = to_char(
                (to_date(cur.snap_date, 'YYYY-MM-DD') - INTERVAL '1 day')::DATE,
                'YYYY-MM-DD'
            )
    """)
    accel_rows = cur.rowcount
    conn.commit()
    _log(f"  acceleration computed: {accel_rows} rows ({time.time()-t0:.1f}s)")

    # 4. 计算连续上榜天数 consecutive_days（gaps and islands）
    _log("step 4: compute consecutive_days (90-day window)...")
    t0 = time.time()
    cur.execute("""
        WITH ranked AS (
            SELECT
                goods_id,
                report_date,
                ROW_NUMBER() OVER (PARTITION BY goods_id ORDER BY report_date) AS rn,
                report_date::DATE
                    - (ROW_NUMBER() OVER (PARTITION BY goods_id ORDER BY report_date) || ' day')::INTERVAL
                    AS grp_start
            FROM premium_report_rank
            WHERE report_date >= to_char(
                (CURRENT_DATE - INTERVAL '90 day')::DATE, 'YYYY-MM-DD'
            )
        ),
        islands AS (
            SELECT
                goods_id,
                grp_start,
                COUNT(*) AS consecutive_days,
                MAX(report_date) AS last_date
            FROM ranked
            GROUP BY goods_id, grp_start
        ),
        latest_island AS (
            SELECT DISTINCT ON (goods_id)
                goods_id,
                consecutive_days,
                last_date
            FROM islands
            ORDER BY goods_id, last_date DESC
        )
        UPDATE goods_feature_metrics cur
        SET consecutive_days = COALESCE(li.consecutive_days, 0),
            updated_at = to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')
        FROM latest_island li
        WHERE li.goods_id = cur.goods_id
    """)
    consec_rows = cur.rowcount
    conn.commit()
    _log(f"  consecutive_days computed: {consec_rows} rows ({time.time()-t0:.1f}s)")

    # 5. 统计结果
    _log("step 5: summary...")
    cur.execute("""
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE growth_rate > 0) AS growth_positive,
            COUNT(*) FILTER (WHERE acceleration > 0) AS accel_positive,
            COUNT(*) FILTER (WHERE consecutive_days >= 3) AS consec_3plus,
            COUNT(*) FILTER (WHERE consecutive_days >= 7) AS consec_7plus,
            ROUND(AVG(growth_rate)::NUMERIC, 6) AS avg_growth,
            MAX(consecutive_days) AS max_consec
        FROM goods_feature_metrics
        WHERE snap_date = %s
    """, (target_date,))
    row = cur.fetchone()
    summary = {
        "snap_date": target_date,
        "total": row[0] if row else 0,
        "growth_positive": row[1] if row else 0,
        "accel_positive": row[2] if row else 0,
        "consec_3plus": row[3] if row else 0,
        "consec_7plus": row[4] if row else 0,
        "avg_growth": float(row[5]) if row and row[5] else 0,
        "max_consec": row[6] if row else 0,
    }
    cur.close()
    conn.close()
    _log(f"done: {summary}")
    return summary


def main() -> int:
    ap = argparse.ArgumentParser(description="Feature Engine PG 计算（增速/加速度/连续上榜）")
    ap.add_argument("--dry-run", action="store_true", help="只建表不计算")
    ap.add_argument("--snap-date", default="", help="指定日期 YYYY-MM-DD（默认今天）")
    args = ap.parse_args()

    try:
        result = run_compute(
            dry_run=args.dry_run,
            snap_date=args.snap_date or None,
        )
        print(f"\n=== result ===\n{result}")
        return 0
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
