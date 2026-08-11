# -*- coding: utf-8 -*-
"""PG 读取与报告行转换（输出 28 列，与桌面报告 data.js 对齐）。"""
from __future__ import annotations

import os
from datetime import date, timedelta
from typing import Any

from cloud_deploy.reporting.constants import (
    DEFAULT_MIN_ACTUAL,
    DEFAULT_MIN_ACTUAL_VIRTUAL,
    DEFAULT_MIN_V1D,
    DEFAULT_MIN_V1D_VIRTUAL,
    REPORT_COLUMNS,
    item_at,
)


def thresholds_for(is_virtual: bool, min_v1d=DEFAULT_MIN_V1D, min_actual=DEFAULT_MIN_ACTUAL,
                   min_v1d_virtual=DEFAULT_MIN_V1D_VIRTUAL, min_actual_virtual=DEFAULT_MIN_ACTUAL_VIRTUAL):
    if is_virtual:
        return min_v1d_virtual, min_actual_virtual
    return min_v1d, min_actual


def passes_threshold_values(
    *,
    is_virtual: bool,
    v1d: float,
    actual_v1d: float,
    sold: float,
    min_v1d=DEFAULT_MIN_V1D,
    min_actual=DEFAULT_MIN_ACTUAL,
    min_v1d_virtual=DEFAULT_MIN_V1D_VIRTUAL,
    min_actual_virtual=DEFAULT_MIN_ACTUAL_VIRTUAL,
) -> bool:
    if sold > 200000:
        return False
    if v1d > 50000 or actual_v1d > 50000:
        return False
    th_v1d, th_actual = thresholds_for(
        is_virtual, min_v1d, min_actual, min_v1d_virtual, min_actual_virtual
    )
    return v1d > th_v1d or actual_v1d >= th_actual


def passes_threshold_row(row: dict, min_v1d=DEFAULT_MIN_V1D, min_actual=DEFAULT_MIN_ACTUAL,
                         min_v1d_virtual=DEFAULT_MIN_V1D_VIRTUAL,
                         min_actual_virtual=DEFAULT_MIN_ACTUAL_VIRTUAL) -> bool:
    return passes_threshold_values(
        is_virtual=bool(row.get("is_virtual")),
        v1d=_f(row.get("v1d")),
        actual_v1d=_f(row.get("actual_v1d")),
        sold=_f(row.get("sold")),
        min_v1d=min_v1d,
        min_actual=min_actual,
        min_v1d_virtual=min_v1d_virtual,
        min_actual_virtual=min_actual_virtual,
    )


def passes_threshold(item: list, min_v1d=DEFAULT_MIN_V1D, min_actual=DEFAULT_MIN_ACTUAL,
                     min_v1d_virtual=DEFAULT_MIN_V1D_VIRTUAL, min_actual_virtual=DEFAULT_MIN_ACTUAL_VIRTUAL) -> bool:
    return passes_threshold_values(
        is_virtual=bool(item_at(item, "is_virtual")),
        v1d=float(item_at(item, "v1d", 0) or 0),
        actual_v1d=float(item_at(item, "actual_v1d", 0) or 0),
        sold=float(item_at(item, "sold", 0) or 0),
        min_v1d=min_v1d,
        min_actual=min_actual,
        min_v1d_virtual=min_v1d_virtual,
        min_actual_virtual=min_actual_virtual,
    )


def dedup_by_title(items: list) -> list:
    best: dict[str, list] = {}
    for item in items:
        title = (item_at(item, "title", "") or "").strip()
        if not title:
            continue
        prev = best.get(title)
        if not prev:
            best[title] = item
            continue
        a_act = float(item_at(item, "actual_v1d", 0) or 0)
        a_v1d = float(item_at(item, "v1d", 0) or 0)
        p_act = float(item_at(prev, "actual_v1d", 0) or 0)
        p_v1d = float(item_at(prev, "v1d", 0) or 0)
        if a_act > p_act or (a_act == p_act and a_v1d > p_v1d):
            best[title] = item
    out = list(best.values())
    out.sort(key=lambda r: (-float(item_at(r, "actual_v1d", 0) or 0), -float(item_at(r, "v1d", 0) or 0)))
    return out


def _f(v, default=0):
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _i(v, default=0):
    if v is None:
        return default
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def _fmt_ts(v) -> str:
    if v is None or v == "":
        return ""
    s = str(v).strip()
    return s[:19] if len(s) >= 10 else s


def _norm_anomaly(v) -> int:
    if v in (None, "", 0, "0", False):
        return 0
    if str(v).strip().lower() in ("0", "false", "no"):
        return 0
    return 1


def calc_fan_sales_ratios(shop_fans: int, shop_sales: int, sold: int) -> tuple[float | None, float | None]:
    fans = _i(shop_fans)
    shop_sales_n = _i(shop_sales)
    sold_n = _i(sold)
    shop_fsr = round(fans / shop_sales_n, 6) if fans > 0 and shop_sales_n > 0 else None
    goods_fsr = round(fans / sold_n, 6) if fans > 0 and sold_n > 0 else None
    return shop_fsr, goods_fsr


def row_to_report_item(row: dict) -> list:
    """report_daily_items 行或等价 dict → 28 列 items 数组。"""
    sold = _i(row.get("sold") if row.get("sold") is not None else row.get("sold_num"))
    actual_v1d = _f(row.get("actual_v1d"))
    shop_sales = _i(row.get("shop_sales"))
    shop_fans = _i(row.get("shop_fans"))
    shop_fsr = row.get("shop_fsr")
    goods_fsr = row.get("goods_fsr")
    if shop_fsr is None or goods_fsr is None:
        calc_shop, calc_goods = calc_fan_sales_ratios(shop_fans, shop_sales, sold)
        if shop_fsr is None:
            shop_fsr = calc_shop
        if goods_fsr is None:
            goods_fsr = calc_goods

    v1d = _f(row.get("v1d"))
    if v1d <= 0 and actual_v1d > 0:
        v1d = actual_v1d
    actual_gr = _f(row.get("actual_gr"))
    gr = _f(row.get("gr"))
    if gr <= 0 and actual_gr > 0:
        gr = actual_gr
    actual_vsr = _f(row.get("actual_vsr")) or (round(actual_v1d / sold, 4) if sold > 0 else 0)
    vsr = _f(row.get("vsr"))
    if vsr <= 0 and v1d > 0 and sold > 0:
        vsr = round(v1d / sold, 4)
    elif vsr <= 0 and actual_vsr > 0:
        vsr = actual_vsr

    base_hours = row.get("base_hours")
    values = {
        "goods_id": row.get("goods_id") or "",
        "title": row.get("title") or "",
        "price": _f(row.get("price") if row.get("price") is not None else row.get("deal_price")),
        "sold": sold,
        "v1h": _f(row.get("v1h")),
        "v6h": _f(row.get("v6h")),
        "actual_v1d": actual_v1d,
        "v1d": v1d,
        "actual_gr": actual_gr,
        "gr": gr,
        "actual_vsr": actual_vsr,
        "vsr": vsr,
        "acc": _f(row.get("acc")),
        "burst": _f(row.get("burst")),
        "pool": row.get("pool") or "WATCH",
        "first_seen": _fmt_ts(row.get("first_seen")),
        "store_id": row.get("store_id") or "",
        "store_name": row.get("store_name") or "",
        "shelf_time": _fmt_ts(row.get("shelf_time")),
        "shop_sales": shop_sales,
        "shop_fans": shop_fans,
        "shop_fsr": _f(shop_fsr) if shop_fsr is not None else 0.0,
        "goods_fsr": _f(goods_fsr) if goods_fsr is not None else 0.0,
        "behavior": row.get("behavior") or "",
        "is_virtual": 1 if row.get("is_virtual") else 0,
        "base_hours": _f(base_hours) if base_hours not in (None, "") else 0.0,
        "base_at": _fmt_ts(row.get("base_at")),
        "anomaly": _norm_anomaly(row.get("anomaly")),
        "category_tag": str(row.get("category_tag") or "").strip()[:64],
    }
    return [values[k] for k in REPORT_COLUMNS]


