#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
仅导出 LLM 投喂包（不调用 LLM）— 用于审计「AI 看到了什么」。

与选品日报同源:
  cloud_gen_report.py --source auto  →  data.js（Legacy 会员）
  本脚本                              →  llm_feed.json / llm_feed.md（AI 情报）

用法:
  cd /opt/xhs-cloud
  PYTHONPATH=/opt/xhs-cloud ./venv/bin/python cloud_deploy/scripts/export_insight_llm_feeds.py --date 2026-07-12
  PYTHONPATH=/opt/xhs-cloud ./venv/bin/python cloud_deploy/scripts/export_insight_llm_feeds.py --date 2026-07-12 --out /tmp/feeds
"""
from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud")
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from cloud_deploy.scripts.bootstrap_env import bootstrap


def main() -> int:
    ap = argparse.ArgumentParser(description="导出类目 LLM 投喂包（feed-v1，无 LLM）")
    ap.add_argument("--date", required=True, help="YYYY-MM-DD")
    ap.add_argument("--source", default=os.environ.get("INSIGHT_PG_SOURCE", "scan_delta"))
    ap.add_argument("--out", default="", help="输出根目录，默认 data/llm_feeds")
    ap.add_argument("--min-sample", type=int, default=None)
    ap.add_argument("--max-categories", type=int, default=None)
    args = ap.parse_args()

    bootstrap()

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

    report_date = args.date[:10]
    min_sample = int(os.environ.get("INSIGHT_MIN_SAMPLE", args.min_sample or 3))
    max_categories = int(os.environ.get("INSIGHT_MAX_CATEGORIES", args.max_categories or 50))
    k_anon = k_anonymity_threshold()

    init_db()
    conn = _conn()
    try:
        raw_items = fetch_items_for_insight(conn, report_date, source=args.source)
        print(
            f"[export-feed] PG rows={len(raw_items)} date={report_date} "
            f"source={args.source} min_delta={insight_min_delta()} "
            f"scan_window_days={insight_scan_window_days()}",
            flush=True,
        )
    finally:
        conn.close()

    if not raw_items:
        print(f"[export-feed] PG 无 {report_date} 选品数据", flush=True)
        return 1

    rows = pg_items_to_rows(raw_items)
    insights = aggregate_items_to_insights(report_date, rows, min_sample=min_sample)
    insights = [m for m in insights if passes_k_anonymity(m.sample_size, k=k_anon)][:max_categories]

    out_root = args.out or os.path.join(ROOT, "data", "llm_feeds")
    day = report_date.replace("-", "")
    base = os.path.join(out_root, f"feed_{day}")
    os.makedirs(base, exist_ok=True)

    index: list[dict] = []
    metrics_conn = _conn()
    try:
        from cloud_deploy.reporting.daily_metrics_store import enrich_metrics_for_llm

        for insight in insights:
            cat_rows = filter_rows_for_category(rows, insight.category)
            public = insight.to_public_dict()
            try:
                public = enrich_metrics_for_llm(metrics_conn, public, report_date)
            except Exception:
                pass
            feed = build_llm_feed(
                insight,
                cat_rows,
                raw_selection_rows=len(raw_items),
                pg_source=args.source,
                k_anonymity_min=k_anon,
                enriched={
                    **public,
                    "selection_rule": (
                        f"goods_sold_daily.delta>={insight_min_delta()} (delta_only), "
                        f"scanned within {insight_scan_window_days()}d, unique per product"
                    ),
                },
            )
            bundle = os.path.join(base, insight.category)
            write_llm_feed_files(bundle, feed)
            index.append(
                {
                    "category": insight.category,
                    "sample_size": insight.sample_size,
                    "path": bundle,
                }
            )
            print(f"[export-feed] ok {insight.category} n={insight.sample_size}", flush=True)
    finally:
        metrics_conn.close()

    manifest = {
        "report_date": report_date,
        "schema_version": "feed-v1",
        "raw_selection_rows": len(raw_items),
        "categories": len(index),
        "items": index,
    }
    manifest_path = os.path.join(base, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"[export-feed] done {len(index)} categories → {base}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
