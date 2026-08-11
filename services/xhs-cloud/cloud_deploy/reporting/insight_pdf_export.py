# -*- coding: utf-8 -*-
"""PDF 摘要导出 — 打印友好 HTML + 水印（浏览器 Print → PDF）。"""
from __future__ import annotations

import html
from datetime import datetime
from typing import Any


def render_print_summary(report: dict[str, Any], metrics: dict[str, Any]) -> str:
    cat = html.escape(str(metrics.get("category") or "市场"))
    report_date = html.escape(str(metrics.get("report_date") or ""))
    stars = int(report.get("opportunity_stars") or 3)
    watermark = html.escape(f"AI 市场情报 · {report_date} · 仅供内部研究")
    exec_sum = html.escape(str(report.get("executive_summary") or ""))
    trend = html.escape(str(report.get("trend_summary") or ""))
    risk = html.escape(str(report.get("risk_assessment") or ""))
    pages = report.get("pages") or []
    verdict = ""
    for p in pages:
        if p.get("verdict"):
            verdict = html.escape(str(p.get("verdict")))
            break

    metrics_rows = ""
    for key, label in [
        ("growth_rate_pct", "增速"),
        ("blue_ocean_score", "蓝海"),
        ("competition_index", "竞争"),
        ("heat_score", "热度"),
        ("price_band", "价格带"),
    ]:
        if key in metrics:
            metrics_rows += f"<tr><th>{label}</th><td>{html.escape(str(metrics[key]))}</td></tr>"

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>情报摘要 — {cat}</title>
<style>
@page {{ margin: 18mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: "PingFang SC", system-ui, sans-serif; font-size: 11pt; color: #1d1d1f; line-height: 1.5; margin: 0; padding: 24px; }}
.wm {{ position: fixed; top: 40%; left: 50%; transform: translate(-50%,-50%) rotate(-35deg);
  font-size: 28px; color: rgba(0,0,0,.06); white-space: nowrap; pointer-events: none; z-index: 0; }}
.content {{ position: relative; z-index: 1; max-width: 680px; margin: 0 auto; }}
h1 {{ font-size: 18pt; margin: 0 0 4px; }}
.meta {{ color: #6e6e73; font-size: 10pt; margin-bottom: 16px; }}
.stars {{ font-size: 16pt; color: #ff9500; }}
.box {{ border: 1px solid #ddd; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; }}
.box h2 {{ margin: 0 0 8px; font-size: 12pt; color: #0071e3; }}
table {{ width: 100%; border-collapse: collapse; font-size: 10pt; }}
th {{ text-align: left; color: #6e6e73; width: 28%; padding: 4px 0; }}
td {{ padding: 4px 0; }}
.footer {{ margin-top: 20px; font-size: 9pt; color: #6e6e73; border-top: 1px solid #eee; padding-top: 10px; }}
.no-print {{ margin-top: 16px; text-align: center; }}
@media print {{
  .no-print {{ display: none !important; }}
  body {{ padding: 0; }}
}}
</style>
</head>
<body>
<div class="wm">{watermark}</div>
<div class="content">
  <h1>AI 市场情报摘要</h1>
  <div class="meta">{cat} · {report_date} · 机会 {stars}/5 · {verdict}</div>
  <div class="stars">{"★" * stars}{"☆" * (5 - stars)}</div>

  <div class="box"><h2>CEO 摘要</h2><p>{exec_sum}</p></div>
  <div class="box"><h2>趋势</h2><p>{trend or "—"}</p></div>
  <div class="box"><h2>关键指标</h2><table>{metrics_rows}</table></div>
  <div class="box"><h2>风险提示</h2><p>{risk or "—"}</p></div>

  <div class="footer">
    本摘要由 AI 辅助生成，不含商品 ID / 店铺明细。禁止转售或用于侵权抄款。
    导出时间：{html.escape(datetime.now().strftime("%Y-%m-%d %H:%M"))} · monitor.xhs365.cn
  </div>
</div>
<div class="no-print">
  <button onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer;background:#0071e3;color:#fff;border:none;border-radius:8px">打印 / 另存为 PDF</button>
  <p style="font-size:12px;color:#6e6e73">在打印对话框选择「另存为 PDF」</p>
</div>
<script>if (new URLSearchParams(location.search).get("autoprint") === "1") setTimeout(() => window.print(), 400);</script>
</body>
</html>"""
