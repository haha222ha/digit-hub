# -*- coding: utf-8 -*-
"""
模拟多关键词搜索数据 — 用商品标题匹配关键词，模拟真实搜索场景

一个商品标题可能包含多个关键词（如"小学语文电子资料"包含"小学语文"和"电子资料"），
用不同关键词搜索都能搜到它，自然产生重叠。

用法:
  python simulate_keyword_mapping.py --date 2026-07-12
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
    print(f"[simulate-kw] {msg}", flush=True)


def run_simulate(*, date: str = "") -> dict:
    import psycopg2

    db_url = os.environ.get("XHS_PREMIUM_DATABASE_URL") or os.environ.get("XHS_DATABASE_URL", "")
    if not db_url or not db_url.startswith("postgres"):
        raise RuntimeError("未配置 XHS_PREMIUM_DATABASE_URL 或 XHS_DATABASE_URL")

    _log("connecting to PG...")
    conn = psycopg2.connect(db_url)
    conn.set_session(isolation_level="READ COMMITTED")
    cur = conn.cursor()
    cur.execute("SET search_path TO xhs_monitor, public")

    target_date = date or "2026-07-12"

    # 1. 加载关键词列表（取短关键词 2-6 字，限制 1500 个）
    _log("loading keywords...")
    cur.execute("""
        SELECT keyword FROM keyword_batch_members
        WHERE length(keyword) >= 2 AND length(keyword) <= 6
        ORDER BY keyword
        LIMIT 1500
    """)
    all_keywords = [r[0] for r in cur.fetchall()]
    _log(f"  {len(all_keywords)} short keywords (2-6 chars)")

    # 2. 加载当天商品标题（限制 8000 个，验证流程）
    _log(f"loading goods titles for {target_date}...")
    cur.execute("""
        SELECT goods_id, title FROM premium_report_rank
        WHERE report_date = %s AND title IS NOT NULL AND title != ''
        LIMIT 8000
    """, (target_date,))
    goods = cur.fetchall()
    _log(f"  {len(goods)} goods with titles")

    # 3. 模拟：用关键词匹配商品标题（每个商品可能被多个关键词匹配到）
    _log("simulating keyword-goods mapping (title matching)...")
    t0 = time.time()

    # 清除当天旧数据
    cur.execute("DELETE FROM keyword_goods_mapping WHERE scan_date = %s", (target_date,))
    conn.commit()

    batch_data = []
    matched_cnt = 0
    multi_kw_cnt = 0
    goods_kw_map: dict[str, int] = {}  # goods_id -> 匹配到的关键词数

    for goods_id, title in goods:
        title_lower = title.lower() if title else ""
        kw_matched = 0
        for kw in all_keywords:
            if kw in title_lower:
                batch_data.append((target_date, kw, goods_id, None, None))
                kw_matched += 1
                matched_cnt += 1
        if kw_matched > 1:
            multi_kw_cnt += 1

        # 每 5000 条提交一次
        if len(batch_data) >= 5000:
            cur.executemany("""
                INSERT INTO keyword_goods_mapping (scan_date, keyword, goods_id, rank_position, batch_id)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (scan_date, keyword, goods_id) DO NOTHING
            """, batch_data)
            conn.commit()
            batch_data = []

    # 提交剩余
    if batch_data:
        cur.executemany("""
            INSERT INTO keyword_goods_mapping (scan_date, keyword, goods_id, rank_position, batch_id)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (scan_date, keyword, goods_id) DO NOTHING
        """, batch_data)
        conn.commit()

    elapsed = time.time() - t0
    _log(f"  matched: {matched_cnt} mappings, {multi_kw_cnt} goods with multi-keyword ({elapsed:.1f}s)")

    # 4. 统计结果
    cur.execute("""
        SELECT
            COUNT(DISTINCT keyword) AS kw_cnt,
            COUNT(DISTINCT goods_id) AS goods_cnt,
            COUNT(*) AS total_rows
        FROM keyword_goods_mapping
        WHERE scan_date = %s
    """, (target_date,))
    row = cur.fetchone()

    cur.execute("""
        SELECT COUNT(*) FROM (
            SELECT goods_id FROM keyword_goods_mapping
            WHERE scan_date = %s
            GROUP BY goods_id
            HAVING COUNT(DISTINCT keyword) >= 2
        ) t
    """, (target_date,))
    overlap_goods = cur.fetchone()[0]

    # 5. 找出被最多关键词搜到的商品
    cur.execute("""
        SELECT goods_id, COUNT(DISTINCT keyword) AS kw_cnt
        FROM keyword_goods_mapping
        WHERE scan_date = %s
        GROUP BY goods_id
        ORDER BY kw_cnt DESC
        LIMIT 5
    """, (target_date,))
    top_multi = cur.fetchall()

    summary = {
        "scan_date": target_date,
        "keywords": row[0],
        "goods": row[1],
        "total_rows": row[2],
        "overlap_goods": overlap_goods,
        "top_multi_kw_goods": [(r[0], r[1]) for r in top_multi],
    }

    cur.close()
    conn.close()
    _log(f"done: {summary}")
    return summary


def main() -> int:
    ap = argparse.ArgumentParser(description="模拟多关键词搜索数据（标题匹配）")
    ap.add_argument("--date", default="2026-07-12", help="指定日期 YYYY-MM-DD")
    args = ap.parse_args()
    try:
        result = run_simulate(date=args.date)
        print(f"\n=== result ===")
        print(f"关键词: {result['keywords']} | 商品: {result['goods']} | 映射: {result['total_rows']}")
        print(f"多关键词重叠商品: {result['overlap_goods']}")
        if result['top_multi_kw_goods']:
            print("被最多关键词搜到的商品:")
            for gid, cnt in result['top_multi_kw_goods']:
                print(f"  {gid}: {cnt} 个关键词")
        return 0
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
