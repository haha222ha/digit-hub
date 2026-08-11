# -*- coding: utf-8 -*-
"""会员 AI 选品顾问 API — 只读阅读。"""
from __future__ import annotations

import json
import os
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from cloud_deploy.cloud_api import database as db
from cloud_deploy.cloud_api.auth import current_user
from cloud_deploy.cloud_api.member_entitlements import (
    assert_advisor_allowed,
    enrich_member_profile,
    resolve_entitlements,
)

router = APIRouter(prefix="/api/v1/member/advisor", tags=["advisor"])
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class AdvisorChatBody(BaseModel):
    query: str = Field(..., min_length=2, max_length=2000)
    context_date: str = Field(default="", max_length=10)


def _log_behavior(
    user_id: int,
    action: str,
    *,
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
                category=None,
                report_date=report_date,
                metadata=metadata,
            )
        finally:
            conn.close()
    except Exception:
        pass


def _advisor_root() -> str:
    root = os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud")
    sub = os.environ.get("XHS_ADVISOR_PUBLISH_DIR", "data/advisor_published")
    return os.path.join(root, sub)


def _enrich_advice_types(data: dict) -> dict:
    """读时补齐 direction_advices.category_type（兼容旧 pregen 无字段）。"""
    try:
        from cloud_deploy.rank_engine.entity_type import enrich_advice_directions

        return enrich_advice_directions(data, context=None)
    except Exception:
        return data


def _load_public_advice(report_date: str) -> dict:
    path = os.path.join(_advisor_root(), report_date, "advice.json")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="当日 AI 报告尚未发布")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        data.pop("rankings", None)
        data.pop("context", None)
        try:
            from cloud_deploy.rank_engine.compliance import public_trim_advice

            data = public_trim_advice(data)
        except Exception:
            pass
        data = _enrich_advice_types(data)
    return data


def _list_advisor_dates() -> list[str]:
    base = _advisor_root()
    if not os.path.isdir(base):
        return []
    out = []
    for name in sorted(os.listdir(base), reverse=True):
        if not _DATE_RE.match(name):
            continue
        if os.path.isfile(os.path.join(base, name, "advice.json")):
            out.append(name)
    return out


def _advisor_library_items() -> list[dict]:
    items = []
    for date in _list_advisor_dates():
        manifest = os.path.join(_advisor_root(), date, "report_manifest.json")
        summary = ""
        if os.path.isfile(manifest):
            try:
                meta = json.loads(open(manifest, encoding="utf-8").read())
                summary = str(meta.get("summary") or "")
            except (OSError, json.JSONDecodeError):
                pass

        # 统计 direction_advices 的 category_type 分布（虚拟/实体分类）
        # 同时收集每篇方向解读的轻量信息（key/title/category_type），
        # 供前端 archive 页面按日期文件夹形式展开 30 篇方向解读。
        physical_count = 0
        virtual_count = 0
        mixed_count = 0
        direction_count = 0
        directions: list[dict] = []
        advice_path = os.path.join(_advisor_root(), date, "advice.json")
        if os.path.isfile(advice_path):
            try:
                with open(advice_path, encoding="utf-8") as f:
                    advice = json.load(f)
                if isinstance(advice, dict):
                    advice = _enrich_advice_types(advice)
                dirs = advice.get("direction_advices") or []
                direction_count = len(dirs)
                for d in dirs:
                    ct = str(d.get("category_type") or "").strip().lower()
                    if ct == "physical":
                        physical_count += 1
                    elif ct == "virtual":
                        virtual_count += 1
                    elif ct == "mixed":
                        mixed_count += 1
                    directions.append({
                        "key": d.get("key") or "",
                        "title": (d.get("title") or d.get("key") or "维度解读")[:120],
                        "category_type": ct or "mixed",
                    })
            except (OSError, json.JSONDecodeError):
                pass

        items.append({
            "report_date": date,
            "summary": summary,
            "archive_type": "member_ai_advisor_zip",
            "direction_count": direction_count,
            "physical_count": physical_count,
            "virtual_count": virtual_count,
            "mixed_count": mixed_count,
            "directions": directions,
        })
    return items


def _insight_library_items(user_id: int) -> list[dict]:
    from cloud_deploy.cloud_api.insight_routes import _list_items_from_disk
    from cloud_deploy.cloud_api.entitlements_v2 import filter_insight_library

    items = _list_items_from_disk()
    ent = resolve_entitlements(user_id, db.get_member_profile(user_id))
    return filter_insight_library(items, ent)


def _insight_today_items(user_id: int) -> list[dict]:
    items = _insight_library_items(user_id)
    if not items:
        return []
    dates = sorted({str(it.get("report_date") or "")[:10] for it in items}, reverse=True)
    latest = dates[0]
    return [it for it in items if str(it.get("report_date") or "")[:10] == latest]


