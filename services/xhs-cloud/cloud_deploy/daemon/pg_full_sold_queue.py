# -*- coding: utf-8 -*-
"""
PG 版 ⑥ 补缺队列 — 对齐 xhs_full_sold_queue_db，数据源为 monitor_goods。
"""
from __future__ import annotations

import logging
import os
from datetime import date, datetime

from cloud_deploy.cloud_api.database_pg import _conn, init_db

_logger = logging.getLogger(__name__)

DEFAULT_SMALL_POOL_THRESHOLD = 50_000

QUEUE_DDL = """
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
"""


def _today() -> str:
    return date.today().isoformat()


def _ensure_queue_table(c) -> None:
    c.execute("SET search_path TO xhs_monitor, public")
    for stmt in QUEUE_DDL.strip().split(";"):
        s = stmt.strip()
        if s:
            c.execute(s)


def _min_sold_value(min_sold: int | None) -> int:
    return 0 if min_sold is None else int(min_sold)


def _sold_filter_sql(min_sold: int | None) -> tuple[str, tuple]:
    """min_sold<=0 时不按销量过滤（全量监控）。"""
    ms = _min_sold_value(min_sold)
    if ms <= 0:
        return "", ()
    return " AND COALESCE(m.last_sold,0) >= %s", (ms,)


def _eligible_monitor_sql(low_v1d_only: bool, skip_today: bool) -> tuple[str, str]:
    v1d_filter = " AND COALESCE(m.last_v1d,0) <= 0" if low_v1d_only else ""
    skip_sql = ""
    if skip_today:
        skip_sql = """
          AND NOT EXISTS (
            SELECT 1 FROM goods_sold_snapshots s
            WHERE s.goods_id = m.goods_id
              AND s.snapshot_time::date = CURRENT_DATE
          )
        """
    return v1d_filter, skip_sql


def count_eligible_monitor(
    low_v1d_only=False,
    skip_today=True,
    min_sold=1,
) -> int:
    init_db()
    conn = _conn()
    try:
        with conn.cursor() as c:
            _ensure_queue_table(c)
            v1d_filter, skip_sql = _eligible_monitor_sql(low_v1d_only, skip_today)
            sold_sql, sold_params = _sold_filter_sql(min_sold)
            c.execute(
                f"""SELECT COUNT(*) FROM monitor_goods m
                    WHERE m.monitor_status IN ('active','idle')
                      {sold_sql}
                      {v1d_filter}
                      {skip_sql}""",
                sold_params,
            )
            return int(c.fetchone()[0] or 0)
    finally:
        conn.close()


def count_missing_from_queue(
    low_v1d_only=False,
    skip_today=True,
    min_sold=1,
    queue_date: str | None = None,
) -> int:
    """监控池候选里尚未进入今日队列的数量。"""
    qd = queue_date or _today()
    init_db()
    conn = _conn()
    try:
        with conn.cursor() as c:
            _ensure_queue_table(c)
            v1d_filter, skip_sql = _eligible_monitor_sql(low_v1d_only, skip_today)
            sold_sql, sold_params = _sold_filter_sql(min_sold)
            c.execute(
                f"""SELECT COUNT(*) FROM monitor_goods m
                    WHERE m.monitor_status IN ('active','idle')
                      {sold_sql}
                      {v1d_filter}
                      {skip_sql}
                      AND NOT EXISTS (
                        SELECT 1 FROM full_sold_queue q
                        WHERE q.goods_id = m.goods_id AND q.queue_date = %s::date
                      )""",
                (*sold_params, qd),
            )
            return int(c.fetchone()[0] or 0)
    finally:
        conn.close()


def _resolve_seed_limit(limit: int, eligible: int) -> int:
    """小监控池一次性全量 seed；大库才按 limit 分批。"""
    mode = os.environ.get("XHS_PG_SEED_MODE", "auto").strip().lower()
    batch_limit = int(limit or 0)
    threshold = int(os.environ.get("XHS_PG_SMALL_POOL_THRESHOLD", DEFAULT_SMALL_POOL_THRESHOLD))
    if mode == "full":
        return 0
    if mode == "batch":
        return batch_limit
    if eligible <= threshold:
        return 0
    return batch_limit


