#!/usr/bin/env python3
"""PG monitor_goods / full_sold_queue stats for verify_pure_online.sh."""
from __future__ import annotations

import os
import sys

ROOT = os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud")
sys.path.insert(0, ROOT)


def main() -> int:
    try:
        from cloud_deploy.scripts.bootstrap_env import bootstrap

        bootstrap()

        from cloud_deploy.cloud_api.database_pg import _conn

        conn = _conn()
        try:
            with conn.cursor() as c:
                c.execute("SET search_path TO xhs_monitor, public")
                c.execute(
                    "SELECT COUNT(*) FROM monitor_goods "
                    "WHERE monitor_status IN ('active','idle')"
                )
                mg = int(c.fetchone()[0] or 0)
                c.execute(
                    "SELECT COUNT(*) FROM full_sold_queue WHERE queue_date=CURRENT_DATE"
                )
                total = int(c.fetchone()[0] or 0)
                c.execute(
                    """SELECT COUNT(*) FROM full_sold_queue
                       WHERE queue_date=CURRENT_DATE
                         AND last_sync_at IS NULL AND frozen_at IS NULL"""
                )
                pending = int(c.fetchone()[0] or 0)
                c.execute(
                    """SELECT COUNT(*) FROM full_sold_queue
                       WHERE queue_date=CURRENT_DATE AND frozen_at IS NOT NULL"""
                )
                frozen = int(c.fetchone()[0] or 0)
        finally:
            conn.close()

        synced = max(0, total - pending - frozen)
        print(
            f"monitor_goods={mg} queue_total={total} "
            f"pending={pending} synced={synced}"
        )
        return 0
    except Exception as exc:
        print(f"FAIL {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
