# -*- coding: utf-8 -*-
"""本地 Agent 拉取 risk 工单 + 回传扫描结果（服务端 PG 写入）。"""
from __future__ import annotations

from collections import Counter

from cloud_deploy.cloud_api.scan_claim import count_claimable_risk, pick_and_claim_risk
from cloud_deploy.cloud_api.sync_service import mark_scan_result, record_cloud_scan

DEFAULT_MIN_AGE_HOURS = 2.0
DEFAULT_CLAIM_TTL_MINUTES = 25


def list_risk_worklist(
    conn,
    scan_date: str,
    limit: int,
    include_pending: bool = False,
    *,
    agent_id: str = "",
    min_age_hours: float = DEFAULT_MIN_AGE_HOURS,
    claim_ttl_minutes: int = DEFAULT_CLAIM_TTL_MINUTES,
) -> dict:
    claimer = f"agent:{agent_id}" if agent_id else "agent:unknown"
    pending = None
    if include_pending:
        pending = count_claimable_risk(
            conn, scan_date, claimer, min_age_hours=min_age_hours
        )
    rows = pick_and_claim_risk(
        conn,
        scan_date,
        limit,
        claimer,
        min_age_hours=min_age_hours,
        claim_ttl_minutes=claim_ttl_minutes,
    )
    items = [{"goods_id": str(r["goods_id"]), "title": r.get("title") or ""} for r in rows]
    return {
        "scan_date": scan_date,
        "pending_risk": pending,
        "claim_ttl_minutes": claim_ttl_minutes,
        "min_age_hours": min_age_hours,
        "agent_id": agent_id or claimer,
        "items": items,
    }


def slim_detail(detail: dict | None) -> dict:
    if not isinstance(detail, dict):
        return {}
    keys = (
        "deal_price",
        "product_price",
        "product_name",
        "title",
        "shop_id",
        "store_id",
        "shop_name",
        "store_name",
        "real_sales",
        "product_sales",
        "fans_count",
        "shop_total_sales",
    )
    return {k: detail[k] for k in keys if k in detail and detail[k] not in (None, "")}


def apply_local_scan_row(conn, row: dict, data_source: str = "local_playwright") -> str:
    gid = str(row.get("goods_id") or "")
    if not gid:
        return "skip"
    status = str(row.get("status") or "fail")
    engine = str(row.get("engine") or "playwright")[:32]
    detail = slim_detail(row.get("detail"))

    if status == "ok" and row.get("sold") is not None:
        deal_price = row.get("deal_price")
        if deal_price is None:
            try:
                deal_price = float(detail.get("deal_price") or detail.get("product_price") or 0)
            except (TypeError, ValueError):
                deal_price = None
        record_cloud_scan(
            conn,
            gid,
            int(row["sold"]),
            data_source=data_source,
            deal_price=deal_price,
            detail=detail or None,
        )
        mark_scan_result(conn, gid, "ok", engine=engine)
        return "ok"
    if status == "frozen":
        with conn.cursor() as c:
            c.execute("SET search_path TO xhs_monitor, public")
            c.execute(
                "UPDATE monitor_goods SET monitor_status='delisted', updated_at=NOW() WHERE goods_id=%s",
                (gid,),
            )
        conn.commit()
        mark_scan_result(conn, gid, "frozen", engine=engine)
        return "frozen"
    mark_scan_result(conn, gid, status if status in ("risk", "fail") else "fail", engine=engine)
    return status if status in ("risk", "fail") else "fail"


def apply_local_scan_batch(
    conn,
    rows: list[dict],
    *,
    agent_id: str = "",
    batch_id: str = "",
    data_source: str = "local_playwright",
) -> dict:
    outcomes = Counter()
    for row in rows:
        try:
            outcomes[apply_local_scan_row(conn, row, data_source=data_source)] += 1
        except Exception:
            outcomes["error"] += 1
    note = f"local_agent:{agent_id or 'unknown'}:{batch_id or '-'}"
    try:
        from cloud_deploy.cloud_api.sync_service import record_daemon_batch_stats

        record_daemon_batch_stats(
            conn,
            len(rows),
            outcomes.get("ok", 0),
            outcomes.get("fail", 0),
            outcomes.get("risk", 0),
            outcomes.get("frozen", 0),
            0,
            note,
        )
    except Exception:
        pass
    return dict(outcomes)
