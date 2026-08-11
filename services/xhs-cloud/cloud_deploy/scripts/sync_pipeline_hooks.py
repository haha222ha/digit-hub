# -*- coding: utf-8
"""日报同步后的 PG 后置步骤（纯线上 / 混合模式共用）。"""
from __future__ import annotations

import os
from typing import Callable


def run_post_report_pg_steps(settings=None, log_fn: Callable[[str], None] | None = None) -> dict:
    """sold 回补/增量、snapshots、规则、清理。无 XHS_DB_PATH 时仅跑规则+清理。"""
    from cloud_deploy.cloud_api.config import get_settings

    s = settings or get_settings()
    log = log_fn or print
    out: dict = {}

    if not s.xhs_database_url.startswith("postgres"):
        return out

    has_local_db = bool(s.xhs_db_path and os.path.isfile(s.xhs_db_path))

    if has_local_db:
        from cloud_deploy.scripts.backfill_sold_history_pg import backfill_sold_history
        from cloud_deploy.scripts.backfill_sold_snapshots_pg import backfill_sold_snapshots
        from cloud_deploy.scripts.sync_incremental_sold_daily import sync_incremental_sold_daily

        bf = backfill_sold_history(s.xhs_db_path, batch_goods=30)
        out["sold_history_backfill"] = bf
        log(f"post: sold_history backfill {bf}")

        inc = sync_incremental_sold_daily(s.xhs_db_path)
        out["sold_history_incr"] = inc
        log(f"post: sold_history incr {inc}")

        sn = backfill_sold_snapshots(s.xhs_db_path, batch_goods=20)
        out["sold_snapshots_backfill"] = sn
        log(f"post: sold_snapshots {sn}")

    from cloud_deploy.scripts.apply_monitor_rules import run as apply_rules

    try:
        rules = apply_rules()
        out["rules"] = rules
        log(f"post: rules {rules}")
    except Exception as exc:
        out["rules"] = {"error": str(exc), "skipped": "deadlock_or_transient"}
        log(f"post: rules skipped ({exc})")

    from cloud_deploy.cloud_api.retention_policy import snapshot_prune_enabled

    if snapshot_prune_enabled():
        from cloud_deploy.scripts.prune_sold_snapshots import prune

        out["prune_snapshots"] = prune()
        log(f"post: prune {out['prune_snapshots']}")
    else:
        out["prune_snapshots"] = {"deleted_rows": 0, "skipped": "retention_disabled"}
        log("post: prune skipped (snapshot retention disabled)")

    return out