def db_row_to_item(row: dict) -> list:
    """report_daily_items 行 → 28 列 items 数组。"""
    return row_to_report_item(row)


def _pick_str(*vals: Any) -> str:
    for v in vals:
        s = str(v or "").strip()
        if s:
            return s
    return ""


def _pick_first_seen(row: dict) -> str:
    """真实首次发现：优先历史 report / monitor_goods.first_seen，勿用入云时间 first_tracked_at。"""
    for key in ("mg_first_seen", "rdi_first_seen_min", "rdi_first_seen"):
        v = row.get(key)
        if v is None or v == "":
            continue
        s = str(v).strip()
        if len(s) >= 10:
            return s[:19]
    ft = row.get("first_tracked_at")
    return str(ft)[:19] if ft else ""


def _pick_int(*vals: Any) -> int:
    for v in vals:
        n = _i(v, 0)
        if n > 0:
            return n
    return 0


def _compute_daily_actual(sold: int, prev_sold: int | None, delta: int) -> float | None:
    """真实日增量：优先 今日销量 − 昨日销量，其次 PG delta（排除首日 delta≈总销量）。"""
    if prev_sold is not None:
        actual = max(0.0, float(sold - prev_sold))
        if actual > 0:
            return actual
    if delta > 0:
        if prev_sold is None and sold > 0 and float(delta) >= float(sold) * 0.95:
            return None
        return float(delta)
    return None


def _v1d_looks_like_sold(v1d: float, sold: int, actual: float) -> bool:
    """v1d 被误写成累计销量（非日增量）。"""
    if sold <= 0 or v1d <= 0:
        return False
    ratio = abs(v1d - sold) / max(float(sold), 1.0)
    if ratio >= 0.05:
        return False
    if actual <= 0:
        return True
    return actual < sold * 0.05


def _pick_v1d(actual: float, stored_v1d: float, gm_v1d: float, sold: int) -> float:
    """预估日增量：拒绝「≈总销量」的脏值，否则回落到真实增量。"""
    for cand in (stored_v1d, gm_v1d):
        if cand > 0 and not _v1d_looks_like_sold(cand, sold, actual):
            return float(cand)
    return float(actual) if actual > 0 else 0.0


def _recompute_derived_rates(row: dict) -> None:
    sold = _i(row.get("sold"))
    actual = _f(row.get("actual_v1d"))
    v1d = _f(row.get("v1d"))
    if actual > 0:
        sold_base = max(sold - int(actual), 1) if sold > int(actual) else max(sold, 1)
        row["actual_gr"] = round(actual / sold_base * 100, 2)
        row["actual_vsr"] = round(actual / sold, 4) if sold > 0 else 0.0
    if v1d > 0 and sold > 0:
        row["vsr"] = round(v1d / sold, 4)
    if _f(row.get("gr")) <= 0 and _f(row.get("actual_gr")) > 0:
        row["gr"] = row["actual_gr"]


def _fetch_sold_daily_map(conn, report_date: str, goods_ids: list[str]) -> dict[str, dict]:
    if not goods_ids:
        return {}
    d = date.fromisoformat(report_date)
    prev = (d - timedelta(days=1)).isoformat()
    out: dict[str, dict] = {}
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        for i in range(0, len(goods_ids), 500):
            chunk = goods_ids[i : i + 500]
            ph = ", ".join("%s" for _ in chunk)
            c.execute(
                f"""
                SELECT sd.goods_id, sd.sold_num, sd.delta,
                       sp.sold_num AS prev_sold,
                       gm.v1d AS gm_v1d, gm.actual_v1d AS gm_actual_v1d
                FROM goods_sold_daily sd
                LEFT JOIN goods_sold_daily sp
                       ON sp.goods_id = sd.goods_id AND sp.snapshot_date = %s
                LEFT JOIN goods_metrics_daily gm
                       ON gm.goods_id = sd.goods_id AND gm.metric_date = %s
                WHERE sd.snapshot_date = %s AND sd.goods_id IN ({ph})
                """,
                (prev, report_date, report_date, *chunk),
            )
            cols = [d[0] for d in c.description]
            for r in c.fetchall():
                row = dict(zip(cols, r))
                out[str(row["goods_id"])] = row
    return out


def reconcile_row_metrics(row: dict, sold_info: dict | None) -> dict | None:
    """
    用 goods_sold_daily 校正 report_daily_items 中 actual=0 / v1d≈sold 的脏行。
    无法得到正增量且原行也无有效 actual 时返回 None（不入报告）。
    """
    sold = _i(row.get("sold"))
    actual = _f(row.get("actual_v1d"))
    v1d = _f(row.get("v1d"))
    gm_v1d = _f(sold_info.get("gm_v1d") if sold_info else 0)
    gm_actual = _f(sold_info.get("gm_actual_v1d") if sold_info else 0)

    if sold_info:
        sd_sold = _i(sold_info.get("sold_num"))
        prev_raw = sold_info.get("prev_sold")
        prev_sold = _i(prev_raw) if prev_raw is not None else None
        delta = _i(sold_info.get("delta"))
        if sd_sold > 0:
            sold = sd_sold
            row["sold"] = sold
        recalc = _compute_daily_actual(sold, prev_sold, delta)
        if recalc is not None and recalc > 0:
            actual = recalc
        elif actual <= 0 and gm_actual > 0:
            actual = gm_actual
        row["actual_v1d"] = actual

    if _v1d_looks_like_sold(v1d, sold, actual) or v1d <= 0:
        v1d = _pick_v1d(actual, v1d, gm_v1d, sold)
        row["v1d"] = v1d

    if actual <= 0:
        return None

    _recompute_derived_rates(row)
    return row


