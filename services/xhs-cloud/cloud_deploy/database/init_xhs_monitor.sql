-- xhs_monitor schema（与 vuemonitor public 隔离）
-- 执行方式见 cloud_deploy/database/README.md
-- 需要 PostgreSQL 超级用户或具备 CREATE ROLE 权限

CREATE SCHEMA IF NOT EXISTS xhs_monitor;

-- 若用户已存在可跳过
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'xhs_monitor_user') THEN
    CREATE ROLE xhs_monitor_user WITH LOGIN PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE vuemonitor TO xhs_monitor_user;
GRANT USAGE ON SCHEMA xhs_monitor TO xhs_monitor_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA xhs_monitor GRANT ALL ON TABLES TO xhs_monitor_user;

SET search_path TO xhs_monitor, public;

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
    shop_fsr NUMERIC(8,4),
    goods_fsr NUMERIC(8,4),
    behavior VARCHAR(128),
    is_virtual BOOLEAN,
    base_hours NUMERIC(8,2),
    base_at TIMESTAMPTZ,
    anomaly VARCHAR(64),
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

CREATE INDEX IF NOT EXISTS idx_rdi_date_v1d ON report_daily_items(report_date, v1d DESC);
CREATE INDEX IF NOT EXISTS idx_rdi_goods ON report_daily_items(goods_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_active ON monitor_goods(monitor_status, last_v1d DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_v1d ON monitor_goods(last_v1d DESC) WHERE last_v1d > 0;
CREATE INDEX IF NOT EXISTS idx_gss_time ON goods_sold_snapshots(snapshot_time);
CREATE INDEX IF NOT EXISTS idx_gss_goods ON goods_sold_snapshots(goods_id, snapshot_time DESC);
CREATE INDEX IF NOT EXISTS idx_ma_goods ON monitor_alerts(goods_id, created_at DESC);

GRANT ALL ON ALL TABLES IN SCHEMA xhs_monitor TO xhs_monitor_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA xhs_monitor TO xhs_monitor_user;
