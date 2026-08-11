# -*- coding: utf-8 -*-
"""
批量导入本地历史 全量* 报告目录 → zip + PG。

用法:
  python cloud_deploy/scripts/import_historical_reports.py --root D:/reports
  python cloud_deploy/scripts/import_historical_reports.py --root . --pattern "全量*"
"""
from __future__ import annotations

import argparse
import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUD_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if CLOUD_ROOT not in sys.path:
    sys.path.insert(0, CLOUD_ROOT)

from cloud_deploy.scripts.run_full_pipeline import run_import_historical


def main():
    ap = argparse.ArgumentParser(description="历史报告冷启动批量入库")
    ap.add_argument("--root", required=True, help="含 全量MMDD 的父目录")
    ap.add_argument("--pattern", default="全量*", help="glob 模式，默认 全量*")
    args = ap.parse_args()
    result = run_import_historical(args.root, args.pattern)
    print(f"[import-historical] 完成: {result}", flush=True)


if __name__ == "__main__":
    main()