def fetch_items_from_daily_table(conn, report_date: str, *, reconcile_sold: bool = True) -> list:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            """SELECT * FROM report_daily_items
               WHERE report_date=%s ORDER BY rank_no ASC, actual_v1d DESC""",
            (report_date,),
        )
        cols = [d[0] for d in c.description]
        rows = [dict(zip(cols, r)) for r in c.fetchall()]
    if not rows:
        return []
    sold_map: dict[str, dict] = {}
    if reconcile_sold:
        sold_map = _fetch_sold_daily_map(conn, report_date, [str(r.get("goods_id") or "") for r in rows])
    items: list = []
    fixed = dropped = 0
    for raw in rows:
        gid = str(raw.get("goods_id") or "")
        if reconcile_sold:
            reconciled = reconcile_row_metrics(dict(raw), sold_map.get(gid))
            if reconciled is None:
                dropped += 1
                continue
            if (
                _f(reconciled.get("actual_v1d")) != _f(raw.get("actual_v1d"))
                or _f(reconciled.get("v1d")) != _f(raw.get("v1d"))
            ):
                fixed += 1
            items.append(db_row_to_item(reconciled))
        else:
            items.append(db_row_to_item(raw))
    if reconcile_sold and (fixed or dropped):
        print(
            f"[pg_reader] reconcile {report_date}: fixed={fixed} dropped={dropped} kept={len(items)}",
            flush=True,
        )
    return items


def _premium_table_exists(conn) -> bool:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            """SELECT 1 FROM information_schema.tables
               WHERE table_schema='xhs_monitor' AND table_name='premium_goods' LIMIT 1"""
        )
        return c.fetchone() is not None


def _tier_to_pool(tier: str) -> str:
    t = (tier or "B").strip().upper()
    return {"S": "BURST", "A": "ACCEL", "B": "WATCH", "C": "NEW"}.get(t, "WATCH")


def _premium_has_metric_signal(row: dict) -> bool:
    return (
        _f(row.get("pgd_actual_delta")) > 0
        or _i(row.get("pgd_delta")) > 0
        or _f(row.get("actual_velocity_1d")) > 0
        or _f(row.get("velocity_1d")) > 0
        or row.get("prev_sold") is not None
    )


def premium_row_to_item(row: dict, *, sold_info: dict | None = None, delta_only: bool = False) -> list | None:
    """premium_goods (+ 可选 premium_goods_daily / goods_sold_daily) → 28 列报告行。"""
    sold = _i(row.get("pgd_sold")) or _i(row.get("sold_num"))
    prev_raw = row.get("prev_sold")
    prev_sold = _i(prev_raw) if prev_raw is not None else None
    delta = _i(row.get("pgd_delta"))
    actual = _f(row.get("pgd_actual_delta"))
    stored_v1d = _f(row.get("pgd_velocity")) or _f(row.get("velocity_1d"))
    gm_v1d = _f(sold_info.get("gm_v1d") if sold_info else 0)

    if sold_info:
        sd_sold = _i(sold_info.get("sold_num"))
        if sd_sold > 0:
            sold = sd_sold
        sp = sold_info.get("prev_sold")
        if sp is not None:
            prev_sold = _i(sp)
        sd_delta = _i(sold_info.get("delta"))
        if sd_delta > 0:
            delta = sd_delta

    recalc = _compute_daily_actual(sold, prev_sold, delta)
    if recalc is not None and recalc > 0:
        actual = recalc
    elif delta_only and delta > 0:
        actual = float(delta)
    elif actual <= 0:
        actual = _f(row.get("actual_velocity_1d"))
    if actual <= 0 and delta_only and delta > 0:
        actual = float(delta)
    if actual <= 0 and sold_info:
        gm_actual = _f(sold_info.get("gm_actual_v1d"))
        if gm_actual > 0:
            actual = gm_actual
    if actual <= 0:
        return None

    v1d = _pick_v1d(actual, stored_v1d, gm_v1d, sold)
    if v1d <= 0:
        v1d = actual

    shop_fans = _i(row.get("shop_fans"))
    shop_sales = _i(row.get("shop_sales"))
    shop_fsr, goods_fsr = calc_fan_sales_ratios(shop_fans, shop_sales, sold)
    sold_base = max((prev_sold or 0), sold - int(actual), 1)
    actual_gr = round(actual / sold_base * 100, 2)
    actual_vsr = round(actual / sold, 4) if sold > 0 else 0
    vsr = round(v1d / sold, 4) if sold > 0 and abs(v1d - actual) > 0.01 else actual_vsr

    merged = {
        "goods_id": row.get("goods_id") or "",
        "title": row.get("title") or "",
        "price": _f(row.get("deal_price")),
        "sold": sold,
        "v1h": 0,
        "v6h": 0,
        "actual_v1d": round(actual, 1),
        "v1d": round(v1d, 1),
        "actual_gr": actual_gr,
        "gr": actual_gr,
        "actual_vsr": actual_vsr,
        "vsr": vsr,
        "acc": 0,
        "burst": _f(row.get("burst_score")),
        "pool": _tier_to_pool(row.get("tier")),
        "first_seen": _fmt_ts(row.get("first_seen_at") or row.get("first_report_date")),
        "store_id": row.get("store_id") or "",
        "store_name": row.get("store_name") or "",
        "shelf_time": "",
        "shop_sales": shop_sales,
        "shop_fans": shop_fans,
        "shop_fsr": shop_fsr or 0.0,
        "goods_fsr": goods_fsr or 0.0,
        "behavior": "",
        "is_virtual": 1 if row.get("is_virtual") else 0,
        "base_hours": 0,
        "base_at": "",
        "anomaly": 0,
        "category_tag": _pick_str(row.get("rdi_category_tag"), row.get("category_tag")),
    }
    return row_to_report_item(merged)


def fetch_items_from_premium_daily(conn, report_date: str, *, incremental_only: bool = True) -> list:
    """从 premium_goods + premium_goods_daily 构造报告行。

    incremental_only=True（默认）：仅当日有日快照且 actual_delta/delta>0 的精品（选品报告）。
    incremental_only=False：全表 premium_goods LEFT JOIN 当日快照（历史全量，慎用大数据量）。
    """
    if not _premium_table_exists(conn):
        return []
    d = date.fromisoformat(report_date)
    prev = (d - timedelta(days=1)).isoformat()
    join_pgd = "INNER JOIN" if incremental_only else "LEFT JOIN"
    incr_filter = ""
    if incremental_only:
        incr_filter = """
              AND (
                COALESCE(pgd.actual_delta, 0) > 0
                OR COALESCE(pgd.delta, 0) > 0
              )
        """
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            f"""
            SELECT pg.goods_id, pg.title, pg.deal_price, pg.sold_num, pg.velocity_1d,
                   pg.actual_velocity_1d, pg.burst_score, pg.tier, pg.store_id, pg.store_name,
                   pg.shop_fans, pg.shop_sales, pg.is_virtual, pg.first_seen_at, pg.first_report_date,
                   pgd.sold_num AS pgd_sold, pgd.delta AS pgd_delta,
                   pgd.actual_delta AS pgd_actual_delta, pgd.velocity_1d AS pgd_velocity,
                   pgd_prev.sold_num AS prev_sold
            FROM premium_goods pg
            {join_pgd} premium_goods_daily pgd
                   ON pgd.goods_id = pg.goods_id AND pgd.snap_date = %s
            LEFT JOIN premium_goods_daily pgd_prev
                   ON pgd_prev.goods_id = pg.goods_id AND pgd_prev.snap_date = %s
            WHERE pg.lifecycle < 3
            {incr_filter}
            """,
            (report_date, prev),
        )
        cols = [d[0] for d in c.description]
        rows = [dict(zip(cols, r)) for r in c.fetchall()]

    items: list = []
    retry_rows: dict[str, dict] = {}
    for raw in rows:
        item = premium_row_to_item(raw)
        if item:
            items.append(item)
            continue
        gid = str(raw.get("goods_id") or "")
        if gid and _premium_has_metric_signal(raw):
            retry_rows[gid] = raw

    if retry_rows:
        sold_map = _fetch_sold_daily_map(conn, report_date, list(retry_rows.keys()))
        for gid, raw in retry_rows.items():
            item = premium_row_to_item(raw, sold_info=sold_map.get(gid))
            if item:
                items.append(item)

    items.sort(key=lambda x: (-float(item_at(x, "actual_v1d", 0) or 0), -float(item_at(x, "v1d", 0) or 0)))
    mode = "incr" if incremental_only else "full"
    print(
        f"[pg_reader] premium_daily/{mode} {report_date}: kept={len(items)} pool={len(rows)} retry={len(retry_rows)}",
        flush=True,
    )
    return items


