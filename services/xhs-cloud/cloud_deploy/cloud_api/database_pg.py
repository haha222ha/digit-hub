# -*- coding: utf-8 -*-
"""
PostgreSQL 业务库（会员 / 报告索引 / 监控池）。
环境变量 XHS_DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/你的库名
"""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

import psycopg2
import psycopg2.extras
from psycopg2 import errors as pg_errors

from cloud_deploy.cloud_api.config import get_settings

psycopg2.extras.register_uuid()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _days_until(dt: datetime) -> int:
    return max(0, (_as_utc(dt) - _now()).days)


def _conn():
    s = get_settings()
    if not s.xhs_database_url:
        raise RuntimeError("未配置 XHS_DATABASE_URL")
    conn = psycopg2.connect(s.xhs_database_url)
    conn.autocommit = False
    return conn


_init_db_lock = threading.Lock()
_init_db_ready = False
_INIT_DB_ADVISORY_LOCK_KEY = 842001


def init_db() -> None:
    """初始化 schema（进程内只执行一次；跨进程用 PG advisory lock 串行迁移）。"""
    global _init_db_ready
    if _init_db_ready:
        return
    with _init_db_lock:
        if _init_db_ready:
            return
        for attempt in range(6):
            conn = _conn()
            locked = False
            try:
                with conn.cursor() as c:
                    c.execute("SELECT pg_advisory_lock(%s)", (_INIT_DB_ADVISORY_LOCK_KEY,))
                locked = True
                _init_db_on_conn(conn)
                conn.commit()
                _init_db_ready = True
                return
            except pg_errors.DeadlockDetected:
                try:
                    conn.rollback()
                except Exception:
                    pass
                if attempt >= 5:
                    raise
                time.sleep(0.4 * (attempt + 1))
            finally:
                if locked:
                    try:
                        with conn.cursor() as c:
                            c.execute("SELECT pg_advisory_unlock(%s)", (_INIT_DB_ADVISORY_LOCK_KEY,))
                        conn.commit()
                    except Exception:
                        try:
                            conn.rollback()
                        except Exception:
                            pass
                conn.close()


