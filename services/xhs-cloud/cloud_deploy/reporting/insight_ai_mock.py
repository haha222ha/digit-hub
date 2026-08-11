# -*- coding: utf-8 -*-
"""情报报告 mock 生成（无 LLM 时使用，L0 预生成默认路径）。"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class InsightReport:
    executive_summary: str
    trend_summary: str
    metric_interpretation: str
    action_plan: dict[str, Any]
    risk_assessment: str
    opportunity_stars: int
    confidence: float
    pages: list[dict[str, Any]] = field(default_factory=list)
    llm_meta: dict[str, Any] = field(default_factory=dict)

    def to_public_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d.pop("llm_meta", None)
        return d


def _stars(score: int) -> int:
    if score >= 85:
        return 5
    if score >= 70:
        return 4
    if score >= 55:
        return 3
    if score >= 40:
        return 2
    return 1


def run_agents_mock(metrics: dict[str, Any]) -> InsightReport:
    cat = metrics.get("category") or "目标类目"
    growth = float(metrics.get("growth_rate_pct") or 0)
    comp = int(metrics.get("competition_index") or 50)
    blue = int(metrics.get("blue_ocean_score") or 50)
    band = metrics.get("price_band") or "待定"
    trend = metrics.get("trend_label") or "平稳"
    stars = _stars(blue)
    enter = blue >= 60 and comp <= 60

    trend_summary = (
        f"近 {metrics.get('window_days', 7)} 天，{cat} 整体呈{trend}态势，"
        f"估算增速约 {growth:.0f}%，热度指数 {metrics.get('heat_score', 0)}。"
    )
    metric_interp = (
        f"竞争指数 {comp}（{'偏低' if comp < 40 else '中等' if comp < 70 else '偏高'}），"
        f"蓝海指数 {blue}，价格带 {band} 元为主战场。"
    )
    action = {
        "enter": enter,
        "category_focus": cat,
        "price_band": f"{band} 元",
        "content_format": ["PDF 资料包", "图文笔记", "短视频脚本"],
        "timeline_days": 7 if enter else 14,
    }
    risk = (
        "竞争开始增加，需避免同质化；请独立核实平台规则与知识产权。"
        if comp > 50
        else "竞争相对温和，注意交付周期与售后。"
    )
    exec_sum = (
        f"{cat}：{'建议进入' if enter else '建议观望'}。"
        f"{'窗口期约 2～3 周' if enter else '等待更强趋势信号'}。"
    )
    pages = [
        {"page": 1, "title": "本周趋势评分", "stars": stars},
        {"page": 2, "title": "AI 总结", "body": trend_summary},
        {
            "page": 3,
            "title": "市场机会",
            "growth": f"{growth:.0f}%",
            "competition": "低" if comp < 40 else "中" if comp < 70 else "高",
            "stars": stars,
        },
        {"page": 4, "title": "AI 建议", "focus": cat, "price": band},
        {"page": 5, "title": "风险提示", "body": risk},
        {"page": 6, "title": "总结", "verdict": "适合进入" if enter else "继续观察"},
    ]
    return InsightReport(
        executive_summary=exec_sum,
        trend_summary=trend_summary,
        metric_interpretation=metric_interp,
        action_plan=action,
        risk_assessment=risk,
        opportunity_stars=stars,
        confidence=min(0.95, 0.5 + blue / 200),
        pages=pages,
    )