def merge_items_by_goods_id(base: list, extra: list) -> list:
    """按 goods_id 合并：base 优先，extra 仅补 base 中缺失的商品。"""
    by_id: dict[str, list] = {}
    for item in base:
        gid = str(item_at(item, "goods_id", "") or "")
        if gid:
            by_id[gid] = item
    added = 0
    for item in extra:
        gid = str(item_at(item, "goods_id", "") or "")
        if not gid or gid in by_id:
            continue
        by_id[gid] = item
        added += 1
    out = list(by_id.values())
    out.sort(key=lambda x: (-float(item_at(x, "actual_v1d", 0) or 0), -float(item_at(x, "v1d", 0) or 0)))
    if added:
        print(f"[pg_reader] merge: +{added} extra goods (base={len(base)} total={len(out)})", flush=True)
    return out


def fetch_items_auto(conn, report_date: str) -> list:
    """选品日报：当日精品增量 ∪ 当日监控池增量（同 goods_id 精品 metadata 优先）。"""
    premium = fetch_items_from_premium_daily(conn, report_date, incremental_only=True)
    monitor = fetch_items_from_monitor_incremental(conn, report_date)
    if premium and monitor:
        merged = merge_items_by_goods_id(premium, monitor)
        print(
            f"[pg_reader] auto {report_date}: premium_incr={len(premium)} "
            f"monitor_incr={len(monitor)} merged={len(merged)}",
            flush=True,
        )
        return merged
    if premium:
        return premium
    if monitor:
        return monitor
    return []


def insight_min_delta() -> int:
    """AI 情报观察池：相对上次扫描销量差阈值（默认 1）。"""
    try:
        return max(1, int(os.environ.get("INSIGHT_MIN_DELTA", "1")))
    except ValueError:
        return 1


def insight_scan_window_days() -> int:
    """观察池扫描窗：最近 N 个自然日（默认 1 = 仅报告日当日扫描）。"""
    try:
        return max(1, int(os.environ.get("INSIGHT_SCAN_WINDOW_DAYS", "1")))
    except ValueError:
        return 1


def _insight_scan_bounds(report_date: str, window_days: int) -> tuple[str, str, str, str]:
    end_d = date.fromisoformat(report_date)
    start_d = end_d - timedelta(days=window_days - 1)
    start_date = start_d.isoformat()
    end_date = end_d.isoformat()
    ts_start = f"{start_date} 00:00:00+00"
    ts_end = f"{(end_d + timedelta(days=1)).isoformat()} 00:00:00+00"
    return start_date, end_date, ts_start, ts_end


def _scan_delta_sold_cap() -> int:
    return 200_000


def _fetch_premium_scan_delta_rows(
    conn, report_date: str, min_delta: int, *, window_days: int
) -> list[dict]:
    """精品库：扫描窗内 premium_goods_daily.delta（对齐 sold_history.delta）。"""
    if not _premium_table_exists(conn):
        return []
    start_date, end_date, ts_start, ts_end = _insight_scan_bounds(report_date, window_days)
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            """
            SELECT DISTINCT ON (pg.goods_id)
                   pg.goods_id, pg.title, pg.deal_price, pg.sold_num, pg.velocity_1d,
                   pg.actual_velocity_1d, pg.burst_score, pg.tier, pg.store_id, pg.store_name,
                   pg.shop_fans, pg.shop_sales, pg.is_virtual, pg.first_seen_at, pg.first_report_date,
                   pgd.snap_date AS pgd_snap_date,
                   pgd.sold_num AS pgd_sold, pgd.delta AS pgd_delta,
                   pgd.actual_delta AS pgd_actual_delta, pgd.velocity_1d AS pgd_velocity,
                   prev.sold_num AS prev_sold,
                   rdi.category_tag AS rdi_category_tag
            FROM premium_goods pg
            INNER JOIN premium_goods_daily pgd
                   ON pgd.goods_id = pg.goods_id
                  AND pgd.snap_date >= %s AND pgd.snap_date <= %s
            LEFT JOIN LATERAL (
                SELECT p.sold_num
                FROM premium_goods_daily p
                WHERE p.goods_id = pg.goods_id AND p.snap_date < pgd.snap_date
                ORDER BY p.snap_date DESC
                LIMIT 1
            ) prev ON TRUE
            LEFT JOIN report_daily_items rdi
                   ON rdi.goods_id = pg.goods_id AND rdi.report_date = %s
            WHERE pg.lifecycle < 3
              AND COALESCE(pgd.delta, 0) >= %s
              AND COALESCE(pgd.sold_num, pg.sold_num, 0) <= %s
              AND (
                    EXISTS (
                        SELECT 1 FROM goods_sold_snapshots gss
                        WHERE gss.goods_id = pg.goods_id
                          AND gss.snapshot_time >= %s::timestamptz
                          AND gss.snapshot_time < %s::timestamptz
                    )
                    OR LEFT(
                        COALESCE(
                            NULLIF(pg.last_app_scan, ''),
                            NULLIF(pg.last_metric_scan, ''),
                            NULLIF(pg.web_sold_ok_at, ''),
                            pgd.snap_date
                        ),
                        10
                    ) >= %s
              )
            ORDER BY pg.goods_id, pgd.delta DESC, pgd.snap_date DESC
            """,
            (
                start_date,
                end_date,
                report_date,
                min_delta,
                _scan_delta_sold_cap(),
                ts_start,
                ts_end,
                start_date,
            ),
        )
        cols = [d[0] for d in c.description]
        return [dict(zip(cols, r)) for r in c.fetchall()]


