# -*- coding: utf-8 -*-
from cloud_deploy.reporting.insight_agent_validate import AgentOutputError, validate_agent_output


def test_validate_market_ok():
    out = validate_agent_output(
        "market",
        {"trend_summary": "上涨", "market_drivers": ["季节"]},
    )
    assert out["trend_summary"] == "上涨"


def test_validate_risk_level():
    validate_agent_output("risk", {"risk_assessment": "竞争加剧", "risk_level": "中"})
    try:
        validate_agent_output("risk", {"risk_assessment": "x", "risk_level": "极高"})
        assert False, "should raise"
    except AgentOutputError:
        pass


def test_run_agents_graph_mock_without_key(monkeypatch):
    monkeypatch.delenv("INSIGHT_LLM_API_KEY", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    from cloud_deploy.reporting.insight_agent_graph import run_agents_graph

    report = run_agents_graph(
        {
            "category": "小学教辅",
            "growth_rate_pct": 25,
            "competition_index": 40,
            "blue_ocean_score": 70,
            "price_band": "10-30",
            "trend_label": "温和上涨",
            "window_days": 7,
        }
    )
    assert report.executive_summary
    assert report.opportunity_stars >= 1