def _init_db_on_conn(conn) -> None:
        with conn.cursor() as c:
            c.execute("CREATE SCHEMA IF NOT EXISTS xhs_monitor")
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(64) UNIQUE NOT NULL,
                    password_hash VARCHAR(128) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS memberships (
                    id SERIAL PRIMARY KEY,
                    user_id INT NOT NULL REFERENCES users(id),
                    plan_code VARCHAR(32) DEFAULT 'monthly',
                    activated_at TIMESTAMPTZ NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL,
                    status VARCHAR(16) DEFAULT 'active'
                );
                CREATE TABLE IF NOT EXISTS auth_codes (
                    id SERIAL PRIMARY KEY,
                    code VARCHAR(32) UNIQUE NOT NULL,
                    plan_code VARCHAR(32) NOT NULL DEFAULT 'monthly',
                    duration_days INT NOT NULL DEFAULT 30,
                    max_activations INT NOT NULL DEFAULT 1,
                    current_activations INT NOT NULL DEFAULT 0,
                    status VARCHAR(16) NOT NULL DEFAULT 'unused',
                    note TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    expires_at TIMESTAMPTZ
                );
                CREATE TABLE IF NOT EXISTS auth_code_activations (
                    id SERIAL PRIMARY KEY,
                    auth_code_id INT NOT NULL REFERENCES auth_codes(id),
                    user_id INT NOT NULL REFERENCES users(id),
                    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(auth_code_id, user_id)
                );
                CREATE TABLE IF NOT EXISTS report_archives (
                    report_date DATE NOT NULL,
                    archive_type VARCHAR(32) NOT NULL,
                    storage_path TEXT NOT NULL,
                    file_name VARCHAR(256) NOT NULL,
                    file_size_bytes BIGINT,
                    sha256 VARCHAR(64),
                    row_count INT,
                    meta_json JSONB,
                    status VARCHAR(16) DEFAULT 'published',
                    published_at TIMESTAMPTZ,
                    PRIMARY KEY (report_date, archive_type)
                );
                CREATE TABLE IF NOT EXISTS report_download_logs (
                    id BIGSERIAL PRIMARY KEY,
                    user_id INT,
                    report_date DATE,
                    archive_type VARCHAR(32),
                    downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    ip INET
                );
                CREATE TABLE IF NOT EXISTS member_watchlist (
                    id SERIAL PRIMARY KEY,
                    user_id INT NOT NULL REFERENCES users(id),
                    goods_id VARCHAR(64) NOT NULL,
                    title TEXT,
                    store_name TEXT,
                    source TEXT,
                    meta_json JSONB,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(user_id, goods_id)
                );
                CREATE TABLE IF NOT EXISTS member_feedback (
                    id SERIAL PRIMARY KEY,
                    user_id INT REFERENCES users(id),
                    username VARCHAR(64),
                    category VARCHAR(32) NOT NULL DEFAULT 'suggestion',
                    content TEXT NOT NULL,
                    contact TEXT,
                    app_version VARCHAR(32),
                    machine_id VARCHAR(64),
                    client_ip INET,
                    status VARCHAR(16) NOT NULL DEFAULT 'new',
                    admin_note TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_member_feedback_status ON member_feedback(status, created_at DESC);
                CREATE TABLE IF NOT EXISTS member_keyword_requests (
                    id SERIAL PRIMARY KEY,
                    user_id INT REFERENCES users(id),
                    username VARCHAR(64),
                    keywords TEXT NOT NULL,
                    note TEXT,
                    app_version VARCHAR(32),
                    machine_id VARCHAR(64),
                    client_ip INET,
                    status VARCHAR(16) NOT NULL DEFAULT 'pending',
                    admin_note TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_member_keyword_requests_status ON member_keyword_requests(status, created_at DESC);
                CREATE TABLE IF NOT EXISTS user_addon_credits (
                    id SERIAL PRIMARY KEY,
                    user_id INT NOT NULL REFERENCES users(id),
                    addon_type VARCHAR(32) NOT NULL DEFAULT 'custom_analysis',
                    credits INT NOT NULL DEFAULT 0,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(user_id, addon_type)
                );
                CREATE TABLE IF NOT EXISTS user_addon_credit_log (
                    id SERIAL PRIMARY KEY,
                    user_id INT NOT NULL REFERENCES users(id),
                    addon_type VARCHAR(32) NOT NULL,
                    delta INT NOT NULL,
                    balance_after INT NOT NULL,
                    source TEXT,
                    ref_id VARCHAR(64),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_user_addon_credit_log_user ON user_addon_credit_log(user_id, created_at DESC);
                CREATE TABLE IF NOT EXISTS payment_orders (
                    id SERIAL PRIMARY KEY,
                    order_no VARCHAR(64) UNIQUE NOT NULL,
                    user_id INT REFERENCES users(id),
                    plan_code VARCHAR(32) NOT NULL,
                    duration_days INT NOT NULL,
                    amount VARCHAR(16) NOT NULL,
                    channel VARCHAR(16) NOT NULL DEFAULT 'wxpay',
                    status VARCHAR(16) NOT NULL DEFAULT 'pending',
                    qrcode TEXT,
                    payurl TEXT,
                    gateway_trade_no VARCHAR(64),
                    auth_code VARCHAR(32),
                    client_ip VARCHAR(64),
                    fulfilled_user_id INT,
                    meta_json JSONB,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    expires_at TIMESTAMPTZ NOT NULL,
                    paid_at TIMESTAMPTZ
                );
                CREATE TABLE IF NOT EXISTS report_daily_meta (
                    report_date DATE PRIMARY KEY,
                    row_count INT,
                    virtual_count INT,
                    physical_count INT,
                    meta_json JSONB,
                    source VARCHAR(32),
                    generated_at TIMESTAMPTZ,
                    synced_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS monitor_goods (
                    goods_id VARCHAR(32) PRIMARY KEY,
                    title TEXT,
                    is_virtual BOOLEAN,
                    pool VARCHAR(16),
                    tier VARCHAR(16),
                    monitor_status VARCHAR(16) NOT NULL DEFAULT 'active',
                    first_tracked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    first_report_date DATE,
                    last_report_date DATE,
                    last_v1d NUMERIC(12,2) DEFAULT 0,
                    last_actual_v1d NUMERIC(12,2) DEFAULT 0,
                    peak_v1d NUMERIC(12,2) DEFAULT 0,
                    last_sold INT DEFAULT 0,
                    store_id VARCHAR(64),
                    store_name VARCHAR(256),
                    priority_score NUMERIC(12,2) DEFAULT 0,
                    source VARCHAR(32) DEFAULT 'daily_report',
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS report_daily_items (
                    report_date DATE NOT NULL,
                    goods_id VARCHAR(32) NOT NULL,
                    rank_no INT,
                    title TEXT,
                    price NUMERIC(12,2),
                    sold INT,
                    v1h NUMERIC(12,2),
                    v6h NUMERIC(12,2),
                    actual_v1d NUMERIC(12,2),
                    v1d NUMERIC(12,2),
                    actual_gr NUMERIC(12,4),
                    gr NUMERIC(12,4),
                    actual_vsr NUMERIC(12,4),
                    vsr NUMERIC(12,4),
                    acc NUMERIC(12,4),
                    burst NUMERIC(12,2),
                    pool VARCHAR(16),
                    first_seen TIMESTAMPTZ,
                    store_id VARCHAR(64),
                    store_name VARCHAR(256),
                    shelf_time TIMESTAMPTZ,
                    shop_sales INT,
                    shop_fans INT,
                    shop_fsr NUMERIC(12,4),
                    goods_fsr NUMERIC(12,4),
                    behavior TEXT,
                    is_virtual BOOLEAN,
                    base_hours NUMERIC(12,2),
                    base_at TIMESTAMPTZ,
                    anomaly VARCHAR(64),
                    category_tag VARCHAR(64) DEFAULT '',
                    PRIMARY KEY (report_date, goods_id)
                );
                CREATE TABLE IF NOT EXISTS goods_sold_daily (
                    goods_id VARCHAR(32) NOT NULL,
                    snapshot_date DATE NOT NULL,
                    sold_num INT NOT NULL,
                    deal_price NUMERIC(12,2),
                    delta INT,
                    source VARCHAR(32) DEFAULT 'local_sync',
                    PRIMARY KEY (goods_id, snapshot_date)
                );
                CREATE TABLE IF NOT EXISTS goods_metrics_daily (
                    goods_id VARCHAR(32) NOT NULL,
                    metric_date DATE NOT NULL,
                    v1d NUMERIC(12,2),
                    actual_v1d NUMERIC(12,2),
                    gr NUMERIC(12,4),
                    burst NUMERIC(12,2),
                    pool VARCHAR(16),
                    PRIMARY KEY (goods_id, metric_date)
                );
                CREATE TABLE IF NOT EXISTS goods_sync_state (
                    goods_id VARCHAR(32) PRIMARY KEY,
                    sold_daily_backfill_done BOOLEAN DEFAULT FALSE,
                    sold_snapshots_backfill_done BOOLEAN DEFAULT FALSE,
                    sold_daily_row_count INT DEFAULT 0,
                    sold_snapshots_row_count INT DEFAULT 0,
                    last_backfill_at TIMESTAMPTZ,
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS goods_sold_snapshots (
                    goods_id VARCHAR(32) NOT NULL,
                    snapshot_time TIMESTAMPTZ NOT NULL,
                    sold_num INT,
                    data_source VARCHAR(32) DEFAULT 'local_sync',
                    PRIMARY KEY (goods_id, snapshot_time)
                );
                CREATE TABLE IF NOT EXISTS monitor_rules (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(128),
                    enabled BOOLEAN DEFAULT TRUE,
                    rule_json JSONB NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS monitor_alerts (
                    id BIGSERIAL PRIMARY KEY,
                    goods_id VARCHAR(32),
                    rule_id INT REFERENCES monitor_rules(id),
                    alert_type VARCHAR(64),
                    payload_json JSONB,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS sync_checkpoints (
                    client_id VARCHAR(64) PRIMARY KEY,
                    last_report_date DATE,
                    last_sold_hist_date DATE,
                    last_goods_id VARCHAR(32),
                    meta_json JSONB,
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS full_sold_queue (
                    goods_id VARCHAR(32) PRIMARY KEY,
                    title TEXT DEFAULT '',
                    sold_num INT DEFAULT 0,
                    velocity_1d NUMERIC(12,2) DEFAULT 0,
                    pool VARCHAR(16) DEFAULT 'WATCH',
                    last_seen TIMESTAMPTZ,
                    queue_date DATE NOT NULL,
                    last_sync_at TIMESTAMPTZ,
                    sync_fail_count INT DEFAULT 0,
                    frozen_at TIMESTAMPTZ,
                    freeze_code INT DEFAULT 0,
                    seeded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_fsq_pending
                    ON full_sold_queue (queue_date, last_sync_at, frozen_at, velocity_1d);
                CREATE INDEX IF NOT EXISTS idx_rdi_date_v1d ON report_daily_items(report_date, v1d DESC);
                CREATE INDEX IF NOT EXISTS idx_rdi_goods ON report_daily_items(goods_id, report_date DESC);
                CREATE INDEX IF NOT EXISTS idx_monitor_active ON monitor_goods(monitor_status, last_v1d DESC);
                CREATE INDEX IF NOT EXISTS idx_monitor_v1d ON monitor_goods(last_v1d DESC) WHERE last_v1d > 0;
                CREATE INDEX IF NOT EXISTS idx_gss_time ON goods_sold_snapshots(snapshot_time);
                CREATE INDEX IF NOT EXISTS idx_gss_goods ON goods_sold_snapshots(goods_id, snapshot_time DESC);
                CREATE INDEX IF NOT EXISTS idx_ma_goods ON monitor_alerts(goods_id, created_at DESC);
                """
            )
            _migrate_legacy_columns(c)
            _seed_default_rules(c)
            try:
                from cloud_deploy.cloud_api.premium_cloud_policy import premium_cloud_sync_enabled

                if premium_cloud_sync_enabled():
                    from cloud_deploy.cloud_api.premium_schema_pg import init_premium_pg_schema

                    init_premium_pg_schema(conn)
            except Exception:
                pass


def _migrate_legacy_columns(c) -> None:
    """旧库可能缺 status/published_at 列，补全以免 admin/stats 500。"""
    c.execute(
        "ALTER TABLE report_archives ADD COLUMN IF NOT EXISTS status VARCHAR(16) DEFAULT 'published'"
    )
    c.execute(
        "ALTER TABLE report_archives ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ"
    )
    # gen_report 的 shop_fsr/goods_fsr 可达 10^5+，旧表 NUMERIC(8,4) 会 overflow
    for col, typ in (
        ("shop_fsr", "NUMERIC(12,4)"),
        ("goods_fsr", "NUMERIC(12,4)"),
        ("base_hours", "NUMERIC(12,2)"),
        ("behavior", "TEXT"),
    ):
        c.execute(
            f"""
            DO $$ BEGIN
                ALTER TABLE report_daily_items ALTER COLUMN {col} TYPE {typ};
            EXCEPTION WHEN others THEN NULL;
            END $$;
            """
        )
    c.execute(
        "ALTER TABLE monitor_goods ADD COLUMN IF NOT EXISTS last_scan_at TIMESTAMPTZ"
    )
    c.execute(
        "ALTER TABLE monitor_goods ADD COLUMN IF NOT EXISTS last_scan_status VARCHAR(16)"
    )
    c.execute(
        "ALTER TABLE monitor_goods ADD COLUMN IF NOT EXISTS last_scan_engine VARCHAR(32)"
    )
    c.execute("ALTER TABLE monitor_goods ADD COLUMN IF NOT EXISTS shop_sales INT")
    c.execute("ALTER TABLE monitor_goods ADD COLUMN IF NOT EXISTS shop_fans INT")
    c.execute("ALTER TABLE monitor_goods ADD COLUMN IF NOT EXISTS first_seen TIMESTAMPTZ")
    c.execute(
        "ALTER TABLE report_daily_items ADD COLUMN IF NOT EXISTS category_tag VARCHAR(64) DEFAULT ''"
    )
    c.execute("ALTER TABLE monitor_goods ADD COLUMN IF NOT EXISTS scan_claim_by VARCHAR(64)")
    c.execute("ALTER TABLE monitor_goods ADD COLUMN IF NOT EXISTS scan_claim_until TIMESTAMPTZ")
    c.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_monitor_scan_pending
            ON monitor_goods (monitor_status, last_scan_at NULLS FIRST, priority_score DESC)
        """
    )
    c.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS session_device_id VARCHAR(160)")
    c.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INT NOT NULL DEFAULT 0")
    c.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS session_device_label VARCHAR(64)")
    c.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS session_bound_at TIMESTAMPTZ")
    for dtype in ("pc", "web"):
        c.execute(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {dtype}_device_id VARCHAR(160)")
        c.execute(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {dtype}_session_version INT NOT NULL DEFAULT 0")
        c.execute(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {dtype}_device_label VARCHAR(64)")
        c.execute(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {dtype}_bound_at TIMESTAMPTZ")
    c.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)")
    c.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
            ON users (LOWER(email)) WHERE email IS NOT NULL AND TRIM(email) != ''
        """
    )
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL REFERENCES users(id),
            token_hash VARCHAR(64) NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            used_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    c.execute("CREATE INDEX IF NOT EXISTS idx_prt_hash ON password_reset_tokens(token_hash)")
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS member_broadcast_acks (
            user_id INT NOT NULL REFERENCES users(id),
            broadcast_id VARCHAR(64) NOT NULL,
            acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, broadcast_id)
        )
        """
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_member_broadcast_acks_bid ON member_broadcast_acks (broadcast_id, acknowledged_at DESC)"
    )
    _migrate_legacy_single_session(c)


def _migrate_legacy_single_session(c) -> None:
    c.execute(
        """SELECT id, session_device_id, session_version, session_device_label, session_bound_at
           FROM users
           WHERE session_device_id IS NOT NULL AND TRIM(session_device_id) <> ''"""
    )
    rows = c.fetchall() or []
    for row in rows:
        if isinstance(row, dict):
            uid = row["id"]
            did = str(row.get("session_device_id") or "").strip()
            sv = int(row.get("session_version") or 0)
            label = row.get("session_device_label") or ""
            bound = row.get("session_bound_at")
        else:
            uid, did, sv, label, bound = row[0], str(row[1] or "").strip(), int(row[2] or 0), row[3] or "", row[4]
        if ":" not in did:
            continue
        dtype = did.split(":", 1)[0].lower()
        if dtype not in ("pc", "web"):
            continue
        c.execute(
            f"SELECT {dtype}_device_id, {dtype}_session_version FROM users WHERE id=%s",
            (uid,),
        )
        slot = c.fetchone()
        if slot:
            if isinstance(slot, dict):
                slot_did = slot.get(f"{dtype}_device_id")
                slot_sv = slot.get(f"{dtype}_session_version")
            else:
                slot_did, slot_sv = slot[0], slot[1]
            if slot_did or slot_sv:
                continue
        c.execute(
            f"""UPDATE users SET {dtype}_device_id=%s, {dtype}_session_version=%s,
                   {dtype}_device_label=%s, {dtype}_bound_at=%s
               WHERE id=%s""",
            (did, sv, label, bound, uid),
        )
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS daemon_scan_stats (
            id BIGSERIAL PRIMARY KEY,
            run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            batch_size INT,
            ok INT,
            fail INT,
            risk INT,
            frozen INT,
            wall_ms INT,
            note TEXT
        )
        """
    )


def _seed_default_rules(c) -> None:
    c.execute("SELECT COUNT(*) FROM monitor_rules")
    if c.fetchone()[0] > 0:
        return
    defaults = [
        ("R01_burst_pool", {"id": "R01", "when": {"last_v1d_gte": 50, "pool_not": "BURST"}, "action": {"set_pool": "BURST", "priority_boost": 100}}),
        ("R02_idle_zero", {"id": "R02", "when": {"zero_v1d_days_gte": 7}, "action": {"set_status": "idle"}}),
        ("R03_drop_alert", {"id": "R03", "when": {"actual_v1d_drop_pct_gte": 80}, "action": {"alert_type": "drop"}}),
        ("R04_delisted", {"id": "R04", "when": {"scan_status": "frozen"}, "action": {"set_status": "delisted", "stop_scan": True}}),
    ]
    for name, rule in defaults:
        c.execute(
            "INSERT INTO monitor_rules (name, enabled, rule_json) VALUES (%s, TRUE, %s)",
            (name, json.dumps(rule, ensure_ascii=False)),
        )


def _hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()
    return f"{salt}${digest}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    return _hash_password(password, salt).split("$", 1)[1] == digest


def ensure_admin() -> None:
    s = get_settings()
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute("SELECT id FROM users WHERE username=%s", (s.xhs_cloud_admin_user,))
            if not c.fetchone():
                c.execute(
                    "INSERT INTO users (username, password_hash) VALUES (%s,%s) RETURNING id",
                    (s.xhs_cloud_admin_user, _hash_password(s.xhs_cloud_admin_pass)),
                )
                uid = c.fetchone()["id"]
                exp = _now() + timedelta(days=3650)
                c.execute(
                    """INSERT INTO memberships (user_id, plan_code, activated_at, expires_at, status)
                       VALUES (%s,'admin',NOW(),%s,'active')""",
                    (uid, exp),
                )
        conn.commit()
    finally:
        conn.close()


def normalize_device_id(device_id: str, device_type: str = "") -> str:
    raw = (device_id or "").strip()
    if not raw:
        return ""
    if ":" in raw:
        prefix, rest = raw.split(":", 1)
        return f"{prefix.strip().lower()}:{rest.strip().upper()}"
    dt = (device_type or "unknown").strip().lower()
    return f"{dt}:{raw.upper()}"


_DEVICE_SLOTS = frozenset({"pc", "web"})


def _parse_device_slot(device_id: str) -> tuple[str, str]:
    did = normalize_device_id(device_id)
    parts = did.split(":", 1)
    if len(parts) != 2 or parts[0] not in _DEVICE_SLOTS or len(parts[1]) < 8:
        raise ValueError("device_id 无效")
    return parts[0], did


def get_member_session(user_id: int) -> dict | None:
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """SELECT pc_device_id, pc_session_version, pc_device_label, pc_bound_at,
                          web_device_id, web_session_version, web_device_label, web_bound_at
                   FROM users WHERE id=%s""",
                (user_id,),
            )
            row = c.fetchone()
            if not row:
                return None

            def _slot(prefix: str) -> dict:
                bound = row.get(f"{prefix}_bound_at")
                return {
                    "device_id": row.get(f"{prefix}_device_id") or "",
                    "session_version": int(row.get(f"{prefix}_session_version") or 0),
                    "device_label": row.get(f"{prefix}_device_label") or "",
                    "bound_at": bound.strftime("%Y-%m-%d %H:%M:%S") if bound else "",
                }

            return {"pc": _slot("pc"), "web": _slot("web")}
    finally:
        conn.close()


def get_member_session_slot(user_id: int, device_type: str) -> dict | None:
    sessions = get_member_session(user_id)
    if not sessions:
        return None
    return sessions.get(device_type)


def bind_member_session(user_id: int, device_id: str, device_label: str = "") -> int:
    dtype, did = _parse_device_slot(device_id)
    current = get_member_session_slot(user_id, dtype) or {}
    label = (device_label or "").strip()[:64]
    if current.get("device_id") == did and int(current.get("session_version") or 0) > 0:
        conn = _conn()
        try:
            with conn.cursor() as c:
                c.execute("SET search_path TO xhs_monitor, public")
                c.execute(
                    f"""UPDATE users SET {dtype}_device_label=%s, {dtype}_bound_at=NOW()
                       WHERE id=%s""",
                    (label or current.get("device_label"), user_id),
                )
            conn.commit()
        finally:
            conn.close()
        return int(current["session_version"])
    new_sv = int(current.get("session_version") or 0) + 1
    conn = _conn()
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                f"""UPDATE users SET {dtype}_device_id=%s, {dtype}_session_version=%s,
                       {dtype}_device_label=%s, {dtype}_bound_at=NOW()
                   WHERE id=%s""",
                (did, new_sv, label, user_id),
            )
        conn.commit()
    finally:
        conn.close()
    return new_sv


def verify_member_session(user_id: int, device_id: str, session_version: int) -> bool:
    try:
        dtype, did = _parse_device_slot(device_id)
    except ValueError:
        return False
    if session_version <= 0:
        return False
    current = get_member_session_slot(user_id, dtype)
    if not current or not current.get("device_id"):
        return False
    return (
        current["device_id"] == did
        and int(current["session_version"]) == int(session_version)
    )


def get_active_member(user_id: int) -> dict | None:
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """SELECT u.id, u.username, u.email, m.expires_at, m.status, m.plan_code
                   FROM users u
                   JOIN memberships m ON m.user_id = u.id
                   WHERE u.id = %s AND m.status = 'active' AND m.expires_at > NOW()
                   ORDER BY m.expires_at DESC
                   LIMIT 1""",
                (user_id,),
            )
            row = c.fetchone()
            if not row:
                return None
            return {
                "id": row["id"],
                "username": row["username"],
                "email": (row.get("email") or "").strip(),
                "expires_at": row["expires_at"].strftime("%Y-%m-%d %H:%M:%S"),
                "plan_code": row.get("plan_code") or "monthly",
                "days_remaining": _days_until(row["expires_at"]),
            }
    finally:
        conn.close()


def authenticate_user(username: str, password: str) -> dict | None:
    """仅校验账号密码，不要求会员未过期（用于过期后续费登录）。"""
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute("SELECT id, username, password_hash FROM users WHERE username=%s", (username,))
            u = c.fetchone()
            if not u or not _verify_password(password, u["password_hash"]):
                return None
            return {"id": u["id"], "username": u["username"]}
    finally:
        conn.close()


def authenticate(username: str, password: str) -> dict | None:
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute("SELECT id, username, password_hash FROM users WHERE username=%s", (username,))
            u = c.fetchone()
            if not u or not _verify_password(password, u["password_hash"]):
                return None
            c.execute(
                "SELECT status, expires_at FROM memberships WHERE user_id=%s ORDER BY id DESC LIMIT 1",
                (u["id"],),
            )
            m = c.fetchone()
            if not m or m["status"] != "active":
                return None
            c.execute(
                "SELECT 1 FROM memberships WHERE user_id=%s AND expires_at > NOW()",
                (u["id"],),
            )
            if not c.fetchone():
                return None
            return {
                "id": u["id"],
                "username": u["username"],
                "expires_at": m["expires_at"].strftime("%Y-%m-%d %H:%M:%S"),
            }
    finally:
        conn.close()


def archive_display_label(
    report_date: str, archive_type: str = "member_daily_zip", file_name: str = ""
) -> str:
    """会员报告库列表展示名：全量0618 / 周报0618 / 月报202606。"""
    date = str(report_date)[:10]
    mmdd = date.replace("-", "")[4:]
    if file_name:
        base = file_name.rsplit(".", 1)[0]
        if base.startswith(("全量", "周报", "月报")):
            return base
    if archive_type == "member_weekly_zip":
        return f"周报{mmdd}"
    if archive_type == "member_monthly_zip":
        return f"月报{date[:7].replace('-', '')}"
    if archive_type == "member_custom_zip":
        if file_name:
            return file_name.rsplit(".", 1)[0]
        return f"定制{mmdd}"
    return f"全量{mmdd}"


def list_archives(archive_type: str = "member_daily_zip") -> list[dict]:
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """SELECT report_date, archive_type, file_name, file_size_bytes,
                          row_count, meta_json, published_at, status
                   FROM report_archives
                   WHERE archive_type=%s AND status='published'
                   ORDER BY report_date DESC""",
                (archive_type,),
            )
            rows = []
            for r in c.fetchall():
                meta = r.get("meta_json") if isinstance(r, dict) else r["meta_json"]
                if not meta:
                    meta = {}
                elif isinstance(meta, str):
                    try:
                        meta = json.loads(meta) or {}
                    except Exception:
                        meta = {}
                rd = r.get("report_date") if isinstance(r, dict) else r["report_date"]
                report_date = rd.isoformat() if hasattr(rd, "isoformat") else (str(rd)[:10] if rd else "")
                fn = (r.get("file_name") if isinstance(r, dict) else r["file_name"]) or ""
                atype = (r.get("archive_type") if isinstance(r, dict) else r["archive_type"]) or archive_type
                summary = meta.get("filter_label") or meta.get("set_label") or meta.get("title")
                if not summary:
                    summary = archive_display_label(report_date, atype, fn)
                pub = r.get("published_at") if isinstance(r, dict) else r["published_at"]
                published_at = pub.isoformat() if hasattr(pub, "isoformat") else (str(pub) if pub else "")
                rows.append(
                    {
                        "report_date": report_date,
                        "archive_type": atype,
                        "file_name": fn,
                        "file_size_bytes": r.get("file_size_bytes") if isinstance(r, dict) else r["file_size_bytes"],
                        "row_count": r.get("row_count") if isinstance(r, dict) else r["row_count"],
                        "summary": summary,
                        "published_at": published_at,
                    }
                )
            return rows
    finally:
        conn.close()


def get_archive_path(report_date: str, archive_type: str = "member_daily_zip") -> str | None:
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """SELECT storage_path FROM report_archives
                   WHERE report_date=%s AND archive_type=%s AND status='published'""",
                (report_date, archive_type),
            )
            r = c.fetchone()
            return r["storage_path"] if r else None
    finally:
        conn.close()


def log_download(user_id: int, report_date: str, archive_type: str, ip: str) -> None:
    conn = _conn()
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """INSERT INTO report_download_logs (user_id, report_date, archive_type, ip)
                   VALUES (%s,%s,%s,%s)""",
                (user_id, report_date, archive_type, ip or None),
            )
        conn.commit()
    finally:
        conn.close()


def upsert_report_archive(
    report_date: str,
    archive_type: str,
    storage_path: str,
    file_name: str,
    file_size: int,
    sha256: str,
    row_count: int,
    meta: dict,
) -> None:
    conn = _conn()
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """INSERT INTO report_archives (
                       report_date, archive_type, storage_path, file_name,
                       file_size_bytes, sha256, row_count, meta_json, status, published_at
                   ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'published',NOW())
                   ON CONFLICT (report_date, archive_type) DO UPDATE SET
                       storage_path=EXCLUDED.storage_path,
                       file_name=EXCLUDED.file_name,
                       file_size_bytes=EXCLUDED.file_size_bytes,
                       sha256=EXCLUDED.sha256,
                       row_count=EXCLUDED.row_count,
                       meta_json=EXCLUDED.meta_json,
                       published_at=NOW()""",
                (
                    report_date,
                    archive_type,
                    storage_path,
                    file_name,
                    file_size,
                    sha256,
                    row_count,
                    json.dumps(meta, ensure_ascii=False),
                ),
            )
        conn.commit()
    finally:
        conn.close()


def purge_all_member_reports(*, dry_run: bool = False) -> dict:
    """删除会员页全部选品报告归档（zip + PG 登记 + 日报行）。"""
    import glob as _glob

    from cloud_deploy.cloud_api.config import get_settings

    archive_types = [
        "member_daily_zip",
        "member_weekly_zip",
        "member_monthly_zip",
        "member_custom_zip",
    ]
    settings = get_settings()
    archive_dir = settings.xhs_report_archive_dir
    conn = _conn()
    files_removed: list[str] = []
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """SELECT report_date, archive_type, storage_path, file_name, row_count
                   FROM report_archives
                   WHERE archive_type = ANY(%s)
                   ORDER BY report_date DESC""",
                (archive_types,),
            )
            rows = list(c.fetchall())
            c.execute("SELECT COUNT(*) AS n FROM report_daily_items")
            items_n = int((c.fetchone() or {}).get("n") or 0)
            c.execute("SELECT COUNT(*) AS n FROM report_daily_meta")
            meta_n = int((c.fetchone() or {}).get("n") or 0)

            if not dry_run:
                for r in rows:
                    path = (r.get("storage_path") or "").strip()
                    if path and os.path.isfile(path):
                        try:
                            os.remove(path)
                            files_removed.append(path)
                        except OSError:
                            pass
                c.execute(
                    "DELETE FROM report_archives WHERE archive_type = ANY(%s)",
                    (archive_types,),
                )
                archives_deleted = int(c.rowcount or 0)
                c.execute("DELETE FROM report_daily_items")
                items_deleted = int(c.rowcount or 0)
                c.execute("DELETE FROM report_daily_meta")
                meta_deleted = int(c.rowcount or 0)
                # 兜底清理归档目录：仅选品报告 zip（勿删 ai_advisor / insight）
                if archive_dir and os.path.isdir(archive_dir):
                    for zp in _glob.glob(os.path.join(archive_dir, "*.zip")):
                        base = os.path.basename(zp)
                        if not base.startswith(("全量", "周报", "月报", "定制")):
                            continue
                        try:
                            os.remove(zp)
                            if zp not in files_removed:
                                files_removed.append(zp)
                        except OSError:
                            pass
                conn.commit()
            else:
                archives_deleted = len(rows)
                items_deleted = items_n
                meta_deleted = meta_n
        return {
            "dry_run": dry_run,
            "archives_matched": len(rows),
            "archives_deleted": archives_deleted,
            "report_daily_items_deleted": items_deleted,
            "report_daily_meta_deleted": meta_deleted,
            "files_removed": files_removed,
            "archives": [
                {
                    "report_date": (
                        r["report_date"].isoformat()
                        if hasattr(r["report_date"], "isoformat")
                        else str(r.get("report_date") or "")[:10]
                    ),
                    "archive_type": r.get("archive_type"),
                    "file_name": r.get("file_name"),
                    "row_count": r.get("row_count"),
                }
                for r in rows
            ],
        }
    finally:
        conn.close()


PLAN_LABELS = {
    "experience_3d": "体验卡",
    "weekly": "周会员",
    "monthly": "月度会员",
    "quarterly": "季度会员",
    "halfyear": "半年会员",
    "yearly": "年度会员",
    "pay_test": "支付测试",
    "experience": "体验会员",
    "insight_monthly": "AI选品月卡",
    "insight_pro_monthly": "AI选品Pro",
    "insight_team_monthly": "AI选品团队",
    "admin": "管理员",
}


def _parse_entitlements_from_note(note: str | None) -> dict | None:
    if not note:
        return None
    text = str(note).strip()
    if not text.startswith("{"):
        return None
    try:
        import json
        data = json.loads(text)
        if isinstance(data, dict):
            return data.get("entitlements") if isinstance(data.get("entitlements"), dict) else data
    except Exception:
        return None
    return None


def get_member_entitlements(user_id: int) -> dict | None:
    """体验会员等受限授权：从激活过的 auth_codes.note JSON 读取 entitlements。"""
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """
                SELECT ac.plan_code, ac.note
                FROM auth_code_activations aca
                JOIN auth_codes ac ON ac.id = aca.auth_code_id
                WHERE aca.user_id = %s
                ORDER BY aca.activated_at DESC
                """,
                (user_id,),
            )
            rows = c.fetchall() or []
            for row in rows:
                ent = _parse_entitlements_from_note(row.get("note"))
                if ent:
                    ent = dict(ent)
                    ent.setdefault("plan_code", row.get("plan_code"))
                    return ent
                if str(row.get("plan_code") or "") == "experience":
                    return {"plan_code": "experience", "pc_full": True, "report_download_limited": True}
    finally:
        conn.close()
    return None


def filter_report_library_by_entitlements(library: dict, entitlements: dict | None) -> dict:
    if not library or not entitlements:
        return library
    allowed_dates = entitlements.get("allowed_report_dates") or entitlements.get("report_dates") or []
    allowed_types = entitlements.get("allowed_archive_types") or entitlements.get("archive_types") or []
    if not allowed_dates and not entitlements.get("report_download_limited"):
        return library
    allowed_dates = {str(x).strip() for x in allowed_dates if str(x).strip()}
    allowed_types = {str(x).strip() for x in allowed_types if str(x).strip()}
    archive_map = {
        "daily": "member_daily_zip",
        "weekly": "member_weekly_zip",
        "monthly": "member_monthly_zip",
        "custom": "member_custom_zip",
    }
    out = dict(library)
    total = 0
    for key in ("daily", "weekly", "monthly", "custom"):
        rows = list(out.get(key) or [])
        if allowed_types:
            atype = archive_map.get(key)
            if atype and atype not in allowed_types:
                rows = []
        if allowed_dates:
            rows = [
                r for r in rows
                if str(r.get("report_date") or r.get("date") or "")[:10] in allowed_dates
            ]
        out[key] = rows
        total += len(rows)
    out["total_count"] = total
    out["entitlements_applied"] = True
    return out


def member_can_download_report(user_id: int, report_date: str, archive_type: str) -> bool:
    ent = get_member_entitlements(user_id)
    if not ent:
        return True
    allowed_dates = ent.get("allowed_report_dates") or ent.get("report_dates") or []
    allowed_types = ent.get("allowed_archive_types") or ent.get("archive_types") or []
    if not allowed_dates and not allowed_types and not ent.get("report_download_limited"):
        return True
    day = str(report_date or "")[:10]
    if allowed_dates and day not in {str(x).strip()[:10] for x in allowed_dates}:
        return False
    if allowed_types and archive_type not in {str(x).strip() for x in allowed_types}:
        return False
    return True


def _normalize_code(code: str) -> str:
    return code.strip().upper().replace(" ", "").replace("-", "")


def _gen_auth_code() -> str:
    return f"XHS-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}"


def generate_auth_codes(
    count: int = 1,
    plan_code: str = "monthly",
    duration_days: int = 30,
    max_activations: int = 1,
    note: str = "",
) -> list[str]:
    conn = _conn()
    codes = []
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            for _ in range(max(1, count)):
                code = _gen_auth_code()
                c.execute(
                    """INSERT INTO auth_codes
                       (code, plan_code, duration_days, max_activations, note)
                       VALUES (%s,%s,%s,%s,%s)""",
                    (code, plan_code, duration_days, max_activations, note or None),
                )
                codes.append(code)
        conn.commit()
        return codes
    finally:
        conn.close()


def list_auth_codes(limit: int = 100, status: str | None = None) -> list[dict]:
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            sql = (
                """SELECT ac.id, ac.code, ac.plan_code, ac.duration_days, ac.max_activations,
                          ac.current_activations, ac.status, ac.note, ac.created_at, ac.expires_at,
                          act.first_activated_at,
                          act.activated_usernames,
                          mem.membership_expires_at
                   FROM auth_codes ac
                   LEFT JOIN (
                       SELECT aca.auth_code_id,
                              MIN(aca.activated_at) AS first_activated_at,
                              STRING_AGG(u.username, ', ' ORDER BY aca.activated_at) AS activated_usernames
                       FROM auth_code_activations aca
                       JOIN users u ON u.id = aca.user_id
                       GROUP BY aca.auth_code_id
                   ) act ON act.auth_code_id = ac.id
                   LEFT JOIN (
                       SELECT aca.auth_code_id,
                              MAX(m.expires_at) AS membership_expires_at
                       FROM auth_code_activations aca
                       JOIN memberships m ON m.user_id = aca.user_id
                       GROUP BY aca.auth_code_id
                   ) mem ON mem.auth_code_id = ac.id"""
            )
            params: list = []
            if status:
                sql += " WHERE ac.status = %s"
                params.append(status)
            sql += " ORDER BY ac.id DESC LIMIT %s"
            params.append(limit)
            c.execute(sql, params)
            rows = []
            for r in c.fetchall():
                membership_expires = r["membership_expires_at"]
                days_remaining = None
                if membership_expires:
                    days_remaining = _days_until(membership_expires)
                rows.append(
                    {
                        "id": r["id"],
                        "code": r["code"],
                        "plan_code": r["plan_code"],
                        "plan_label": PLAN_LABELS.get(r["plan_code"], r["plan_code"]),
                        "duration_days": r["duration_days"],
                        "max_activations": r["max_activations"],
                        "current_activations": r["current_activations"],
                        "status": r["status"],
                        "note": r["note"] or "",
                        "created_at": r["created_at"].isoformat() if r["created_at"] else "",
                        "expires_at": r["expires_at"].isoformat() if r["expires_at"] else "",
                        "first_activated_at": (
                            r["first_activated_at"].isoformat() if r["first_activated_at"] else ""
                        ),
                        "activated_usernames": r["activated_usernames"] or "",
                        "membership_expires_at": (
                            membership_expires.isoformat() if membership_expires else ""
                        ),
                        "days_remaining": days_remaining,
                    }
                )
            return rows
    finally:
        conn.close()


def revoke_auth_code(code: str) -> dict:
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            row = _fetch_auth_code(c, code)
            if not row:
                raise ValueError("授权码不存在")
            if row["status"] == "revoked":
                raise ValueError("授权码已被吊销")
            c.execute("UPDATE auth_codes SET status='revoked' WHERE id=%s", (row["id"],))
        conn.commit()
        return {"code": row["code"], "status": "revoked"}
    finally:
        conn.close()


def get_admin_stats() -> dict:
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute("SELECT COUNT(*) AS n FROM users")
            total_members = int(c.fetchone()["n"])
            c.execute(
                """SELECT COUNT(DISTINCT u.id) AS n
                   FROM users u
                   JOIN memberships m ON m.user_id = u.id
                   WHERE m.expires_at > NOW()"""
            )
            active_members = int(c.fetchone()["n"])
            c.execute("SELECT status, COUNT(*) AS n FROM auth_codes GROUP BY status")
            code_by_status = {r["status"]: int(r["n"]) for r in c.fetchall()}
            c.execute(
                """SELECT report_date, file_name
                   FROM report_archives
                   WHERE archive_type = 'member_daily_zip' AND status = 'published'
                   ORDER BY report_date DESC LIMIT 1"""
            )
            latest = c.fetchone()
            c.execute(
                """SELECT COUNT(*) AS n FROM report_archives
                   WHERE archive_type = 'member_daily_zip' AND status = 'published'"""
            )
            archive_count = int(c.fetchone()["n"])
            return {
                "total_members": total_members,
                "active_members": active_members,
                "auth_codes_unused": code_by_status.get("unused", 0),
                "auth_codes_active": code_by_status.get("active", 0),
                "auth_codes_revoked": code_by_status.get("revoked", 0),
                "auth_codes_total": sum(code_by_status.values()),
                "latest_report_date": (
                    latest["report_date"].isoformat() if latest and latest.get("report_date") else None
                ),
                "latest_report_file": latest["file_name"] if latest else None,
                "archive_count": archive_count,
            }
    finally:
        conn.close()


def _fetch_auth_code(c, code: str) -> dict | None:
    norm = _normalize_code(code)
    c.execute(
        """SELECT id, code, plan_code, duration_days, max_activations,
                  current_activations, status, expires_at
           FROM auth_codes
           WHERE REPLACE(REPLACE(UPPER(code), '-', ''), ' ', '') = %s""",
        (norm,),
    )
    return c.fetchone()


def _validate_auth_code_row(row: dict | None) -> dict:
    if not row:
        raise ValueError("授权码不存在")
    if row["status"] == "revoked":
        raise ValueError("授权码已被吊销")
    if row["current_activations"] >= row["max_activations"]:
        raise ValueError("授权码已达最大激活次数")
    if row["expires_at"] and _as_utc(row["expires_at"]) < _now():
        raise ValueError("授权码已过期")
    return row


def _extend_membership(c, user_id: int, plan_code: str, duration_days: int) -> dict:
    c.execute(
        """SELECT expires_at FROM memberships
           WHERE user_id=%s AND status='active' ORDER BY expires_at DESC LIMIT 1""",
        (user_id,),
    )
    row = c.fetchone()
    now = _now()
    base = now
    previous_days = 0
    stacked = False
    exp_raw = row.get("expires_at") if row else None
    if exp_raw:
        exp = _as_utc(exp_raw)
        if exp > now:
            base = exp
            previous_days = max(0, _days_until(exp))
            stacked = True
    expires = base + timedelta(days=duration_days)
    c.execute(
        """INSERT INTO memberships (user_id, plan_code, activated_at, expires_at, status)
           VALUES (%s,%s,NOW(),%s,'active')""",
        (user_id, plan_code, expires),
    )
    return {
        "expires_at": expires,
        "stacked": stacked,
        "previous_days_remaining": previous_days,
        "days_added": int(duration_days),
    }


def register_with_auth_code(username: str, password: str, code: str) -> dict:
    username = (username or "").strip()
    if len(username) < 3:
        raise ValueError("用户名至少 3 个字符")
    if len(password or "") < 6:
        raise ValueError("密码至少 6 位")
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute("SELECT id FROM users WHERE username=%s", (username,))
            if c.fetchone():
                raise ValueError("用户名已存在，请切换到「授权码续费」或使用登录后在会员中心续费")
            row = _validate_auth_code_row(_fetch_auth_code(c, code))
            c.execute(
                "INSERT INTO users (username, password_hash) VALUES (%s,%s) RETURNING id",
                (username, _hash_password(password)),
            )
            uid = c.fetchone()["id"]
            from cloud_deploy.cloud_api.payment_plans import is_addon_plan

            if is_addon_plan(row["plan_code"]):
                expires = None
            else:
                extend_info = _extend_membership(c, uid, row["plan_code"], row["duration_days"])
                expires = extend_info["expires_at"]
            c.execute(
                "INSERT INTO auth_code_activations (auth_code_id, user_id) VALUES (%s,%s)",
                (row["id"], uid),
            )
            c.execute(
                "UPDATE auth_codes SET current_activations=current_activations+1, status='active' WHERE id=%s",
                (row["id"],),
            )
        conn.commit()
        profile = get_member_profile(uid)
        if profile:
            return profile
        return {
            "id": uid,
            "username": username,
            "expires_at": expires.strftime("%Y-%m-%d %H:%M:%S") if expires else "",
            "plan_code": row["plan_code"],
            "days_remaining": _days_until(expires) if expires else 0,
            "is_active": bool(expires),
        }
    finally:
        conn.close()


def login_with_auth_code(code: str) -> dict:
    code = (code or "").strip()
    if len(code) < 8:
        raise ValueError("授权码格式不正确")
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            row = _fetch_auth_code(c, code)
            if not row:
                raise ValueError("授权码不存在")
            c.execute(
                """SELECT u.id, u.username
                   FROM auth_code_activations aca
                   JOIN users u ON u.id = aca.user_id
                   WHERE aca.auth_code_id=%s
                   ORDER BY aca.activated_at DESC, aca.id DESC
                   LIMIT 1""",
                (row["id"],),
            )
            user = c.fetchone()
            if user:
                profile = get_member_profile(user["id"])
                if not profile:
                    raise ValueError("账号数据异常，请联系管理员")
                return profile
            _validate_auth_code_row(row)
            raise ValueError("授权码尚未开通，请购买会员完成首次开通")
    finally:
        conn.close()


def change_password(user_id: int, new_password: str, current_password: str | None = None) -> None:
    if len(new_password or "") < 6:
        raise ValueError("新密码至少 6 位")
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute("SELECT password_hash FROM users WHERE id=%s", (user_id,))
            row = c.fetchone()
            if not row:
                raise ValueError("用户不存在")
            if current_password and not _verify_password(current_password, row["password_hash"]):
                raise ValueError("当前密码不正确")
            c.execute(
                "UPDATE users SET password_hash=%s WHERE id=%s",
                (_hash_password(new_password), user_id),
            )
        conn.commit()
    finally:
        conn.close()


def renew_with_auth_code(user_id: int, code: str) -> dict:
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            row = _validate_auth_code_row(_fetch_auth_code(c, code))
            c.execute(
                "SELECT 1 FROM auth_code_activations WHERE auth_code_id=%s AND user_id=%s",
                (row["id"], user_id),
            )
            if c.fetchone():
                raise ValueError("您已使用过此授权码")
            from cloud_deploy.cloud_api.payment_plans import is_addon_plan

            if is_addon_plan(row["plan_code"]):
                extend_info = {
                    "stacked": False,
                    "previous_days_remaining": 0,
                    "days_added": 0,
                    "expires_at": _now(),
                }
            else:
                extend_info = _extend_membership(c, user_id, row["plan_code"], row["duration_days"])
            c.execute(
                "INSERT INTO auth_code_activations (auth_code_id, user_id) VALUES (%s,%s)",
                (row["id"], user_id),
            )
            c.execute(
                "UPDATE auth_codes SET current_activations=current_activations+1, status='active' WHERE id=%s",
                (row["id"],),
            )
        conn.commit()
        profile = get_member_profile(user_id) or {}
        profile["renew_stack"] = {
            "stacked": extend_info["stacked"],
            "previous_days_remaining": extend_info["previous_days_remaining"],
            "days_added": extend_info["days_added"],
            "expires_at": extend_info["expires_at"].strftime("%Y-%m-%d %H:%M:%S"),
        }
        return profile
    finally:
        conn.close()


def get_addon_credits(user_id: int, addon_type: str = "custom_analysis") -> int:
    addon_type = (addon_type or "custom_analysis").strip() or "custom_analysis"
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                "SELECT credits FROM user_addon_credits WHERE user_id=%s AND addon_type=%s",
                (user_id, addon_type),
            )
            row = c.fetchone()
            return int(row["credits"]) if row else 0
    finally:
        conn.close()


def add_addon_credits(
    user_id: int,
    addon_type: str,
    amount: int,
    *,
    source: str = "",
    ref_id: str = "",
) -> int:
    addon_type = (addon_type or "custom_analysis").strip() or "custom_analysis"
    delta = int(amount or 0)
    if delta <= 0:
        return get_addon_credits(user_id, addon_type)
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """INSERT INTO user_addon_credits (user_id, addon_type, credits, updated_at)
                   VALUES (%s, %s, %s, NOW())
                   ON CONFLICT (user_id, addon_type) DO UPDATE
                   SET credits = user_addon_credits.credits + EXCLUDED.credits,
                       updated_at = NOW()
                   RETURNING credits""",
                (user_id, addon_type, delta),
            )
            balance = int(c.fetchone()["credits"])
            c.execute(
                """INSERT INTO user_addon_credit_log
                   (user_id, addon_type, delta, balance_after, source, ref_id)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (user_id, addon_type, delta, balance, (source or "")[:255], (ref_id or "")[:64]),
            )
        conn.commit()
        return balance
    finally:
        conn.close()


def consume_addon_credit(user_id: int, addon_type: str = "custom_analysis") -> bool:
    addon_type = (addon_type or "custom_analysis").strip() or "custom_analysis"
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """UPDATE user_addon_credits
                   SET credits = credits - 1, updated_at = NOW()
                   WHERE user_id=%s AND addon_type=%s AND credits > 0
                   RETURNING credits""",
                (user_id, addon_type),
            )
            row = c.fetchone()
            if not row:
                conn.rollback()
                return False
            balance = int(row["credits"])
            c.execute(
                """INSERT INTO user_addon_credit_log
                   (user_id, addon_type, delta, balance_after, source, ref_id)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (user_id, addon_type, -1, balance, "consume", ""),
            )
        conn.commit()
        return True
    finally:
        conn.close()


def fulfill_addon_order(user_id: int, code: str, plan_code: str) -> dict:
    """定制分析等加购订单：核销授权码并写入按次额度，不延长会员。"""
    from cloud_deploy.cloud_api.payment_plans import PLAN_BY_CODE

    profile = renew_with_auth_code(user_id, code)
    plan = PLAN_BY_CODE.get(str(plan_code or "").strip()) or {}
    tpl = plan.get("entitlements_template") or {}
    addon = str(tpl.get("addon") or "custom_analysis")
    credit = int(tpl.get("custom_analysis_credit") or 0)
    if credit > 0:
        balance = add_addon_credits(user_id, addon, credit, source="addon_order", ref_id=code)
        profile["custom_analysis_credits"] = balance
    else:
        profile["custom_analysis_credits"] = get_addon_credits(user_id, addon)
    return profile


def renew_with_credentials(username: str, password: str, code: str) -> dict:
    """已注册用户用账号密码 + 新授权码续费/叠加时长。"""
    user = authenticate_user(username, password)
    if not user:
        raise ValueError("用户名或密码错误")
    return renew_with_auth_code(user["id"], code)


def get_member_profile(user_id: int) -> dict | None:
    member = get_active_member(user_id)
    if not member:
        conn = _conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
                c.execute("SET search_path TO xhs_monitor, public")
                c.execute("SELECT username, email FROM users WHERE id=%s", (user_id,))
                u = c.fetchone()
                if not u:
                    return None
                c.execute(
                    """SELECT plan_code, expires_at, status FROM memberships
                       WHERE user_id=%s ORDER BY id DESC LIMIT 1""",
                    (user_id,),
                )
                m = c.fetchone()
                if not m:
                    return None
                days = _days_until(m["expires_at"])
                return {
                    "id": user_id,
                    "username": u["username"],
                    "email": (u.get("email") or "").strip(),
                    "plan_code": m["plan_code"],
                    "plan_label": PLAN_LABELS.get(m["plan_code"], m["plan_code"]),
                    "expires_at": m["expires_at"].strftime("%Y-%m-%d %H:%M:%S"),
                    "status": m["status"],
                    "days_remaining": days,
                    "is_active": False,
                    "expiry_warning": "会员已过期，请使用下方「微信扫码续费」",
                }
        finally:
            conn.close()
    member["plan_label"] = PLAN_LABELS.get(
        member.get("plan_code", ""), member.get("plan_code", "")
    )
    member["is_active"] = True
    member["status"] = "active"
    days = member.get("days_remaining", 0)
    if days <= 0:
        member["expiry_warning"] = "会员今日到期，请尽快续费"
    elif days <= 7:
        member["expiry_warning"] = f"会员将在 {days} 天后到期"
    else:
        member["expiry_warning"] = ""
    member.setdefault("email", "")
    return member


def list_report_library(user_id: int | None = None) -> dict:
    """历史报告库 — Legacy zip 在 XHS_LEGACY_ZIP_DISABLED=1 时仅返回 ai_advisor。"""
    from cloud_deploy.cloud_api.member_entitlements import legacy_zip_globally_disabled

    archive_map = {"ai_advisor": "member_ai_advisor_zip"}
    if not legacy_zip_globally_disabled():
        archive_map.update(
            {
                "daily": "member_daily_zip",
                "weekly": "member_weekly_zip",
                "monthly": "member_monthly_zip",
                "custom": "member_custom_zip",
            }
        )
    out: dict = {}
    total = 0
    for key, archive_type in archive_map.items():
        try:
            rows = list_archives(archive_type)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("list_archives(%s) failed: %s", archive_type, e)
            rows = []
        out[key] = rows
        total += len(rows)
    out["total_count"] = total
    if user_id:
        ent = get_member_entitlements(user_id)
        if ent:
            out = filter_report_library_by_entitlements(out, ent)
    return out


def list_member_watchlist(user_id: int, limit: int = 500) -> list:
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """SELECT goods_id, title, store_name, source, meta_json, created_at, updated_at
                   FROM member_watchlist
                   WHERE user_id=%s
                   ORDER BY updated_at DESC
                   LIMIT %s""",
                (user_id, limit),
            )
            rows = c.fetchall()
        out = []
        for r in rows:
            item = {
                "goods_id": r["goods_id"],
                "title": r.get("title") or "",
                "store_name": r.get("store_name") or "",
                "source": r.get("source") or "",
                "created_at": r["created_at"].isoformat() if r.get("created_at") else "",
                "updated_at": r["updated_at"].isoformat() if r.get("updated_at") else "",
            }
            meta = r.get("meta_json")
            if isinstance(meta, dict):
                item["meta"] = meta
            out.append(item)
        return out
    finally:
        conn.close()


def upsert_member_watchlist(user_id: int, items: list, source: str = "") -> dict:
    if not items:
        return {"upserted": 0}
    conn = _conn()
    upserted = 0
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            for raw in items:
                if not isinstance(raw, dict):
                    continue
                gid = str(raw.get("goods_id") or raw.get("product_id") or "").strip()
                if not gid:
                    continue
                title = str(raw.get("title") or raw.get("product_name") or "")[:500]
                store = str(raw.get("store_name") or "")[:256]
                src = str(raw.get("source") or source or "")[:128]
                meta = {
                    k: raw[k]
                    for k in ("price", "sold", "actual_v1d", "report_id", "report_date")
                    if raw.get(k) is not None
                }
                c.execute(
                    """INSERT INTO member_watchlist
                       (user_id, goods_id, title, store_name, source, meta_json, updated_at)
                       VALUES (%s,%s,%s,%s,%s,%s,NOW())
                       ON CONFLICT (user_id, goods_id) DO UPDATE SET
                         title=EXCLUDED.title,
                         store_name=EXCLUDED.store_name,
                         source=CASE WHEN EXCLUDED.source<>'' THEN EXCLUDED.source ELSE member_watchlist.source END,
                         meta_json=EXCLUDED.meta_json,
                         updated_at=NOW()""",
                    (user_id, gid, title, store, src, json.dumps(meta) if meta else None),
                )
                upserted += 1
        conn.commit()
        return {"upserted": upserted}
    finally:
        conn.close()


def delete_member_watchlist(user_id: int, goods_ids: list) -> int:
    clean = [str(g).strip() for g in goods_ids if str(g).strip()]
    if not clean:
        return 0
    conn = _conn()
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                "DELETE FROM member_watchlist WHERE user_id=%s AND goods_id = ANY(%s)",
                (user_id, clean),
            )
            removed = c.rowcount
        conn.commit()
        return removed
    finally:
        conn.close()


def _fmt_ts(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return _as_utc(value).strftime("%Y-%m-%d %H:%M:%S")
    return str(value)


def _payment_order_row(row) -> dict | None:
    if not row:
        return None
    return {
        "id": row["id"],
        "order_no": row["order_no"],
        "user_id": row["user_id"],
        "plan_code": row["plan_code"],
        "duration_days": row["duration_days"],
        "amount": str(row["amount"]),
        "channel": row["channel"],
        "status": row["status"],
        "qrcode": row["qrcode"],
        "payurl": row["payurl"],
        "gateway_trade_no": row["gateway_trade_no"],
        "auth_code": row["auth_code"],
        "client_ip": row["client_ip"],
        "fulfilled_user_id": row["fulfilled_user_id"],
        "meta_json": row["meta_json"],
        "created_at": _fmt_ts(row["created_at"]),
        "expires_at": _fmt_ts(row["expires_at"]),
        "paid_at": _fmt_ts(row["paid_at"]),
    }


def insert_payment_order(
    *,
    order_no: str,
    user_id: int | None,
    plan_code: str,
    duration_days: int,
    amount: str,
    channel: str,
    client_ip: str,
    expires_at: str,
) -> None:
    conn = _conn()
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """INSERT INTO payment_orders
                   (order_no, user_id, plan_code, duration_days, amount, channel, status,
                    client_ip, expires_at)
                   VALUES (%s,%s,%s,%s,%s,%s,'pending',%s,%s::timestamp)""",
                (order_no, user_id, plan_code, duration_days, amount, channel, client_ip, expires_at),
            )
        conn.commit()
    finally:
        conn.close()


def update_payment_order_gateway(
    order_no: str,
    *,
    qrcode: str = "",
    payurl: str = "",
    gateway_trade_no: str = "",
) -> None:
    conn = _conn()
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """UPDATE payment_orders SET qrcode=%s, payurl=%s, gateway_trade_no=%s
                   WHERE order_no=%s AND status='pending'""",
                (qrcode or None, payurl or None, gateway_trade_no or None, order_no),
            )
        conn.commit()
    finally:
        conn.close()


def get_payment_order(order_no: str) -> dict | None:
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute("SELECT * FROM payment_orders WHERE order_no=%s", (order_no,))
            row = c.fetchone()
        return _payment_order_row(row)
    finally:
        conn.close()


def expire_stale_payment_order(order_no: str) -> None:
    conn = _conn()
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """UPDATE payment_orders SET status='expired'
                   WHERE order_no=%s AND status='pending' AND expires_at < NOW()""",
                (order_no,),
            )
        conn.commit()
    finally:
        conn.close()


def mark_payment_order_paid(
    order_no: str,
    *,
    gateway_trade_no: str,
    auth_code: str,
    paid_at: str,
) -> bool:
    conn = _conn()
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """UPDATE payment_orders
                   SET status='paid', gateway_trade_no=%s, auth_code=%s, paid_at=%s::timestamp
                   WHERE order_no=%s AND status='pending'""",
                (gateway_trade_no or None, auth_code, paid_at, order_no),
            )
            ok = c.rowcount > 0
        conn.commit()
        return ok
    finally:
        conn.close()


def mark_payment_order_paid_force(
    order_no: str,
    *,
    gateway_trade_no: str,
    auth_code: str,
    paid_at: str,
) -> bool:
    """已付款但订单 pending/expired 时强制标记为 paid（补单）。"""
    conn = _conn()
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """UPDATE payment_orders
                   SET status='paid', gateway_trade_no=%s, auth_code=%s, paid_at=%s::timestamp
                   WHERE order_no=%s AND status IN ('pending', 'expired')""",
                (gateway_trade_no or None, auth_code, paid_at, order_no),
            )
            ok = c.rowcount > 0
        conn.commit()
        return ok
    finally:
        conn.close()


def mark_payment_order_fulfilled(order_no: str, user_id: int) -> None:
    conn = _conn()
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                "UPDATE payment_orders SET fulfilled_user_id=%s WHERE order_no=%s",
                (user_id, order_no),
            )
        conn.commit()
    finally:
        conn.close()


def get_user_by_email(email: str) -> dict | None:
    addr = (email or "").strip().lower()
    if not addr:
        return None
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                "SELECT id, username, email FROM users WHERE LOWER(email)=%s",
                (addr,),
            )
            row = c.fetchone()
            return dict(row) if row else None
    finally:
        conn.close()


def set_user_email(user_id: int, email: str) -> None:
    addr = (email or "").strip().lower()
    if not addr or "@" not in addr:
        raise ValueError("请输入有效邮箱")
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                "SELECT id FROM users WHERE LOWER(email)=%s AND id!=%s",
                (addr, user_id),
            )
            if c.fetchone():
                raise ValueError("该邮箱已被其他账号绑定")
            c.execute("UPDATE users SET email=%s WHERE id=%s", (addr, user_id))
        conn.commit()
    finally:
        conn.close()


def create_password_reset_token(user_id: int, token_hash: str, hours: int = 2) -> None:
    conn = _conn()
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                "DELETE FROM password_reset_tokens WHERE user_id=%s AND used_at IS NULL",
                (user_id,),
            )
            c.execute(
                """INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
                   VALUES (%s, %s, NOW() + (%s || ' hours')::interval)""",
                (user_id, token_hash, str(int(hours))),
            )
        conn.commit()
    finally:
        conn.close()


def consume_password_reset_token(token_hash: str) -> int | None:
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """SELECT id, user_id FROM password_reset_tokens
                   WHERE token_hash=%s AND used_at IS NULL AND expires_at >= NOW()""",
                (token_hash,),
            )
            row = c.fetchone()
            if not row:
                return None
            c.execute(
                "UPDATE password_reset_tokens SET used_at=NOW() WHERE id=%s",
                (row["id"],),
            )
            user_id = int(row["user_id"])
        conn.commit()
        return user_id
    finally:
        conn.close()


def create_member_feedback(
    *,
    user_id: int,
    username: str,
    category: str,
    content: str,
    contact: str = "",
    app_version: str = "",
    machine_id: str = "",
    client_ip: str = "",
) -> dict:
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """INSERT INTO member_feedback
                   (user_id, username, category, content, contact, app_version, machine_id, client_ip)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, NULLIF(%s, '')::inet)
                   RETURNING id, created_at""",
                (
                    user_id,
                    (username or "")[:64],
                    (category or "suggestion")[:32],
                    (content or "")[:8000],
                    (contact or "")[:255],
                    (app_version or "")[:32],
                    (machine_id or "")[:64],
                    (client_ip or "")[:64],
                ),
            )
            row = c.fetchone()
        conn.commit()
        return {"id": int(row["id"]), "created_at": str(row["created_at"])}
    finally:
        conn.close()


def create_member_keyword_request(
    *,
    user_id: int,
    username: str,
    keywords: str,
    note: str = "",
    app_version: str = "",
    machine_id: str = "",
    client_ip: str = "",
) -> dict:
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """INSERT INTO member_keyword_requests
                   (user_id, username, keywords, note, app_version, machine_id, client_ip)
                   VALUES (%s, %s, %s, %s, %s, %s, NULLIF(%s, '')::inet)
                   RETURNING id, created_at""",
                (
                    user_id,
                    (username or "")[:64],
                    (keywords or "")[:4000],
                    (note or "")[:2000],
                    (app_version or "")[:32],
                    (machine_id or "")[:64],
                    (client_ip or "")[:64],
                ),
            )
            row = c.fetchone()
        conn.commit()
        return {"id": int(row["id"]), "created_at": str(row["created_at"])}
    finally:
        conn.close()


def _row_ts(row: dict, key: str = "created_at") -> str:
    val = row.get(key)
    return val.isoformat() if hasattr(val, "isoformat") else str(val or "")


def list_member_feedback(*, limit: int = 100, status: str | None = None) -> list:
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            if status:
                c.execute(
                    """SELECT * FROM member_feedback WHERE status=%s
                       ORDER BY created_at DESC LIMIT %s""",
                    (status[:16], min(max(limit, 1), 500)),
                )
            else:
                c.execute(
                    "SELECT * FROM member_feedback ORDER BY created_at DESC LIMIT %s",
                    (min(max(limit, 1), 500),),
                )
            rows = c.fetchall() or []
        out = []
        for r in rows:
            item = dict(r)
            item["created_at"] = _row_ts(item)
            item["updated_at"] = _row_ts(item, "updated_at")
            if item.get("client_ip") is not None:
                item["client_ip"] = str(item["client_ip"])
            out.append(item)
        return out
    finally:
        conn.close()


def list_member_keyword_requests(*, limit: int = 100, status: str | None = None) -> list:
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c:
            c.execute("SET search_path TO xhs_monitor, public")
            if status:
                c.execute(
                    """SELECT * FROM member_keyword_requests WHERE status=%s
                       ORDER BY created_at DESC LIMIT %s""",
                    (status[:16], min(max(limit, 1), 500)),
                )
            else:
                c.execute(
                    "SELECT * FROM member_keyword_requests ORDER BY created_at DESC LIMIT %s",
                    (min(max(limit, 1), 500),),
                )
            rows = c.fetchall() or []
        out = []
        for r in rows:
            item = dict(r)
            item["created_at"] = _row_ts(item)
            item["updated_at"] = _row_ts(item, "updated_at")
            if item.get("client_ip") is not None:
                item["client_ip"] = str(item["client_ip"])
            out.append(item)
        return out
    finally:
        conn.close()


def update_member_feedback(item_id: int, *, status: str | None = None, admin_note: str | None = None) -> bool:
    conn = _conn()
    try:
        sets = ["updated_at = NOW()"]
        params: list = []
        if status is not None:
            sets.append("status = %s")
            params.append(status[:16])
        if admin_note is not None:
            sets.append("admin_note = %s")
            params.append((admin_note or "")[:2000])
        if len(sets) <= 1:
            return False
        params.append(int(item_id))
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                f"UPDATE member_feedback SET {', '.join(sets)} WHERE id = %s",
                params,
            )
            ok = c.rowcount > 0
        conn.commit()
        return ok
    finally:
        conn.close()


def update_member_keyword_request(item_id: int, *, status: str | None = None, admin_note: str | None = None) -> bool:
    conn = _conn()
    try:
        sets = ["updated_at = NOW()"]
        params: list = []
        if status is not None:
            sets.append("status = %s")
            params.append(status[:16])
        if admin_note is not None:
            sets.append("admin_note = %s")
            params.append((admin_note or "")[:2000])
        if len(sets) <= 1:
            return False
        params.append(int(item_id))
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                f"UPDATE member_keyword_requests SET {', '.join(sets)} WHERE id = %s",
                params,
            )
            ok = c.rowcount > 0
        conn.commit()
        return ok
    finally:
        conn.close()


def has_member_broadcast_ack(user_id: int, broadcast_id: str) -> bool:
    conn = _conn()
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                "SELECT 1 FROM member_broadcast_acks WHERE user_id=%s AND broadcast_id=%s LIMIT 1",
                (int(user_id), str(broadcast_id)[:64]),
            )
            return c.fetchone() is not None
    finally:
        conn.close()


def ack_member_broadcast(user_id: int, broadcast_id: str) -> bool:
    conn = _conn()
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                """
                INSERT INTO member_broadcast_acks (user_id, broadcast_id)
                VALUES (%s, %s)
                ON CONFLICT (user_id, broadcast_id) DO NOTHING
                """,
                (int(user_id), str(broadcast_id)[:64]),
            )
            ok = c.rowcount > 0
        conn.commit()
        return ok
    finally:
        conn.close()
