-- PR-1: V2 情报相关表（ADD ONLY，可安全重复执行）
-- 执行: psql "$XHS_DATABASE_URL" -f cloud_deploy/database/08_insight_v2_tables.sql

SET search_path TO xhs_monitor, public;

-- REQ-PROD-006：情报类目日配额
CREATE TABLE IF NOT EXISTS insight_daily_usage (
    id              SERIAL PRIMARY KEY,
    user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    usage_date      DATE NOT NULL,
    generated_count INT NOT NULL DEFAULT 0,
    categories      JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_insight_daily_usage_user_date
    ON insight_daily_usage (user_id, usage_date DESC);

-- 类目关注（与 member_watchlist 商品收藏并存）
CREATE TABLE IF NOT EXISTS member_insight_watchlist (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category    VARCHAR(64) NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_member_insight_watchlist_user
    ON member_insight_watchlist (user_id);

-- 可选：预生成情报元数据（Phase 2 写入）
CREATE TABLE IF NOT EXISTS insight_reports (
    id           SERIAL PRIMARY KEY,
    report_date  DATE NOT NULL,
    category     VARCHAR(64) NOT NULL,
    archive_path TEXT,
    summary_json JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (report_date, category)
);

CREATE INDEX IF NOT EXISTS idx_insight_reports_date
    ON insight_reports (report_date DESC);

-- Admin 后台可配置项（LLM Key 等，加密存储）
CREATE TABLE IF NOT EXISTS system_settings (
    key             VARCHAR(64) PRIMARY KEY,
    value_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
