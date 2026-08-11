#!/usr/bin/env python3
# thin wrapper so: python cloud_deploy/scripts/purge_member_reports.py works from /opt/xhs-cloud
from __future__ import annotations

import os
import runpy
import sys

if __name__ == "__main__":
    # already this file; execute the module body by importing purge helpers directly
    root = os.environ.get("XHS_CLOUD_ROOT") or os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..")
    )
    if root not in sys.path:
        sys.path.insert(0, root)
    from cloud_deploy.cloud_api.database_pg import init_db, purge_all_member_reports
    import argparse
    import json

    ap = argparse.ArgumentParser(description="清空云端选品报告")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    init_db()
    print(json.dumps(purge_all_member_reports(dry_run=bool(args.dry_run)), ensure_ascii=False, indent=2))
