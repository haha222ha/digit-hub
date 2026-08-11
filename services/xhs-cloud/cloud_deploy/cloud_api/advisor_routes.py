# -*- coding: utf-8 -*-
"""AI 顾问 context ingest（内部同步，X-Sync-Key）。"""
from __future__ import annotations

import gzip
import json
import os

from fastapi import APIRouter, Depends, HTTPException, Request

from cloud_deploy.cloud_api.auth import verify_sync_key

router = APIRouter(prefix="/api/v1/internal/advisor", tags=["advisor-internal"])


def _incoming_dir() -> str:
    root = os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud")
    sub = os.environ.get("XHS_ADVISOR_INCOMING_DIR", "data/incoming/advisor")
    return os.path.join(root, sub)


@router.post("/context")
async def ingest_context(request: Request, _: None = Depends(verify_sync_key)):
    raw = await request.body()
    if request.headers.get("content-encoding") == "gzip":
        try:
            raw = gzip.decompress(raw)
        except OSError as e:
            raise HTTPException(status_code=400, detail="gzip 解压失败") from e
    try:
        body = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=400, detail="无效 JSON") from e

    target_date = str(body.get("target_date") or "")[:10]
    context = body.get("context")
    if not target_date or len(target_date) != 10 or target_date[4] != "-":
        raise HTTPException(status_code=400, detail="缺少有效 target_date (YYYY-MM-DD)")
    if not isinstance(context, dict):
        raise HTTPException(status_code=400, detail="缺少 context 对象")

    incoming = _incoming_dir()
    os.makedirs(incoming, exist_ok=True)
    path = os.path.join(incoming, f"context_{target_date}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"target_date": target_date, "context": context}, f, ensure_ascii=False, indent=2)
    ready = os.path.join(incoming, f"context_{target_date}.ready")
    with open(ready, "w", encoding="utf-8") as f:
        f.write("ok")
    return {"ok": True, "target_date": target_date, "path": path}


@router.post("/generate")
async def trigger_generate(
    request: Request,
    _: None = Depends(verify_sync_key),
):
    """触发处理已就绪的 context（等同 cron 跑 advisor_cloud_generate）。"""
    try:
        body = await request.json()
    except Exception:
        body = {}
    report_date = str((body or {}).get("report_date") or "")[:10] or None

    from cloud_deploy.scripts.advisor_cloud_generate import process_pending
    from cloud_deploy.scripts.insight_llm_runtime import apply_admin_insight_llm

    apply_admin_insight_llm(log_prefix="advisor")
    results = process_pending(report_date=report_date)
    return {"ok": True, "processed": results}
