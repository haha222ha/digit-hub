# -*- coding: utf-8 -*-
"""
对接爬虫主面板「⑥补缺挂机」到 xhs-cloud PG。

启动前 patch：
  sync_sold_to_main_db  → pg_sold_sync_write.sync_sold_to_pg
  xhs_full_sold_queue_db → pg_full_sold_queue
  SQLite 锁检测 → 跳过（PG 无锁争用）
"""
from __future__ import annotations

import logging
import os
import signal
import sys
import time

_logger = logging.getLogger(__name__)


def _setup_crawler_path() -> str:
    crawler = os.environ.get("XHS_CRAWLER_ROOT", "/opt/xhs/crawler").strip()
    if not crawler or not os.path.isdir(crawler):
        raise RuntimeError(
            f"爬虫目录不存在: {crawler!r}。"
            "请在 /opt/xhs-cloud/.env 设置 XHS_CRAWLER_ROOT，并上传爬虫（含 xhs_full_sold_daemon.py）。"
        )
    if crawler not in sys.path:
        sys.path.insert(0, crawler)
    missing = [
        name
        for name in (
            "xhs_full_sold_queue_db.py",
            "xhs_full_sold_daemon.py",
            "xhs_full_sold_fetch.py",
            "xhs_web_sold_sync_write.py",
            "shop_collectors.py",
        )
        if not os.path.isfile(os.path.join(crawler, name))
    ]
    if missing:
        raise RuntimeError(
            f"爬虫目录 {crawler} 缺少文件: {', '.join(missing)}。"
            "请从 Windows 上传完整爬虫到该目录后再 systemctl restart xhs-daemon。"
        )
    return crawler


def install_pg_bridge() -> None:
    """在 import FullSoldSyncDaemon 之前调用。"""
    crawler = _setup_crawler_path()

    from cloud_deploy.daemon import pg_full_sold_queue as pg_queue
    from cloud_deploy.daemon.pg_sold_sync_write import recalc_velocity_after_sync, sync_sold_to_pg

    try:
        import xhs_full_sold_queue_db as qmod
    except ModuleNotFoundError as e:
        raise RuntimeError(
            f"无法 import xhs_full_sold_queue_db（XHS_CRAWLER_ROOT={crawler}）。"
            "请确认爬虫已上传到服务器。"
        ) from e

    qmod.seed_full_sold_queue = pg_queue.seed_full_sold_queue
    qmod.ensure_queue_seeded = pg_queue.ensure_queue_seeded
    qmod.fetch_full_sold_queue_batch = pg_queue.fetch_full_sold_queue_batch
    qmod.mark_full_sold_sync_result = pg_queue.mark_full_sold_sync_result
    qmod.finalize_frozen_goods = pg_queue.finalize_frozen_goods
    qmod.queue_stats = pg_queue.queue_stats
    qmod.count_pending = pg_queue.count_pending
    qmod.queue_pending_sold_tiers = pg_queue.queue_pending_sold_tiers

    import xhs_web_sold_sync_write as wmod

    wmod.sync_sold_to_main_db = sync_sold_to_pg
    wmod.recalc_velocity_after_sync = recalc_velocity_after_sync

    try:
        import xhs_db_idle as idle

        idle.wait_main_db_idle = lambda **kw: (True, 0)
        idle.try_db_write_lock = lambda: True
    except ImportError:
        pass

    try:
        import xhs_detail_enrich_db as dedb

        dedb.append_panel_log = lambda *_a, **_k: None
    except ImportError:
        pass

    try:
        import xhs_web_risk_cooldown_log as rlog

        rlog.begin_cooldown_event = lambda **kw: 0
        rlog.end_cooldown_event = lambda *_a, **_k: None
        rlog.close_open_events = lambda **_k: None
        rlog.format_event_line = lambda *_a, **_k: ""
    except ImportError:
        pass

    _logger.info("PG bridge installed for FullSoldSyncDaemon")


def run_full_sold_daemon_loop(config: dict | None = None) -> None:
    crawler = _setup_crawler_path()
    install_pg_bridge()

    try:
        from xhs_full_sold_daemon import (
            get_full_sold_daemon,
            start_full_sold_daemon,
            stop_full_sold_daemon,
        )
    except ImportError as e:
        raise RuntimeError(
            f"无法加载爬虫 ⑥补缺挂机模块，请确认 XHS_CRAWLER_ROOT={crawler} 含 xhs_full_sold_daemon.py"
        ) from e

    cfg = dict(config or {})
    print(f"[xhs-daemon] ⑥补缺挂机 PG 模式: {cfg}", flush=True)
    start_full_sold_daemon(config=cfg, log_func=print, web_log_func=print)

    def _on_sig(_sig, _frame):
        print("[xhs-daemon] 停止 ⑥补缺挂机", flush=True)
        stop_full_sold_daemon()
        sys.exit(0)

    signal.signal(signal.SIGINT, _on_sig)
    signal.signal(signal.SIGTERM, _on_sig)

    while True:
        d = get_full_sold_daemon()
        if d and not d._running:
            break
        time.sleep(60)
