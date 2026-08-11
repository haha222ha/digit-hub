-- T2: pgvector 类目嵌入（ADD ONLY，需 CREATE EXTENSION vector）
-- 执行前: CREATE EXTENSION IF NOT EXISTS vector;
-- 关联: doc 27 REQ-RET-020

SET search_path TO xhs_monitor, public;

CREATE TABLE IF NOT EXISTS category_embeddings (
    id          BIGSERIAL PRIMARY KEY,
    category    VARCHAR(64) NOT NULL,
    sub_category VARCHAR(64) NOT NULL DEFAULT '',
    model       VARCHAR(64) NOT NULL DEFAULT 'text-embedding-3-small',
    embedding   vector(768),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (category, sub_category, model)
);

CREATE INDEX IF NOT EXISTS idx_ce_category ON category_embeddings (category);

-- 相似类目查询示例（需 pgvector）:
-- SELECT category, 1 - (embedding <=> $1) AS score
-- FROM category_embeddings ORDER BY embedding <=> $1 LIMIT 3;
