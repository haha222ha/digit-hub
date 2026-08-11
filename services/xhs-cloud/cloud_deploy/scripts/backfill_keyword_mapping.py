# -*- coding: utf-8 -*-
"""
回填 keyword_goods_mapping 初始数据 + 建表 + 验证

从 premium_goods.primary_keyword + premium_report_rank 回填映射数据。
后续爬虫改造后会直接写入真实的关键词-商品映射。

用法:
  python backfill_keyword_mapping.py                    # 回填最近 7 天
  python backfill_keyword_mapping.py --days 30          # 回填最近 30 天
  python backfill_keyword_mapping.py --date 2026-07-12  # 回填指定日期
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


def _log(msg: str) -> None:
    print(f"[backfill-kw] {msg}", flush=True)


def run_backfill(*, days: int = 7, date: str = "") -> dict:
    import psycopg2

    db_url = os.environ.get("XHS_PREMIUM_DATABASE_URL") or os.environ.get("XHS_DATABASE_URL", "")
    if not db_url or not db_url.startswith("postgres"):
        raise RuntimeError("未配置 XHS_PREMIUM_DATABASE_URL 或 XHS_DATABASE_URL")

    _log("connecting to PG...")
    conn = psycopg2.connect(db_url)
    conn.set_session(isolation_level="READ COMMITTED")
    cur = conn.cursor()
    cur.execute("SET search_path TO xhs_monitor, public")

    # 1. 建表（如果不存在）
    _log("step 1: ensure tables exist...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS keyword_goods_mapping (
            scan_date     TEXT NOT NULL,
            keyword       TEXT NOT NULL,
            goods_id      TEXT NOT NULL,
            rank_position INTEGER,
            batch_id      INTEGER,
            scanned_at    TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
            PRIMARY KEY (scan_date, keyword, goods_id)
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_kgm_kw ON keyword_goods_mapping (keyword, scan_date)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_kgm_date ON keyword_goods_mapping (scan_date)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_kgm_goods ON keyword_goods_mapping (goods_id)")
    conn.commit()
    _log("  tables ready")

    # 2. 回填映射数据
    if date:
        # 指定日期
        cur.execute("SELECT DISTINCT report_date FROM premium_report_rank WHERE report_date = %s", (date,))
        dates = [r[0] for r in cur.fetchall()]
    else:
        # 最近 N 天
        cur.execute("""
            SELECT DISTINCT report_date FROM premium_report_rank
            WHERE report_date >= to_char((CURRENT_DATE - INTERVAL '%s day')::DATE, 'YYYY-MM-DD')
            ORDER BY report_date DESC
        """, (days,))
        dates = [r[0] for r in cur.fetchall()]

    _log(f"step 2: backfill {len(dates)} dates: {dates}")

    total_rows = 0
    for d in dates:
        t0 = time.time()
        # 从 premium_goods.primary_keyword + premium_report_rank 回填
        cur.execute("""
            INSERT INTO keyword_goods_mapping (scan_date, keyword, goods_id, rank_position, batch_id)
            SELECT DISTINCT
                r.report_date,
                g.primary_keyword,
                r.goods_id,
                r.rank_no,
                NULL::INTEGER
            FROM premium_report_rank r
            JOIN premium_goods g ON g.goods_id = r.goods_id
            WHERE r.report_date = %s
                AND g.primary_keyword IS NOT NULL
                AND g.primary_keyword != ''
            ON CONFLICT (scan_date, keyword, goods_id) DO NOTHING
        """, (d,))
        rows = cur.rowcount
        conn.commit()
        total_rows += rows
        _log(f"  {d}: {rows} rows ({time.time()-t0:.1f}s)")

    _log(f"  total backfilled: {total_rows} rows")

    # 3. 统计回填结果
    cur.execute("""
        SELECT
            COUNT(DISTINCT keyword) AS kw_cnt,
            COUNT(DISTINCT goods_id) AS goods_cnt,
            COUNT(DISTINCT scan_date) AS date_cnt,
            COUNT(*) AS total_rows
        FROM keyword_goods_mapping
    """)
    row = cur.fetchone()
    summary = {
        "keywords": row[0],
        "goods": row[1],
        "dates": row[2],
        "total_rows": row[3],
    }

    # 4. 检查是否有重叠商品（被多个关键词搜到的商品）
    cur.execute("""
        SELECT COUNT(*) FROM (
            SELECT goods_id FROM keyword_goods_mapping
            WHERE scan_date = %s
            GROUP BY goods_id
            HAVING COUNT(DISTINCT keyword) >= 2
        ) t
    """, (dates[0] if dates else "",))
    overlap_goods = cur.fetchone()[0]
    summary["overlap_goods"] = overlap_goods
    _log(f"  overlap goods (multi-keyword) on {dates[0] if dates else 'N/A'}: {overlap_goods}")

    cur.close()
    conn.close()
    _log(f"done: {summary}")
    return summary


def main() -> int:
    ap = argparse.ArgumentParser(description="回填 keyword_goods_mapping 初始数据")
    ap.add_argument("--days", type=int, default=7, help="回填最近 N 天 (默认 7)")
    ap.add_argument("--date", default="", help="指定日期 YYYY-MM-DD")
    args = ap.parse_args()
    try:
        result = run_backfill(days=args.days, date=args.date)
        print(f"\n=== result ===\n{result}")
        return 0
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
