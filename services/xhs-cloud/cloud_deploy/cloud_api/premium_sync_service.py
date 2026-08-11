# -*- coding: utf-8 -*-
"""精品库同步 — 合并规则 + 规格书 API 实现。"""
from __future__ import annotations

from datetime import datetime

LOCAL_BUSINESS_FIELDS = frozenset(
    {
        "primary_keyword",
        "fallback_keywords",
        "tier",
        "scan_priority",
        "monitor_freq",
        "lifecycle",
    }
)

SCAN_FIELDS = frozenset(
    {
        "sold_num",
        "velocity_1d",
        "actual_velocity_1d",
        "deal_price",
        "shop_fans",
        "shop_sales",
        "shop_fans_delta_1d",
        "burst_score",
        "title",
        "store_id",
        "store_name",
        "last_app_scan",
        "last_metric_scan",
        "last_scan_engine",
        "streak_sold_up_days",
    }
)

_UPSERT_COLS = [
    "goods_id", "title", "tier", "lifecycle", "primary_keyword", "store_id", "store_name",
    "deal_price", "sold_num", "velocity_1d", "actual_velocity_1d", "burst_score",
    "report_count", "first_report_date", "last_report_date", "scan_priority",
    "shop_fans", "shop_sales", "shop_fans_delta_1d", "streak_sold_up_days",
    "last_app_scan", "last_metric_scan", "last_scan_engine", "sync_version", "updated_at",
]


def _parse_ts(val) -> float:
    if not val:
        return 0.0
    s = str(val).strip()[:19]
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(s, fmt).timestamp()
        except ValueError:
            continue
    return 0.0


def _next_sync_version(cursor) -> int:
    cursor.execute(
        """
        INSERT INTO premium_schema_meta (key, value) VALUES ('sync_version_counter', '1')
        ON CONFLICT (key) DO UPDATE SET value = (CAST(premium_schema_meta.value AS BIGINT) + 1)::TEXT
        RETURNING value
        """
    )
    row = cursor.fetchone()
    return int(row[0]) if row else 1


def merge_premium_row(existing: dict | None, incoming: dict) -> dict:
    if not existing:
        out = dict(incoming)
        out.setdefault("scan_owner", incoming.get("scan_owner") or "local")
        return out

    out = dict(existing)
    inc_ts = _parse_ts(incoming.get("last_metric_scan"))
    ex_ts = _parse_ts(existing.get("last_metric_scan"))
    incoming_wins_scan = inc_ts >= ex_ts

    for col in LOCAL_BUSINESS_FIELDS:
        if incoming.get("scan_owner") == "local" and col in incoming and incoming[col] is not None:
            out[col] = incoming[col]
        elif col in existing:
            out[col] = existing[col]

    for col in SCAN_FIELDS:
        if not incoming_wins_scan:
            if col in existing:
                out[col] = existing[col]
            continue
        val = incoming.get(col)
        if val is None:
            continue
        if col in ("shop_fans", "shop_sales") and int(val or 0) == 0:
            if int(existing.get(col) or 0) > 0:
                continue
        out[col] = val

    if incoming_wins_scan:
        for k in ("last_metric_scan", "last_app_scan", "last_scan_engine", "updated_at"):
            if incoming.get(k):
                out[k] = incoming[k]
    return out


def apply_premium_upsert(conn, rows: list[dict], client_id: str = "") -> dict:
    accepted = 0
    rejected = 0
    conflicts: list = []
    server_version = 0
    cols = _UPSERT_COLS
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        batch_version = _next_sync_version(c)
        for raw in rows:
            gid = str(raw.get("goods_id") or "").strip()
            if len(gid) < 5:
                rejected += 1
                continue
            c.execute("SELECT * FROM premium_goods WHERE goods_id=%s", (gid,))
            ex_row = c.fetchone()
            existing = None
            if ex_row:
                names = [d[0] for d in c.description]
                existing = {names[i]: ex_row[i] for i in range(len(names))}
            merged = merge_premium_row(existing, raw)
            merged["sync_version"] = batch_version
            server_version = max(server_version, batch_version)
            placeholders = ", ".join("%s" for _ in cols)
            col_sql = ", ".join(cols)
            updates = ", ".join(f"{col}=EXCLUDED.{col}" for col in cols if col != "goods_id")
            vals = tuple(merged.get(col) for col in cols)
            try:
                c.execute(
                    f"""
                    INSERT INTO premium_goods ({col_sql}) VALUES ({placeholders})
                    ON CONFLICT (goods_id) DO UPDATE SET {updates}
                    """,
                    vals,
                )
                accepted += 1
            except Exception as e:
                rejected += 1
                conflicts.append({"goods_id": gid, "error": str(e)[:200]})
    return {
        "accepted": accepted,
        "rejected": rejected,
        "server_version": server_version,
        "conflicts": conflicts[:20],
        "client_id": client_id,
    }


