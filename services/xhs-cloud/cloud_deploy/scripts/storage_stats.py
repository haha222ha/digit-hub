# -*- coding: utf-8 -*-
"""PG 数据层容量与保留策略一览（运维/年度分析前自检）。"""
from __future__ import annotations

import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLOUD_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if CLOUD_ROOT not in sys.path:
    sys.path.insert(0, CLOUD_ROOT)


def main() -> int:
    from cloud_deploy.scripts.bootstrap_env import bootstrap

    bootstrap()
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.retention_policy import retention_policy_summary

    init_db()
    conn = _conn()
    tables = [
        ("goods_sold_snapshots", "snapshot_time"),
        ("goods_sold_daily", "stat_date"),
        ("report_daily_items", "report_date"),
        ("monitor_goods", None),
        ("report_archives", "created_at"),
    ]
    print("=== 保留策略 ===")
    for k, v in retention_policy_summary().items():
        print(f"  {k}: {v}")
    print()
    print("=== 表规模（xhs_monitor）===")
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        for table, time_col in tables:
            c.execute(f"SELECT COUNT(*) FROM {table}")
            cnt = c.fetchone()[0]
            if time_col:
                c.execute(
                    f"SELECT MIN({time_col})::text, MAX({time_col})::text FROM {table}"
                )
                mn, mx = c.fetchone()
                span = f"{mn or '-'} ~ {mx or '-'}"
            else:
                span = "-"
            c.execute(
                """SELECT pg_size_pretty(pg_total_relation_size(%s::regclass))""",
                (f"xhs_monitor.{table}",),
            )
            size = c.fetchone()[0]
            print(f"  {table}: rows={cnt:,}  span={span}  size={size}")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
