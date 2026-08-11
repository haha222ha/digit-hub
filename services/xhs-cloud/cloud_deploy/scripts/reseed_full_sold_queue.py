#!/usr/bin/env python3
"""一次性将监控池全量（或按 daemon.json 策略）灌入今日补缺队列。"""
from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud")
sys.path.insert(0, ROOT)


def _load_daemon_cfg() -> dict:
    from cloud_deploy.scripts.run_daemon import _load_config

    return _load_config()


def main() -> int:
    ap = argparse.ArgumentParser(description="监控池 → full_sold_queue 全量/增量 seed")
    ap.add_argument(
        "--reset-today",
        action="store_true",
        help="清空今日队列后重新 seed（切换全量模式时用）",
    )
    args = ap.parse_args()

    from cloud_deploy.scripts.bootstrap_env import bootstrap

    bootstrap()
    cfg = _load_daemon_cfg()

    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.daemon import pg_full_sold_queue as q

    if args.reset_today:
        init_db()
        conn = _conn()
        try:
            with conn.cursor() as c:
                c.execute("SET search_path TO xhs_monitor, public")
                c.execute(
                    "DELETE FROM full_sold_queue WHERE queue_date=CURRENT_DATE"
                )
            conn.commit()
            print("[reseed] 已清空今日 full_sold_queue", flush=True)
        finally:
            conn.close()

    result = q.seed_full_sold_queue(
        low_v1d_only=bool(cfg.get("low_v1d_only", False)),
        skip_today=bool(cfg.get("skip_today", True)),
        min_sold=int(cfg.get("min_sold", 1)),
        log_func=lambda m: print(f"[reseed] {m}", flush=True),
        limit=int(cfg.get("seed_batch_size", 0) or 0),
    )
    stats = q.queue_stats()
    print(
        json.dumps(
            {
                "seeded_total": result,
                "queue": stats,
                "config": {
                    "full_pool": cfg.get("full_pool"),
                    "skip_today": cfg.get("skip_today"),
                    "min_sold": cfg.get("min_sold"),
                },
            },
            ensure_ascii=False,
        ),
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