def get_premium_changes(conn, since: int = 0, limit: int = 500) -> dict:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            """
            SELECT goods_id, title, tier, lifecycle, primary_keyword, store_id, store_name,
                   deal_price, sold_num, velocity_1d, actual_velocity_1d, burst_score,
                   shop_fans, shop_sales, shop_fans_delta_1d, last_app_scan, last_metric_scan,
                   last_scan_engine, sync_version, updated_at
            FROM premium_goods
            WHERE COALESCE(sync_version, 0) > %s
            ORDER BY sync_version ASC
            LIMIT %s
            """,
            (int(since), int(limit)),
        )
        cols = [d[0] for d in c.description]
        rows = [{cols[i]: r[i] for i in range(len(cols))} for r in c.fetchall()]
        latest = since
        if rows:
            latest = max(int(r.get("sync_version") or 0) for r in rows)
    return {"rows": rows, "latest_version": latest, "count": len(rows)}


def apply_snapshots_backfill(conn, goods_id: str, goods_daily: list, store_daily: list) -> dict:
    g_n = 0
    s_n = 0
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        for row in goods_daily or []:
            c.execute(
                """
                INSERT INTO premium_goods_daily (
                    goods_id, snap_date, sold_num, deal_price, delta, actual_delta,
                    velocity_1d, source, created_at
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (goods_id, snap_date) DO UPDATE SET
                    sold_num=EXCLUDED.sold_num,
                    deal_price=EXCLUDED.deal_price,
                    delta=EXCLUDED.delta,
                    actual_delta=EXCLUDED.actual_delta,
                    velocity_1d=EXCLUDED.velocity_1d,
                    source=EXCLUDED.source
                """,
                (
                    row.get("goods_id") or goods_id,
                    row.get("snap_date"),
                    row.get("sold_num"),
                    row.get("deal_price"),
                    row.get("delta"),
                    row.get("actual_delta"),
                    row.get("velocity_1d"),
                    row.get("source") or "backfill",
                    row.get("created_at"),
                ),
            )
            g_n += 1
        for row in store_daily or []:
            c.execute(
                """
                INSERT INTO premium_store_daily (
                    store_id, snap_date, shop_fans, shop_sales, shop_fans_delta,
                    scan_owner, scan_engine, source, created_at
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (store_id, snap_date) DO UPDATE SET
                    shop_fans=EXCLUDED.shop_fans,
                    shop_sales=EXCLUDED.shop_sales,
                    shop_fans_delta=EXCLUDED.shop_fans_delta
                """,
                (
                    row.get("store_id"),
                    row.get("snap_date"),
                    row.get("shop_fans"),
                    row.get("shop_sales"),
                    row.get("shop_fans_delta"),
                    row.get("scan_owner") or "local",
                    row.get("scan_engine") or "app",
                    row.get("source") or "backfill",
                    row.get("created_at"),
                ),
            )
            s_n += 1
        c.execute(
            """
            INSERT INTO premium_sync_state (goods_id, snapshots_backfill_done, snapshots_backfill_rows, updated_at)
            VALUES (%s, 1, %s, to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
            ON CONFLICT (goods_id) DO UPDATE SET
                snapshots_backfill_done=1,
                snapshots_backfill_rows=EXCLUDED.snapshots_backfill_rows,
                updated_at=EXCLUDED.updated_at
            """,
            (goods_id, g_n + s_n),
        )
    return {"goods_daily": g_n, "store_daily": s_n}


def apply_premium_catalog(
    conn,
    local_ids: list[str],
    since_date: str = "",
    page: int = 0,
    page_size: int = 5000,
) -> dict:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute("SELECT goods_id FROM premium_goods WHERE lifecycle < 3")
        cloud_ids = {str(r[0]) for r in c.fetchall()}
    local_set = {str(x) for x in local_ids if x}
    cloud_only_all = sorted(cloud_ids - local_set)
    local_only_all = sorted(local_set - cloud_ids)
    overlap = len(local_set & cloud_ids)
    ps = max(1, int(page_size))
    pg = max(0, int(page))
    start = pg * ps
    end = start + ps
    return {
        "cloud_total": len(cloud_ids),
        "local_total": len(local_set),
        "overlap": overlap,
        "cloud_only_count": len(cloud_only_all),
        "local_only_count": len(local_only_all),
        "cloud_only": cloud_only_all[start:end],
        "local_only": local_only_all[start:end],
        "page": pg,
        "page_size": ps,
        "since_date": since_date,
    }


_FETCH_COLS = (
    "goods_id", "title", "tier", "lifecycle", "primary_keyword", "store_id", "store_name",
    "deal_price", "sold_num", "velocity_1d", "actual_velocity_1d", "burst_score",
    "report_count", "first_report_date", "last_report_date", "scan_priority",
    "shop_fans", "shop_sales", "shop_fans_delta_1d", "streak_sold_up_days",
    "last_app_scan", "last_metric_scan", "last_scan_engine", "updated_at",
)