def _fetch_sold_daily_scan_delta_rows(
    conn, report_date: str, min_delta: int, *, window_days: int
) -> list[dict]:
    """监控池：扫描窗内 goods_sold_daily.delta（补全不在精品库的商品）。"""
    start_date, end_date, ts_start, ts_end = _insight_scan_bounds(report_date, window_days)
    mg_shop = (
        "m.shop_sales AS mg_shop_sales, m.shop_fans AS mg_shop_fans,"
        if _monitor_goods_has_shop_cols(conn)
        else "NULL::int AS mg_shop_sales, NULL::int AS mg_shop_fans,"
    )
    mg_fs = (
        "m.first_seen AS mg_first_seen,"
        if _monitor_goods_has_first_seen(conn)
        else "NULL::timestamptz AS mg_first_seen,"
    )
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            f"""
            SELECT DISTINCT ON (sd.goods_id)
                   sd.goods_id, sd.sold_num, sd.delta, sd.deal_price,
                   prev.sold_num AS prev_sold,
                   COALESCE(m.title, pg.title) AS title,
                   COALESCE(m.is_virtual::int, pg.is_virtual) AS is_virtual,
                   COALESCE(m.pool, 'WATCH') AS pool,
                   COALESCE(m.store_id, pg.store_id) AS store_id,
                   COALESCE(m.store_name, pg.store_name) AS store_name,
                   m.first_tracked_at,
                   {mg_fs}
                   {mg_shop}
                   (SELECT MIN(r.first_seen)
                    FROM report_daily_items r
                    WHERE r.goods_id = sd.goods_id AND r.first_seen IS NOT NULL) AS rdi_first_seen_min,
                   gm.actual_v1d AS gm_actual_v1d, gm.v1d AS gm_v1d, gm.gr AS gm_gr,
                   rdi.title AS rdi_title,
                   rdi.price AS rdi_price,
                   rdi.actual_v1d AS rdi_actual_v1d,
                   rdi.v1d AS rdi_v1d,
                   rdi.actual_gr AS rdi_actual_gr,
                   rdi.gr AS rdi_gr,
                   rdi.actual_vsr AS rdi_actual_vsr,
                   rdi.vsr AS rdi_vsr,
                   rdi.v1h AS rdi_v1h,
                   rdi.v6h AS rdi_v6h,
                   rdi.acc AS rdi_acc,
                   rdi.burst AS rdi_burst,
                   rdi.pool AS rdi_pool,
                   rdi.first_seen AS rdi_first_seen,
                   rdi.store_id AS rdi_store_id,
                   rdi.store_name AS rdi_store_name,
                   rdi.shelf_time AS rdi_shelf_time,
                   rdi.shop_sales AS rdi_shop_sales,
                   rdi.shop_fans AS rdi_shop_fans,
                   rdi.shop_fsr AS rdi_shop_fsr,
                   rdi.goods_fsr AS rdi_goods_fsr,
                   rdi.behavior AS rdi_behavior,
                   rdi.is_virtual AS rdi_is_virtual,
                   rdi.base_hours AS rdi_base_hours,
                   rdi.base_at AS rdi_base_at,
                   rdi.anomaly AS rdi_anomaly,
                   rdi.category_tag AS rdi_category_tag
            FROM goods_sold_daily sd
            LEFT JOIN LATERAL (
                SELECT p.sold_num
                FROM goods_sold_daily p
                WHERE p.goods_id = sd.goods_id AND p.snapshot_date < sd.snapshot_date
                ORDER BY p.snapshot_date DESC
                LIMIT 1
            ) prev ON TRUE
            LEFT JOIN monitor_goods m ON m.goods_id = sd.goods_id
            LEFT JOIN premium_goods pg ON pg.goods_id = sd.goods_id AND pg.lifecycle < 3
            LEFT JOIN goods_metrics_daily gm
                   ON gm.goods_id = sd.goods_id AND gm.metric_date = %s
            LEFT JOIN LATERAL (
                SELECT *
                FROM report_daily_items r
                WHERE r.goods_id = sd.goods_id
                ORDER BY r.report_date DESC
                LIMIT 1
            ) rdi ON TRUE
            WHERE sd.snapshot_date >= %s AND sd.snapshot_date <= %s
              AND COALESCE(sd.delta, 0) >= %s
              AND COALESCE(sd.sold_num, 0) <= %s
              AND (
                    EXISTS (
                        SELECT 1 FROM goods_sold_snapshots gss
                        WHERE gss.goods_id = sd.goods_id
                          AND gss.snapshot_time >= %s::timestamptz
                          AND gss.snapshot_time < %s::timestamptz
                    )
                    OR (
                        m.last_scan_at IS NOT NULL
                        AND m.last_scan_at >= %s::timestamptz
                        AND m.last_scan_at < %s::timestamptz
                    )
              )
            ORDER BY sd.goods_id, sd.delta DESC, sd.snapshot_date DESC
            """,
            (
                report_date,
                start_date,
                end_date,
                min_delta,
                _scan_delta_sold_cap(),
                ts_start,
                ts_end,
                ts_start,
                ts_end,
            ),
        )
        cols = [d[0] for d in c.description]
        return [dict(zip(cols, r)) for r in c.fetchall()]


def fetch_items_from_scan_delta(
    conn,
    report_date: str,
    *,
    min_delta: int | None = None,
) -> list:
    """
    AI 情报观察池（delta_only + 最近 N 日扫描窗，默认 1 天）：

    - 主池：扫描窗内 premium_goods_daily.delta >= min_delta
    - 补池：扫描窗内 goods_sold_daily.delta >= min_delta（精品库未覆盖）
    - 扫描判定：goods_sold_snapshots.snapshot_time 或精品 last_app_scan 等
    - 唯一 goods_id；lifecycle<3；销量上限 20 万；不用 actual_velocity 卡门槛
    """
    min_delta = insight_min_delta() if min_delta is None else max(1, int(min_delta))
    window_days = insight_scan_window_days()

    premium_rows = _fetch_premium_scan_delta_rows(
        conn, report_date, min_delta, window_days=window_days
    )
    premium_items: list = []
    for raw in premium_rows:
        item = premium_row_to_item(raw, delta_only=True)
        if item:
            premium_items.append(item)

    premium_ids = {str(item_at(x, "goods_id", "") or "") for x in premium_items}
    premium_ids.discard("")

    sold_rows = _fetch_sold_daily_scan_delta_rows(
        conn, report_date, min_delta, window_days=window_days
    )
    monitor_items: list = []
    for r in sold_rows:
        gid = str(r.get("goods_id") or "")
        if gid and gid in premium_ids:
            continue
        prev_raw = r.get("prev_sold")
        prev_sold = _i(prev_raw) if prev_raw is not None else None
        item = sold_row_to_item(r, prev_sold)
        if item:
            monitor_items.append(item)

    items = merge_items_by_goods_id(premium_items, monitor_items)
    print(
        f"[pg_reader] scan_delta {report_date}: kept={len(items)} "
        f"premium={len(premium_items)}/{len(premium_rows)} "
        f"monitor+={len(monitor_items)} min_delta={min_delta} "
        f"scan_window_days={window_days} mode=delta_only",
        flush=True,
    )
    return items


