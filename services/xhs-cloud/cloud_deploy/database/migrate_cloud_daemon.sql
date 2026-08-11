SET search_path TO xhs_monitor, public;

ALTER TABLE monitor_goods
    ADD COLUMN IF NOT EXISTS last_scan_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_scan_status VARCHAR(16),
    ADD COLUMN IF NOT EXISTS last_scan_engine VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_monitor_scan_pending
    ON monitor_goods (monitor_status, last_scan_at NULLS FIRST, priority_score DESC);

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
);