def fetch_premium_goods_by_ids(conn, goods_ids: list[str]) -> list[dict]:
    ids = [str(g).strip() for g in goods_ids if g and len(str(g)) >= 5]
    if not ids:
        return []
    out: list[dict] = []
    cols = ", ".join(_FETCH_COLS)
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        for i in range(0, len(ids), 500):
            chunk = ids[i : i + 500]
            ph = ", ".join("%s" for _ in chunk)
            c.execute(
                f"SELECT {cols} FROM premium_goods WHERE goods_id IN ({ph}) AND lifecycle < 3",
                chunk,
            )
            names = [d[0] for d in c.description]
            for row in c.fetchall():
                out.append({names[j]: row[j] for j in range(len(names))})
    return out


_DAILY_FETCH_COLS = (
    "goods_id",
    "snap_date",
    "sold_num",
    "deal_price",
    "delta",
    "actual_delta",
    "velocity_1d",
    "source",
    "created_at",
)


def fetch_premium_goods_daily_by_ids(
    conn,
    goods_ids: list[str],
    since_date: str = "",
    max_rows: int = 25000,
) -> dict:
    """按 goods_id 批量拉取 premium_goods_daily 日快照（云 → 本地 pull）。"""
    ids = [str(g).strip() for g in goods_ids if g and len(str(g)) >= 5]
    if not ids:
        return {"rows": [], "count": 0, "since_date": since_date, "max_rows": max_rows}
    cap = max(1, min(int(max_rows or 25000), 50000))
    since = (since_date or "").strip()[:10]
    col_sql = ", ".join(_DAILY_FETCH_COLS)
    out: list[dict] = []
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        for i in range(0, len(ids), 500):
            if len(out) >= cap:
                break
            chunk = ids[i : i + 500]
            ph = ", ".join("%s" for _ in chunk)
            params: list = list(chunk)
            sql = f"SELECT {col_sql} FROM premium_goods_daily WHERE goods_id IN ({ph})"
            if since:
                sql += " AND snap_date >= %s"
                params.append(since)
            sql += " ORDER BY goods_id, snap_date ASC LIMIT %s"
            params.append(cap - len(out))
            c.execute(sql, params)
            names = [d[0] for d in c.description]
            for row in c.fetchall():
                item = {names[j]: row[j] for j in range(len(names))}
                if item.get("snap_date") is not None:
                    item["snap_date"] = str(item["snap_date"])[:10]
                out.append(item)
                if len(out) >= cap:
                    break
    return {"rows": out, "count": len(out), "since_date": since_date, "max_rows": max_rows}


def apply_premium_goods_batch(conn, rows: list[dict]) -> int:
    return int(apply_premium_upsert(conn, rows).get("accepted") or 0)


def apply_premium_goods_daily_batch(conn, rows: list[dict]) -> int:
    n = 0
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        for row in rows:
            c.execute(
                """
                INSERT INTO premium_goods_daily (
                    goods_id, snap_date, sold_num, deal_price, delta, actual_delta,
                    velocity_1d, source, created_at
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (goods_id, snap_date) DO UPDATE SET
                    sold_num=EXCLUDED.sold_num,
                    deal_price=EXCLUDED.deal_price,
                    delta=EXCLUDED.delta,
                    actual_delta=EXCLUDED.actual_delta,
                    velocity_1d=EXCLUDED.velocity_1d
                """,
                (
                    row.get("goods_id"),
                    row.get("snap_date"),
                    row.get("sold_num"),
                    row.get("deal_price"),
                    row.get("delta"),
                    row.get("actual_delta"),
                    row.get("velocity_1d"),
                    row.get("source"),
                    row.get("created_at"),
                ),
            )
            n += 1
    return n


def apply_premium_store_daily_batch(conn, rows: list[dict]) -> int:
    n = 0
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        for row in rows:
            c.execute(
                """
                INSERT INTO premium_store_daily (
                    store_id, snap_date, shop_fans, shop_sales, shop_fans_delta,
                    scan_owner, scan_engine, source, created_at
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (store_id, snap_date) DO UPDATE SET
                    shop_fans=EXCLUDED.shop_fans,
                    shop_sales=EXCLUDED.shop_sales,
                    shop_fans_delta=EXCLUDED.shop_fans_delta
                """,
                (
                    row.get("store_id"),
                    row.get("snap_date"),
                    row.get("shop_fans"),
                    row.get("shop_sales"),
                    row.get("shop_fans_delta"),
                    row.get("scan_owner"),
                    row.get("scan_engine"),
                    row.get("source"),
                    row.get("created_at"),
                ),
            )
            n += 1
    return n
