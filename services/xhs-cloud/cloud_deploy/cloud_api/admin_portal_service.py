# -*- coding: utf-8 -*-
"""运营后台共享逻辑 — vuemonitor BFF / Sync Key API / 浏览器 portal 共用。"""
from __future__ import annotations

import os

from fastapi import HTTPException

from cloud_deploy.cloud_api import database as db


def collect_admin_stats() -> dict:
    """与 vuemonitor GET /xhs-cloud/admin/status 中 stats 部分对齐。"""
    try:
        stats = db.get_admin_stats()
        archives = db.list_archives()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"数据库未就绪: {e}") from e

    pool_size = 0
    pending_backfill = 0
    pending_snapshots = 0
    if os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        try:
            from cloud_deploy.cloud_api.database_pg import _conn

            conn = _conn()
            with conn.cursor() as c:
                c.execute("SET search_path TO xhs_monitor, public")
                c.execute("SELECT COUNT(*) FROM monitor_goods WHERE monitor_status='active'")
                pool_size = c.fetchone()[0]
                c.execute(
                    "SELECT COUNT(*) FROM goods_sync_state WHERE sold_daily_backfill_done=FALSE"
                )
                pending_backfill = c.fetchone()[0]
                c.execute(
                    "SELECT COUNT(*) FROM goods_sync_state WHERE sold_snapshots_backfill_done=FALSE"
                )
                pending_snapshots = c.fetchone()[0]
            conn.close()
        except Exception:
            pass

    return {
        **stats,
        "archive_count_sync": len(archives),
        "latest_archive": archives[0] if archives else None,
        "monitor_pool_active": pool_size,
        "sold_history_pending_backfill": pending_backfill,
        "sold_snapshots_pending_backfill": pending_snapshots,
    }


def cloud_status_payload(*, health_ok: bool = True) -> dict:
    """vuemonitor member_cloud_status 等价结构（浏览器后台用）。"""
    from cloud_deploy.cloud_api.auth_product_registry import (
        DEFAULT_ACTIVATE_ORIGIN,
        list_products,
    )

    stats = collect_admin_stats()
    origin = DEFAULT_ACTIVATE_ORIGIN.rstrip("/")
    products = list_products(include_reserved=True)
    portal_links = {
        "assess_site": f"{origin}/?api=live",
        "assess_activate": f"{origin}/?api=live#/activate",
        "admin_console": f"{origin}/admin/",
        "insight_member": f"{origin}/member",
        "psy_site": os.environ.get("XHS_PSY_ORIGIN", "https://psy.xhs365.cn").rstrip("/"),
        "psy_admin": os.environ.get("XHS_PSY_ORIGIN", "https://psy.xhs365.cn").rstrip("/") + "/login",
    }
    for p in products:
        portal_links[f"{p['product']}_activate_template"] = p.get("activate_url_template", "")

    return {
        "online": health_ok,
        "configured": True,
        "stats": stats,
        "portal_links": portal_links,
        "products": products,
    }


def filter_auth_codes_by_product(items: list[dict], product: str | None) -> list[dict]:
    if not product:
        return items
    want = product.strip().lower()
    filtered: list[dict] = []
    for it in items:
        note = it.get("note") or ""
        if f'"product": "{want}"' in note or f'"product":"{want}"' in note.replace(" ", ""):
            filtered.append(it)
        elif want == "insight" and (it.get("plan_code") or "").startswith(
            ("experience", "monthly", "quarterly", "halfyear", "yearly")
        ):
            filtered.append(it)
        elif want == "assess" and (it.get("plan_code") or "").startswith("assess"):
            filtered.append(it)
        elif want == "psy_dist" and (it.get("plan_code") or "").startswith("psy_quota"):
            filtered.append(it)
    return filtered


def collect_dist_admin_payload(*, link_status: str | None = None, limit: int = 100) -> dict:
    from cloud_deploy.cloud_api import database as db
    from cloud_deploy.cloud_api import dist_db
    from cloud_deploy.cloud_api.dist_orders import map_order_row
    from cloud_deploy.cloud_api.payment_plans import get_plan

    stats = dist_db.admin_dist_stats()
    links = dist_db.admin_list_links(status=link_status or None, limit=limit)
    distributors = dist_db.admin_list_distributors(limit=limit)
    orders_raw = db.list_payment_orders_by_plan_prefix("psy_quota", limit=limit)
    orders = []
    for row in orders_raw:
        plan = get_plan(row.get("plan_code") or "")
        orders.append(map_order_row(row, plan))
    return {
        "stats": stats,
        "links": links,
        "distributors": distributors,
        "orders": orders,
    }
