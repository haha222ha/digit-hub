# -*- coding: utf-8 -*-
"""免费 AI 阅读样例 — 以机会卡为主（doc 49 R2）。

设计：
- 样例数据：assets/demo_static/advice.json（research_v1 / opportunity_cards）
- 前 N 张机会卡免费；其余加锁引导开会员
- 兼容旧版仅有 direction_advices 的样例包
"""
from __future__ import annotations

import json
import os
from typing import Any

from fastapi import HTTPException
from fastapi.responses import FileResponse, HTMLResponse

_ASSETS = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "assets",
)
_DEMO_SHELL = os.path.join(_ASSETS, "advisor_demo.html")
_STATIC_DEMO_DIR = os.path.join(_ASSETS, "demo_static")
_STATIC_DEMO_ADVICE = os.path.join(_STATIC_DEMO_DIR, "advice.json")
_STATIC_DEMO_HTML = os.path.join(_STATIC_DEMO_DIR, "advisor.html")

# 免费解锁机会卡数量
_DEMO_FREE_UNLOCK_COUNT = 8

_META_CACHE: dict[str, Any] | None = None


def _advisor_published_root() -> str:
    root = os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud")
    return os.path.join(root, "data", "advisor_published")


def _load_static_demo_advice() -> dict[str, Any] | None:
    if not os.path.isfile(_STATIC_DEMO_ADVICE):
        return None
    try:
        with open(_STATIC_DEMO_ADVICE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _card_to_content(card: dict[str, Any]) -> str:
    risks = card.get("risks") or []
    risk_txt = "\n".join(f"- {r}" for r in risks) or "- 请自行验证供需"
    profiles = "、".join(card.get("suggested_seller_profile") or []) or "中小商家"
    verdict = card.get("decision_verdict") or card.get("core_direction") or ""
    return (
        f"## {card.get('concept_name')}\n\n"
        f"> **决策结论**：{verdict}\n\n"
        f"**履约**：{card.get('fulfillment_mode') or '—'}　"
        f"**虚实**：{'虚拟培训/数字交付' if card.get('entity_class')=='virtual' else '实体供应'}\n\n"
        f"**机会指数**：{card.get('opportunity_score')}　"
        f"**轨道**：{card.get('signal_track') or '综合机会'}　"
        f"**竞争**：{card.get('competition_level')}　"
        f"**生命周期**：{card.get('lifecycle_stage')}\n\n"
        f"**增速档**：{card.get('growth_band') or card.get('trend_label') or '—'}　"
        f"**加速度档**：{card.get('accel_band') or '—'}　"
        f"**价格带**：{card.get('price_band')}\n\n"
        f"### 核心方向\n{card.get('core_direction') or ''}\n\n"
        f"### 为什么现在\n{card.get('why_now') or ''}\n\n"
        f"### 怎么做\n{card.get('how_to_act') or ''}\n\n"
        f"### 适合谁\n{profiles}\n\n"
        f"### 风险提示\n{risk_txt}\n\n"
        f"> 样例为细分研究方向决策，不指向可定位平台商品。"
    )


def _iter_demo_items(advice: dict[str, Any]) -> list[dict[str, Any]]:
    """优先机会卡；无则回退方向简报。"""
    items: list[dict[str, Any]] = []
    for card in advice.get("opportunity_cards") or []:
        if not isinstance(card, dict):
            continue
        name = card.get("concept_name") or card.get("opportunity_id")
        if not name:
            continue
        track = card.get("signal_track") or "机会"
        score = card.get("opportunity_score")
        title = f"{name}" + (f" · 指数{score}" if score is not None else "")
        if track and track != "综合机会":
            title = f"[{track}] {title}"
        items.append({
            "kind": "opportunity",
            "key": card.get("opportunity_id") or "",
            "title": title,
            "content": _card_to_content(card),
            "signal_track": track,
            "opportunity_score": score,
        })
    if items:
        return items
    for block in advice.get("direction_advices") or []:
        if not isinstance(block, dict):
            continue
        items.append({
            "kind": "direction",
            "key": block.get("key") or "",
            "title": block.get("title") or block.get("key") or "决策简报",
            "content": (block.get("content") or block.get("summary") or "").strip(),
            "signal_track": "",
            "opportunity_score": None,
        })
    return items


def pick_demo_report() -> dict[str, Any]:
    global _META_CACHE
    if _META_CACHE is not None:
        return dict(_META_CACHE)

    advice = _load_static_demo_advice()
    if not advice:
        out = {
            "available": False,
            "reason": "no_static_demo",
            "message": "样例报告筹备中，请稍后刷新或开通体验卡阅读完整 AI 分析",
        }
        _META_CACHE = out
        return dict(out)

    ov = advice.get("daily_overview") or {}
    title = ov.get("title") or "AI 选品研究 · 免费样例"
    items = _iter_demo_items(advice)
    item_count = len(items)
    free_count = min(_DEMO_FREE_UNLOCK_COUNT, item_count)
    report_date = str(
        (advice.get("meta") or {}).get("target_date")
        or advice.get("report_date")
        or "2026-07-15"
    )[:10]
    stars = min(5, max(3, (advice.get("meta") or {}).get("opportunity_count", item_count) // 4 + 2))

    out = {
        "available": True,
        "report_date": report_date,
        "latest_date": "",
        "is_static": True,
        "is_latest": False,
        "category": "advisor",
        "title": title,
        "stars": stars,
        "direction_count": item_count,
        "opportunity_count": len(advice.get("opportunity_cards") or []),
        "free_unlock_count": free_count,
        "locked_count": max(0, item_count - free_count),
        "pack_type": (advice.get("meta") or {}).get("pack_type") or "research_v1",
        "categories": [{"category": "advisor", "title": title, "stars": stars}],
        "view_url": f"/api/v1/public/advisor-demo/view?date={report_date}&category=advisor",
        "shell_url": "/public/advisor-demo",
        "ai_modes": {
            "pregenerated_read": True,
            "dynamic_llm": False,
            "advisor_chat": False,
        },
        "notice": (
            f"免费样例：前 {free_count} 张 AI 机会卡可深度阅读，"
            f"其余为会员专享。开通体验卡或正式会员可解锁全部机会与每日最新研究。"
        ),
    }
    _META_CACHE = out
    return dict(out)


def invalidate_demo_cache() -> None:
    global _META_CACHE
    _META_CACHE = None


def demo_info() -> dict[str, Any]:
    return pick_demo_report()


def demo_directions() -> dict[str, Any]:
    """返回机会卡列表（字段名仍为 directions，兼容现网前端）。"""
    meta = pick_demo_report()
    if not meta.get("available"):
        return {"available": False, "report_date": "", "directions": [], "opportunities": []}

    advice = _load_static_demo_advice()
    if not advice:
        return {"available": False, "report_date": meta.get("report_date", ""), "directions": []}

    report_date = meta.get("report_date") or ""
    raw_items = _iter_demo_items(advice)
    free_count = min(_DEMO_FREE_UNLOCK_COUNT, len(raw_items))
    directions: list[dict] = []
    unlocked_count = 0
    for i, block in enumerate(raw_items):
        if i < free_count:
            directions.append({
                "title": block["title"],
                "content": block["content"],
                "unlocked": True,
                "index": i + 1,
                "kind": block.get("kind") or "opportunity",
                "signal_track": block.get("signal_track") or "",
                "opportunity_score": block.get("opportunity_score"),
            })
            unlocked_count += 1
        else:
            directions.append({
                "title": block["title"],
                "content": (
                    "🔒 本机会为会员专享。开通 ¥9.9 体验卡（3 天）或正式会员即可解锁"
                    "全部机会卡 + 高增速/高加速度研究轨道 + 每日最新报告。"
                ),
                "unlocked": False,
                "index": i + 1,
                "kind": block.get("kind") or "opportunity",
                "signal_track": block.get("signal_track") or "",
                "opportunity_score": block.get("opportunity_score"),
            })

    return {
        "available": True,
        "report_date": report_date,
        "total": len(directions),
        "unlocked_count": unlocked_count,
        "locked_count": max(0, len(directions) - unlocked_count),
        "free_unlock_count": free_count,
        "pack_type": meta.get("pack_type") or "research_v1",
        "directions": directions,
        "opportunities": directions,  # 新字段别名
    }


def demo_view_response(date: str, category: str) -> FileResponse:
    date = (date or "").strip()[:10]
    meta = pick_demo_report()
    if not meta.get("available"):
        raise HTTPException(status_code=404, detail=meta.get("message") or "样例不可用")

    if os.path.isfile(_STATIC_DEMO_HTML):
        return FileResponse(
            _STATIC_DEMO_HTML,
            media_type="text/html; charset=utf-8",
            headers={"Cache-Control": "public, max-age=600", "X-Demo-Mode": "free-readonly-static"},
        )

    advisor_path = os.path.join(_advisor_published_root(), date, "advisor.html")
    if os.path.isfile(advisor_path):
        return FileResponse(
            advisor_path,
            media_type="text/html; charset=utf-8",
            headers={"Cache-Control": "public, max-age=600", "X-Demo-Mode": "free-readonly"},
        )

    raise HTTPException(status_code=404, detail="样例报告不存在")


def demo_advice_response() -> dict[str, Any]:
    meta = pick_demo_report()
    if not meta.get("available"):
        raise HTTPException(status_code=404, detail=meta.get("message") or "样例不可用")

    advice = _load_static_demo_advice()
    if not advice:
        raise HTTPException(status_code=404, detail="静态样例数据缺失")

    out = json.loads(json.dumps(advice))
    cards = out.get("opportunity_cards") or []
    free_count = min(_DEMO_FREE_UNLOCK_COUNT, len(cards))
    for i, card in enumerate(cards):
        if i >= free_count and isinstance(card, dict):
            card["why_now"] = "🔒 会员专享机会解读"
            card["how_to_act"] = "开通体验卡或正式会员解锁"
            card["risks"] = ["会员专享"]
            card["locked"] = True

    raw_dirs = out.get("direction_advices") or []
    # 方向简报：样例仅开放前 2 篇
    for i, block in enumerate(raw_dirs):
        if i >= 2 and isinstance(block, dict):
            block["content"] = "🔒 本决策简报为会员专享内容。"
            block["summary"] = block["content"]
            block["locked"] = True

    return out


def demo_shell_response() -> HTMLResponse:
    if not os.path.isfile(_DEMO_SHELL):
        raise HTTPException(status_code=404, detail="样例页未部署")
    with open(_DEMO_SHELL, "r", encoding="utf-8") as f:
        html = f.read()
    return HTMLResponse(html, headers={"Cache-Control": "no-cache"})
