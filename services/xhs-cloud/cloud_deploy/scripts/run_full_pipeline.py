# -*- coding: utf-8
"""
统一流水线 — 纯线上全自动入口。

模式:
  full     PG 生成日报 → zip → 登记 → 规则 → 清理（主路径）
  ingest   外部 data.js 入库（过渡/冷启动）
  generate 仅生成日报
  weekly / monthly  周期报告（不写 PG 日报表）
"""
from __future__ import annotations

import argparse
import glob
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUD_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if CLOUD_ROOT not in sys.path:
    sys.path.insert(0, CLOUD_ROOT)


def _log(msg: str) -> None:
    print(f"[pipeline] {msg}", flush=True)


def run_ingest(report_dir: str = "") -> dict:
    from cloud_deploy.scripts.run_daily_pipeline import run_ingest as _ingest

    return _ingest(report_dir=report_dir)


def _default_report_source() -> str:
    return (os.environ.get("XHS_CLOUD_REPORT_SOURCE") or "premium_daily").strip() or "premium_daily"


def _legacy_zip_disabled() -> bool:
    return os.environ.get("XHS_LEGACY_ZIP_GENERATION", "1").strip().lower() in ("0", "false", "no", "off")


def run_generate(report_date: str = "", source: str = "") -> dict:
    if _legacy_zip_disabled():
        _log("XHS_LEGACY_ZIP_GENERATION=0，跳过 Legacy 日报生成")
        return {"skipped": True, "reason": "legacy_zip_disabled"}
    from cloud_deploy.cloud_api.config import get_settings
    from cloud_deploy.reporting.constants import ARCHIVE_DAILY
    from cloud_deploy.scripts.cloud_gen_report import generate_daily_report
    from cloud_deploy.scripts.pipeline_common import pack_register_sync

    gen = generate_daily_report(report_date=report_date, source=source or _default_report_source())
    s = get_settings()
    reg = pack_register_sync(gen["output_dir"], ARCHIVE_DAILY, s.xhs_report_archive_dir, sync_pg=False)
    return {**gen, **reg}


def run_import_historical(root: str, pattern: str = "全量*") -> dict:
    from cloud_deploy.scripts.run_daily_pipeline import run_ingest

    root = os.path.abspath(root)
    dirs = sorted(
        d for d in glob.glob(os.path.join(root, pattern))
        if os.path.isdir(d) and os.path.isfile(os.path.join(d, "data.js"))
    )
    if not dirs:
        raise RuntimeError(f"未找到含 data.js 的目录: {root}/{pattern}")

    results = []
    for d in dirs:
        _log(f"import {d}")
        results.append(run_ingest(report_dir=d))
    return {"imported": len(results), "dirs": [r.get("report_date") for r in results]}


def run_full(report_date: str = "", source: str = "") -> dict:
    """纯线上主路径：云端生成日报 + 后置 PG 步骤。"""
    from cloud_deploy.cloud_api.config import get_settings
    from cloud_deploy.scripts.sync_pipeline_hooks import run_post_report_pg_steps

    result = run_generate(report_date=report_date, source=source or _default_report_source())
    s = get_settings()
    result["post"] = run_post_report_pg_steps(s, _log)
    return result


def main():
    ap = argparse.ArgumentParser(description="xhs-cloud 完整流水线")
    sub = ap.add_subparsers(dest="mode", required=True)

    p_ingest = sub.add_parser("ingest", help="incoming 或指定目录入库")
    p_ingest.add_argument("--report-dir", default="")

    p_gen = sub.add_parser("generate", help="PG 生成日报")
    p_gen.add_argument("--date", default="")
    p_gen.add_argument("--source", default="", help="默认读 XHS_CLOUD_REPORT_SOURCE 或 premium_daily")

    p_imp = sub.add_parser("import", help="批量历史报告入库")
    p_imp.add_argument("--root", required=True)
    p_imp.add_argument("--pattern", default="全量*")

    p_full = sub.add_parser("full", help="纯线上：生成日报+zip+PG+规则+清理")
    p_full.add_argument("--date", default="")
    p_full.add_argument("--source", default="", help="默认 premium_daily（云端精品自算）")

    p_week = sub.add_parser("weekly", help="生成周报")
    p_week.add_argument("--end-date", default="")

    p_mon = sub.add_parser("monthly", help="生成月报")
    p_mon.add_argument("--end-date", default="")

    p_sn = sub.add_parser("backfill-snapshots")
    p_sn.add_argument("--main-db", default=os.environ.get("XHS_DB_PATH", ""))

    p_inc = sub.add_parser("sync-incr-daily")
    p_inc.add_argument("--main-db", default=os.environ.get("XHS_DB_PATH", ""))

    sub.add_parser("prune-snapshots")
    sub.add_parser("apply-rules")

    args = ap.parse_args()
    if args.mode == "ingest":
        run_ingest(args.report_dir)
    elif args.mode == "generate":
        run_generate(args.date, args.source)
    elif args.mode == "import":
        run_import_historical(args.root, args.pattern)
    elif args.mode == "full":
        run_full(args.date, source=args.source)
    elif args.mode == "weekly":
        from cloud_deploy.scripts.cloud_period_report import generate_period_report

        generate_period_report("weekly", args.end_date)
    elif args.mode == "monthly":
        from cloud_deploy.scripts.cloud_period_report import generate_period_report

        generate_period_report("monthly", args.end_date)
    elif args.mode == "backfill-snapshots":
        from cloud_deploy.scripts.backfill_sold_snapshots_pg import backfill_sold_snapshots

        backfill_sold_snapshots(args.main_db or os.environ.get("XHS_DB_PATH", ""))
    elif args.mode == "sync-incr-daily":
        from cloud_deploy.scripts.sync_incremental_sold_daily import sync_incremental_sold_daily

        sync_incremental_sold_daily(args.main_db or os.environ.get("XHS_DB_PATH", ""))
    elif args.mode == "prune-snapshots":
        from cloud_deploy.scripts.prune_sold_snapshots import prune

        prune()
    elif args.mode == "apply-rules":
        from cloud_deploy.scripts.apply_monitor_rules import run as _apply_rules

        _apply_rules()


if __name__ == "__main__":
    main()
