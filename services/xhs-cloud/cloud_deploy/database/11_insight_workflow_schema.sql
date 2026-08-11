-- T2：工作流进货回填（ADD ONLY）
SET search_path TO xhs_monitor, public;

CREATE TABLE IF NOT EXISTS member_insight_workflow (
    id              BIGSERIAL PRIMARY KEY,
    user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category        VARCHAR(64) NOT NULL,
    report_date     DATE,
    status          VARCHAR(32) NOT NULL DEFAULT 'viewed',
    outcome         VARCHAR(32),
    note            TEXT,
    remind_at       DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_miw_user_updated
    ON member_insight_workflow (user_id, updated_at DESC);
