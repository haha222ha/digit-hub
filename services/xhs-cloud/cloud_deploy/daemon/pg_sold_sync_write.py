# -*- coding: utf-8 -*-
"""
PG 版销量快照写入 — 对齐爬虫 xhs_web_sold_sync_write.sync_sold_to_main_db 口径。

- 必写 goods_sold_snapshots
- 维护当日 goods_sold_daily（delta 仅上行累加）
- monitor_goods.last_sold 仅在上行时更新
- 缺失店铺/标题字段空值补齐
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from cloud_deploy.cloud_api.database_pg import _conn, init_db

_logger = logging.getLogger(__name__)
DATA_SOURCE = "web_full_sold_sync"


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _apply_missing_fields(c, goods_id: str, detail: dict) -> None:
    store_id = str(detail.get("shop_id") or "")
    store_name = str(detail.get("shop_name") or "")
    title = str(detail.get("product_name") or detail.get("title") or "")
    c.execute(
        """UPDATE monitor_goods SET
               title=COALESCE(NULLIF(title,''), %s),
               store_id=COALESCE(NULLIF(store_id,''), %s),
               store_name=COALESCE(NULLIF(store_name,''), %s),
               updated_at=NOW()
           WHERE goods_id=%s""",
        (title, store_id, store_name, goods_id),
    )


def sync_sold_to_pg(goods_id, detail, enrich_missing=True, data_source=None):
    """与 sync_sold_to_main_db 相同签名，供 FullSoldSyncDaemon 调用。"""
    ds = data_source or DATA_SOURCE
    try:
        new_sold = int(detail.get("real_sales") or detail.get("product_sales") or 0)
    except (TypeError, ValueError):
        return False, "invalid_sales", 0, 0

    if new_sold <= 0:
        return False, "no_sales", 0, 0

    gid = str(goods_id)
    now = datetime.now()
    today = now.date().isoformat()
    yesterday = (now.date() - timedelta(days=1)).isoformat()

    init_db()
    conn = _conn()
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                "SELECT last_sold FROM monitor_goods WHERE goods_id=%s AND monitor_status IN ('active','idle')",
                (gid,),
            )
            row = c.fetchone()
            if not row:
                return False, "not_in_main", 0, new_sold

            old_sold = int(row[0] or 0)

            c.execute(
                """INSERT INTO goods_sold_snapshots (goods_id, snapshot_time, sold_num, data_source)
                   VALUES (%s,%s,%s,%s)
                   ON CONFLICT (goods_id, snapshot_time) DO UPDATE SET
                       sold_num=EXCLUDED.sold_num, data_source=EXCLUDED.data_source""",
                (gid, now, new_sold, ds),
            )

            if new_sold > old_sold:
                delta = new_sold - old_sold
                c.execute(
                    """UPDATE monitor_goods SET
                           last_sold=%s,
                           last_actual_v1d=%s,
                           last_v1d=%s,
                           peak_v1d=GREATEST(COALESCE(peak_v1d,0), %s),
                           updated_at=NOW()
                       WHERE goods_id=%s""",
                    (new_sold, float(delta), float(delta), float(delta), gid),
                )
                c.execute(
                    """INSERT INTO goods_sold_daily (goods_id, snapshot_date, sold_num, delta, source)
                       VALUES (%s,%s,%s,%s,%s)
                       ON CONFLICT (goods_id, snapshot_date) DO UPDATE SET
                           sold_num=EXCLUDED.sold_num,
                           delta=goods_sold_daily.delta + EXCLUDED.delta,
                           source=EXCLUDED.source""",
                    (gid, today, new_sold, delta, ds),
                )
                c.execute(
                    """INSERT INTO goods_metrics_daily (goods_id, metric_date, v1d, actual_v1d, pool)
                       SELECT goods_id, %s, %s, %s, pool FROM monitor_goods WHERE goods_id=%s
                       ON CONFLICT (goods_id, metric_date) DO UPDATE SET
                           v1d=EXCLUDED.v1d, actual_v1d=EXCLUDED.actual_v1d""",
                    (today, float(delta), float(delta), gid),
                )
                status = "updated"
                effective = new_sold
            elif new_sold == old_sold:
                c.execute(
                    """INSERT INTO goods_sold_daily (goods_id, snapshot_date, sold_num, delta, source)
                       VALUES (%s,%s,%s,0,%s)
                       ON CONFLICT (goods_id, snapshot_date) DO NOTHING""",
                    (gid, today, new_sold, ds),
                )
                c.execute("UPDATE monitor_goods SET updated_at=NOW() WHERE goods_id=%s", (gid,))
                status = "snapshot"
                effective = new_sold
            else:
                c.execute(
                    """INSERT INTO goods_sold_daily (goods_id, snapshot_date, sold_num, delta, source)
                       VALUES (%s,%s,%s,0,%s)
                       ON CONFLICT (goods_id, snapshot_date) DO NOTHING""",
                    (gid, today, old_sold, ds),
                )
                c.execute("UPDATE monitor_goods SET updated_at=NOW() WHERE goods_id=%s", (gid,))
                status = "snapshot"
                effective = old_sold

            if enrich_missing:
                _apply_missing_fields(c, gid, detail)

        conn.commit()
        return True, status, old_sold, effective
    except Exception as e:
        conn.rollback()
        _logger.warning("PG 销量快照落库失败 %s: %s", gid, e)
        return False, "db_error", 0, new_sold
    finally:
        conn.close()


def recalc_velocity_after_sync(goods_ids: list[str]) -> int:
    """批量刷新 monitor_goods.last_v1d（对齐爬虫 velocity 重算入口）。"""
    if not goods_ids:
        return 0
    today = _today()
    init_db()
    conn = _conn()
    n = 0
    try:
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            for gid in goods_ids:
                c.execute(
                    """SELECT delta FROM goods_sold_daily
                       WHERE goods_id=%s AND snapshot_date=%s""",
                    (str(gid), today),
                )
                row = c.fetchone()
                if not row:
                    continue
                delta = float(row[0] or 0)
                c.execute(
                    """UPDATE monitor_goods SET
                           last_v1d=%s, last_actual_v1d=%s, updated_at=NOW()
                       WHERE goods_id=%s""",
                    (delta, delta, str(gid)),
                )
                n += 1
        conn.commit()
        return n
    finally:
        conn.close()
