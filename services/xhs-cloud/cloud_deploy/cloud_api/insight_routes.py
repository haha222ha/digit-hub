# -*- coding: utf-8 -*-
"""
V2 情报 API — PR-1/PR-2：library 扫描预生成目录，view 支持 iframe token。
"""
from __future__ import annotations

import json
import os
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, field_validator

from cloud_deploy.cloud_api.auth import current_user, member_from_token, security
from cloud_deploy.cloud_api.entitlements_v2 import can_insight_generate, filter_insight_library
from cloud_deploy.cloud_api.member_entitlements import assert_insight_allowed

router = APIRouter(prefix="/api/v1/member/insight", tags=["insight"])

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_CATEGORY_RE = re.compile(r"^[\u4e00-\u9fa5a-zA-Z0-9]+$")


def _validate_path_params(report_date: str, category: str) -> None:
    if not _DATE_RE.match(report_date):
        raise HTTPException(status_code=400, detail="report_date 格式应为 YYYY-MM-DD")
    if not _CATEGORY_RE.match(category):
        raise HTTPException(status_code=400, detail="category 含非法字符")


def _insight_data_root() -> str:
    root = os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud")
    sub = "insight_shadow" if _shadow_mode() else "report_archives"
    return os.path.join(root, "data", sub)


def _shadow_mode() -> bool:
    return os.environ.get("XHS_INSIGHT_SHADOW", "1").strip().lower() in ("1", "true", "yes", "on")


