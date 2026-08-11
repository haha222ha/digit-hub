# -*- coding: utf-8 -*-
"""
报告 → PG 同步核心逻辑（对齐 docs/选品监控云服务需求规格书_v2.md §3–§6）。

- 来源：gen_report 产出的 data.js（items + meta），不是 13GB 主库平迁
- 监控池：v1d > 0 OR actual_v1d > 0 才入 monitor_goods
- 日报行：items 全量写入 report_daily_items（28 列）
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timedelta
from typing import Any

import psycopg2.extras

from cloud_deploy.cloud_api.retention_policy import snapshot_retention_days
from cloud_deploy.reporting.constants import COL, REPORT_COLUMNS


def _parse_report_payload(text: str) -> dict:
    """兼容 gen_report 产出：var/无 var、末尾可有/无分号。"""
    m = re.search(r"(?:var\s+)?REPORT_DATA\s*=\s*(\{.*\})\s*;?\s*$", text, re.S)
    if not m:
        m = re.search(r"(?:var\s+)?REPORT_DATA\s*=\s*(\{.*\})", text, re.S)
    if not m:
        raise RuntimeError("无法解析 REPORT_DATA JSON")
    return json.loads(m.group(1))


def parse_data_js(data_js_path: str) -> tuple[str, dict, list]:
    with open(data_js_path, "r", encoding="utf-8") as f:
        text = f.read()
    payload = _parse_report_payload(text)
    meta = dict(payload.get("meta") or {})
    columns = payload.get("columns")
    if isinstance(columns, list) and columns and "columns" not in meta:
        meta["columns"] = columns
    report_date = str(meta.get("date") or datetime.now().strftime("%Y-%m-%d"))[:10]
    items = payload.get("items") or []
    return report_date, meta, items


def _col_map_from_meta(meta: dict | None) -> dict[str, int]:
    """兼容新版 gen_report（21 列 snapshot_phase1）与旧版 28 列。"""
    cols = (meta or {}).get("columns")
    if isinstance(cols, list) and len(cols) >= 5:
        return {str(name): i for i, name in enumerate(cols)}
    return COL


def _field(item: Any, key: str, default=None, col_map: dict[str, int] | None = None):
    if isinstance(item, dict):
        return item.get(key, default)
    cmap = col_map or COL
    idx = cmap.get(key)
    if idx is None or not isinstance(item, (list, tuple)) or idx >= len(item):
        return default
    return item[idx]


def _num(v, default=0):
    if v is None or v == "":
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _int(v, default=0):
    if v is None or v == "":
        return default
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def _bool(v) -> bool:
    if isinstance(v, bool):
        return v
    if v in (1, "1", "true", "True"):
        return True
    return False


def item_to_daily_row(
    report_date: str,
    rank_no: int,
    item: Any,
    col_map: dict[str, int] | None = None,
) -> tuple | None:
    gid = str(_field(item, "goods_id", "", col_map) or "").strip()
    if not gid:
        return None
    # 新版 gen_report 用 delta；旧版用 actual_v1d —— 入库时统一写入 actual_v1d
    actual = _num(_field(item, "actual_v1d", col_map=col_map))
    if actual <= 0:
        actual = _num(_field(item, "delta", col_map=col_map))
    v1d = _num(_field(item, "v1d", col_map=col_map))
    if v1d <= 0:
        v1d = actual
    return (
        report_date,
        gid,
        rank_no,
        _field(item, "title", col_map=col_map) or "",
        _num(_field(item, "price", col_map=col_map)),
        _int(_field(item, "sold", col_map=col_map)),
        _num(_field(item, "v1h", col_map=col_map)),
        _num(_field(item, "v6h", col_map=col_map)),
        actual,
        v1d,
        _num(_field(item, "actual_gr", col_map=col_map)),
        _num(_field(item, "gr", col_map=col_map) or _field(item, "actual_gr", col_map=col_map)),
        _num(_field(item, "actual_vsr", col_map=col_map)),
        _num(_field(item, "vsr", col_map=col_map)),
        _num(_field(item, "acc", col_map=col_map)),
        _num(_field(item, "burst", col_map=col_map)),
        _field(item, "pool", col_map=col_map) or "",
        _field(item, "first_seen", col_map=col_map) or None,
        _field(item, "store_id", col_map=col_map) or "",
        _field(item, "store_name", col_map=col_map) or "",
        _field(item, "shelf_time", col_map=col_map) or None,
        _int(_field(item, "shop_sales", col_map=col_map)),
        _int(_field(item, "shop_fans", col_map=col_map)),
        _num(_field(item, "shop_fsr", col_map=col_map)),
        _num(_field(item, "goods_fsr", col_map=col_map)),
        _field(item, "behavior", col_map=col_map) or "",
        _bool(_field(item, "is_virtual", col_map=col_map)),
        _num(_field(item, "base_hours", col_map=col_map)),
        _field(item, "base_at", col_map=col_map) or None,
        str(_field(item, "anomaly", col_map=col_map) or ""),
        str(_field(item, "category_tag", col_map=col_map) or "").strip()[:64],
    )


def qualifies_monitor_pool(item: Any, col_map: dict[str, int] | None = None) -> bool:
    v1d = _num(_field(item, "v1d", col_map=col_map))
    actual = _num(_field(item, "actual_v1d", col_map=col_map))
    if actual <= 0:
        actual = _num(_field(item, "delta", col_map=col_map))
    return v1d > 0 or actual > 0


def apply_daily_report(conn, report_date: str, meta: dict, items: list, source: str = "local_gen_report") -> dict:
    """
    幂等写入：report_daily_meta + report_daily_items + monitor_goods（v1d>0 或 actual>0）
    + goods_metrics_daily；返回需 sold_history backfill 的新 goods_id 列表。
    """
    daily_rows = []
    monitor_rows = []
    metrics_rows = []
    need_backfill: list[str] = []
    col_map = _col_map_from_meta(meta)

    for rank, item in enumerate(items, start=1):
        row = item_to_daily_row(report_date, rank, item, col_map)
        if not row:
            continue
        daily_rows.append(row)
        gid = row[1]
        v1d = row[9]
        actual_v1d = row[8]
        metrics_rows.append((gid, report_date, v1d, actual_v1d, row[11], row[15], row[16]))

        if qualifies_monitor_pool(item, col_map):
            fs = _field(item, "first_seen", col_map=col_map) or None
            monitor_rows.append(
                (
                    gid,
                    row[3],
                    row[26],
                    row[16],
                    v1d,
                    actual_v1d,
                    row[5],
                    report_date,
                    row[18],
                    row[19],
                    max(v1d, actual_v1d),
                    fs,
                )
            )

    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")

        c.execute(
            """INSERT INTO report_daily_meta (
                   report_date, row_count, virtual_count, physical_count,
                   meta_json, source, generated_at, synced_at
               ) VALUES (%s,%s,%s,%s,%s,%s,NOW(),NOW())
               ON CONFLICT (report_date) DO UPDATE SET
                   row_count=EXCLUDED.row_count,
                   virtual_count=EXCLUDED.virtual_count,
                   physical_count=EXCLUDED.physical_count,
                   meta_json=EXCLUDED.meta_json,
                   source=EXCLUDED.source,
                   generated_at=EXCLUDED.generated_at,
                   synced_at=NOW()""",
            (
                report_date,
                len(daily_rows),
                int(meta.get("virtual_v1d") or 0),
                int(meta.get("physical_v1d") or 0),
                json.dumps(meta, ensure_ascii=False),
                source,
            ),
        )

        if daily_rows:
            psycopg2.extras.execute_values(
                c,
                """INSERT INTO report_daily_items (
                       report_date, goods_id, rank_no, title, price, sold,
                       v1h, v6h, actual_v1d, v1d, actual_gr, gr, actual_vsr, vsr,
                       acc, burst, pool, first_seen, store_id, store_name, shelf_time,
                       shop_sales, shop_fans, shop_fsr, goods_fsr, behavior,
                       is_virtual, base_hours, base_at, anomaly, category_tag
                   ) VALUES %s
                   ON CONFLICT (report_date, goods_id) DO UPDATE SET
                       rank_no=EXCLUDED.rank_no, title=EXCLUDED.title, price=EXCLUDED.price,
                       sold=EXCLUDED.sold, v1h=EXCLUDED.v1h, v6h=EXCLUDED.v6h,
                       actual_v1d=EXCLUDED.actual_v1d, v1d=EXCLUDED.v1d,
                       actual_gr=EXCLUDED.actual_gr, gr=EXCLUDED.gr,
                       actual_vsr=EXCLUDED.actual_vsr, vsr=EXCLUDED.vsr,
                       acc=EXCLUDED.acc, burst=EXCLUDED.burst, pool=EXCLUDED.pool,
                       first_seen=EXCLUDED.first_seen, store_id=EXCLUDED.store_id,
                       store_name=EXCLUDED.store_name, shelf_time=EXCLUDED.shelf_time,
                       shop_sales=EXCLUDED.shop_sales, shop_fans=EXCLUDED.shop_fans,
                       shop_fsr=EXCLUDED.shop_fsr, goods_fsr=EXCLUDED.goods_fsr,
                       behavior=EXCLUDED.behavior, is_virtual=EXCLUDED.is_virtual,
                       base_hours=EXCLUDED.base_hours, base_at=EXCLUDED.base_at,
                       anomaly=EXCLUDED.anomaly, category_tag=EXCLUDED.category_tag""",
                daily_rows,
                page_size=500,
            )
            synced_gids = [r[1] for r in daily_rows]
            c.execute(
                """DELETE FROM report_daily_items
                   WHERE report_date=%s AND NOT (goods_id = ANY(%s))""",
                (report_date, synced_gids),
            )

        if metrics_rows:
            psycopg2.extras.execute_values(
                c,
                """INSERT INTO goods_metrics_daily (
                       goods_id, metric_date, v1d, actual_v1d, gr, burst, pool
                   ) VALUES %s
                   ON CONFLICT (goods_id, metric_date) DO UPDATE SET
                       v1d=EXCLUDED.v1d, actual_v1d=EXCLUDED.actual_v1d,
                       gr=EXCLUDED.gr, burst=EXCLUDED.burst, pool=EXCLUDED.pool""",
                metrics_rows,
                page_size=500,
            )

        if monitor_rows:
            for row in monitor_rows:
                gid = row[0]
                c.execute("SELECT goods_id FROM goods_sync_state WHERE goods_id=%s", (gid,))
                is_new = c.fetchone() is None
                if is_new:
                    need_backfill.append(gid)

            psycopg2.extras.execute_values(
                c,
                """INSERT INTO monitor_goods (
                       goods_id, title, is_virtual, pool, last_v1d, last_actual_v1d,
                       last_sold, last_report_date, store_id, store_name, peak_v1d,
                       monitor_status, first_tracked_at, first_seen, source, updated_at
                   ) VALUES %s
                   ON CONFLICT (goods_id) DO UPDATE SET
                       title=EXCLUDED.title,
                       is_virtual=EXCLUDED.is_virtual,
                       pool=EXCLUDED.pool,
                       last_v1d=EXCLUDED.last_v1d,
                       last_actual_v1d=EXCLUDED.last_actual_v1d,
                       last_sold=EXCLUDED.last_sold,
                       last_report_date=EXCLUDED.last_report_date,
                       store_id=EXCLUDED.store_id,
                       store_name=EXCLUDED.store_name,
                       peak_v1d=GREATEST(monitor_goods.peak_v1d, EXCLUDED.peak_v1d),
                       first_seen=COALESCE(monitor_goods.first_seen, EXCLUDED.first_seen),
                       monitor_status=CASE
                           WHEN monitor_goods.monitor_status='delisted' THEN 'delisted'
                           WHEN EXCLUDED.last_v1d > 0 OR EXCLUDED.last_actual_v1d > 0 THEN 'active'
                           ELSE monitor_goods.monitor_status END,
                       updated_at=NOW()""",
                monitor_rows,
                template="(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'active',NOW(),%s,'daily_report',NOW())",
                page_size=500,
            )

            psycopg2.extras.execute_values(
                c,
                """INSERT INTO goods_sync_state (goods_id, sold_daily_backfill_done, updated_at)
                   VALUES %s
                   ON CONFLICT (goods_id) DO NOTHING""",
                [(gid, False) for gid in need_backfill],
                template="(%s, %s, NOW())",
                page_size=500,
            )

    conn.commit()

    return {
        "report_date": report_date,
        "items_upserted": len(daily_rows),
        "monitor_pool_added": len(need_backfill),
        "monitor_pool_updated": len(monitor_rows) - len(need_backfill),
        "monitor_pool_total": len(monitor_rows),
        "need_sold_history_backfill": need_backfill[:100],
        "need_sold_history_backfill_count": len(need_backfill),
    }


def apply_sold_history_batch(conn, rows: list[dict]) -> int:
    """批量写入 sold_history 行 → goods_sold_daily。"""
    if not rows:
        return 0
    tuples = []
    goods_ids = set()
    for r in rows:
        gid = str(r.get("goods_id") or "").strip()
        snap = r.get("snapshot_date")
        if not gid or not snap:
            continue
        tuples.append(
            (
                gid,
                snap,
                int(r.get("sold_num") or 0),
                r.get("deal_price"),
                int(r.get("delta") or 0),
                r.get("source") or "local_sync",
            )
        )
        goods_ids.add(gid)

    if not tuples:
        return 0

    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        psycopg2.extras.execute_values(
            c,
            """INSERT INTO goods_sold_daily (
                   goods_id, snapshot_date, sold_num, deal_price, delta, source
               ) VALUES %s
               ON CONFLICT (goods_id, snapshot_date) DO UPDATE SET
                   sold_num=EXCLUDED.sold_num,
                   deal_price=EXCLUDED.deal_price,
                   delta=EXCLUDED.delta,
                   source=EXCLUDED.source""",
            tuples,
            page_size=1000,
        )
        for gid in goods_ids:
            c.execute(
                """UPDATE goods_sync_state SET
                       sold_daily_row_count = (
                           SELECT COUNT(*) FROM goods_sold_daily WHERE goods_id=%s
                       ),
                       updated_at=NOW()
                   WHERE goods_id=%s""",
                (gid, gid),
            )
    conn.commit()
    return len(tuples)


def apply_sold_snapshots_batch(conn, rows: list[dict]) -> int:
    """批量写入 sold_snapshots → goods_sold_snapshots（retention=0 时全量保留）。"""
    if not rows:
        return 0
    days = snapshot_retention_days()
    cutoff = None if days <= 0 else datetime.now() - timedelta(days=days)
    tuples = []
    goods_ids = set()
    for r in rows:
        snap_raw = r.get("snapshot_time") or r.get("snapshot_at") or ""
        if not snap_raw:
            continue
        snap = str(snap_raw).replace(" ", "T")[:19]
        try:
            snap_dt = datetime.fromisoformat(snap)
        except ValueError:
            continue
        if cutoff is not None and snap_dt < cutoff:
            continue
        gid = str(r["goods_id"])
        tuples.append(
            (
                gid,
                snap_dt,
                int(r.get("sold_num") or 0),
                r.get("data_source") or "local_sync",
            )
        )
        goods_ids.add(gid)

    if not tuples:
        return 0

    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        psycopg2.extras.execute_values(
            c,
            """INSERT INTO goods_sold_snapshots (
                   goods_id, snapshot_time, sold_num, data_source
               ) VALUES %s
               ON CONFLICT (goods_id, snapshot_time) DO UPDATE SET
                   sold_num=EXCLUDED.sold_num,
                   data_source=EXCLUDED.data_source""",
            tuples,
            page_size=1000,
        )
        for gid in goods_ids:
            c.execute(
                """UPDATE goods_sync_state SET
                       sold_snapshots_row_count = (
                           SELECT COUNT(*) FROM goods_sold_snapshots WHERE goods_id=%s
                       ),
                       updated_at=NOW()
                   WHERE goods_id=%s""",
                (gid, gid),
            )
    conn.commit()
    return len(tuples)


def prune_sold_snapshots(conn, retention_days: int | None = None) -> int:
    days = retention_days if retention_days is not None else snapshot_retention_days()
    if days <= 0:
        return 0
    cutoff = datetime.now() - timedelta(days=days)
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute("DELETE FROM goods_sold_snapshots WHERE snapshot_time < %s", (cutoff,))
        deleted = c.rowcount
    conn.commit()
    return deleted


def _int_detail(v, default: int = 0) -> int:
    if v is None or v == "":
        return default
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def apply_monitor_goods_detail(c, goods_id: str, detail: dict | None) -> None:
    """用采集详情刷新 monitor_goods 标题/店铺/粉丝/店铺销量（有值则覆盖为最新）。"""
    if not detail:
        return
    title = str(detail.get("product_name") or detail.get("title") or "").strip()
    store_id = str(detail.get("shop_id") or detail.get("store_id") or "").strip()
    store_name = str(detail.get("shop_name") or detail.get("store_name") or "").strip()
    shop_fans = _int_detail(detail.get("fans_count"))
    shop_sales = _int_detail(detail.get("shop_total_sales"))
    if not any((title, store_id, store_name, shop_fans, shop_sales)):
        return
    gid = str(goods_id)
    c.execute("SET search_path TO xhs_monitor, public")
    c.execute(
        """UPDATE monitor_goods SET
               title=CASE WHEN %s<>'' THEN %s ELSE title END,
               store_id=CASE WHEN %s<>'' THEN %s ELSE store_id END,
               store_name=CASE WHEN %s<>'' THEN %s ELSE store_name END,
               shop_fans=CASE WHEN %s>0 THEN %s ELSE shop_fans END,
               shop_sales=CASE WHEN %s>0 THEN %s ELSE shop_sales END,
               updated_at=NOW()
           WHERE goods_id=%s""",
        (
            title,
            title,
            store_id,
            store_id,
            store_name,
            store_name,
            shop_fans,
            shop_fans,
            shop_sales,
            shop_sales,
            gid,
        ),
    )


def record_cloud_scan(
    conn,
    goods_id: str,
    sold_num: int,
    data_source: str = "cloud_scan",
    snapshot_time: datetime | None = None,
    deal_price: float | None = None,
    detail: dict | None = None,
) -> dict:
    """云扫描单点写入 snapshots + 更新 monitor_goods + 当日 sold_daily。"""
    now = snapshot_time or datetime.now()
    today = now.date().isoformat()
    yesterday = (now.date() - timedelta(days=1)).isoformat()
    gid = str(goods_id)
    sold_num = int(sold_num)
    detail = dict(detail or {})
    price_val = deal_price
    if price_val is None:
        try:
            price_val = float(
                detail.get("deal_price")
                or detail.get("product_price")
                or 0
            )
        except (TypeError, ValueError):
            price_val = 0.0
    else:
        try:
            price_val = float(price_val)
        except (TypeError, ValueError):
            price_val = 0.0

    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        if detail:
            apply_monitor_goods_detail(c, gid, detail)
        c.execute(
            """INSERT INTO goods_sold_snapshots (goods_id, snapshot_time, sold_num, data_source)
               VALUES (%s,%s,%s,%s)
               ON CONFLICT (goods_id, snapshot_time) DO UPDATE SET
                   sold_num=EXCLUDED.sold_num, data_source=EXCLUDED.data_source""",
            (gid, now, sold_num, data_source),
        )
        c.execute(
            """SELECT sold_num, delta FROM goods_sold_daily
               WHERE goods_id=%s AND snapshot_date=%s""",
            (gid, today),
        )
        existing = c.fetchone()
        if existing:
            start_sold = int(existing[0] or 0) - int(existing[1] or 0)
            delta = max(0, sold_num - start_sold)
            sold_base = start_sold
        else:
            c.execute(
                """SELECT sold_num FROM goods_sold_daily
                   WHERE goods_id=%s AND snapshot_date=%s""",
                (gid, yesterday),
            )
            prev_row = c.fetchone()
            prev_sold = int(prev_row[0] or 0) if prev_row else 0
            delta = max(0, sold_num - prev_sold)
            sold_base = prev_sold

        gr_val = round(float(delta) / sold_base * 100, 4) if sold_base > 0 else 0.0

        c.execute(
            """INSERT INTO goods_sold_daily (goods_id, snapshot_date, sold_num, deal_price, delta, source)
               VALUES (%s,%s,%s,%s,%s,%s)
               ON CONFLICT (goods_id, snapshot_date) DO UPDATE SET
                   sold_num=EXCLUDED.sold_num,
                   deal_price=CASE WHEN EXCLUDED.deal_price > 0 THEN EXCLUDED.deal_price ELSE goods_sold_daily.deal_price END,
                   delta=EXCLUDED.delta,
                   source=EXCLUDED.source""",
            (gid, today, sold_num, price_val if price_val > 0 else None, delta, data_source),
        )
        c.execute(
            """UPDATE monitor_goods SET
                   last_sold=%s,
                   last_actual_v1d=%s,
                   last_v1d=%s,
                   updated_at=NOW()
               WHERE goods_id=%s AND monitor_status IN ('active','idle')""",
            (sold_num, float(delta), float(delta), gid),
        )
        c.execute(
            """INSERT INTO goods_metrics_daily (goods_id, metric_date, v1d, actual_v1d, gr, burst, pool)
               SELECT goods_id, %s, %s, %s, %s, 0, pool FROM monitor_goods WHERE goods_id=%s
               ON CONFLICT (goods_id, metric_date) DO UPDATE SET
                   v1d=EXCLUDED.v1d, actual_v1d=EXCLUDED.actual_v1d, gr=EXCLUDED.gr""",
            (today, float(delta), float(delta), gr_val, gid),
        )
    conn.commit()
    return {"goods_id": gid, "sold_num": sold_num, "delta": delta, "snapshot_time": now.isoformat()}


def mark_scan_result(
    conn,
    goods_id: str,
    status: str,
    engine: str = "",
    message: str = "",
) -> None:
    """记录单次扫描结果（任何状态均更新 last_scan_at，避免 fail 商品同批反复重扫）。"""
    del message
    gid = str(goods_id)
    st = str(status or "fail")[:16]
    eng = str(engine or "")[:32]
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            """UPDATE monitor_goods SET
                   last_scan_at=NOW(), last_scan_status=%s,
                   last_scan_engine=%s,
                   scan_claim_by=NULL, scan_claim_until=NULL,
                   updated_at=NOW()
               WHERE goods_id=%s""",
            (st, eng, gid),
        )
    conn.commit()


def record_daemon_batch_stats(
    conn,
    batch_size: int,
    ok: int,
    fail: int,
    risk: int,
    frozen: int,
    wall_ms: int,
    note: str = "",
) -> None:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            """INSERT INTO daemon_scan_stats
               (batch_size, ok, fail, risk, frozen, wall_ms, note)
               VALUES (%s,%s,%s,%s,%s,%s,%s)""",
            (batch_size, ok, fail, risk, frozen, wall_ms, (note or "")[:512]),
        )
    conn.commit()