def fetch_items_for_insight(conn, report_date: str, *, source: str | None = None) -> list:
    """V2 情报 / feed 专用数据源（默认 scan_delta；空池自动回退 pg_items）。"""
    src = (source or os.environ.get("INSIGHT_PG_SOURCE", "scan_delta")).strip().lower()
    if src in ("scan_delta", "delta", "insight"):
        items = fetch_items_from_scan_delta(conn, report_date)
        if items:
            return items
        # 扫描窗证据经常缺失；日报表仍有当日增量时不阻断夜间管道
        fallback = fetch_items_from_daily_table(conn, report_date, reconcile_sold=True)
        print(
            f"[pg_reader] scan_delta empty → fallback pg_items "
            f"date={report_date} n={len(fallback)}",
            flush=True,
        )
        return fallback
    if src == "auto":
        return fetch_items_auto(conn, report_date)
    if src == "pg_items":
        return fetch_items_from_daily_table(conn, report_date, reconcile_sold=True)
    raise ValueError(f"未知 INSIGHT_PG_SOURCE: {src}")


def sold_row_to_item(row: dict, prev_sold: int | None) -> list | None:
    """由 monitor_goods + goods_sold_daily (+ 可选 report_daily_items 补齐) 构造报告 item。"""
    sold = _i(row.get("sold_num"))
    delta = _i(row.get("delta"))
    gm_actual = _f(row.get("gm_actual_v1d"))
    gm_v1d = _f(row.get("gm_v1d"))
    gm_gr = _f(row.get("gm_gr"))
    rdi_actual = _f(row.get("rdi_actual_v1d"))
    rdi_v1d = _f(row.get("rdi_v1d"))

    if prev_sold is None:
        if delta > 0:
            actual_v1d = float(delta)
        elif gm_actual > 0:
            actual_v1d = gm_actual
        elif rdi_actual > 0:
            actual_v1d = rdi_actual
        else:
            return None
    else:
        actual_v1d = max(0.0, float(sold - prev_sold))
        if actual_v1d <= 0 and delta > 0:
            actual_v1d = float(delta)
        elif actual_v1d <= 0 and gm_actual > 0:
            actual_v1d = gm_actual

    if actual_v1d <= 0:
        return None

    v1d = _pick_v1d(actual_v1d, rdi_v1d, gm_v1d, sold)
    if v1d <= 0:
        v1d = actual_v1d
    sold_base = max(prev_sold or 0, 1) if (prev_sold or 0) > 0 else max(sold - int(actual_v1d), 1)
    actual_gr = _f(row.get("rdi_actual_gr")) or round(actual_v1d / sold_base * 100, 2)
    gr = _f(row.get("rdi_gr")) or gm_gr or actual_gr
    actual_vsr = _f(row.get("rdi_actual_vsr")) or (round(actual_v1d / sold, 4) if sold > 0 else 0)
    vsr = _f(row.get("rdi_vsr")) or (round(v1d / sold, 4) if sold > 0 and v1d != actual_v1d else actual_vsr)
    price = _f(row.get("deal_price") or row.get("rdi_price"))
    title = _pick_str(row.get("title"), row.get("rdi_title"))
    store_id = _pick_str(row.get("store_id"), row.get("rdi_store_id"))
    store_name = _pick_str(row.get("store_name"), row.get("rdi_store_name"))
    shop_sales = _pick_int(row.get("shop_sales"), row.get("rdi_shop_sales"), row.get("mg_shop_sales"))
    shop_fans = _pick_int(row.get("shop_fans"), row.get("rdi_shop_fans"), row.get("mg_shop_fans"))
    behavior = _pick_str(row.get("rdi_behavior"))
    pool = _pick_str(row.get("pool"), row.get("rdi_pool")) or "WATCH"
    is_virtual = row.get("is_virtual")
    if is_virtual is None:
        is_virtual = row.get("rdi_is_virtual")

    merged = {
        "goods_id": row.get("goods_id") or "",
        "title": title,
        "price": price,
        "sold": sold,
        "v1h": row.get("rdi_v1h"),
        "v6h": row.get("rdi_v6h"),
        "actual_v1d": round(actual_v1d, 1),
        "v1d": round(v1d, 1),
        "actual_gr": actual_gr,
        "gr": gr,
        "actual_vsr": actual_vsr,
        "vsr": vsr,
        "acc": row.get("rdi_acc"),
        "burst": row.get("rdi_burst"),
        "pool": pool,
        "first_seen": _pick_first_seen(row),
        "store_id": store_id,
        "store_name": store_name,
        "shelf_time": row.get("rdi_shelf_time"),
        "shop_sales": shop_sales,
        "shop_fans": shop_fans,
        "shop_fsr": row.get("rdi_shop_fsr"),
        "goods_fsr": row.get("rdi_goods_fsr"),
        "behavior": behavior,
        "is_virtual": is_virtual,
        "base_hours": row.get("rdi_base_hours"),
        "base_at": row.get("rdi_base_at"),
        "anomaly": row.get("rdi_anomaly") or 0,
        "category_tag": _pick_str(row.get("rdi_category_tag"), row.get("category_tag")),
    }
    return row_to_report_item(merged)


def fetch_pool_stats(conn) -> dict:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            "SELECT COUNT(*) FROM monitor_goods WHERE monitor_status IN ('active','idle')"
        )
        active = int(c.fetchone()[0] or 0)
        c.execute("SELECT COUNT(*) FROM monitor_goods")
        total = int(c.fetchone()[0] or 0)
        premium_active = 0
        if _premium_table_exists(conn):
            c.execute("SELECT COUNT(*) FROM premium_goods WHERE lifecycle < 3")
            premium_active = int(c.fetchone()[0] or 0)
    return {"active_goods": active, "total_goods": total, "premium_goods": premium_active}


def _monitor_goods_has_shop_cols(conn) -> bool:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            """SELECT 1 FROM information_schema.columns
               WHERE table_schema='xhs_monitor' AND table_name='monitor_goods'
                 AND column_name='shop_sales' LIMIT 1"""
        )
        return c.fetchone() is not None


def _monitor_goods_has_first_seen(conn) -> bool:
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            """SELECT 1 FROM information_schema.columns
               WHERE table_schema='xhs_monitor' AND table_name='monitor_goods'
                 AND column_name='first_seen' LIMIT 1"""
        )
        return c.fetchone() is not None