def _resolve_insight_html(report_date: str, category: str) -> str | None:
    day = report_date.replace("-", "")
    base = _insight_data_root()
    candidates = [
        os.path.join(base, f"insight_{day}", category, "index.html"),
        os.path.join(base, f"insight_{day}_{category}", "index.html"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    return None


def _load_insight_json(report_date: str, category: str) -> dict | None:
    day = report_date.replace("-", "")
    path = os.path.join(_insight_data_root(), f"insight_{day}", category, "insight.json")
    if not os.path.isfile(path):
        return None
    try:
        return json.loads(open(path, encoding="utf-8").read())
    except Exception:
        return None


def _list_items_from_disk() -> list[dict]:
    base = _insight_data_root()
    items: list[dict] = []
    if not os.path.isdir(base):
        return items
    for day_dir in sorted(os.listdir(base), reverse=True):
        if not day_dir.startswith("insight_"):
            continue
        full_day = os.path.join(base, day_dir)
        if not os.path.isdir(full_day):
            continue
        date = day_dir.replace("insight_", "")
        if len(date) == 8:
            report_date = f"{date[:4]}-{date[4:6]}-{date[6:8]}"
        else:
            report_date = date
        for cat in os.listdir(full_day):
            cat_path = os.path.join(full_day, cat)
            if not os.path.isdir(cat_path):
                continue
            if not os.path.isfile(os.path.join(cat_path, "index.html")):
                continue
            if not _CATEGORY_RE.match(cat):
                continue
            meta = _load_insight_json(report_date, cat) or {}
            report = meta.get("report") or {}
            metrics = meta.get("metrics") or {}
            llm_feed = meta.get("llm_feed") or {}
            sel_summary = llm_feed.get("selection_summary") or {}
            items.append(
                {
                    "category": cat,
                    "report_date": report_date,
                    "stars": report.get("opportunity_stars") or 3,
                    "title": f"{cat} 情报",
                    "summary": report.get("executive_summary") or report.get("trend_summary") or "",
                    "growth_rate": metrics.get("growth_rate_pct"),
                    "blue_ocean_score": metrics.get("blue_ocean_score"),
                    "competition_index": metrics.get("competition_index"),
                    "heat_score": metrics.get("heat_score"),
                    "lifecycle_stage": metrics.get("lifecycle_stage") or report.get("lifecycle_stage"),
                    "trend_label": metrics.get("trend_label"),
                    "price_band": metrics.get("price_band"),
                    "median_price": sel_summary.get("median_price"),
                    "confidence": report.get("confidence"),
                    "action_enter": (report.get("action_plan") or {}).get("enter"),
                    "sample_size": sel_summary.get("sample_size"),
                }
            )
    items.sort(key=lambda x: (x.get("report_date", ""), x.get("category", "")), reverse=True)
    return items


def _strip_internal_fields(data: dict) -> None:
    for k in ("goods_id", "store_id", "store_name", "title", "items", "columns"):
        data.pop(k, None)


def _user_for_request(
    access_token: str,
    cred: HTTPAuthorizationCredentials | None,
) -> dict:
    token = (cred.credentials if cred else None) or (access_token or "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="需要登录")
    return member_from_token(token)


def _log_behavior(
    user_id: int,
    action: str,
    *,
    category: str | None = None,
    report_date: str | None = None,
    metadata: dict | None = None,
) -> None:
    try:
        from cloud_deploy.cloud_api.database_pg import _conn
        from cloud_deploy.cloud_api.user_behavior import log_user_behavior

        conn = _conn()
        try:
            log_user_behavior(
                conn,
                user_id,
                action,
                category=category,
                report_date=report_date,
                metadata=metadata,
            )
        finally:
            conn.close()
    except Exception:
        pass


@router.get("/library")
def insight_library(user: dict = Depends(current_user)):
    ent = assert_insight_allowed(user["id"])
    items = _list_items_from_disk()
    items = filter_insight_library(items, ent)
    _log_behavior(user["id"], "library")
    return {
        "items": items,
        "shadow_mode": _shadow_mode(),
        "legacy_note": "V1 zip 仍在 /api/v1/member/library",
    }


@router.get("/categories")
def insight_categories(user: dict = Depends(current_user)):
    """PR-2：从最新预生成摘要返回类目列表（只读）。"""
    assert_insight_allowed(user["id"])
    items = _list_items_from_disk()
    latest_date = items[0]["report_date"] if items else None
    cats = []
    seen = set()
    for it in items:
        if latest_date and it.get("report_date") != latest_date:
            continue
        c = it.get("category")
        if c and c not in seen:
            seen.add(c)
            cats.append({"category": c, "report_date": it.get("report_date")})
    return {"report_date": latest_date, "items": cats}


class InsightWatchlistBody(BaseModel):
    categories: list[str]

    @field_validator("categories")
    @classmethod
    def validate_categories(cls, v: list[str]) -> list[str]:
        out: list[str] = []
        for c in v:
            c = str(c).strip()
            if not c:
                continue
            if not _CATEGORY_RE.match(c):
                raise ValueError(f"非法类目: {c}")
            if c not in out:
                out.append(c)
        if len(out) > 30:
            raise ValueError("关注类目最多 30 个")
        return out


class InsightGenerateBody(BaseModel):
    category: str
    report_date: str = ""

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        v = str(v).strip()
        if not _CATEGORY_RE.match(v):
            raise ValueError("category 含非法字符")
        return v


def _list_insight_watchlist(user_id: int) -> list[str]:
    from cloud_deploy.cloud_api.database_pg import _conn

    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = current_schema() AND table_name = 'member_insight_watchlist'
                LIMIT 1
                """
            )
            if not cur.fetchone():
                return []
            cur.execute(
                """
                SELECT category FROM member_insight_watchlist
                WHERE user_id = %s ORDER BY sort_order, id
                """,
                (user_id,),
            )
            rows = cur.fetchall()
        return [r[0] if not isinstance(r, dict) else r.get("category") for r in rows]
    finally:
        conn.close()


def _replace_insight_watchlist(user_id: int, categories: list[str]) -> list[str]:
    from cloud_deploy.cloud_api.database_pg import _conn

    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = current_schema() AND table_name = 'member_insight_watchlist'
                LIMIT 1
                """
            )
            if not cur.fetchone():
                raise HTTPException(status_code=503, detail="类目关注表未迁移")
            cur.execute("DELETE FROM member_insight_watchlist WHERE user_id = %s", (user_id,))
            for i, cat in enumerate(categories):
                cur.execute(
                    """
                    INSERT INTO member_insight_watchlist (user_id, category, sort_order)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (user_id, category) DO UPDATE SET sort_order = EXCLUDED.sort_order
                    """,
                    (user_id, cat, i),
                )
        conn.commit()
        return categories
    finally:
        conn.close()


def _find_report_for_category(category: str, report_date: str = "") -> str | None:
    """返回可用的 report_date（优先指定日，否则最新）。"""
    report_date = (report_date or "")[:10]
    if report_date and _resolve_insight_html(report_date, category):
        return report_date
    for it in _list_items_from_disk():
        if it.get("category") != category:
            continue
        d = str(it.get("report_date") or "")[:10]
        if report_date and d != report_date:
            continue
        if _resolve_insight_html(d, category):
            return d
    return None


@router.get("/radar")
def insight_radar(user: dict = Depends(current_user)):
    """机会雷达：今日蓝海/增速摘要（REQ-RET-001）。"""
    assert_insight_allowed(user["id"])
    from cloud_deploy.cloud_api.database_pg import _conn
    from cloud_deploy.reporting.insight_radar import build_opportunity_radar

    conn = _conn()
    try:
        data = build_opportunity_radar(conn, _list_items_from_disk, limit=5)
    finally:
        conn.close()
    _log_behavior(user["id"], "radar")
    return data


@router.get("/watchlist")
def insight_watchlist_get(user: dict = Depends(current_user)):
    assert_insight_allowed(user["id"])
    cats = _list_insight_watchlist(user["id"])
    return {"categories": cats, "count": len(cats)}


@router.get("/recommendations")
def insight_recommendations(user: dict = Depends(current_user)):
    """T2：基于浏览历史的类目推荐（骨架）。"""
    assert_insight_allowed(user["id"])
    from cloud_deploy.cloud_api.database_pg import _conn
    from cloud_deploy.cloud_api.insight_recommend import build_recommendations

    conn = _conn()
    try:
        data = build_recommendations(conn, user["id"], _list_items_from_disk, limit=4)
    finally:
        conn.close()
    _log_behavior(user["id"], "recommendations")
    return data


@router.get("/health-score")
def insight_health_score(user: dict = Depends(current_user)):
    """T2：用户健康度评分（REQ-RET-030）。"""
    assert_insight_allowed(user["id"])
    from cloud_deploy.cloud_api.database_pg import _conn
    from cloud_deploy.cloud_api.insight_health import compute_health_score

    conn = _conn()
    try:
        data = compute_health_score(conn, user["id"])
    finally:
        conn.close()
    return data


class InsightWorkflowBody(BaseModel):
    category: str
    report_date: str = ""
    status: str = "stocked"
    outcome: str = ""
    note: str = ""

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        v = str(v).strip()
        if not _CATEGORY_RE.match(v):
            raise ValueError("category 含非法字符")
        return v


@router.get("/workflow")
def insight_workflow_list(user: dict = Depends(current_user)):
    assert_insight_allowed(user["id"])
    from cloud_deploy.cloud_api.database_pg import _conn
    from cloud_deploy.cloud_api.insight_workflow import list_workflow

    conn = _conn()
    try:
        items = list_workflow(conn, user["id"])
    finally:
        conn.close()
    return {"items": items}


@router.get("/notifications")
def insight_notifications(user: dict = Depends(current_user)):
    """Q3-5：站内提醒（工作流到期 + 关注类目阈值）。"""
    assert_insight_allowed(user["id"])
    from cloud_deploy.cloud_api.insight_notifications import build_insight_notifications

    from cloud_deploy.cloud_api.database_pg import _conn

    conn = _conn()
    try:
        data = build_insight_notifications(conn, user["id"])
    finally:
        conn.close()
    _log_behavior(user["id"], "notifications")
    return data


@router.get("/similar")
def insight_similar(category: str = "", user: dict = Depends(current_user)):
    """Q3：相关赛道（pgvector 或同日蓝海兜底）。"""
    assert_insight_allowed(user["id"])
    from cloud_deploy.cloud_api.insight_similar import build_similar_categories

    cat = str(category or "").strip()
    if not _CATEGORY_RE.match(cat):
        raise HTTPException(status_code=400, detail="category 含非法字符")
    from cloud_deploy.cloud_api.database_pg import _conn

    conn = _conn()
    try:
        data = build_similar_categories(conn, cat, limit=3)
    finally:
        conn.close()
    _log_behavior(user["id"], "similar", category=cat)
    return data


@router.get("/compare")
def insight_compare(categories: str = "", user: dict = Depends(current_user)):
    """Q2：2～3 类目指标对比（读 PG，无实时 LLM）。"""
    ent = assert_insight_allowed(user["id"])
    from cloud_deploy.cloud_api.entitlements_v2 import can_insight_compare
    from cloud_deploy.cloud_api.insight_compare import build_category_compare

    if not can_insight_compare(ent):
        raise HTTPException(status_code=403, detail="当前套餐不含类目对比，请升级 V2-Pro")
    cats = [c.strip() for c in (categories or "").split(",") if c.strip()]
    if len(cats) < 2 or len(cats) > 3:
        raise HTTPException(status_code=400, detail="请选择 2～3 个类目（逗号分隔）")
    for c in cats:
        if not _CATEGORY_RE.match(c):
            raise HTTPException(status_code=400, detail=f"非法类目: {c}")
    from cloud_deploy.cloud_api.database_pg import _conn

    conn = _conn()
    try:
        data = build_category_compare(conn, cats)
    finally:
        conn.close()
    _log_behavior(user["id"], "compare", metadata={"categories": cats})
    return data


@router.get("/timeline")
def insight_timeline(
    category: str = "",
    days: int = 7,
    user: dict = Depends(current_user),
):
    """Q2：类目趋势时间轴（读 PG 序列）。"""
    ent = assert_insight_allowed(user["id"])
    from cloud_deploy.cloud_api.entitlements_v2 import can_insight_timeline
    from cloud_deploy.cloud_api.insight_timeline import build_category_timeline

    ok, msg = can_insight_timeline(ent, days=days)
    if not ok:
        raise HTTPException(status_code=403, detail=msg)
    cat = str(category or "").strip()
    if not _CATEGORY_RE.match(cat):
        raise HTTPException(status_code=400, detail="category 含非法字符")
    from cloud_deploy.cloud_api.database_pg import _conn

    conn = _conn()
    try:
        data = build_category_timeline(conn, cat, days=days)
    finally:
        conn.close()
    _log_behavior(user["id"], "timeline", category=cat)
    return data


@router.post("/workflow")
def insight_workflow_post(body: InsightWorkflowBody, user: dict = Depends(current_user)):
    ent = assert_insight_allowed(user["id"])
    from cloud_deploy.cloud_api.entitlements_v2 import can_insight_workflow

    if not can_insight_workflow(ent):
        raise HTTPException(status_code=403, detail="当前套餐不含工作流记录，请升级 V2-Pro")
    from cloud_deploy.cloud_api.database_pg import _conn
    from cloud_deploy.cloud_api.insight_workflow import upsert_workflow

    conn = _conn()
    try:
        item = upsert_workflow(
            conn,
            user["id"],
            category=body.category,
            report_date=body.report_date,
            status=body.status or "stocked",
            outcome=body.outcome or None,
            note=body.note or None,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    finally:
        conn.close()
    _log_behavior(user["id"], "workflow", category=body.category, report_date=body.report_date[:10] or None)
    return item


@router.put("/watchlist")
def insight_watchlist_put(body: InsightWatchlistBody, user: dict = Depends(current_user)):
    ent = assert_insight_allowed(user["id"])
    max_cats = max(int(ent.get("insight_categories_per_day") or 1) * 3, 10)
    if len(body.categories) > max_cats:
        raise HTTPException(status_code=400, detail=f"关注类目最多 {max_cats} 个")
    cats = _replace_insight_watchlist(user["id"], body.categories)
    _log_behavior(user["id"], "watchlist_add", metadata={"count": len(cats)})
    return {"categories": cats, "count": len(cats)}


@router.post("/generate")
def insight_generate(body: InsightGenerateBody, user: dict = Depends(current_user)):
    """
    Cache-First 触达预生成报告；扣减类目日配额（REQ-CACHE-002 / REQ-QUOTA-001）。
    未预生成则 404，不触发实时 LLM。
    """
    ent = assert_insight_allowed(user["id"])
    from cloud_deploy.cloud_api.database_pg import _conn
    from cloud_deploy.cloud_api.insight_quota import get_usage_today, try_reserve_category

    category = body.category
    report_date = _find_report_for_category(category, body.report_date)
    if not report_date:
        raise HTTPException(status_code=404, detail="该类目尚未预生成，请明日查看或浏览情报库")

    conn = _conn()
    try:
        usage = get_usage_today(conn, user["id"])
        already = category in (usage.get("categories") or [])
        if already:
            snap = usage
        else:
            ok, msg, snap = try_reserve_category(
                conn,
                user["id"],
                category,
                int(ent.get("insight_categories_per_day") or 1),
            )
            if not ok:
                raise HTTPException(status_code=429, detail=msg)
    finally:
        conn.close()

    limit = int(ent.get("insight_categories_per_day") or 1)
    _log_behavior(user["id"], "generate", category=category, report_date=report_date)
    view_path = f"/api/v1/member/insight/{report_date}/{category}/view"
    return {
        "category": category,
        "report_date": report_date,
        "view_path": view_path,
        "from_cache": True,
        "quota": {
            "used": int(snap.get("generated_count") or 0),
            "limit": limit,
            "categories_today": snap.get("categories") or [],
        },
    }


@router.get("/{report_date}/{category}/view")
def insight_view(
    report_date: str,
    category: str,
    access_token: str = "",
    cred: HTTPAuthorizationCredentials | None = Depends(security),
):
    user = _user_for_request(access_token, cred)
    assert_insight_allowed(user["id"])
    _validate_path_params(report_date, category)
    path = _resolve_insight_html(report_date, category)
    if not path:
        raise HTTPException(status_code=404, detail="情报报告不存在")
    _log_behavior(user["id"], "view", category=category, report_date=report_date)
    return FileResponse(path, media_type="text/html; charset=utf-8")


@router.get("/{report_date}/{category}/pdf")
def insight_pdf_export(
    report_date: str,
    category: str,
    access_token: str = "",
    cred: HTTPAuthorizationCredentials | None = Depends(security),
):
    """Q2-6：Pro 打印友好 PDF 摘要（浏览器另存为 PDF）。"""
    user = _user_for_request(access_token, cred)
    ent = assert_insight_allowed(user["id"])
    from cloud_deploy.cloud_api.entitlements_v2 import can_insight_pdf
    from cloud_deploy.reporting.insight_pdf_export import render_print_summary

    if not can_insight_pdf(ent):
        raise HTTPException(status_code=403, detail="当前套餐不含 PDF 摘要导出，请升级 V2-Pro")
    _validate_path_params(report_date, category)
    data = _load_insight_json(report_date, category)
    if not data:
        raise HTTPException(status_code=404, detail="情报报告不存在")
    report = data.get("report") or {}
    metrics = data.get("metrics") or {}
    _strip_internal_fields(metrics)
    _log_behavior(user["id"], "pdf_export", category=category, report_date=report_date)
    html_body = render_print_summary(report, metrics)
    return HTMLResponse(content=html_body, media_type="text/html; charset=utf-8")


@router.get("/{report_date}/{category}/summary")
def insight_summary(report_date: str, category: str, user: dict = Depends(current_user)):
    ent = assert_insight_allowed(user["id"])
    _validate_path_params(report_date, category)
    data = _load_insight_json(report_date, category)
    if not data:
        raise HTTPException(status_code=404, detail="情报报告不存在")
    _strip_internal_fields(data)
    allowed = filter_insight_library(
        [{"report_date": report_date, "category": category}],
        ent,
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="当前授权不可查看该日期情报")
    return data
