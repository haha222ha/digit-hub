-- Phase T1: 留存 + PG 预聚合（ADD ONLY，可安全重复执行）
-- 执行: psql "$XHS_DATABASE_URL" -f cloud_deploy/database/09_retention_pg_schema.sql
-- 关联: doc 27 REQ-PG-* / REQ-RET-010

SET search_path TO xhs_monitor, public;

-- 类目日指标预聚合（LLM 读此表 + 7 日趋势，不扫 raw）
CREATE TABLE IF NOT EXISTS daily_category_metrics (
    id                  BIGSERIAL PRIMARY KEY,
    report_date         DATE NOT NULL,
    category            VARCHAR(64) NOT NULL,
    sub_category        VARCHAR(64) NOT NULL DEFAULT '',
    sample_size         INT,
    growth_rate_pct     NUMERIC(6,2),
    competition_index   INT,
    blue_ocean_score    INT,
    heat_score          INT,
    new_product_score   INT,
    season_score        INT,
    price_band          TEXT,
    avg_price           NUMERIC(10,2),
    price_diversity     NUMERIC(6,2),
    lifecycle_stage     TEXT,
    trend_label         TEXT,
    formula_version     TEXT NOT NULL DEFAULT 'v2.2',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (report_date, category, sub_category)
);

CREATE INDEX IF NOT EXISTS idx_dcm_date_cat
    ON daily_category_metrics (report_date DESC, category);

CREATE INDEX IF NOT EXISTS idx_dcm_cat_date
    ON daily_category_metrics (category, report_date DESC);

-- 用户行为（个性化 / 健康度 / 转化漏斗）
CREATE TABLE IF NOT EXISTS user_behavior (
    id          BIGSERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action      VARCHAR(32) NOT NULL,
    category    VARCHAR(64),
    report_date DATE,
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ub_user_time
    ON user_behavior (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ub_action_cat
    ON user_behavior (action, category)
    WHERE category IS NOT NULL;

-- L1 精确缓存（metrics_hash + prompt_version → report_json）
CREATE TABLE IF NOT EXISTS insight_report_cache (
    id              BIGSERIAL PRIMARY KEY,
    metrics_hash    VARCHAR(64) NOT NULL,
    prompt_version  VARCHAR(32) NOT NULL DEFAULT 'v1',
    report_json     JSONB NOT NULL,
    llm_tokens_used INT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (metrics_hash, prompt_version)
);

CREATE INDEX IF NOT EXISTS idx_irc_hash
    ON insight_report_cache (metrics_hash);