def fetch_items_from_sold_daily(conn, report_date: str, *, incremental_only: bool = False) -> list:
    d = date.fromisoformat(report_date)
    prev = (d - timedelta(days=1)).isoformat()
    mg_shop = (
        "m.shop_sales AS mg_shop_sales, m.shop_fans AS mg_shop_fans,"
        if _monitor_goods_has_shop_cols(conn)
        else "NULL::int AS mg_shop_sales, NULL::int AS mg_shop_fans,"
    )
    mg_fs = (
        "m.first_seen AS mg_first_seen,"
        if _monitor_goods_has_first_seen(conn)
        else "NULL::timestamptz AS mg_first_seen,"
    )
    incr_filter = ""
    if incremental_only:
        incr_filter = """
              AND (
                COALESCE(sd.delta, 0) > 0
                OR COALESCE(gm.actual_v1d, 0) > 0
                OR (sp.sold_num IS NOT NULL AND sd.sold_num > sp.sold_num)
              )
        """
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            f"""
            SELECT m.goods_id, m.title, m.is_virtual, m.pool, m.store_id, m.store_name,
                   m.first_tracked_at,
                   {mg_fs}
                   {mg_shop}
                   (SELECT MIN(r.first_seen)
                    FROM report_daily_items r
                    WHERE r.goods_id = m.goods_id AND r.first_seen IS NOT NULL) AS rdi_first_seen_min,
                   sd.sold_num, sd.delta, sd.deal_price,
                   sp.sold_num AS prev_sold,
                   gm.actual_v1d AS gm_actual_v1d, gm.v1d AS gm_v1d, gm.gr AS gm_gr,
                   rdi.title AS rdi_title,
                   rdi.price AS rdi_price,
                   rdi.actual_v1d AS rdi_actual_v1d,
                   rdi.v1d AS rdi_v1d,
                   rdi.actual_gr AS rdi_actual_gr,
                   rdi.gr AS rdi_gr,
                   rdi.actual_vsr AS rdi_actual_vsr,
                   rdi.vsr AS rdi_vsr,
                   rdi.v1h AS rdi_v1h,
                   rdi.v6h AS rdi_v6h,
                   rdi.acc AS rdi_acc,
                   rdi.burst AS rdi_burst,
                   rdi.pool AS rdi_pool,
                   rdi.first_seen AS rdi_first_seen,
                   rdi.store_id AS rdi_store_id,
                   rdi.store_name AS rdi_store_name,
                   rdi.shelf_time AS rdi_shelf_time,
                   rdi.shop_sales AS rdi_shop_sales,
                   rdi.shop_fans AS rdi_shop_fans,
                   rdi.shop_fsr AS rdi_shop_fsr,
                   rdi.goods_fsr AS rdi_goods_fsr,
                   rdi.behavior AS rdi_behavior,
                   rdi.is_virtual AS rdi_is_virtual,
                   rdi.base_hours AS rdi_base_hours,
                   rdi.base_at AS rdi_base_at,
                   rdi.anomaly AS rdi_anomaly,
                   rdi.category_tag AS rdi_category_tag
            FROM monitor_goods m
            JOIN goods_sold_daily sd ON sd.goods_id = m.goods_id AND sd.snapshot_date = %s
            LEFT JOIN goods_sold_daily sp ON sp.goods_id = m.goods_id AND sp.snapshot_date = %s
            LEFT JOIN goods_metrics_daily gm
                   ON gm.goods_id = m.goods_id AND gm.metric_date = %s
            LEFT JOIN LATERAL (
                SELECT *
                FROM report_daily_items r
                WHERE r.goods_id = m.goods_id
                ORDER BY r.report_date DESC
                LIMIT 1
            ) rdi ON TRUE
            WHERE m.monitor_status IN ('active', 'idle')
            {incr_filter}
            """,
            (report_date, prev, report_date),
        )
        cols = [d[0] for d in c.description]
        rows = [dict(zip(cols, r)) for r in c.fetchall()]
    items = []
    for r in rows:
        prev_raw = r.get("prev_sold")
        prev_sold = _i(prev_raw) if prev_raw is not None else None
        item = sold_row_to_item(r, prev_sold)
        if item and float(item_at(item, "actual_v1d", 0) or 0) > 0:
            items.append(item)
    items.sort(key=lambda x: (-float(item_at(x, "actual_v1d", 0) or 0), -float(item_at(x, "v1d", 0) or 0)))
    if incremental_only:
        print(
            f"[pg_reader] monitor_incr {report_date}: kept={len(items)} scanned={len(rows)}",
            flush=True,
        )
    return items


def fetch_items_from_monitor_incremental(conn, report_date: str) -> list:
    """监控池：仅当日 goods_sold_daily 有正增量的 active/idle 商品。"""
    return fetch_items_from_sold_daily(conn, report_date, incremental_only=True)


def fetch_premium_items_for_period(conn, start_date: str, end_date: str) -> list:
    """周期内每 goods_id 取 actual_delta 最高的 premium 日快照（对齐日报 premium_daily 逻辑）。"""
    if not _premium_table_exists(conn):
        return []
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            """
            SELECT DISTINCT ON (pg.goods_id)
                   pg.goods_id, pg.title, pg.deal_price, pg.sold_num, pg.velocity_1d,
                   pg.actual_velocity_1d, pg.burst_score, pg.tier, pg.store_id, pg.store_name,
                   pg.shop_fans, pg.shop_sales, pg.is_virtual, pg.first_seen_at, pg.first_report_date,
                   pgd.snap_date AS peak_snap_date,
                   pgd.sold_num AS pgd_sold, pgd.delta AS pgd_delta,
                   pgd.actual_delta AS pgd_actual_delta, pgd.velocity_1d AS pgd_velocity,
                   pgd_prev.sold_num AS prev_sold
            FROM premium_goods pg
            JOIN premium_goods_daily pgd ON pgd.goods_id = pg.goods_id
            LEFT JOIN premium_goods_daily pgd_prev
                   ON pgd_prev.goods_id = pg.goods_id
                  AND pgd_prev.snap_date = pgd.snap_date - 1
            WHERE pg.lifecycle < 3
              AND pgd.snap_date >= %s AND pgd.snap_date <= %s
            ORDER BY pg.goods_id, pgd.actual_delta DESC NULLS LAST,
                     pgd.velocity_1d DESC NULLS LAST, pgd.snap_date DESC
            """,
            (start_date, end_date),
        )
        cols = [d[0] for d in c.description]
        rows = [dict(zip(cols, r)) for r in c.fetchall()]

    items: list = []
    retry_rows: dict[str, dict] = {}
    sold_by_snap: dict[str, dict[str, dict]] = {}
    for raw in rows:
        snap = str(raw.get("peak_snap_date") or "")
        gid = str(raw.get("goods_id") or "")
        sold_info = None
        if snap and gid:
            if snap not in sold_by_snap:
                gids = [
                    str(r.get("goods_id") or "")
                    for r in rows
                    if str(r.get("peak_snap_date") or "") == snap
                ]
                sold_by_snap[snap] = _fetch_sold_daily_map(conn, snap, gids)
            sold_info = sold_by_snap[snap].get(gid)
        item = premium_row_to_item(raw, sold_info=sold_info)
        if item:
            items.append(item)
        elif gid and _premium_has_metric_signal(raw):
            retry_rows[gid] = (raw, sold_info)

    for gid, (raw, sold_info) in retry_rows.items():
        if gid in {str(item_at(it, "goods_id", "") or "") for it in items}:
            continue
        item = premium_row_to_item(raw, sold_info=sold_info)
        if item:
            items.append(item)

    items.sort(key=lambda x: (-float(item_at(x, "actual_v1d", 0) or 0), -float(item_at(x, "v1d", 0) or 0)))
    print(
        f"[pg_reader] premium_period {start_date}~{end_date}: kept={len(items)} pool={len(rows)}",
        flush=True,
    )
    return items


