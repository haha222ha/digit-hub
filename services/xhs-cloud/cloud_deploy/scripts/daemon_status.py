#!/usr/bin/env python3
"""cloud_daemon 采集状态（队列覆盖 / 最近批次 / 今日扫描率）。

服务器请用 venv 运行（系统 python3 无 psycopg2）:
  /opt/xhs-cloud/venv/bin/python cloud_deploy/scripts/daemon_status.py
本脚本在检测到 venv 时会自动切换解释器。
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud")
sys.path.insert(0, ROOT)


def _reexec_venv_if_needed() -> None:
    vpy = os.path.join(ROOT, "venv", "bin", "python")
    if not os.path.isfile(vpy):
        return
    try:
        if os.path.samefile(sys.executable, vpy):
            return
    except (OSError, ValueError):
        if os.path.normcase(os.path.abspath(sys.executable)) == os.path.normcase(
            os.path.abspath(vpy)
        ):
            return
    os.execv(vpy, [vpy, *sys.argv])


def main() -> int:
    _reexec_venv_if_needed()
    from cloud_deploy.scripts.bootstrap_env import bootstrap

    bootstrap()
    from cloud_deploy.cloud_api.database_pg import _conn

    conn = _conn()
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                "SELECT COUNT(*) FROM monitor_goods WHERE monitor_status IN ('active','idle')"
            )
            pool = int(c.fetchone()[0] or 0)
            c.execute(
                """SELECT COUNT(*) FROM monitor_goods
                   WHERE monitor_status IN ('active','idle')
                     AND last_scan_status='ok'
                     AND last_scan_at::date = CURRENT_DATE"""
            )
            scanned_today = int(c.fetchone()[0] or 0)
            c.execute(
                """SELECT COUNT(*) FROM monitor_goods
                   WHERE monitor_status IN ('active','idle')
                     AND last_scan_at IS NOT NULL
                     AND last_scan_at::date = CURRENT_DATE"""
            )
            attempted_today = int(c.fetchone()[0] or 0)
            c.execute(
                """SELECT COUNT(*) FROM monitor_goods
                   WHERE monitor_status IN ('active','idle')
                     AND last_scan_status = 'risk'
                     AND last_scan_at >= CURRENT_DATE
                     AND last_scan_at < CURRENT_DATE + INTERVAL '1 day'
                     AND last_scan_at < NOW() - INTERVAL '2 hours'
                     AND (scan_claim_until IS NULL OR scan_claim_until < NOW())"""
            )
            risk_rescan_ready = int(c.fetchone()[0] or 0)
            c.execute(
                """SELECT last_scan_status, COUNT(*)
                   FROM monitor_goods
                   WHERE monitor_status IN ('active','idle')
                     AND updated_at::date = CURRENT_DATE
                   GROUP BY 1 ORDER BY 2 DESC"""
            )
            status_rows = c.fetchall()
            c.execute(
                """SELECT run_at, batch_size, ok, fail, risk, frozen, wall_ms, note
                   FROM daemon_scan_stats ORDER BY id DESC LIMIT 5"""
            )
            rows = c.fetchall()
    finally:
        conn.close()

    pct = (scanned_today / pool * 100) if pool else 0.0
    print(f"监控池 active/idle: {pool:,}")
    print(f"今日成功(ok)已扫:   {scanned_today:,} ({pct:.2f}%)")
    print(f"今日已尝试(含fail): {attempted_today:,}")
    print(f"待扫(约):           {max(0, pool - attempted_today):,}")
    print(f"risk可补扫(≥2h):    {risk_rescan_ready:,}")
    if status_rows:
        parts = [f"{st or 'null'}={n:,}" for st, n in status_rows]
        print(f"今日状态分布:       {', '.join(parts)}")
    print("")
    print("最近 5 批:")
    if not rows:
        print("  (无 daemon_scan_stats 记录 — 确认 XHS_DAEMON_MODE=cloud 且服务在跑)")
    for r in rows:
        print(
            f"  {r[0]} batch={r[1]} ok={r[2]} fail={r[3]} risk={r[4]} "
            f"frozen={r[5]} {r[6]}ms | {r[7] or ''}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