def _count_pending(c, qd: str) -> int:
    c.execute(
        """SELECT COUNT(*) FROM full_sold_queue
           WHERE queue_date=%s AND last_sync_at IS NULL AND frozen_at IS NULL""",
        (qd,),
    )
    return int(c.fetchone()[0] or 0)


def queue_stats(queue_date=None, queue_db=None):
    del queue_db
    qd = queue_date or _today()
    init_db()
    conn = _conn()
    try:
        with conn.cursor() as c:
            _ensure_queue_table(c)
            c.execute("SELECT COUNT(*) FROM full_sold_queue WHERE queue_date=%s", (qd,))
            total = int(c.fetchone()[0] or 0)
            c.execute(
                """SELECT COUNT(*) FROM full_sold_queue
                   WHERE queue_date=%s AND last_sync_at IS NULL AND frozen_at IS NULL""",
                (qd,),
            )
            pending = int(c.fetchone()[0] or 0)
            c.execute(
                "SELECT COUNT(*) FROM full_sold_queue WHERE queue_date=%s AND frozen_at IS NOT NULL",
                (qd,),
            )
            frozen = int(c.fetchone()[0] or 0)
        conn.commit()
        return {
            "queue_date": qd,
            "total": total,
            "pending": pending,
            "synced": max(0, total - pending - frozen),
            "frozen": frozen,
        }
    finally:
        conn.close()


def count_pending(queue_date=None, queue_db=None):
    return queue_stats(queue_date, queue_db)["pending"]


