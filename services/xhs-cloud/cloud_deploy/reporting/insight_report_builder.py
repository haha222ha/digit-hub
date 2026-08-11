# -*- coding: utf-8 -*-
"""情报 HTML 渲染与 bundle 写入。"""
from __future__ import annotations

import html
import json
import os
from pathlib import Path
from typing import Any


def render_insight_html(report: dict[str, Any], metrics: dict[str, Any]) -> str:
    cat = html.escape(str(metrics.get("category") or "市场"))
    report_date = html.escape(str(metrics.get("report_date") or ""))
    stars = int(report.get("opportunity_stars") or 3)
    star_str = "★" * stars + "☆" * (5 - stars)
    body_parts = []
    for p in report.get("pages") or []:
        title = html.escape(str(p.get("title") or ""))
        if p.get("body"):
            body_parts.append(f"<section><h2>{title}</h2><p>{html.escape(str(p['body']))}</p></section>")
        elif p.get("verdict"):
            extra = ""
            if p.get("action"):
                extra = f"<p class=\"sub\">{html.escape(str(p.get('action')))}</p>"
            body_parts.append(
                f"<section><h2>{title}</h2><p>{html.escape(str(p.get('verdict')))}</p>{extra}</section>"
            )
        elif p.get("growth") is not None:
            body_parts.append(
                f"<section><h2>{title}</h2>"
                f"<p>增速 {html.escape(str(p.get('growth')))} · 竞争 {html.escape(str(p.get('competition') or ''))}</p></section>"
            )
        elif p.get("focus") or p.get("price"):
            fmt = html.escape(str(p.get("format") or ""))
            fmt_line = f"<p>内容形式：{fmt}</p>" if fmt else ""
            body_parts.append(
                f"<section><h2>{title}</h2>"
                f"<p>聚焦 {html.escape(str(p.get('focus') or ''))} · 价格带 {html.escape(str(p.get('price') or ''))}</p>"
                f"{fmt_line}</section>"
            )
    sections = "\n".join(body_parts) or f"<p>{html.escape(report.get('executive_summary') or '')}</p>"

    metric_interp = html.escape(str(report.get("metric_interpretation") or ""))
    interp_block = ""
    if metric_interp:
        interp_block = f"<section><h2>指标解读</h2><p>{metric_interp}</p></section>"

    evidence = _render_metrics_evidence(metrics)
    return f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{cat} · AI 选品情报 {report_date}</title>
<style>
body{{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:20px;background:#f5f5f7;color:#1d1d1f}}
.wrap{{max-width:720px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,.06)}}
h1{{font-size:22px;margin:0 0 8px}} .meta{{color:#6e6e73;font-size:13px;margin-bottom:20px}}
.stars{{color:#ff9500;font-size:18px;margin:8px 0 16px}} section{{margin-bottom:20px}}
h2{{font-size:16px;margin:0 0 8px}} p{{line-height:1.65;font-size:14px;margin:0}} p.sub{{color:#6e6e73;font-size:13px;margin-top:6px}}
.disclaimer{{font-size:12px;color:#6e6e73;margin-top:24px;padding-top:16px;border-top:1px solid #eee}}
details.evidence{{margin-top:20px;border:1px solid #e5e5ea;border-radius:10px;padding:12px 14px;background:#fafafa}}
details.evidence summary{{cursor:pointer;font-weight:600;font-size:14px;color:#0071e3}}
.evidence dl{{margin:12px 0 0;display:grid;grid-template-columns:120px 1fr;gap:8px 12px;font-size:13px}}
.evidence dt{{color:#6e6e73}} .evidence dd{{margin:0}}
</style></head><body><div class="wrap">
<h1>{cat}</h1>
<div class="meta">报告日期 {report_date} · 类目级聚合情报 · 5 Agent</div>
<div class="stars">{star_str} 机会 {stars}/5</div>
<p><strong>{html.escape(report.get('executive_summary') or '')}</strong></p>
{interp_block}
{sections}
{evidence}
<p class="disclaimer">{html.escape(metrics.get('disclaimer') or '')}</p>
</div></body></html>"""


def _render_metrics_evidence(metrics: dict[str, Any]) -> str:
    rows: list[tuple[str, str]] = []
    mapping = [
        ("growth_rate_pct", "增速指数", "%"),
        ("competition_index", "竞争指数", ""),
        ("blue_ocean_score", "蓝海指数", ""),
        ("heat_score", "热度指数", ""),
        ("new_product_score", "新品指数", ""),
        ("price_band", "价格带", ""),
        ("trend_label", "趋势标签", ""),
        ("lifecycle_stage", "生命周期", ""),
        ("season_score", "季节指数", ""),
    ]
    for key, label, suffix in mapping:
        if key in metrics and metrics[key] is not None and metrics[key] != "":
            val = metrics[key]
            if suffix == "%":
                rows.append((label, f"{val}{suffix}"))
            else:
                rows.append((label, str(val)))
    pd = metrics.get("price_distribution")
    if isinstance(pd, dict) and pd:
        parts = [f"{k} {v}%" for k, v in list(pd.items())[:5]]
        rows.append(("价格分布", " · ".join(parts)))
    trend = metrics.get("trend_7d")
    if isinstance(trend, list) and trend:
        last = trend[-3:]
        parts = [f"{t.get('date','')[-5:]} {t.get('growth',0):.0f}%" for t in last]
        rows.append(("近7日增速", " → ".join(parts)))
    peers = metrics.get("similar_categories")
    if isinstance(peers, list) and peers:
        rows.append(("相关赛道", "、".join(str(x) for x in peers[:4])))
    if not rows:
        return ""
    dl = "".join(f"<dt>{html.escape(k)}</dt><dd>{html.escape(v)}</dd>" for k, v in rows)
    return f'<details class="evidence"><summary>指标依据（类目级聚合，非单品）</summary><dl>{dl}</dl></details>'



def write_insight_bundle(
    base_dir: str | Path,
    report_date: str,
    category: str,
    html_content: str,
    meta: dict[str, Any],
) -> Path:
    day = report_date.replace("-", "")
    bundle = Path(base_dir) / f"insight_{day}" / category
    bundle.mkdir(parents=True, exist_ok=True)
    (bundle / "index.html").write_text(html_content, encoding="utf-8")
    (bundle / "insight.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return bundle


def pg_items_to_rows(items: list) -> list[dict[str, Any]]:
    """报告 item → insight 聚合输入（含脱敏 category_tag，与日报分层同源）。"""
    from cloud_deploy.reporting.constants import item_at

    rows: list[dict[str, Any]] = []
    for it in items:
        title = str(item_at(it, "title") or "").strip()
        if not title:
            continue
        gr = float(item_at(it, "gr") or item_at(it, "actual_gr") or 0)
        if gr > 1.5:
            gr = gr / 100.0
        pool = str(item_at(it, "pool") or "")
        is_virtual = bool(item_at(it, "is_virtual"))
        delta = float(item_at(it, "actual_v1d") or item_at(it, "delta") or 0)
        cat = str(item_at(it, "category_tag") or item_at(it, "category") or "").strip()
        rows.append(
            {
                "title": title,
                "price": float(item_at(it, "price") or 0),
                "delta": delta,
                "gr": gr,
                "first_seen_days": 99,
                "is_new": pool.upper() == "NEW",
                "is_virtual": is_virtual,
                "behavior": str(item_at(it, "behavior") or ""),
                "category_tag": cat,
                "category": cat,
            }
        )
    return rows
