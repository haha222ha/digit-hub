# -*- coding: utf-8 -*-
from cloud_deploy.rank_engine.compliance import sanitize_context, validate_advisory_output


def test_sanitize_context_strips_goods_id():
    ctx = sanitize_context({"goods_id": "123", "market_summary": "ok"})
    assert "goods_id" not in ctx
    assert ctx["market_summary"] == "ok"


def test_validate_advisory_output_ok():
    validate_advisory_output({"daily_overview": {"content": "市场观察"}})


def test_ai_advisor_template():
    from cloud_deploy.rank_engine.ai_advisor import AiAdvisor

    out = AiAdvisor().run_batch(
        target_date="2026-07-12",
        context={"market_summary": "测试摘要", "directions": [{"key": "price", "title": "价格", "summary": "平稳"}]},
    )
    assert out["daily_overview"]["content"]
    assert out["direction_advices"]
