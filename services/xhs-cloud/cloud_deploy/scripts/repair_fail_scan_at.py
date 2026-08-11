#!/usr/bin/env python3
"""今日 fail/risk 但未写 last_scan_at 的商品补全时间戳，避免同批反复重扫。"""
from __future__ import annotations

import os
import sys

ROOT = os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud")
sys.path.insert(0, ROOT)


def main() -> int:
    from cloud_deploy.scripts.bootstrap_env import bootstrap

    bootstrap()
    from cloud_deploy.cloud_api.database_pg import _conn

    conn = _conn()
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """UPDATE monitor_goods SET last_scan_at = updated_at
                   WHERE monitor_status IN ('active', 'idle')
                     AND last_scan_status IN ('fail', 'risk')
                     AND updated_at::date = CURRENT_DATE
                     AND (
                       last_scan_at IS NULL
                       OR last_scan_at::date < CURRENT_DATE
                     )"""
            )
            n = c.rowcount
        conn.commit()
    finally:
        conn.close()
    print(f"repair_fail_scan_at: 已补全 {n} 条 last_scan_at")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
