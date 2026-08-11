# -*- coding: utf-8 -*-
"""Agent LLM 输出 JSON 结构校验（Lab agent_validate 移植）。"""
from __future__ import annotations

from typing import Any

AGENT_SCHEMAS: dict[str, dict[str, type | tuple]] = {
    "market": {"trend_summary": str, "market_drivers": list},
    "data": {"metric_interpretation": str, "data_highlights": list},
    "risk": {"risk_assessment": str, "risk_level": str},
    "ops": {"action_plan": dict},
    "ceo": {
        "executive_summary": str,
        "opportunity_stars": (int, float),
        "confidence": (int, float),
        "verdict": str,
    },
}


class AgentOutputError(ValueError):
    def __init__(self, agent: str, message: str):
        super().__init__(f"{agent}: {message}")
        self.agent = agent


def validate_agent_output(agent: str, data: dict[str, Any]) -> dict[str, Any]:
    schema = AGENT_SCHEMAS.get(agent)
    if not schema:
        return data
    if not isinstance(data, dict):
        raise AgentOutputError(agent, "输出非 dict")
    for key, expected in schema.items():
        if key not in data:
            raise AgentOutputError(agent, f"缺少字段 {key}")
        val = data[key]
        if isinstance(expected, tuple):
            if not isinstance(val, expected):
                raise AgentOutputError(agent, f"{key} 类型错误")
        elif not isinstance(val, expected):
            raise AgentOutputError(agent, f"{key} 类型错误")
    if agent == "risk" and data.get("risk_level") not in ("低", "中", "高"):
        raise AgentOutputError(agent, f"risk_level 非法值: {data.get('risk_level')!r}（应为 低/中/高）")
    return data
