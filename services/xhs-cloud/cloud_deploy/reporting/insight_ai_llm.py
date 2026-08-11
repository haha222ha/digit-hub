# -*- coding: utf-8 -*-
"""L0 预生成 — 5 Agent 报告（Q1-B；失败降级 mock）。"""
from __future__ import annotations

import os
from typing import Any

from cloud_deploy.reporting.insight_agent_graph import PROMPT_VERSION, run_agents_graph
from cloud_deploy.reporting.insight_ai_mock import InsightReport, run_agents_mock
from cloud_deploy.reporting.insight_llm_client import LLMError, llm_configured

_daily_tokens: dict[str, int] = {}


def _budget_exceeded(budget: int) -> bool:
    from datetime import date

    day = date.today().isoformat()
    return _daily_tokens.get(day, 0) >= budget


def _record_usage_summary(summary: dict[str, Any]) -> None:
    from datetime import date

    day = date.today().isoformat()
    total = int(summary.get("prompt_tokens") or 0) + int(summary.get("completion_tokens") or 0)
    _daily_tokens[day] = _daily_tokens.get(day, 0) + total


def should_use_llm() -> bool:
    flag = os.environ.get("INSIGHT_USE_LLM", "").strip().lower() in ("1", "true", "yes")
    return flag and llm_configured()


def run_agents_llm(metrics: dict[str, Any], *, budget_tokens: int = 200_000) -> InsightReport:
    if not should_use_llm():
        return run_agents_mock(metrics)
    if _budget_exceeded(budget_tokens):
        print("[insight-ai-llm] daily budget exceeded, fallback mock", flush=True)
        return run_agents_mock(metrics)

    try:
        return run_agents_graph(metrics, on_usage=_record_usage_summary)
    except LLMError as e:
        print(f"[insight-ai-llm] 5-agent failed, fallback mock: {e}", flush=True)
        return run_agents_mock(metrics)


def run_agents_auto(metrics: dict[str, Any], *, budget_tokens: int = 200_000) -> InsightReport:
    """INSIGHT_USE_LLM=1 且 Key 已配置时走 5 Agent，否则 mock。"""
    if should_use_llm():
        return run_agents_llm(metrics, budget_tokens=budget_tokens)
    return run_agents_mock(metrics)


__all__ = [
    "PROMPT_VERSION",
    "run_agents_auto",
    "run_agents_llm",
    "should_use_llm",
]
