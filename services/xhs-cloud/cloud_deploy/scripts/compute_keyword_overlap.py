# -*- coding: utf-8 -*-
"""
关键词重叠率计算 — 基于 Jaccard 相似度

从 keyword_goods_mapping 表计算关键词两两之间的商品重叠率，
识别低效关键词（重叠率 >= 80% 且覆盖商品数更少）。

用法:
  python compute_keyword_overlap.py                      # 跑今天
  python compute_keyword_overlap.py --scan-date 2026-07-14
  python compute_keyword_overlap.py --threshold 0.8      # 自定义重叠阈值
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
    print(f"[keyword-overlap] {msg}", flush=True)


def run_compute(*, scan_date: str | None = None, threshold: float = 0.8) -> dict:
    """计算关键词重叠率并输出低效关键词列表。

    算法: Jaccard 相似度 = |A ∩ B| / |A ∪ B|
    优化: 只比较有共同商品的关键词对（通过 self-join on goods_id）
    """
    import psycopg2

    db_url = os.environ.get("XHS_PREMIUM_DATABASE_URL") or os.environ.get("XHS_DATABASE_URL", "")
    if not db_url or not db_url.startswith("postgres"):
        raise RuntimeError("未配置 XHS_PREMIUM_DATABASE_URL 或 XHS_DATABASE_URL")

    target_date = scan_date or time.strftime("%Y-%m-%d")

    _log(f"connecting to PG... (date={target_date}, threshold={threshold})")
    conn = psycopg2.connect(db_url)
    conn.set_session(isolation_level="READ COMMITTED")
    cur = conn.cursor()
    cur.execute("SET search_path TO xhs_monitor, public")

    # 1. 确保结果表存在
    cur.execute("""
        CREATE TABLE IF NOT EXISTS keyword_overlap_results (
            scan_date       TEXT NOT NULL,
            kw_keep         TEXT NOT NULL,
            kw_drop         TEXT NOT NULL,
            keep_goods_cnt  INTEGER,
            drop_goods_cnt  INTEGER,
            intersection    INTEGER,
            union_cnt       INTEGER,
            overlap_pct     DOUBLE PRECISION,
            computed_at     TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
            PRIMARY KEY (scan_date, kw_keep, kw_drop)
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_kor_date ON keyword_overlap_results (scan_date)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_kor_overlap ON keyword_overlap_results (scan_date, overlap_pct DESC)")
    conn.commit()

    # 2. 检查映射数据量
    cur.execute("SELECT COUNT(DISTINCT keyword), COUNT(DISTINCT goods_id), COUNT(*) FROM keyword_goods_mapping WHERE scan_date = %s", (target_date,))
    kw_cnt, goods_cnt, total_rows = cur.fetchone()
    _log(f"mapping data: {kw_cnt} keywords, {goods_cnt} goods, {total_rows} rows")

    if total_rows == 0:
        _log(f"no mapping data for {target_date}, skip")
        cur.close()
        conn.close()
        return {"scan_date": target_date, "status": "no_data", "keywords": 0, "low_efficiency": 0}

    # 3. 计算每对关键词的商品重叠率（只比较有共同商品的关键词对）
    _log("computing keyword overlap (Jaccard similarity)...")
    t0 = time.time()

    # 先计算每个关键词的商品数
    cur.execute("""
        CREATE TEMP TABLE _kw_goods_cnt AS
        SELECT keyword, COUNT(DISTINCT goods_id) AS cnt
        FROM keyword_goods_mapping
        WHERE scan_date = %s
        GROUP BY keyword
    """, (target_date,))

    # 找有共同商品的关键词对 + 计算交集
    cur.execute("""
        INSERT INTO keyword_overlap_results (
            scan_date, kw_keep, kw_drop, keep_goods_cnt, drop_goods_cnt,
            intersection, union_cnt, overlap_pct, computed_at
        )
        SELECT
            %s,
            CASE WHEN a.cnt >= b.cnt THEN a.keyword ELSE b.keyword END AS kw_keep,
            CASE WHEN a.cnt >= b.cnt THEN b.keyword ELSE a.keyword END AS kw_drop,
            GREATEST(a.cnt, b.cnt) AS keep_goods_cnt,
            LEAST(a.cnt, b.cnt) AS drop_goods_cnt,
            COUNT(DISTINCT m1.goods_id) AS intersection,
            a.cnt + b.cnt - COUNT(DISTINCT m1.goods_id) AS union_cnt,
            CASE
                WHEN a.cnt + b.cnt - COUNT(DISTINCT m1.goods_id) > 0
                THEN ROUND(
                    COUNT(DISTINCT m1.goods_id)::NUMERIC /
                    (a.cnt + b.cnt - COUNT(DISTINCT m1.goods_id)),
                    4
                )
                ELSE 0
            END AS overlap_pct,
            to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')
        FROM keyword_goods_mapping m1
        JOIN keyword_goods_mapping m2
            ON m1.goods_id = m2.goods_id
            AND m1.keyword < m2.keyword
            AND m1.scan_date = %s
            AND m2.scan_date = %s
        JOIN _kw_goods_cnt a ON a.keyword = m1.keyword
        JOIN _kw_goods_cnt b ON b.keyword = m2.keyword
        GROUP BY a.keyword, b.keyword, a.cnt, b.cnt
        HAVING COUNT(DISTINCT m1.goods_id)::FLOAT / NULLIF(a.cnt + b.cnt - COUNT(DISTINCT m1.goods_id), 0) >= %s
        ON CONFLICT (scan_date, kw_keep, kw_drop) DO UPDATE SET
            keep_goods_cnt = EXCLUDED.keep_goods_cnt,
            drop_goods_cnt = EXCLUDED.drop_goods_cnt,
            intersection = EXCLUDED.intersection,
            union_cnt = EXCLUDED.union_cnt,
            overlap_pct = EXCLUDED.overlap_pct,
            computed_at = EXCLUDED.computed_at
    """, (target_date, target_date, target_date, threshold))

    overlap_rows = cur.rowcount
    conn.commit()
    _log(f"overlap pairs computed: {overlap_rows} ({time.time()-t0:.1f}s)")

    # 4. 统计低效关键词（需要舍弃的）
    cur.execute("""
        SELECT COUNT(DISTINCT kw_drop) FROM keyword_overlap_results
        WHERE scan_date = %s AND overlap_pct >= %s
    """, (target_date, threshold))
    low_eff_cnt = cur.fetchone()[0]

    # 5. 输出 Top 20 低效关键词对
    cur.execute("""
        SELECT kw_keep, kw_drop, keep_goods_cnt, drop_goods_cnt, intersection, union_cnt,
               ROUND((overlap_pct * 100)::NUMERIC, 1) as overlap_pct_100
        FROM keyword_overlap_results
        WHERE scan_date = %s
        ORDER BY overlap_pct DESC, drop_goods_cnt ASC
        LIMIT 20
    """, (target_date,))
    top_pairs = cur.fetchall()
    _log(f"low-efficiency keywords: {low_eff_cnt}")
    if top_pairs:
        _log("top 20 overlap pairs:")
        for r in top_pairs:
            _log(f"  保留'{r[0]}'({r[2]}商品) 舍弃'{r[1]}'({r[3]}商品) 重叠{r[6]}% (交集{r[4]}/并集{r[5]})")

    cur.close()
    conn.close()
    return {
        "scan_date": target_date,
        "status": "ok",
        "keywords": kw_cnt,
        "goods": goods_cnt,
        "overlap_pairs": overlap_rows,
        "low_efficiency": low_eff_cnt,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="关键词重叠率计算（Jaccard 相似度）")
    ap.add_argument("--scan-date", default="", help="指定日期 YYYY-MM-DD")
    ap.add_argument("--threshold", type=float, default=0.8, help="重叠率阈值 (默认 0.8)")
    args = ap.parse_args()
    try:
        result = run_compute(scan_date=args.scan_date or None, threshold=args.threshold)
        print(f"\n=== result ===\n{result}")
        return 0
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
