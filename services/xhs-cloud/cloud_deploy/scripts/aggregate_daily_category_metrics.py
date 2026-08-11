#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
REQ-PG-020：从 PG 商品快照聚合类目日指标 → daily_category_metrics。

用法:
  cd /opt/xhs-cloud
  PYTHONPATH=/opt/xhs-cloud python3 cloud_deploy/scripts/aggregate_daily_category_metrics.py
  python3 cloud_deploy/scripts/aggregate_daily_category_metrics.py 2026-07-11
"""
from __future__ import annotations

import os
import sys
from datetime import date

ROOT = os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud")
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from cloud_deploy.cloud_api.database_pg import _conn, init_db
from cloud_deploy.reporting.daily_metrics_store import upsert_daily_metrics
from cloud_deploy.reporting.insight_metric_engine import aggregate_items_to_insights
from cloud_deploy.reporting.insight_report_builder import pg_items_to_rows
from cloud_deploy.reporting.pg_reader import (
    fetch_items_for_insight,
    insight_min_delta,
    insight_scan_window_days,
)


def main() -> int:
    report_date = (sys.argv[1] if len(sys.argv) > 1 else date.today().isoformat())[:10]
    min_sample = int(os.environ.get("INSIGHT_MIN_SAMPLE", "3"))
    source = os.environ.get("INSIGHT_PG_SOURCE", "scan_delta")

    init_db()
    conn = _conn()
    try:
        raw = fetch_items_for_insight(conn, report_date, source=source)
        print(
            f"[aggregate-dcm] PG rows={len(raw)} date={report_date} "
            f"source={source} min_delta={insight_min_delta()} "
            f"scan_window_days={insight_scan_window_days()}",
            flush=True,
        )
        if not raw:
            print(f"[aggregate-dcm] 无数据 date={report_date}", flush=True)
            return 1
        rows = pg_items_to_rows(raw)
        insights = aggregate_items_to_insights(report_date, rows, min_sample=min_sample)
        if not insights:
            print(f"[aggregate-dcm] 样本不足 min_sample={min_sample}", flush=True)
            return 1
        n = upsert_daily_metrics(conn, report_date, insights)
        print(f"[aggregate-dcm] date={report_date} categories={n}", flush=True)
        return 0 if n else 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