def seed_full_sold_queue(
    main_db=None,
    queue_db=None,
    low_v1d_only=False,
    skip_today=True,
    min_sold=1,
    log_func=None,
    limit=0,
):
    del main_db, queue_db
    log = log_func or (lambda _m: None)
    qd = _today()
    init_db()
    conn = _conn()
    try:
        with conn.cursor() as c:
            _ensure_queue_table(c)
            c.execute("DELETE FROM full_sold_queue WHERE queue_date < %s", (qd,))
            c.execute("SELECT COUNT(*) FROM full_sold_queue WHERE queue_date=%s", (qd,))
            existing = int(c.fetchone()[0] or 0)
            pending = _count_pending(c, qd)
            v1d_filter, skip_sql = _eligible_monitor_sql(low_v1d_only, skip_today)
            sold_sql, sold_params = _sold_filter_sql(min_sold)
            c.execute(
                f"""SELECT COUNT(*) FROM monitor_goods m
                    WHERE m.monitor_status IN ('active','idle')
                      {sold_sql}
                      {v1d_filter}
                      {skip_sql}""",
                sold_params,
            )
            eligible = int(c.fetchone()[0] or 0)
            c.execute(
                f"""SELECT COUNT(*) FROM monitor_goods m
                    WHERE m.monitor_status IN ('active','idle')
                      {sold_sql}
                      {v1d_filter}
                      {skip_sql}
                      AND NOT EXISTS (
                        SELECT 1 FROM full_sold_queue q
                        WHERE q.goods_id = m.goods_id AND q.queue_date = %s::date
                      )""",
                (*sold_params, qd),
            )
            missing = int(c.fetchone()[0] or 0)
            batch_limit = _resolve_seed_limit(limit, eligible)

            if batch_limit == 0:
                log_msg = f"PG 全量 seed: monitor 候选 {eligible:,} 条，待入队 {missing:,}"
            elif batch_limit > 0:
                log_msg = f"PG 分批 seed: 候选 {eligible:,} 条，待入队 {missing:,}，本批上限 {batch_limit:,}"
            else:
                log_msg = f"PG seed: 候选 {eligible:,} 条，待入队 {missing:,}"

            # 队列已满批上限但无 pending，且 monitor 仍有候选 → 清空重 seed（修复空转）
            if existing > 0 and pending == 0 and missing > 0:
                log(
                    f"队列 {existing:,} 条均已处理完，monitor 仍有 {missing:,} 未入队，继续增量 seed"
                )
            elif batch_limit > 0 and existing >= batch_limit and pending > 0 and missing == 0:
                log(f"补缺队列已有 {existing:,} 条 (>=批次上限 {batch_limit:,})，待扫 {pending:,}，跳过 seed")
                return existing
            elif missing == 0:
                if pending > 0:
                    log(f"队列已含全部 {eligible:,} 候选，待扫 {pending:,}，跳过 seed")
                else:
                    log("monitor 无候选商品，跳过 seed")
                return existing
            elif eligible == 0:
                log("monitor 无候选商品，跳过 seed")
                return existing

            limit_sql = f" LIMIT {batch_limit}" if batch_limit > 0 else ""
            log(log_msg)

            c.execute(
                f"""INSERT INTO full_sold_queue
                    (goods_id, title, sold_num, velocity_1d, pool, last_seen, queue_date, seeded_at)
                    SELECT m.goods_id,
                           COALESCE(m.title,''),
                           COALESCE(m.last_sold,0),
                           COALESCE(m.last_v1d,0),
                           COALESCE(m.pool,'WATCH'),
                           m.updated_at,
                           %s::date,
                           NOW()
                    FROM monitor_goods m
                    WHERE m.monitor_status IN ('active','idle')
                      {sold_sql}
                      {v1d_filter}
                      {skip_sql}
                      AND NOT EXISTS (
                        SELECT 1 FROM full_sold_queue q
                        WHERE q.goods_id = m.goods_id AND q.queue_date = %s::date
                      )
                    ORDER BY COALESCE(m.last_sold,0) DESC, m.updated_at DESC
                    {limit_sql}
                    ON CONFLICT (goods_id) DO UPDATE SET
                        queue_date=EXCLUDED.queue_date,
                        title=EXCLUDED.title,
                        sold_num=EXCLUDED.sold_num,
                        velocity_1d=EXCLUDED.velocity_1d,
                        pool=EXCLUDED.pool,
                        last_seen=EXCLUDED.last_seen,
                        seeded_at=EXCLUDED.seeded_at,
                        last_sync_at=NULL,
                        sync_fail_count=0,
                        frozen_at=NULL""",
                (qd, *sold_params, qd),
            )
            inserted = c.rowcount if c.rowcount >= 0 else 0
            c.execute("SELECT COUNT(*) FROM full_sold_queue WHERE queue_date=%s", (qd,))
            total = int(c.fetchone()[0] or 0)
            pending_after = _count_pending(c, qd)
        conn.commit()
        log(f"PG 补缺队列 seed: 本次+{inserted:,} 累计 {total:,} 条，待扫 {pending_after:,}")
        return total
    finally:
        conn.close()


def ensure_queue_seeded(
    low_v1d_only=False,
    skip_today=True,
    min_sold=1,
    min_pending=100,
    main_db=None,
    queue_db=None,
    log_func=None,
    seed_limit=0,
):
    stats = queue_stats()
    pending = stats["pending"]
    eligible = count_eligible_monitor(
        low_v1d_only=low_v1d_only,
        skip_today=skip_today,
        min_sold=min_sold,
    )
    missing = count_missing_from_queue(
        low_v1d_only=low_v1d_only,
        skip_today=skip_today,
        min_sold=min_sold,
    )
    eff_min_pending = min_pending if eligible >= min_pending else max(1, min(eligible, 10))
    if pending >= eff_min_pending and missing == 0:
        return pending, False
    log = log_func or (lambda _m: None)
    log(
        f"补缺队列待扫 {pending} 条（monitor 候选 {eligible}，未入队 {missing}），开始 seed..."
    )
    seed_full_sold_queue(
        low_v1d_only=low_v1d_only,
        skip_today=skip_today,
        min_sold=min_sold,
        log_func=log,
        limit=seed_limit,
    )
    return count_pending(), True


