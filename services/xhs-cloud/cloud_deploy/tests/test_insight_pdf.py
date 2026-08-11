# -*- coding: utf-8 -*-
"""Q2-6 PDF 导出渲染。"""
from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from cloud_deploy.reporting.insight_pdf_export import render_print_summary


def test_pdf_render():
    html = render_print_summary(
        {
            "executive_summary": "测试摘要",
            "trend_summary": "温和上涨",
            "risk_assessment": "注意合规",
            "opportunity_stars": 4,
            "pages": [{"verdict": "可跟进"}],
        },
        {
            "category": "美妆护肤",
            "report_date": "2026-07-12",
            "growth_rate_pct": 12.5,
            "blue_ocean_score": 80,
        },
    )
    assert "美妆护肤" in html
    assert "测试摘要" in html
    assert "window.print" in html


if __name__ == "__main__":
    test_pdf_render()
    print("test_insight_pdf OK")
