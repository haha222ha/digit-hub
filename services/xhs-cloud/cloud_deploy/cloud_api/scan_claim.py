# -*- coding: utf-8 -*-
"""risk 工单认领 — 云端 daemon 与本地 Agent 避免重复扫同一 goods_id。"""
from __future__ import annotations

DEFAULT_CLAIM_TTL_MINUTES = 25


def _hours_ago_sql(column: str) -> str:
    return f" AND {column} < NOW() - (%s * INTERVAL '1 hour')"


def ensure_scan_claim_columns(conn) -> None:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute("ALTER TABLE monitor_goods ADD COLUMN IF NOT EXISTS scan_claim_by VARCHAR(64)")
        c.execute("ALTER TABLE monitor_goods ADD COLUMN IF NOT EXISTS scan_claim_until TIMESTAMPTZ")
    conn.commit()


def _claimable_sql(alias: str = "") -> str:
    p = f"{alias}." if alias else ""
    return f"""(
        {p}scan_claim_until IS NULL
        OR {p}scan_claim_until < NOW()
        OR {p}scan_claim_by = %s
    )"""


def count_today_risk(conn, scan_date: str, *, min_age_hours: float = 0) -> int:
    ensure_scan_claim_columns(conn)
    params: list = [scan_date, scan_date]
    age_sql = ""
    if min_age_hours > 0:
        age_sql = _hours_ago_sql("last_scan_at")
        params.append(float(min_age_hours))
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            f"""SELECT COUNT(*) FROM monitor_goods
               WHERE monitor_status IN ('active', 'idle')
                 AND last_scan_status = 'risk'
                 AND last_scan_at >= %s::date
                 AND last_scan_at < (%s::date + INTERVAL '1 day')
                 {age_sql}""",
            tuple(params),
        )
        return int(c.fetchone()[0] or 0)


def count_claimable_risk(
    conn,
    scan_date: str,
    claimer: str,
    *,
    min_age_hours: float = 0,
) -> int:
    ensure_scan_claim_columns(conn)
    params: list = [scan_date, scan_date]
    age_sql = ""
    if min_age_hours > 0:
        age_sql = _hours_ago_sql("last_scan_at")
        params.append(float(min_age_hours))
    params.append(str(claimer or "unknown")[:64])
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            f"""SELECT COUNT(*) FROM monitor_goods
               WHERE monitor_status IN ('active', 'idle')
                 AND last_scan_status = 'risk'
                 AND last_scan_at >= %s::date
                 AND last_scan_at < (%s::date + INTERVAL '1 day')
                 {age_sql}
                 AND {_claimable_sql()}""",
            tuple(params),
        )
        return int(c.fetchone()[0] or 0)


def pick_and_claim_risk(
    conn,
    scan_date: str,
    limit: int,
    claimer: str,
    *,
    min_age_hours: float = 0,
    claim_ttl_minutes: int = DEFAULT_CLAIM_TTL_MINUTES,
) -> list[dict]:
    """原子认领 risk 商品，返回 goods_id + title。"""
    ensure_scan_claim_columns(conn)
    limit = max(1, min(int(limit), 1000))
    claimer = str(claimer or "unknown")[:64]
    ttl = max(5, min(int(claim_ttl_minutes), 120))

    params: list = [scan_date, scan_date]
    age_sql = ""
    if min_age_hours > 0:
        age_sql = _hours_ago_sql("m.last_scan_at")
        params.append(float(min_age_hours))
    params.extend([claimer, limit, claimer, ttl])

    sql = f"""
        WITH picked AS (
            SELECT m.goods_id
            FROM monitor_goods m
            WHERE m.monitor_status IN ('active', 'idle')
              AND m.last_scan_status = 'risk'
              AND m.last_scan_at >= %s::date
              AND m.last_scan_at < (%s::date + INTERVAL '1 day')
              {age_sql}
              AND {_claimable_sql("m")}
            ORDER BY m.priority_score DESC NULLS LAST, m.last_scan_at ASC
            LIMIT %s
            FOR UPDATE SKIP LOCKED
        )
        UPDATE monitor_goods m
        SET scan_claim_by = %s,
            scan_claim_until = NOW() + (%s * INTERVAL '1 minute'),
            updated_at = NOW()
        FROM picked p
        WHERE m.goods_id = p.goods_id
        RETURNING m.goods_id, m.title, m.last_v1d, m.last_sold, m.tier, m.pool, m.priority_score
    """
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(sql, tuple(params))
        cols = (
            "goods_id",
            "title",
            "last_v1d",
            "last_sold",
            "tier",
            "pool",
            "priority_score",
        )
        rows = [dict(zip(cols, row)) for row in c.fetchall()]
    conn.commit()
    return rows


def pick_and_claim_pool(
    conn,
    limit: int,
    claimer: str,
    *,
    claim_ttl_minutes: int = DEFAULT_CLAIM_TTL_MINUTES,
) -> list[dict]:
    """认领并返回下一批全池商品（与本地 Agent 的 risk claim 互不冲突）。"""
    ensure_scan_claim_columns(conn)
    limit = max(1, min(int(limit), 1500))
    claimer = str(claimer or "unknown")[:64]
    ttl = max(5, min(int(claim_ttl_minutes), 120))

    sql = f"""
        WITH picked AS (
            SELECT m.goods_id
            FROM monitor_goods m
            WHERE m.monitor_status IN ('active', 'idle')
              AND {_claimable_sql("m")}
            ORDER BY m.priority_score DESC NULLS LAST,
                     m.last_scan_at ASC NULLS FIRST
            LIMIT %s
            FOR UPDATE SKIP LOCKED
        )
        UPDATE monitor_goods m
        SET scan_claim_by = %s,
            scan_claim_until = NOW() + (%s * INTERVAL '1 minute'),
            updated_at = NOW()
        FROM picked p
        WHERE m.goods_id = p.goods_id
        RETURNING m.goods_id, m.title, m.last_v1d, m.last_sold, m.tier, m.pool, m.priority_score
    """
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(sql, (claimer, limit, claimer, ttl))
        cols = (
            "goods_id",
            "title",
            "last_v1d",
            "last_sold",
            "tier",
            "pool",
            "priority_score",
        )
        rows = [dict(zip(cols, row)) for row in c.fetchall()]
    conn.commit()
    return rows


def clear_scan_claim(conn, goods_id: str) -> None:
    gid = str(goods_id or "").strip()
    if not gid:
        return
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            """UPDATE monitor_goods
               SET scan_claim_by = NULL, scan_claim_until = NULL
               WHERE goods_id = %s""",
            (gid,),
        )
    conn.commit()
