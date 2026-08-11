#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
方案 A：本地 PG（9 万 delta 池）→ 类目 llm_feed.json → 可选 LLM → 上传云用目录。

不上云精品库 PG；AI 只吃聚合后每类目 ~2–5KB JSON（含增速切片方向词）。

用法（开发机，配置本地 XHS_DATABASE_URL 或 INSIGHT_PG_DSN）:
  cd E:\\vuemonitor\\xhs-cloud
  set PYTHONPATH=E:\\vuemonitor\\xhs-cloud
  python cloud_deploy/scripts/export_local_insight_bundle.py --date 2026-07-12
  python cloud_deploy/scripts/export_local_insight_bundle.py --date 2026-07-12 --llm

输出:
  data/insight_export/insight_YYYYMMDD/{类目}/llm_feed.json (+ --llm 时 index.html)
"""
from __future__ import annotations

import argparse
import os
import sys

ROOT = os.environ.get("XHS_CLOUD_ROOT", os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from cloud_deploy.scripts.bootstrap_env import bootstrap


def main() -> int:
    ap = argparse.ArgumentParser(description="本地观察池 → feed-v1.1 投喂包（方案 A）")
    ap.add_argument("--date", required=True, help="YYYY-MM-DD")
    ap.add_argument(
        "--source",
        default=os.environ.get("INSIGHT_PG_SOURCE", "pg_items"),
        help="默认 pg_items（report_daily_items）；可选 scan_delta / auto",
    )
    ap.add_argument(
        "--out",
        default="",
        help="输出根目录，默认 data/insight_export/insight_YYYYMMDD",
    )
    ap.add_argument(
        "--llm",
        action="store_true",
        help="本地跑 5 Agent 生成 index.html（可再 upload 到云，云零 LLM）",
    )
    ap.add_argument("--min-sample", type=int, default=None)
    ap.add_argument("--max-categories", type=int, default=None)
    args = ap.parse_args()

    bootstrap()
    report_date = args.date[:10]
    day = report_date.replace("-", "")

    if args.llm:
        os.environ.setdefault("INSIGHT_PG_SOURCE", args.source)
        from cloud_deploy.reporting.insight_pipeline import run_insight_pipeline

        out_root = args.out or os.path.join(ROOT, "data", "insight_export", f"insight_{day}")
        os.environ["XHS_INSIGHT_EXPORT_DIR"] = out_root
        summary = run_insight_pipeline(report_date, shadow=True, source=args.source)
        print(f"[local-bundle] LLM pipeline done categories={summary.get('categories')} → {out_root}")
        return 0 if summary.get("categories") else 1

    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.reporting.insight_compliance_gate import k_anonymity_threshold, passes_k_anonymity
    from cloud_deploy.reporting.insight_llm_feed import (
        build_llm_feed,
        filter_rows_for_category,
        write_llm_feed_files,
    )
    from cloud_deploy.reporting.insight_metric_engine import aggregate_items_to_insights
    from cloud_deploy.reporting.insight_report_builder import pg_items_to_rows
    from cloud_deploy.reporting.pg_reader import (
        fetch_items_for_insight,
        insight_min_delta,
        insight_scan_window_days,
    )

    min_sample = int(os.environ.get("INSIGHT_MIN_SAMPLE", args.min_sample or 3))
    max_categories = int(os.environ.get("INSIGHT_MAX_CATEGORIES", args.max_categories or 80))
    k_anon = k_anonymity_threshold()

    init_db()
    conn = _conn()
    try:
        raw_items = fetch_items_for_insight(conn, report_date, source=args.source)
        print(
            f"[local-bundle] PG rows={len(raw_items)} source={args.source} "
            f"min_delta={insight_min_delta()} scan_window_days={insight_scan_window_days()}",
            flush=True,
        )
    finally:
        conn.close()

    if not raw_items:
        print(f"[local-bundle] 无数据 date={report_date}", flush=True)
        return 1

    rows = pg_items_to_rows(raw_items)
    insights = aggregate_items_to_insights(report_date, rows, min_sample=min_sample)
    insights = [m for m in insights if passes_k_anonymity(m.sample_size, k=k_anon)][:max_categories]

    out_root = args.out or os.path.join(ROOT, "data", "insight_export", f"insight_{day}")
    os.makedirs(out_root, exist_ok=True)

    for insight in insights:
        cat_rows = filter_rows_for_category(rows, insight.category)
        feed = build_llm_feed(
            insight,
            cat_rows,
            raw_selection_rows=len(raw_items),
            pg_source=args.source,
            k_anonymity_min=k_anon,
            enriched={
                "selection_rule": (
                    f"local premium_goods_daily.delta>={insight_min_delta()} (delta_only), "
                    f"scanned within {insight_scan_window_days()}d"
                ),
            },
        )
        bundle = os.path.join(out_root, insight.category)
        write_llm_feed_files(bundle, feed)
        hints = (feed.get("context") or {}).get("growth_direction_hints") or {}
        kw = hints.get("product_direction_keywords") or []
        print(
            f"[local-bundle] ok {insight.category} n={insight.sample_size} "
            f"directions={','.join(kw[:5]) or '—'}",
            flush=True,
        )

    print(f"[local-bundle] done {len(insights)} categories → {out_root}", flush=True)
    print(f"[local-bundle] 上传: bash cloud_deploy/scripts/upload_insight_bundle.sh {report_date}", flush=True)
    return 0 if insights else 1


if __name__ == "__main__":
    raise SystemExit(main())