def _insight_tree(user_id: int, limit_dates: int = 7) -> list[dict]:
    items = _insight_library_items(user_id)
    if not items:
        return []
    by_date: dict[str, list[dict]] = {}
    for it in items:
        d = str(it.get("report_date") or "")[:10]
        if not d:
            continue
        by_date.setdefault(d, []).append(it)
    out = []
    for d in sorted(by_date.keys(), reverse=True)[:limit_dates]:
        cats = sorted(by_date[d], key=lambda x: -(x.get("stars") or 0))
        out.append({
            "report_date": d,
            "items": [
                {
                    "category": c.get("category") or "",
                    "stars": c.get("stars") or 0,
                    "summary": c.get("summary") or "",
                    "growth_rate": c.get("growth_rate"),
                    "blue_ocean_score": c.get("blue_ocean_score"),
                    "competition_index": c.get("competition_index"),
                    "heat_score": c.get("heat_score"),
                    "lifecycle_stage": c.get("lifecycle_stage"),
                    "trend_label": c.get("trend_label"),
                    "price_band": c.get("price_band"),
                    "median_price": c.get("median_price"),
                    "confidence": c.get("confidence"),
                    "action_enter": c.get("action_enter"),
                    "sample_size": c.get("sample_size"),
                }
                for c in cats[:30]
            ],
        })
    return out


@router.get("/library")
def advisor_library(user: dict = Depends(current_user)):
    assert_advisor_allowed(user["id"])
    _log_behavior(user["id"], "advisor_library")
    return {"items": _advisor_library_items()}


@router.post("/chat")
def advisor_chat(body: AdvisorChatBody, user: dict = Depends(current_user)):
    enriched = assert_advisor_allowed(user["id"])
    daily_limit = int(enriched.get("advisor_chat_daily") or 0)
    if daily_limit <= 0:
        raise HTTPException(status_code=403, detail="当前套餐不含 AI 对话")

    from cloud_deploy.cloud_api.advisor_chat_quota import try_consume_chat
    from cloud_deploy.cloud_api.database_pg import _conn

    conn = _conn()
    try:
        ok, msg, usage = try_consume_chat(conn, user["id"], daily_limit)
        if not ok:
            raise HTTPException(status_code=429, detail=msg)
        conn.commit()
    finally:
        conn.close()

    query = body.query.strip()
    context_date = (body.context_date or "").strip()
    if context_date and not _DATE_RE.match(context_date):
        raise HTTPException(status_code=400, detail="context_date 格式应为 YYYY-MM-DD")

    dates = _list_advisor_dates()
    ref_date = context_date or (dates[0] if dates else "")
    context_hint = ""
    if ref_date:
        try:
            advice = _load_public_advice(ref_date)
            ov = advice.get("daily_overview") or {}
            hint_parts = []
            if ov.get("summary"):
                hint_parts.append(str(ov["summary"]))
            if ov.get("content"):
                hint_parts.append(str(ov["content"]))
            # 追加方向解读标题列表，让 LLM 知道有哪些方向
            directions = advice.get("directions") or []
            if directions:
                dir_titles = [d.get("title", "") for d in directions[:30] if d.get("title")]
                if dir_titles:
                    hint_parts.append("今日方向：" + " | ".join(dir_titles))
            context_hint = "\n".join(hint_parts)[:3000]
        except HTTPException:
            context_hint = ""

    content = ""
    llm_error = ""
    try:
        from cloud_deploy.reporting.insight_llm_client import LLMError, chat_json_with_usage

        system_prompt = (
            "你是 PA AI 选品顾问，仅基于预生成报告摘要回答，不得编造商品 ID 或店铺名。"
            "回答需简洁、具体、有数据支撑，并注明仅供参考。"
        )
        user_prompt = (
            f"报告日期：{ref_date or '未知'}\n"
            f"报告摘要：{context_hint or '（暂无当日摘要）'}\n"
            f"用户问题：{query}\n"
            '请用简洁中文回答，返回 JSON 格式：{"content": "你的回答内容"}'
        )
        parsed, _usage = chat_json_with_usage(
            system=system_prompt,
            user=user_prompt,
        )
        if isinstance(parsed, dict):
            content = str(parsed.get("content") or parsed.get("answer") or "")
        elif isinstance(parsed, str):
            content = parsed
    except Exception as e:
        llm_error = str(e)[:200]
        content = ""

    if not content.strip():
        content = (
            f"抱歉，AI 顾问暂时无法回答（报告日期：{ref_date or '暂无'}）。"
            f"请结合侧栏「方向解读」与类目情报阅读。"
            + (f"（调试信息：{llm_error}）" if llm_error else "")
        )

    quota_remaining = max(daily_limit - int(usage.get("chat_count") or 0), 0)
    _log_behavior(user["id"], "advisor_chat", report_date=ref_date or None, metadata={"query_len": len(query)})
    return {
        "query": query,
        "content": content.strip(),
        "quota_remaining": quota_remaining,
        "disclaimer": "仅供参考，不构成投资建议。回答基于预生成报告摘要，存在延迟与误差。",
    }


