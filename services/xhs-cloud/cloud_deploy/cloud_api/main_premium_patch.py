# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import sys
from datetime import datetime

CRAWLER_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if CRAWLER_ROOT not in sys.path:
    sys.path.insert(0, CRAWLER_ROOT)

from cloud_deploy.scripts.bootstrap_env import bootstrap

bootstrap()

from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

from cloud_deploy.cloud_api import database as db
from cloud_deploy.cloud_api.auth import current_member, login_member, verify_sync_key
from cloud_deploy.cloud_api.config import get_settings

app = FastAPI(title="XHS 选品云服务", version="1.0.0")


@app.on_event("startup")
def _startup():
    db.init_db()
    db.ensure_admin()


class LoginBody(BaseModel):
    username: str
    password: str
    device_id: str = Field(..., min_length=8, max_length=160)
    device_label: str = Field(default="", max_length=64)


class DailyReportSyncBody(BaseModel):
    report_date: str
    meta: dict = Field(default_factory=dict)
    items: list
    source: str = "local_gen_report"


class SoldHistorySyncBody(BaseModel):
    batch_id: str = ""
    rows: list[dict]
    final_batch: bool = False


class SoldSnapshotsSyncBody(BaseModel):
    batch_id: str = ""
    rows: list[dict]
    final_batch: bool = False


class PremiumBatchSyncBody(BaseModel):
    batch_id: str = ""
    rows: list[dict]
    final_batch: bool = False


class PremiumUpsertBody(BaseModel):
    client_id: str = ""
    sync_version: int = 0
    rows: list[dict]


class PremiumSnapshotsBackfillBody(BaseModel):
    client_id: str = ""
    goods_id: str
    goods_daily: list[dict] = Field(default_factory=list)
    store_daily: list[dict] = Field(default_factory=list)


class PremiumCatalogBody(BaseModel):
    local_ids: list[str] = Field(default_factory=list)
    since_date: str = ""


@app.get("/api/v1/health")
def health():
    return {"status": "ok"}


@app.post("/api/v1/auth/login")
def login(body: LoginBody):
    return login_member(body.username, body.password, body.device_id, body.device_label)


@app.get("/api/v1/member/reports")
def member_reports_legacy_gone(
    archive_type: str = "member_daily_zip",
    user: dict = Depends(current_member),
):
    raise HTTPException(
        status_code=410,
        detail={
            "detail": "表格数据包已下线，请使用 AI 选品分析中心阅读最新报告",
            "migration_url": "/member#today",
            "archive_type": archive_type,
        },
    )


@app.get("/api/v1/sync/status")
def sync_status(_: None = Depends(verify_sync_key)):
    archives = db.list_archives()
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
        "archive_count": len(archives),
        "latest": archives[0] if archives else None,
        "monitor_pool_active": pool_size,
        "sold_history_pending_backfill": pending_backfill,
        "sold_snapshots_pending_backfill": pending_snapshots,
    }


@app.post("/api/v1/sync/daily-report")
def sync_daily_report(body: DailyReportSyncBody, _: None = Depends(verify_sync_key)):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.sync_service import apply_daily_report

    init_db()
    conn = _conn()
    try:
        return apply_daily_report(conn, body.report_date, body.meta, body.items, source=body.source)
    finally:
        conn.close()


@app.post("/api/v1/sync/sold-history")
def sync_sold_history(body: SoldHistorySyncBody, _: None = Depends(verify_sync_key)):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.sync_service import apply_sold_history_batch

    init_db()
    conn = _conn()
    try:
        n = apply_sold_history_batch(conn, body.rows)
        return {"batch_id": body.batch_id, "rows_upserted": n, "final_batch": body.final_batch}
    finally:
        conn.close()


@app.post("/api/v1/sync/sold-snapshots")
def sync_sold_snapshots(body: SoldSnapshotsSyncBody, _: None = Depends(verify_sync_key)):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.sync_service import apply_sold_snapshots_batch

    init_db()
    conn = _conn()
    try:
        n = apply_sold_snapshots_batch(conn, body.rows)
        return {"batch_id": body.batch_id, "rows_upserted": n, "final_batch": body.final_batch}
    finally:
        conn.close()


