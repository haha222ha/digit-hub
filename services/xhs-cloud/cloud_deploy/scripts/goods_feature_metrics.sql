-- -*- sql -*-
-- goods_feature_metrics: PG 端预计算的增速 / 加速度 / 连续上榜天数
-- 对应需求文档 48 §P2（Feature Engine PG 改造）
--
-- 约束:
--   1. 计算表与爬虫写表分离 — 爬虫仅写 premium_goods_daily / premium_report_rank
--   2. READ COMMITTED 事务隔离 — 不阻塞爬虫写入
--   3. ON CONFLICT DO UPDATE — 幂等，安全重跑
--   4. 仅对日增量 >= 1 的商品计算
--   5. 03:00 定时执行，错开爬虫写入高峰 (19:00-22:00)

-- ============================================================
-- 1. 建表
-- ============================================================
CREATE TABLE IF NOT EXISTS xhs_monitor.goods_feature_metrics (
    goods_id          TEXT NOT NULL,
    snap_date         TEXT NOT NULL,
    -- 基础字段（从 premium_goods_daily 继承）
    sold_num          INTEGER DEFAULT 0,
    delta             INTEGER DEFAULT 0,           -- 日增量
    velocity_1d       DOUBLE PRECISION DEFAULT 0,  -- 日增速（继承）
    -- 预计算指标
    growth_rate       DOUBLE PRECISION DEFAULT 0,  -- 增速 = (今日sold - 昨日sold) / 昨日sold
    acceleration      DOUBLE PRECISION DEFAULT 0,  -- 加速度 = 今日growth_rate - 昨日growth_rate
    consecutive_days  INTEGER DEFAULT 0,           -- 连续上榜天数（从 premium_report_rank 计算）
    -- 元数据
    updated_at        TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
    PRIMARY KEY (goods_id, snap_date)
);

CREATE INDEX IF NOT EXISTS idx_gfm_date ON xhs_monitor.goods_feature_metrics (snap_date);
CREATE INDEX IF NOT EXISTS idx_gfm_goods ON xhs_monitor.goods_feature_metrics (goods_id, snap_date DESC);
CREATE INDEX IF NOT EXISTS idx_gfm_growth ON xhs_monitor.goods_feature_metrics (snap_date, growth_rate DESC);
CREATE INDEX IF NOT EXISTS idx_gfm_accel ON xhs_monitor.goods_feature_metrics (snap_date, acceleration DESC);
CREATE INDEX IF NOT EXISTS idx_gfm_consec ON xhs_monitor.goods_feature_metrics (snap_date, consecutive_days DESC);

-- ============================================================
-- 2. 计算增速 growth_rate（从 premium_goods_daily 自连接）
--    仅对 delta >= 1 的商品计算
--    growth_rate = (今日 sold_num - 昨日 sold_num) / 昨日 sold_num
-- ============================================================
INSERT INTO xhs_monitor.goods_feature_metrics (
    goods_id, snap_date, sold_num, delta, velocity_1d,
    growth_rate, acceleration, consecutive_days, updated_at
)
SELECT
    cur.goods_id,
    cur.snap_date,
    cur.sold_num,
    cur.delta,
    cur.velocity_1d,
    CASE
        WHEN prev.sold_num IS NOT NULL AND prev.sold_num > 0
        THEN ROUND(
            (cur.sold_num - prev.sold_num)::NUMERIC / prev.sold_num, 6
        )
        ELSE 0
    END AS growth_rate,
    0 AS acceleration,  -- 先占位，步骤 3 更新
    0 AS consecutive_days,  -- 先占位，步骤 4 更新
    to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')
FROM xhs_monitor.premium_goods_daily cur
LEFT JOIN xhs_monitor.premium_goods_daily prev
    ON prev.goods_id = cur.goods_id
    AND prev.snap_date = to_char(
        (to_date(cur.snap_date, 'YYYY-MM-DD') - INTERVAL '1 day')::DATE,
        'YYYY-MM-DD'
    )
WHERE cur.delta >= 1
ON CONFLICT (goods_id, snap_date) DO UPDATE SET
    sold_num = EXCLUDED.sold_num,
    delta = EXCLUDED.delta,
    velocity_1d = EXCLUDED.velocity_1d,
    growth_rate = EXCLUDED.growth_rate,
    updated_at = EXCLUDED.updated_at;

-- ============================================================
-- 3. 计算加速度 acceleration（从 goods_feature_metrics 自连接）
--    acceleration = 今日 growth_rate - 昨日 growth_rate
-- ============================================================
UPDATE xhs_monitor.goods_feature_metrics cur
SET acceleration = CASE
        WHEN COALESCE(prev.growth_rate, 0) != 0 AND cur.growth_rate != 0
        THEN ROUND((cur.growth_rate - prev.growth_rate)::NUMERIC, 6)
        ELSE 0
    END,
    updated_at = to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')
FROM xhs_monitor.goods_feature_metrics prev
WHERE prev.goods_id = cur.goods_id
    AND prev.snap_date = to_char(
        (to_date(cur.snap_date, 'YYYY-MM-DD') - INTERVAL '1 day')::DATE,
        'YYYY-MM-DD'
    );

-- ============================================================
-- 4. 计算连续上榜天数 consecutive_days（gaps and islands）
--    从 premium_report_rank 统计商品连续出现在榜单上的天数
--    窗口: 近 90 天
-- ============================================================
WITH ranked AS (
    SELECT
        goods_id,
        report_date,
        -- 行号差用于识别连续段（gaps and islands）
        ROW_NUMBER() OVER (PARTITION BY goods_id ORDER BY report_date) AS rn,
        report_date::DATE
            - (ROW_NUMBER() OVER (PARTITION BY goods_id ORDER BY report_date) || ' day')::INTERVAL
            AS grp_start
    FROM xhs_monitor.premium_report_rank
    WHERE report_date >= to_char(
        (CURRENT_DATE - INTERVAL '90 day')::DATE, 'YYYY-MM-DD'
    )
),
islands AS (
    SELECT
        goods_id,
        grp_start,
        COUNT(*) AS consecutive_days,
        MAX(report_date) AS last_date
    FROM ranked
    GROUP BY goods_id, grp_start
),
-- 取最近一段连续上榜的天数
latest_island AS (
    SELECT DISTINCT ON (goods_id)
        goods_id,
        consecutive_days,
        last_date
    FROM islands
    ORDER BY goods_id, last_date DESC
)
UPDATE xhs_monitor.goods_feature_metrics cur
SET consecutive_days = COALESCE(li.consecutive_days, 0),
    updated_at = to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')
FROM latest_island li
WHERE li.goods_id = cur.goods_id;