@router.get("/dashboard")
def advisor_dashboard(user: dict = Depends(current_user)):
    assert_advisor_allowed(user["id"])
    _log_behavior(user["id"], "advisor_dashboard")
    profile = db.get_member_profile(user["id"])
    if not profile:
        raise HTTPException(status_code=404, detail="用户不存在")
    enriched = enrich_member_profile(profile, user["id"]) or profile
    ent = enriched.get("entitlements") or {}

    dates = _list_advisor_dates()
    advisor_date = dates[0] if dates else ""
    overview = None
    directions: list[dict] = []
    opportunities: list[dict] = []
    status = "pending"

    if advisor_date:
        try:
            advice = _load_public_advice(advisor_date)
            status = "published"
            ov = advice.get("daily_overview") or {}
            n_opp = len(advice.get("opportunity_cards") or [])
            overview = {
                "title": ov.get("title") or "今日选品研究",
                "summary": (ov.get("summary") or ov.get("content") or "")[:240],
                "read_url": f"/api/v1/member/advisor/{advisor_date}/articles/overview",
                "opportunity_count": n_opp,
            }
            for card in advice.get("opportunity_cards") or []:
                if not isinstance(card, dict):
                    continue
                oid = str(card.get("opportunity_id") or "")
                if not oid:
                    continue
                opportunities.append({
                    "opportunity_id": oid,
                    "concept_name": card.get("concept_name") or oid,
                    "decision_verdict": card.get("decision_verdict") or "",
                    "core_direction": card.get("core_direction") or "",
                    "fulfillment_mode": card.get("fulfillment_mode") or "",
                    "opportunity_score": card.get("opportunity_score"),
                    "competition_level": card.get("competition_level") or "",
                    "lifecycle_stage": card.get("lifecycle_stage") or "",
                    "trend_label": card.get("trend_label") or "",
                    "signal_track": card.get("signal_track") or "综合机会",
                    "growth_band": card.get("growth_band") or "",
                    "accel_band": card.get("accel_band") or "",
                    "price_band": card.get("price_band") or "",
                    "entity_class": str(card.get("entity_class") or "mixed").lower(),
                    "summary": (card.get("decision_verdict") or card.get("why_now") or "")[:160],
                })
            for block in advice.get("direction_advices") or []:
                if not isinstance(block, dict):
                    continue
                directions.append({
                    "key": block.get("key") or "",
                    "title": block.get("title") or block.get("key") or "决策简报",
                    "summary": (block.get("summary") or block.get("content") or "")[:200],
                    "category_type": str(block.get("category_type") or "mixed").lower(),
                })
        except HTTPException:
            status = "pending"

    insights = []
    for it in _insight_today_items(user["id"])[:20]:
        insights.append({
            "category": it.get("category") or "",
            "stars": it.get("stars") or 0,
            "report_date": str(it.get("report_date") or "")[:10],
            "summary": it.get("summary") or "",
        })

    report_date = advisor_date or (insights[0]["report_date"] if insights else "")
    archive_months = sorted({d[:7] for d in dates}, reverse=True)

    return {
        "membership": {
            "is_active": enriched.get("is_active"),
            "days_left": enriched.get("days_remaining"),
            "plan_label": enriched.get("plan_label") or enriched.get("plan_code"),
            "username": enriched.get("username"),
        },
        "entitlements": ent,
        "today": {
            "report_date": report_date,
            "status": status,
            "overview": overview,
            "opportunities": opportunities,
            "directions": directions,
            "insights": insights,
        },
        "insight_tree": _insight_tree(user["id"]),
        "archive_hint": {
            "latest_month": archive_months[0] if archive_months else "",
            "total_days": len(dates),
            "advisor_dates": dates[:30],
        },
    }


@router.get("/{report_date}")
def advisor_day(report_date: str, user: dict = Depends(current_user)):
    assert_advisor_allowed(user["id"], report_date=report_date)
    if not _DATE_RE.match(report_date):
        raise HTTPException(status_code=400, detail="report_date 格式应为 YYYY-MM-DD")
    _log_behavior(user["id"], "advisor_day", report_date=report_date)
    return _load_public_advice(report_date)


