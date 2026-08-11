# -*- coding: utf-8
"""周报 / 月报聚合生成。"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime, timedelta

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUD_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if CLOUD_ROOT not in sys.path:
    sys.path.insert(0, CLOUD_ROOT)

from cloud_deploy.reporting.constants import ARCHIVE_MONTHLY, ARCHIVE_WEEKLY


def _log(msg: str) -> None:
    print(f"[period-report] {msg}", flush=True)


def _report_assets_dir() -> str:
    custom = os.environ.get("XHS_REPORT_ASSETS_DIR", "").strip()
    if custom and os.path.isdir(custom):
        return custom
    return os.path.join(CLOUD_ROOT, "cloud_deploy", "assets")


def _week_range(end: date | None = None) -> tuple[str, str]:
    end = end or date.today()
    # 周日为周报结束日
    while end.weekday() != 6:
        end -= timedelta(days=1)
    start = end - timedelta(days=6)
    return start.isoformat(), end.isoformat()


def _month_range(ref: date | None = None) -> tuple[str, str]:
    ref = ref or date.today()
    first_this = ref.replace(day=1)
    last_prev = first_this - timedelta(days=1)
    start = last_prev.replace(day=1)
    return start.isoformat(), last_prev.isoformat()


def generate_period_report(scope: str, end_date: str = "") -> dict:
    from cloud_deploy.scripts.bootstrap_env import bootstrap

    bootstrap()
    from cloud_deploy.cloud_api.config import get_settings
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.reporting.data_js_builder import build_report_payload, resolve_output_dir, write_report_dir
    from cloud_deploy.reporting.pg_reader import dedup_by_title, fetch_items_for_period, passes_threshold

    s = get_settings()
    if not s.xhs_database_url.startswith("postgres"):
        raise RuntimeError("需要 XHS_DATABASE_URL")

    if scope == "weekly":
        if end_date:
            end = date.fromisoformat(end_date)
            start, end_s = _week_range(end)
        else:
            start, end_s = _week_range()
        archive_type = ARCHIVE_WEEKLY
        label = f"周报 {start} ~ {end_s}"
    else:
        if end_date:
            ref = date.fromisoformat(end_date)
            start, end_s = _month_range(ref)
        else:
            start, end_s = _month_range()
        archive_type = ARCHIVE_MONTHLY
        label = f"月报 {start} ~ {end_s}"

    init_db()
    conn = _conn()
    try:
        items = fetch_items_for_period(conn, start, end_s)
    finally:
        conn.close()

    items = [it for it in items if passes_threshold(it)]
    items = dedup_by_title(items)

    report_root = os.environ.get("XHS_REPORT_OUTPUT_DIR", os.path.join(s.xhs_data_dir, "reports"))
    out_dir = resolve_output_dir(report_root, end_s, scope)
    payload = build_report_payload(
        items,
        end_s,
        scope=scope,
        scope_label=label,
        source=f"cloud_{scope}_report",
        period_start=start,
        period_end=end_s,
    )
    write_report_dir(out_dir, payload, _report_assets_dir())
    _log(f"{label} → {out_dir} ({len(items)} 条)")

    from cloud_deploy.scripts.pipeline_common import pack_register_sync

    result = pack_register_sync(out_dir, archive_type, s.xhs_report_archive_dir, sync_pg=False)
    result["output_dir"] = out_dir
    result["scope"] = scope
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("scope", choices=("weekly", "monthly"))
    ap.add_argument("--end-date", default="")
    args = ap.parse_args()
    generate_period_report(args.scope, args.end_date)


if __name__ == "__main__":
    main()