@app.post("/api/v1/sync/prune-snapshots")
def sync_prune_snapshots(_: None = Depends(verify_sync_key)):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.sync_service import prune_sold_snapshots

    init_db()
    conn = _conn()
    try:
        deleted = prune_sold_snapshots(conn)
        return {"deleted_rows": deleted}
    finally:
        conn.close()


@app.post("/api/v1/sync/premium-goods")
def sync_premium_goods(body: PremiumBatchSyncBody, _: None = Depends(verify_sync_key)):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.premium_sync_service import apply_premium_goods_batch

    init_db()
    conn = _conn()
    try:
        n = apply_premium_goods_batch(conn, body.rows)
        conn.commit()
        return {"batch_id": body.batch_id, "rows_upserted": n, "final_batch": body.final_batch}
    finally:
        conn.close()


@app.post("/api/v1/sync/premium-goods-daily")
def sync_premium_goods_daily(body: PremiumBatchSyncBody, _: None = Depends(verify_sync_key)):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.premium_sync_service import apply_premium_goods_daily_batch

    init_db()
    conn = _conn()
    try:
        n = apply_premium_goods_daily_batch(conn, body.rows)
        conn.commit()
        return {"batch_id": body.batch_id, "rows_upserted": n, "final_batch": body.final_batch}
    finally:
        conn.close()


@app.post("/api/v1/sync/premium-store-daily")
def sync_premium_store_daily(body: PremiumBatchSyncBody, _: None = Depends(verify_sync_key)):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.premium_sync_service import apply_premium_store_daily_batch

    init_db()
    conn = _conn()
    try:
        n = apply_premium_store_daily_batch(conn, body.rows)
        conn.commit()
        return {"batch_id": body.batch_id, "rows_upserted": n, "final_batch": body.final_batch}
    finally:
        conn.close()


@app.post("/api/v1/sync/premium-upsert")
def sync_premium_upsert(body: PremiumUpsertBody, _: None = Depends(verify_sync_key)):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.premium_sync_service import apply_premium_upsert

    init_db()
    conn = _conn()
    try:
        result = apply_premium_upsert(conn, body.rows, client_id=body.client_id)
        conn.commit()
        return result
    finally:
        conn.close()


@app.get("/api/v1/sync/premium-changes")
def sync_premium_changes(
    since: int = 0,
    limit: int = 500,
    _: None = Depends(verify_sync_key),
):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.premium_sync_service import get_premium_changes

    init_db()
    conn = _conn()
    try:
        return get_premium_changes(conn, since=since, limit=limit)
    finally:
        conn.close()


@app.post("/api/v1/sync/premium-snapshots-backfill")
def sync_premium_snapshots_backfill(
    body: PremiumSnapshotsBackfillBody,
    _: None = Depends(verify_sync_key),
):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.premium_sync_service import apply_snapshots_backfill

    init_db()
    conn = _conn()
    try:
        result = apply_snapshots_backfill(
            conn, body.goods_id, body.goods_daily, body.store_daily
        )
        conn.commit()
        return result
    finally:
        conn.close()


@app.post("/api/v1/sync/premium-catalog")
def sync_premium_catalog(body: PremiumCatalogBody, _: None = Depends(verify_sync_key)):
    if not os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        raise HTTPException(status_code=503, detail="未配置 XHS_DATABASE_URL")
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.cloud_api.premium_sync_service import apply_premium_catalog

    init_db()
    conn = _conn()
    try:
        return apply_premium_catalog(conn, body.local_ids, since_date=body.since_date)
    finally:
        conn.close()


def main():
    s = get_settings()
    import uvicorn

    uvicorn.run(
        "cloud_deploy.cloud_api.main:app",
        host=s.xhs_cloud_host,
        port=s.xhs_cloud_port,
        reload=False,
        workers=1,
    )


if __name__ == "__main__":
    main()
