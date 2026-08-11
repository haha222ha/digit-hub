# -*- coding: utf-8 -*-
"""
关键词贪心去重优化 — 贪心集合覆盖算法

从 keyword_goods_mapping 表读取数据，用贪心算法选择最优关键词子集：
1. 按覆盖商品数降序排列关键词
2. 逐个选择关键词，如果该关键词 >80% 的商品已被选中关键词覆盖，则舍弃
3. 输出保留/舍弃关键词列表 + 优化报告

用法:
  python optimize_keywords.py                         # 跑今天
  python optimize_keywords.py --scan-date 2026-07-14
  python optimize_keywords.py --threshold 0.8 --output result.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUD_DEPLOY = os.path.dirname(SCRIPT_DIR)
CLOUD_ROOT = os.path.dirname(CLOUD_DEPLOY)
if CLOUD_ROOT not in sys.path:
    sys.path.insert(0, CLOUD_ROOT)


def _log(msg: str) -> None:
    print(f"[keyword-optimize] {msg}", flush=True)


def run_optimize(*, scan_date: str | None = None, threshold: float = 0.8, output: str = "") -> dict:
    """贪心集合覆盖：用最少的关键词覆盖最多的商品。"""
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

    # 1. 加载关键词→商品集合映射
    _log("loading keyword-goods mapping...")
    cur.execute("""
        SELECT keyword, goods_id FROM keyword_goods_mapping WHERE scan_date = %s
    """, (target_date,))
    mapping: dict[str, set[str]] = {}
    for kw, gid in cur.fetchall():
        mapping.setdefault(kw, set()).add(gid)

    total_kw = len(mapping)
    if total_kw == 0:
        _log(f"no mapping data for {target_date}")
        cur.close()
        conn.close()
        return {"scan_date": target_date, "status": "no_data", "total_keywords": 0}

    all_goods = set()
    for goods_set in mapping.values():
        all_goods |= goods_set
    total_goods = len(all_goods)
    _log(f"loaded: {total_kw} keywords, {total_goods} unique goods")

    # 2. 贪心集合覆盖
    _log(f"running greedy set cover (threshold={threshold})...")
    t0 = time.time()

    # 按覆盖商品数降序排列
    sorted_kw = sorted(mapping.items(), key=lambda x: len(x[1]), reverse=True)

    keep_list = []      # 保留的关键词 [(keyword, goods_count, new_goods_count)]
    drop_list = []      # 舍弃的关键词 [(keyword, goods_count, overlap_ratio)]
    covered: set[str] = set()

    for kw, goods_set in sorted_kw:
        new_goods = goods_set - covered
        overlap_ratio = 1.0 - (len(new_goods) / len(goods_set)) if goods_set else 1.0

        if overlap_ratio >= threshold:
            # >80% 商品已被覆盖 → 低效关键词，舍弃
            drop_list.append({
                "keyword": kw,
                "goods_count": len(goods_set),
                "overlap_pct": round(overlap_ratio * 100, 1),
            })
        else:
            keep_list.append({
                "keyword": kw,
                "goods_count": len(goods_set),
                "new_goods_count": len(new_goods),
            })
            covered |= goods_set

    elapsed = time.time() - t0
    keep_count = len(keep_list)
    drop_count = len(drop_list)
    coverage_pct = round(len(covered) / total_goods * 100, 1) if total_goods else 0

    _log(f"greedy done in {elapsed:.1f}s")
    _log(f"  keep: {keep_count} keywords (覆盖 {len(covered)}/{total_goods} 商品 = {coverage_pct}%)")
    _log(f"  drop: {drop_count} keywords (低效/重复)")
    _log(f"  优化率: 减少 {round(drop_count/total_kw*100, 1)}% 关键词")

    if keep_list:
        _log("  保留 Top 10:")
        for item in keep_list[:10]:
            _log(f"    '{item['keyword']}': {item['goods_count']}商品 (+{item['new_goods_count']}新增)")
    if drop_list:
        _log("  舍弃 Top 10:")
        for item in drop_list[:10]:
            _log(f"    '{item['keyword']}': {item['goods_count']}商品 (重叠{item['overlap_pct']}%)")

    # 3. 写入优化结果表
    cur.execute("""
        CREATE TABLE IF NOT EXISTS keyword_optimize_results (
            scan_date      TEXT NOT NULL,
            keyword        TEXT NOT NULL,
            action         TEXT NOT NULL,  -- keep / drop
            goods_count    INTEGER,
            new_goods_count INTEGER,
            overlap_pct    DOUBLE PRECISION,
            computed_at    TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
            PRIMARY KEY (scan_date, keyword)
        )
    """)
    # 清除当天旧数据
    cur.execute("DELETE FROM keyword_optimize_results WHERE scan_date = %s", (target_date,))

    # 批量插入保留关键词
    for item in keep_list:
        cur.execute("""
            INSERT INTO keyword_optimize_results (scan_date, keyword, action, goods_count, new_goods_count, overlap_pct)
            VALUES (%s, %s, 'keep', %s, %s, 0)
        """, (target_date, item["keyword"], item["goods_count"], item["new_goods_count"]))

    # 批量插入舍弃关键词
    for item in drop_list:
        cur.execute("""
            INSERT INTO keyword_optimize_results (scan_date, keyword, action, goods_count, new_goods_count, overlap_pct)
            VALUES (%s, %s, 'drop', %s, 0, %s)
        """, (target_date, item["keyword"], item["goods_count"], item["overlap_pct"] / 100))

    conn.commit()
    cur.close()
    conn.close()

    result = {
        "scan_date": target_date,
        "status": "ok",
        "total_keywords": total_kw,
        "total_goods": total_goods,
        "keep_keywords": keep_count,
        "drop_keywords": drop_count,
        "covered_goods": len(covered),
        "coverage_pct": coverage_pct,
        "reduction_pct": round(drop_count / total_kw * 100, 1) if total_kw else 0,
        "keep_list": keep_list[:50],
        "drop_list": drop_list[:50],
    }

    if output:
        with open(output, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        _log(f"results written to {output}")

    return result


def main() -> int:
    ap = argparse.ArgumentParser(description="关键词贪心去重优化（贪心集合覆盖）")
    ap.add_argument("--scan-date", default="", help="指定日期 YYYY-MM-DD")
    ap.add_argument("--threshold", type=float, default=0.8, help="重叠率阈值 (默认 0.8)")
    ap.add_argument("--output", default="", help="输出 JSON 文件路径")
    args = ap.parse_args()
    try:
        result = run_optimize(scan_date=args.scan_date or None, threshold=args.threshold, output=args.output)
        print(f"\n=== result ===\n总关键词: {result['total_keywords']}")
        print(f"保留: {result['keep_keywords']} | 舍弃: {result['drop_keywords']}")
        print(f"商品覆盖率: {result['coverage_pct']}% | 关键词减少: {result['reduction_pct']}%")
        return 0
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