def _queue_order_sql(queue_sort: str) -> str:
    sort_key = (queue_sort or "monitor_first").strip().lower()
    if sort_key in ("sold_desc", "monitor_first", "sold_first"):
        return "COALESCE(sold_num,0) DESC, last_seen DESC NULLS LAST, goods_id ASC"
    return "COALESCE(velocity_1d,0) ASC, last_seen ASC NULLS LAST, goods_id ASC"


def queue_pending_sold_tiers(high_sold_min=10, queue_db=None, queue_date=None):
    del queue_db
    qd = queue_date or _today()
    threshold = max(1, int(high_sold_min or 10))
    init_db()
    conn = _conn()
    try:
        with conn.cursor() as c:
            _ensure_queue_table(c)
            base = "queue_date=%s AND last_sync_at IS NULL AND frozen_at IS NULL"
            c.execute(
                f"SELECT COUNT(*) FROM full_sold_queue WHERE {base} AND COALESCE(sold_num,0)>=%s",
                (qd, threshold),
            )
            high = int(c.fetchone()[0] or 0)
            c.execute(
                f"SELECT COUNT(*) FROM full_sold_queue WHERE {base} AND COALESCE(sold_num,0)<%s",
                (qd, threshold),
            )
            low = int(c.fetchone()[0] or 0)
        return {"threshold": threshold, "high_sold": high, "low_sold": low}
    finally:
        conn.close()


def fetch_full_sold_queue_batch(
    limit=800,
    queue_db=None,
    queue_date=None,
    max_fail=3,
    queue_sort="monitor_first",
):
    del queue_db
    qd = queue_date or _today()
    limit = max(1, min(int(limit or 800), 5000))
    max_fail = max(1, int(max_fail or 3))
    order_sql = _queue_order_sql(queue_sort)
    init_db()
    conn = _conn()
    try:
        with conn.cursor() as c:
            _ensure_queue_table(c)
            c.execute(
                f"""SELECT goods_id, title, sold_num, velocity_1d, pool, last_seen
                    FROM full_sold_queue
                    WHERE queue_date=%s AND last_sync_at IS NULL AND frozen_at IS NULL
                      AND COALESCE(sync_fail_count,0) < %s
                    ORDER BY {order_sql}
                    LIMIT %s""",
                (qd, max_fail, limit),
            )
            rows = [
                {
                    "goods_id": r[0],
                    "title": r[1] or "",
                    "sold_num": int(r[2] or 0),
                    "velocity_1d": float(r[3] or 0),
                    "pool": r[4] or "WATCH",
                    "last_seen": r[5].isoformat() if r[5] else "",
                }
                for r in c.fetchall()
            ]
        return rows
    finally:
        conn.close()


def mark_full_sold_sync_result(goods_id, ok=True, queue_db=None):
    del queue_db
    if not goods_id:
        return
    init_db()
    conn = _conn()
    try:
        with conn.cursor() as c:
            _ensure_queue_table(c)
            if ok:
                c.execute(
                    """UPDATE full_sold_queue SET last_sync_at=NOW(), sync_fail_count=0
                       WHERE goods_id=%s""",
                    (str(goods_id),),
                )
            else:
                c.execute(
                    "UPDATE full_sold_queue SET sync_fail_count=COALESCE(sync_fail_count,0)+1 WHERE goods_id=%s",
                    (str(goods_id),),
                )
        conn.commit()
    finally:
        conn.close()


def finalize_frozen_goods(goods_id, code=600, queue_db=None, log_func=None):
    del queue_db
    gid = str(goods_id)
    init_db()
    conn = _conn()
    try:
        with conn.cursor() as c:
            _ensure_queue_table(c)
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                "UPDATE monitor_goods SET monitor_status='delisted', updated_at=NOW() WHERE goods_id=%s",
                (gid,),
            )
            c.execute(
                """UPDATE full_sold_queue SET frozen_at=NOW(), freeze_code=%s,
                       last_sync_at=NOW(), sync_fail_count=0 WHERE goods_id=%s""",
                (int(code or 600), gid),
            )
        conn.commit()
    finally:
        conn.close()
    if log_func:
        log_func(f"冻结标注 {gid[:16]}… code={code} (PG delisted)")
