# -*- coding: utf-8
"""
云端生成日报（读 PG，不依赖 gen_report.py）。

数据源（--source）:
  auto           当日精品增量 ∪ 当日监控池增量（选品报告，推荐）
  premium_daily  仅精品库当日增量（同 auto 的精品部分）
  premium_full   精品全表 LEFT JOIN 当日快照（大数据量慎用）
  pg_items       仅 report_daily_items
  sold_daily     监控池 + goods_sold_daily（含零增量扫描，incremental 请用 auto）

输出: {XHS_REPORT_OUTPUT_DIR}/全量MMDD/ → data.js + html
"""
from __future__ import annotations

import argparse
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUD_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if CLOUD_ROOT not in sys.path:
    sys.path.insert(0, CLOUD_ROOT)

from cloud_deploy.scripts.bootstrap_env import bootstrap


def _log(msg: str) -> None:
    print(f"[cloud-gen-report] {msg}", flush=True)


def _report_assets_dir() -> str:
    custom = os.environ.get("XHS_REPORT_ASSETS_DIR", "").strip()
    if custom and os.path.isdir(custom):
        return custom
    return os.path.join(CLOUD_ROOT, "cloud_deploy", "assets")


def generate_daily_report(
    report_date: str = "",
    source: str = "auto",
    dedup: bool = True,
    min_v1d=5,
    min_actual=5,
    min_v1d_virtual=1,
    min_actual_virtual=1,
) -> dict:
    bootstrap()
    from datetime import datetime

    from cloud_deploy.cloud_api.config import get_settings
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.reporting.data_js_builder import build_report_payload, resolve_output_dir, write_report_dir
    from cloud_deploy.reporting.pg_reader import (
        dedup_by_title,
        fetch_items_auto,
        fetch_items_from_daily_table,
        fetch_items_from_premium_daily,
        fetch_items_from_sold_daily,
        fetch_pool_stats,
        passes_threshold,
    )

    s = get_settings()
    if not s.xhs_database_url.startswith("postgres"):
        raise RuntimeError("cloud_gen_report 需要配置 XHS_DATABASE_URL")

    report_date = report_date or datetime.now().strftime("%Y-%m-%d")
    init_db()
    conn = _conn()
    pool_stats = {}
    try:
        pool_stats = fetch_pool_stats(conn)
        items = []
        if source == "auto":
            items = fetch_items_auto(conn, report_date)
            _log(f"auto(selection): {len(items)} 行")
        elif source == "pg_items":
            items = fetch_items_from_daily_table(conn, report_date, reconcile_sold=True)
            _log(f"pg_items: {len(items)} 行")
        elif source == "premium_daily":
            items = fetch_items_from_premium_daily(conn, report_date, incremental_only=True)
            _log(f"premium_daily(incr): {len(items)} 行")
        elif source == "premium_full":
            items = fetch_items_from_premium_daily(conn, report_date, incremental_only=False)
            _log(f"premium_full: {len(items)} 行")
        elif source == "sold_daily":
            items = fetch_items_from_sold_daily(conn, report_date)
            _log(f"sold_daily: {len(items)} 行")
    finally:
        conn.close()

    raw = len(items)
    _log(f"筛选阈值 (v1d>{min_v1d} 或 actual>={min_actual})...")
    items = [it for it in items if passes_threshold(it, min_v1d, min_actual, min_v1d_virtual, min_actual_virtual)]
    _log(f"阈值后: {len(items)} 行 (raw={raw})")
    if dedup:
        _log("同标题去重...")
        items = dedup_by_title(items)
        _log(f"去重后: {len(items)} 行")

    report_root = os.environ.get("XHS_REPORT_OUTPUT_DIR", os.path.join(s.xhs_data_dir, "reports"))
    out_dir = resolve_output_dir(report_root, report_date, "daily")
    _log(f"组装 data.js（约 {len(items)} 条，charts 统计中，请稍候）...")
    payload = build_report_payload(
        items,
        report_date,
        scope="daily",
        min_v1d=min_v1d,
        min_actual=min_actual,
        min_v1d_virtual=min_v1d_virtual,
        min_actual_virtual=min_actual_virtual,
        source="cloud_gen_report",
        pool_stats=pool_stats,
    )
    payload["meta"]["count_raw"] = raw
    _log(f"写入目录 {out_dir} ...")
    write_report_dir(out_dir, payload, _report_assets_dir())
    _log(f"输出: {out_dir} items={len(items)} (raw={raw}) bundle=data.js+index_with_gr.html+index_vue.html+report_theme")
    return {"report_date": report_date, "output_dir": out_dir, "count": len(items), "raw": raw}


def main():
    ap = argparse.ArgumentParser(description="云端 PG 生成日报")
    ap.add_argument("--date", default="", help="YYYY-MM-DD")
    ap.add_argument("--source", choices=("auto", "pg_items", "premium_daily", "premium_full", "sold_daily"), default="auto")
    ap.add_argument("--no-dedup", action="store_true")
    ap.add_argument("--min-v1d", type=float, default=5)
    ap.add_argument("--min-actual", type=float, default=5)
    ap.add_argument("--min-v1d-virtual", type=float, default=1)
    ap.add_argument("--min-actual-virtual", type=float, default=1)
    args = ap.parse_args()
    generate_daily_report(
        report_date=args.date,
        source=args.source,
        dedup=not args.no_dedup,
        min_v1d=args.min_v1d,
        min_actual=args.min_actual,
        min_v1d_virtual=args.min_v1d_virtual,
        min_actual_virtual=args.min_actual_virtual,
    )


if __name__ == "__main__":
    main()
