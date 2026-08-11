# -*- coding: utf-8 -*-
"""
Shadow / 正式 情报日报生成 — 读 PG，写 data/insight_shadow 或 report_archives。

用法:
  python cloud_deploy/scripts/cloud_insight_report.py --date 2026-07-12
  python cloud_deploy/scripts/cloud_insight_report.py --date 2026-07-12 --playbook full
  python cloud_deploy/scripts/cloud_insight_report.py --date 2026-07-12 --playbook full --publish
"""
from __future__ import annotations

import argparse
import os
import sys

CRAWLER_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if CRAWLER_ROOT not in sys.path:
    sys.path.insert(0, CRAWLER_ROOT)

from cloud_deploy.scripts.bootstrap_env import bootstrap


def main() -> int:
    ap = argparse.ArgumentParser(description="V2 情报预生成（PG → 类目 HTML）")
    ap.add_argument("--date", required=True, help="报告日期 YYYY-MM-DD")
    ap.add_argument(
        "--playbook",
        choices=("dry-run", "full"),
        default="full",
        help="dry-run 仅建目录；full 跑 PG 管道",
    )
    ap.add_argument(
        "--publish",
        action="store_true",
        help="写入 data/report_archives（默认 insight_shadow）",
    )
    ap.add_argument(
        "--source",
        default=os.environ.get("INSIGHT_PG_SOURCE", "scan_delta"),
        choices=("scan_delta", "auto", "pg_items"),
        help="PG 数据源；默认 scan_delta（当日 delta>=1 唯一商品）",
    )
    args = ap.parse_args()

    bootstrap()
    shadow = not args.publish

    if args.playbook == "dry-run":
        root = os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud")
        sub = "insight_shadow" if shadow else "report_archives"
        day = args.date.replace("-", "")
        out = os.path.join(root, "data", sub, f"insight_{day}")
        os.makedirs(out, exist_ok=True)
        readme = os.path.join(out, "README.txt")
        with open(readme, "w", encoding="utf-8") as f:
            f.write(f"Stub {args.date}. Run --playbook full for PG pipeline.\n")
        print(f"[dry-run] created {out}")
        return 0

    from cloud_deploy.reporting.insight_pipeline import run_insight_pipeline

    summary = run_insight_pipeline(args.date, shadow=shadow, source=args.source)
    print(f"OK categories={summary.get('categories')} shadow={shadow}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