def fetch_rdi_items_for_period(
    conn, start_date: str, end_date: str, *, reconcile_sold: bool = True
) -> list:
    """周期内每 goods_id 保留 actual_v1d 最高的一行，并用 goods_sold_daily 校正。"""
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            """
            SELECT DISTINCT ON (goods_id) *
            FROM report_daily_items
            WHERE report_date >= %s AND report_date <= %s
            ORDER BY goods_id, actual_v1d DESC, v1d DESC, report_date DESC
            """,
            (start_date, end_date),
        )
        cols = [d[0] for d in c.description]
        rows = [dict(zip(cols, r)) for r in c.fetchall()]
    if not rows:
        return []

    sold_maps: dict[str, dict[str, dict]] = {}
    if reconcile_sold:
        by_date: dict[str, list[str]] = {}
        for raw in rows:
            rd = str(raw.get("report_date") or "")
            gid = str(raw.get("goods_id") or "")
            if rd and gid:
                by_date.setdefault(rd, []).append(gid)
        for rd, gids in by_date.items():
            sold_maps[rd] = _fetch_sold_daily_map(conn, rd, gids)

    items: list = []
    fixed = dropped = 0
    for raw in rows:
        gid = str(raw.get("goods_id") or "")
        rd = str(raw.get("report_date") or "")
        if reconcile_sold:
            reconciled = reconcile_row_metrics(dict(raw), sold_maps.get(rd, {}).get(gid))
            if reconciled is None:
                dropped += 1
                continue
            if (
                _f(reconciled.get("actual_v1d")) != _f(raw.get("actual_v1d"))
                or _f(reconciled.get("v1d")) != _f(raw.get("v1d"))
            ):
                fixed += 1
            items.append(db_row_to_item(reconciled))
        else:
            items.append(db_row_to_item(raw))

    if reconcile_sold and (fixed or dropped):
        print(
            f"[pg_reader] period_reconcile {start_date}~{end_date}: "
            f"fixed={fixed} dropped={dropped} kept={len(items)}",
            flush=True,
        )
    items.sort(key=lambda x: (-float(item_at(x, "actual_v1d", 0) or 0), -float(item_at(x, "v1d", 0) or 0)))
    return items


def fetch_monitor_items_for_period(conn, start_date: str, end_date: str) -> list:
    """周期内监控池：每 goods_id 取增量最高的一天（仅正增量日）。"""
    mg_shop = (
        "m.shop_sales AS mg_shop_sales, m.shop_fans AS mg_shop_fans,"
        if _monitor_goods_has_shop_cols(conn)
        else "NULL::int AS mg_shop_sales, NULL::int AS mg_shop_fans,"
    )
    mg_fs = (
        "m.first_seen AS mg_first_seen,"
        if _monitor_goods_has_first_seen(conn)
        else "NULL::timestamptz AS mg_first_seen,"
    )
    with conn.cursor() as c:
        c.execute("SET search_path TO xhs_monitor, public")
        c.execute(
            f"""
            SELECT DISTINCT ON (m.goods_id)
                   m.goods_id, m.title, m.is_virtual, m.pool, m.store_id, m.store_name,
                   m.first_tracked_at,
                   {mg_fs}
                   {mg_shop}
                   (SELECT MIN(r.first_seen)
                    FROM report_daily_items r
                    WHERE r.goods_id = m.goods_id AND r.first_seen IS NOT NULL) AS rdi_first_seen_min,
                   sd.sold_num, sd.delta, sd.deal_price,
                   sp.sold_num AS prev_sold,
                   gm.actual_v1d AS gm_actual_v1d, gm.v1d AS gm_v1d, gm.gr AS gm_gr,
                   rdi.title AS rdi_title,
                   rdi.price AS rdi_price,
                   rdi.actual_v1d AS rdi_actual_v1d,
                   rdi.v1d AS rdi_v1d,
                   rdi.actual_gr AS rdi_actual_gr,
                   rdi.gr AS rdi_gr,
                   rdi.actual_vsr AS rdi_actual_vsr,
                   rdi.vsr AS rdi_vsr,
                   rdi.v1h AS rdi_v1h,
                   rdi.v6h AS rdi_v6h,
                   rdi.acc AS rdi_acc,
                   rdi.burst AS rdi_burst,
                   rdi.pool AS rdi_pool,
                   rdi.first_seen AS rdi_first_seen,
                   rdi.store_id AS rdi_store_id,
                   rdi.store_name AS rdi_store_name,
                   rdi.shelf_time AS rdi_shelf_time,
                   rdi.shop_sales AS rdi_shop_sales,
                   rdi.shop_fans AS rdi_shop_fans,
                   rdi.shop_fsr AS rdi_shop_fsr,
                   rdi.goods_fsr AS rdi_goods_fsr,
                   rdi.behavior AS rdi_behavior,
                   rdi.is_virtual AS rdi_is_virtual,
                   rdi.base_hours AS rdi_base_hours,
                   rdi.base_at AS rdi_base_at,
                   rdi.anomaly AS rdi_anomaly,
                   rdi.category_tag AS rdi_category_tag
            FROM monitor_goods m
            JOIN goods_sold_daily sd
              ON sd.goods_id = m.goods_id
             AND sd.snapshot_date >= %s AND sd.snapshot_date <= %s
            LEFT JOIN goods_sold_daily sp
              ON sp.goods_id = m.goods_id AND sp.snapshot_date = sd.snapshot_date - 1
            LEFT JOIN goods_metrics_daily gm
              ON gm.goods_id = m.goods_id AND gm.metric_date = sd.snapshot_date
            LEFT JOIN LATERAL (
                SELECT *
                FROM report_daily_items r
                WHERE r.goods_id = m.goods_id
                ORDER BY r.report_date DESC
                LIMIT 1
            ) rdi ON TRUE
            WHERE m.monitor_status IN ('active', 'idle')
              AND (
                COALESCE(sd.delta, 0) > 0
                OR COALESCE(gm.actual_v1d, 0) > 0
                OR (sp.sold_num IS NOT NULL AND sd.sold_num > sp.sold_num)
              )
            ORDER BY m.goods_id, sd.delta DESC NULLS LAST, sd.snapshot_date DESC
            """,
            (start_date, end_date),
        )
        cols = [d[0] for d in c.description]
        rows = [dict(zip(cols, r)) for r in c.fetchall()]
    items = []
    for r in rows:
        prev_raw = r.get("prev_sold")
        prev_sold = _i(prev_raw) if prev_raw is not None else None
        item = sold_row_to_item(r, prev_sold)
        if item and float(item_at(item, "actual_v1d", 0) or 0) > 0:
            items.append(item)
    items.sort(key=lambda x: (-float(item_at(x, "actual_v1d", 0) or 0), -float(item_at(x, "v1d", 0) or 0)))
    print(
        f"[pg_reader] monitor_period {start_date}~{end_date}: kept={len(items)} scanned={len(rows)}",
        flush=True,
    )
    return items


def fetch_items_for_period(conn, start_date: str, end_date: str) -> list:
    """周期选品报告：周期内精品增量峰值日 ∪ 监控池增量峰值日（精品 metadata 优先）。"""
    premium = fetch_premium_items_for_period(conn, start_date, end_date)
    monitor = fetch_monitor_items_for_period(conn, start_date, end_date)
    if premium and monitor:
        merged = merge_items_by_goods_id(premium, monitor)
        print(
            f"[pg_reader] period {start_date}~{end_date}: "
            f"premium_incr={len(premium)} monitor_incr={len(monitor)} merged={len(merged)}",
            flush=True,
        )
        return merged
    if premium:
        return premium
    if monitor:
        return monitor
    return []