@router.get("/{report_date}/articles/{article_key}")
def advisor_article(report_date: str, article_key: str, user: dict = Depends(current_user)):
    assert_advisor_allowed(user["id"], report_date=report_date)
    data = _load_public_advice(report_date)
    if article_key == "overview":
        block = data.get("daily_overview")
    elif str(article_key).startswith("opp_"):
        card = next(
            (c for c in data.get("opportunity_cards", []) if c.get("opportunity_id") == article_key),
            None,
        )
        if not card:
            raise HTTPException(status_code=404, detail="机会卡不存在")
        risks = card.get("risks") or []
        risk_txt = "\n".join(f"- {r}" for r in risks)
        profiles = "、".join(card.get("suggested_seller_profile") or [])
        content = (
            f"## {card.get('concept_name')}\n\n"
            f"> **决策结论**：{card.get('decision_verdict') or card.get('core_direction') or card.get('concept_name')}\n\n"
            f"**履约形态**：{card.get('fulfillment_mode') or ('虚拟' if card.get('entity_class')=='virtual' else '实体')}　"
            f"**虚实**：{'虚拟培训/数字交付' if card.get('entity_class')=='virtual' else '实体供应'}　"
            f"**类目簇**：{card.get('category_cluster') or '—'}\n\n"
            f"**机会指数**：{card.get('opportunity_score')}　"
            f"**轨道**：{card.get('signal_track') or '综合机会'}　"
            f"**竞争**：{card.get('competition_level')}　"
            f"**生命周期**：{card.get('lifecycle_stage')}\n\n"
            f"**增速档**：{card.get('growth_band') or card.get('trend_label') or '—'}　"
            f"**加速度档**：{card.get('accel_band') or '—'}　"
            f"**价格带**：{card.get('price_band')}　"
            f"**建议进入**：{card.get('suggested_entry_window')}\n\n"
            f"### 核心方向\n{card.get('core_direction') or ''}\n\n"
            f"### 为什么现在\n{card.get('why_now') or ''}\n\n"
            f"### 怎么做\n{card.get('how_to_act') or ''}\n\n"
            f"### 适合谁\n{profiles or '中小商家'}\n\n"
            f"### 风险提示\n{risk_txt or '- 请自行验证供需'}\n\n"
            f"> 输出为细分**研究方向**决策，不是平台商品链接；不提供可定位 SKU。"
        )
        _log_behavior(user["id"], "advisor_opportunity", report_date=report_date, metadata={"key": article_key})
        return {
            "report_date": report_date,
            "key": article_key,
            "title": card.get("concept_name") or article_key,
            "summary": (card.get("why_now") or "")[:200],
            "content": content,
            "key_points": [],
            "category_type": str(card.get("entity_class") or "").strip().lower(),
            "opportunity": card,
            "source_refs": [],
            "source_ref_policy": "",
        }
    else:
        block = next(
            (d for d in data.get("direction_advices", []) if d.get("key") == article_key),
            None,
        )
    if not block:
        raise HTTPException(status_code=404, detail="文章不存在")
    _log_behavior(user["id"], "advisor_article", report_date=report_date, metadata={"key": article_key})
    refs = block.get("source_refs") if isinstance(block.get("source_refs"), list) else []
    return {
        "report_date": report_date,
        "key": article_key,
        "title": block.get("title") or article_key,
        "summary": block.get("summary") or "",
        "content": block.get("content") or block.get("summary") or "",
        "key_points": list(block.get("key_points") or [])[:12],
        "category_type": str(block.get("category_type") or "").strip().lower(),
        "source_refs": [r for r in refs if isinstance(r, dict) and r.get("id")][:40],
        "source_ref_policy": (data.get("meta") or {}).get("source_ref_policy") or "",
    }


@router.get("/{report_date}/download")
def advisor_zip_download(report_date: str, user: dict = Depends(current_user)):
    """PC 端 sync ai_advisor ZIP（非 Legacy daily zip）。"""
    assert_advisor_allowed(user["id"], report_date=report_date)
    if not _DATE_RE.match(report_date):
        raise HTTPException(status_code=400, detail="report_date 格式应为 YYYY-MM-DD")
    path = db.get_archive_path(report_date, "member_ai_advisor_zip")
    if not path or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="AI 顾问 ZIP 不存在")
    _log_behavior(user["id"], "advisor_download", report_date=report_date)
    return FileResponse(
        path,
        media_type="application/zip",
        filename=os.path.basename(path),
    )


@router.get("/{report_date}/view")
def advisor_html(report_date: str, user: dict = Depends(current_user)):
    assert_advisor_allowed(user["id"], report_date=report_date)
    html = os.path.join(_advisor_root(), report_date, "advisor.html")
    if not os.path.isfile(html):
        raise HTTPException(status_code=404, detail="HTML 视图不存在")
    _log_behavior(user["id"], "advisor_view", report_date=report_date)
    return FileResponse(
        html,
        media_type="text/html; charset=utf-8",
        headers={"Cache-Control": "private, max-age=300"},
    )
