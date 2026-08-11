# -*- coding: utf-8 -*-
"""精品库 PostgreSQL schema v5 — 对齐 xhs_premium_db.py + 词效表。"""
from __future__ import annotations

SCHEMA_VERSION = 5


def init_premium_pg_schema(conn) -> None:
    """在 xhs_monitor schema 内创建/补齐全部精品表。"""
    c = conn.cursor()
    c.execute("CREATE SCHEMA IF NOT EXISTS xhs_monitor")
    c.execute("SET search_path TO xhs_monitor, public")

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS premium_schema_meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS premium_goods (
            goods_id            TEXT PRIMARY KEY,
            title               TEXT DEFAULT '',
            tier                TEXT DEFAULT 'B',
            lifecycle           INTEGER DEFAULT 0,
            primary_keyword     TEXT NOT NULL DEFAULT '',
            fallback_keywords   TEXT DEFAULT '[]',
            keyword_stale       INTEGER DEFAULT 0,
            miss_count          INTEGER DEFAULT 0,
            store_id            TEXT DEFAULT '',
            store_name          TEXT DEFAULT '',
            deal_price          DOUBLE PRECISION DEFAULT 0,
            sold_num            INTEGER DEFAULT 0,
            velocity_1d         DOUBLE PRECISION DEFAULT 0,
            actual_velocity_1d  DOUBLE PRECISION DEFAULT 0,
            burst_score         DOUBLE PRECISION DEFAULT 0,
            report_count        INTEGER DEFAULT 0,
            first_report_date   TEXT DEFAULT '',
            last_report_date    TEXT DEFAULT '',
            peak_velocity       DOUBLE PRECISION DEFAULT 0,
            peak_burst          DOUBLE PRECISION DEFAULT 0,
            monitor_freq        TEXT DEFAULT 'daily',
            scan_priority       INTEGER DEFAULT 50,
            velocity_ok_at      TEXT DEFAULT '',
            behavior_ok_at      TEXT DEFAULT '',
            web_detail_ok_at    TEXT DEFAULT '',
            web_sold_ok_at      TEXT DEFAULT '',
            last_behavior_tags  TEXT DEFAULT '',
            has_surge_24h       INTEGER DEFAULT 0,
            last_app_scan       TEXT DEFAULT '',
            last_note_scan      TEXT DEFAULT '',
            last_mall_scan      TEXT DEFAULT '',
            note_scan_ok        INTEGER DEFAULT 0,
            mall_detail_ok      INTEGER DEFAULT 0,
            shop_fans           INTEGER DEFAULT 0,
            shop_sales          INTEGER DEFAULT 0,
            shop_fans_delta_1d  DOUBLE PRECISION DEFAULT 0,
            shop_fsr            DOUBLE PRECISION DEFAULT 0,
            goods_fsr           DOUBLE PRECISION DEFAULT 0,
            streak_sold_up_days INTEGER DEFAULT 0,
            store_watch_tags    TEXT DEFAULT '[]',
            is_new_store        INTEGER DEFAULT 0,
            is_virtual          INTEGER DEFAULT 0,
            first_seen_at       TEXT DEFAULT '',
            last_metric_scan    TEXT DEFAULT '',
            last_scan_engine    TEXT DEFAULT 'app',
            sync_version        INTEGER DEFAULT 0,
            created_at          TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
            updated_at          TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')
        )
        """
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_pg_tier_pri ON premium_goods (lifecycle, tier, scan_priority DESC)"
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_pg_kw ON premium_goods (primary_keyword, lifecycle)"
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_pg_velocity ON premium_goods (velocity_ok_at)"
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_pg_behavior ON premium_goods (behavior_ok_at)"
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_pg_next ON premium_goods (monitor_freq, last_app_scan)"
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS premium_enrich_queue (
            id              SERIAL PRIMARY KEY,
            queue_date      TEXT NOT NULL,
            task_type       TEXT NOT NULL DEFAULT 'keyword_bundle',
            keyword         TEXT,
            goods_ids       TEXT NOT NULL DEFAULT '[]',
            need_velocity   INTEGER DEFAULT 1,
            need_behavior   INTEGER DEFAULT 0,
            tier_max        TEXT DEFAULT 'B',
            priority        INTEGER DEFAULT 50,
            status          TEXT DEFAULT 'pending',
            assigned_device TEXT DEFAULT '',
            try_count       INTEGER DEFAULT 0,
            max_try         INTEGER DEFAULT 5,
            matched_count   INTEGER DEFAULT 0,
            pages_scanned   INTEGER DEFAULT 0,
            fail_reason     TEXT DEFAULT '',
            created_at      TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
            started_at      TEXT DEFAULT '',
            completed_at    TEXT DEFAULT ''
        )
        """
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_peq_pending ON premium_enrich_queue (queue_date, status, priority DESC)"
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_peq_kw ON premium_enrich_queue (queue_date, keyword, task_type)"
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS premium_behavior_snapshots (
            id              SERIAL PRIMARY KEY,
            goods_id        TEXT NOT NULL,
            keyword         TEXT NOT NULL,
            behavior_tags   TEXT NOT NULL DEFAULT '',
            search_tags     TEXT DEFAULT '',
            has_surge_24h   INTEGER DEFAULT 0,
            snapshot_time   TEXT NOT NULL,
            source          TEXT DEFAULT 'mall_list',
            device_name     TEXT DEFAULT ''
        )
        """
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_pbs_goods_time ON premium_behavior_snapshots (goods_id, snapshot_time DESC)"
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS premium_reject_log (
            id          SERIAL PRIMARY KEY,
            goods_id    TEXT NOT NULL,
            title       TEXT DEFAULT '',
            reason      TEXT NOT NULL,
            source      TEXT DEFAULT '',
            created_at  TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')
        )
        """
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_prl_goods ON premium_reject_log (goods_id, created_at DESC)"
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS premium_report_rank (
            report_date   TEXT NOT NULL,
            rank_no       INTEGER NOT NULL,
            goods_id      TEXT NOT NULL,
            title         TEXT DEFAULT '',
            price         DOUBLE PRECISION DEFAULT 0,
            sold_num      INTEGER DEFAULT 0,
            actual_v1d    DOUBLE PRECISION DEFAULT 0,
            velocity_1d   DOUBLE PRECISION DEFAULT 0,
            burst_score   DOUBLE PRECISION DEFAULT 0,
            pool          TEXT DEFAULT '',
            behavior      TEXT DEFAULT '',
            is_virtual    INTEGER DEFAULT 0,
            store_id      TEXT DEFAULT '',
            store_name    TEXT DEFAULT '',
            source_dir    TEXT DEFAULT '',
            injected_at   TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
            PRIMARY KEY (report_date, goods_id)
        )
        """
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_prr_goods ON premium_report_rank (goods_id, report_date DESC)"
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_prr_date ON premium_report_rank (report_date, rank_no)"
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS premium_metric_snapshots (
            goods_id            TEXT NOT NULL,
            snapshot_date       TEXT NOT NULL,
            source              TEXT NOT NULL,
            sold_num            INTEGER DEFAULT 0,
            velocity_1d         DOUBLE PRECISION DEFAULT 0,
            actual_velocity_1d  DOUBLE PRECISION DEFAULT 0,
            burst_score         DOUBLE PRECISION DEFAULT 0,
            deal_price          DOUBLE PRECISION DEFAULT 0,
            behavior_tags       TEXT DEFAULT '',
            report_rank         INTEGER DEFAULT 0,
            report_pool         TEXT DEFAULT '',
            tier                TEXT DEFAULT '',
            created_at          TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
            PRIMARY KEY (goods_id, snapshot_date, source)
        )
        """
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_pms_goods_date ON premium_metric_snapshots (goods_id, snapshot_date DESC)"
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_pms_date_src ON premium_metric_snapshots (snapshot_date, source)"
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS device_api_quota (
            device_name       TEXT PRIMARY KEY,
            quota_date        TEXT NOT NULL,
            note_goods_used   INTEGER DEFAULT 0,
            note_goods_limit  INTEGER DEFAULT 150000,
            mall_list_used    INTEGER DEFAULT 0,
            mall_list_limit   INTEGER DEFAULT 20000,
            mall_detail_used  INTEGER DEFAULT 0,
            mall_detail_limit INTEGER DEFAULT 4000,
            mall_blocked      INTEGER DEFAULT 0,
            note_blocked      INTEGER DEFAULT 0,
            mall_fail_streak  INTEGER DEFAULT 0,
            updated_at        TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')
        )
        """
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS keyword_batches (
            batch_id       INTEGER PRIMARY KEY,
            name           TEXT NOT NULL,
            week_of_cycle  INTEGER NOT NULL,
            daily_kw_quota INTEGER DEFAULT 500,
            is_active      INTEGER DEFAULT 1,
            note           TEXT DEFAULT ''
        )
        """
    )
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS keyword_batch_members (
            batch_id  INTEGER NOT NULL,
            keyword   TEXT NOT NULL,
            scan_tier TEXT DEFAULT 'B',
            PRIMARY KEY (batch_id, keyword)
        )
        """
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS premium_goods_daily (
            goods_id          TEXT NOT NULL,
            snap_date         TEXT NOT NULL,
            sold_num          INTEGER DEFAULT 0,
            deal_price        DOUBLE PRECISION DEFAULT 0,
            delta             INTEGER DEFAULT 0,
            actual_delta      DOUBLE PRECISION DEFAULT 0,
            velocity_1d       DOUBLE PRECISION DEFAULT 0,
            source            TEXT DEFAULT 'local_app',
            created_at        TEXT NOT NULL,
            PRIMARY KEY (goods_id, snap_date)
        )
        """
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_pgd_date ON premium_goods_daily (snap_date)"
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_pgd_goods ON premium_goods_daily (goods_id, snap_date DESC)"
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS premium_store_daily (
            store_id          TEXT NOT NULL,
            snap_date         TEXT NOT NULL,
            shop_fans         INTEGER DEFAULT 0,
            shop_sales        INTEGER DEFAULT 0,
            shop_fans_delta   INTEGER DEFAULT 0,
            scan_owner        TEXT DEFAULT 'local',
            scan_engine       TEXT DEFAULT 'app',
            source            TEXT DEFAULT 'local_app',
            created_at        TEXT NOT NULL,
            PRIMARY KEY (store_id, snap_date)
        )
        """
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_psd_store ON premium_store_daily (store_id, snap_date DESC)"
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS premium_store_watch (
            store_id              TEXT PRIMARY KEY,
            store_name            TEXT DEFAULT '',
            shop_fans             INTEGER DEFAULT 0,
            shop_fans_delta_1d    INTEGER DEFAULT 0,
            streak_fans_up_days   INTEGER DEFAULT 0,
            sum_actual_delta_7d   DOUBLE PRECISION DEFAULT 0,
            sum_goods_delta_7d    REAL DEFAULT 0,
            premium_sku_count     INTEGER DEFAULT 0,
            watch_score           DOUBLE PRECISION DEFAULT 0,
            watch_tags            TEXT DEFAULT '[]',
            rep_goods_id          TEXT DEFAULT '',
            last_store_scan       TEXT DEFAULT '',
            updated_at            TEXT NOT NULL
        )
        """
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_psw_score ON premium_store_watch (watch_score DESC)"
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS premium_sync_state (
            goods_id                   TEXT PRIMARY KEY,
            snapshots_backfill_done    INTEGER DEFAULT 0,
            snapshots_backfill_rows    INTEGER DEFAULT 0,
            last_snapshot_upload_at    TEXT DEFAULT '',
            updated_at                 TEXT NOT NULL
        )
        """
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS premium_keyword_scan_deltas (
            id           SERIAL PRIMARY KEY,
            keyword      TEXT NOT NULL,
            goods_id     TEXT NOT NULL,
            sold_before  INTEGER DEFAULT 0,
            sold_after   INTEGER DEFAULT 0,
            delta        INTEGER DEFAULT 0,
            is_virtual   INTEGER DEFAULT -1,
            is_high_incr INTEGER DEFAULT 0,
            scan_time    TEXT NOT NULL
        )
        """
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_pksd_kw ON premium_keyword_scan_deltas (keyword, scan_time)"
    )
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS premium_keyword_daily_stats (
            stat_date        TEXT NOT NULL,
            keyword          TEXT NOT NULL,
            hit_count        INTEGER DEFAULT 0,
            unique_goods     INTEGER DEFAULT 0,
            high_incr_goods  INTEGER DEFAULT 0,
            high_incr_rate   DOUBLE PRECISION DEFAULT 0,
            efficiency_score DOUBLE PRECISION DEFAULT 0,
            updated_at       TEXT,
            PRIMARY KEY (stat_date, keyword)
        )
        """
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_pkds_date ON premium_keyword_daily_stats (stat_date DESC)"
    )

    # Feature Engine PG 改造：预计算增速/加速度/连续上榜天数（与爬虫写表分离）
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS goods_feature_metrics (
            goods_id          TEXT NOT NULL,
            snap_date         TEXT NOT NULL,
            sold_num          INTEGER DEFAULT 0,
            delta             INTEGER DEFAULT 0,
            velocity_1d       DOUBLE PRECISION DEFAULT 0,
            growth_rate       DOUBLE PRECISION DEFAULT 0,
            acceleration      DOUBLE PRECISION DEFAULT 0,
            consecutive_days  INTEGER DEFAULT 0,
            updated_at        TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
            PRIMARY KEY (goods_id, snap_date)
        )
        """
    )
    c.execute("CREATE INDEX IF NOT EXISTS idx_gfm_date ON goods_feature_metrics (snap_date)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_gfm_goods ON goods_feature_metrics (goods_id, snap_date DESC)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_gfm_growth ON goods_feature_metrics (snap_date, growth_rate DESC)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_gfm_accel ON goods_feature_metrics (snap_date, acceleration DESC)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_gfm_consec ON goods_feature_metrics (snap_date, consecutive_days DESC)")

    # 关键词-商品映射表（爬虫写入，记录每次扫描时关键词与商品的对应关系）
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS keyword_goods_mapping (
            scan_date     TEXT NOT NULL,
            keyword       TEXT NOT NULL,
            goods_id      TEXT NOT NULL,
            rank_position INTEGER,
            batch_id      INTEGER,
            scanned_at    TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
            PRIMARY KEY (scan_date, keyword, goods_id)
        )
        """
    )
    c.execute("CREATE INDEX IF NOT EXISTS idx_kgm_kw ON keyword_goods_mapping (keyword, scan_date)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_kgm_date ON keyword_goods_mapping (scan_date)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_kgm_goods ON keyword_goods_mapping (goods_id)")

    # 关键词重叠率结果表（计算表，与爬虫写表分离）
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS keyword_overlap_results (
            scan_date       TEXT NOT NULL,
            kw_keep         TEXT NOT NULL,
            kw_drop         TEXT NOT NULL,
            keep_goods_cnt  INTEGER,
            drop_goods_cnt  INTEGER,
            intersection    INTEGER,
            union_cnt       INTEGER,
            overlap_pct     DOUBLE PRECISION,
            computed_at     TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
            PRIMARY KEY (scan_date, kw_keep, kw_drop)
        )
        """
    )
    c.execute("CREATE INDEX IF NOT EXISTS idx_kor_date ON keyword_overlap_results (scan_date)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_kor_overlap ON keyword_overlap_results (scan_date, overlap_pct DESC)")

    # 关键词优化结果表（贪心去重结果）
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS keyword_optimize_results (
            scan_date       TEXT NOT NULL,
            keyword         TEXT NOT NULL,
            action          TEXT NOT NULL,
            goods_count     INTEGER,
            new_goods_count INTEGER,
            overlap_pct     DOUBLE PRECISION,
            computed_at     TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
            PRIMARY KEY (scan_date, keyword)
        )
        """
    )

    c.execute("SELECT COUNT(*) FROM keyword_batches")
    if int(c.fetchone()[0] or 0) == 0:
        c.executemany(
            "INSERT INTO keyword_batches (batch_id, name, week_of_cycle, daily_kw_quota) VALUES (%s,%s,%s,%s)",
            [
                (1, "第1周-泛类目", 1, 500),
                (2, "第2周-季节词", 2, 500),
                (3, "第3周-长尾词", 3, 500),
                (4, "第4周-试探词", 4, 500),
            ],
        )

    c.execute(
        """
        INSERT INTO premium_schema_meta (key, value) VALUES ('schema_version', %s)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        """,
        (str(SCHEMA_VERSION),),
    )
    conn.commit()
