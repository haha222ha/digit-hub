# -*- coding: utf-8 -*-
"""gen_report 完成后，将 data.js 同步到 PG（对齐需求规格书 v2 §3–§7）。"""
from __future__ import annotations

import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUD_DEPLOY = os.path.dirname(SCRIPT_DIR)
CRAWLER_ROOT = os.path.dirname(CLOUD_DEPLOY)
if CRAWLER_ROOT not in sys.path:
    sys.path.insert(0, CRAWLER_ROOT)

from cloud_deploy.cloud_api.config import get_settings
from cloud_deploy.cloud_api.database_pg import _conn, init_db
from cloud_deploy.cloud_api.sync_service import apply_daily_report, parse_data_js


def _log(msg: str) -> None:
    print(f"[sync-pg] {msg}", flush=True)


def sync_report_to_pg(data_js_path: str, source: str = "local_gen_report") -> dict:
    s = get_settings()
    if not s.xhs_database_url.startswith("postgres"):
        return {"skipped": True, "reason": "未配置 XHS_DATABASE_URL"}

    init_db()
    report_date, meta, items = parse_data_js(data_js_path)
    conn = _conn()
    try:
        result = apply_daily_report(conn, report_date, meta, items, source=source)
    finally:
        conn.close()

    _log(f"完成: {result}")
    return result


def main():
    import argparse

    ap = argparse.ArgumentParser(description="将 gen_report 的 data.js 同步到 PG 监控池")
    ap.add_argument("data_js", help="报告目录下的 data.js")
    args = ap.parse_args()
    sync_report_to_pg(args.data_js)


if __name__ == "__main__":
    main()
