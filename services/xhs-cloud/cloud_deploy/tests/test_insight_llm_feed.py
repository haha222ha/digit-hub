# -*- coding: utf-8 -*-
"""LLM Feed v1 构建。"""
from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from cloud_deploy.reporting.insight_llm_feed import (
    build_llm_feed,
    feed_to_agent_metrics,
    render_llm_feed_md,
)
from cloud_deploy.reporting.insight_metric_engine import InsightMetrics


def test_feed_from_insight():
    insight = InsightMetrics(
        report_date="2026-07-12",
        category="美妆护肤",
        sub_category="面部护理",
        sample_size=120,
        growth_rate_pct=18.0,
        competition_index=45,
        blue_ocean_score=72,
        heat_score=60,
        price_band="20-50",
        trend_label="温和上涨",
        top_keywords=["保湿", "防晒", "精华"],
        price_distribution={"20-50": 55.0, "50-100": 30.0},
    )
    rows = [
        {"title": "保湿面霜 x", "price": 39.0, "delta": 12, "gr": 0.15, "is_virtual": False, "is_new": True, "behavior": "BURST"},
        {"title": "防晒喷雾 y", "price": 29.0, "delta": 8, "gr": 0.12, "is_virtual": False, "is_new": False, "behavior": "ACCEL"},
    ] * 60
    feed = build_llm_feed(insight, rows, raw_selection_rows=5000, pg_source="local_delta", k_anonymity_min=5)
    assert feed["schema_version"] == "feed-v1.1"
    assert feed["provenance"]["raw_selection_rows"] == 5000
    assert feed["provenance"]["pg_source"] == "local_delta"
    assert (feed.get("context") or {}).get("growth_direction_hints")
    assert feed["selection_summary"]["sample_size"] == 120
    assert "保湿" in (feed["context"]["keyword_themes"] or [])

    metrics = feed_to_agent_metrics(feed)
    assert metrics["category"] == "美妆护肤"
    assert "selection_summary" in metrics
    assert "keyword_themes" in metrics

    md = render_llm_feed_md(feed)
    assert "美妆护肤" in md
    assert "goods_id" not in md


if __name__ == "__main__":
    test_feed_from_insight()
    print("test_insight_llm_feed OK")
