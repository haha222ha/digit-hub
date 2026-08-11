# -*- coding: utf-8 -*-
"""
Q1-B：5 Agent 编排（market/data/risk 并行 → ops → ceo）。

无 langgraph 依赖；与 Lab services/agent_graph.py 行为对齐。
"""
from __future__ import annotations

import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Callable

from cloud_deploy.reporting.insight_agent_validate import AgentOutputError, validate_agent_output
from cloud_deploy.reporting.insight_ai_mock import InsightReport, run_agents_mock
from cloud_deploy.reporting.insight_llm_client import LLMError, LLMUsage, chat_json_with_usage, llm_configured

PROMPTS_PATH = Path(__file__).resolve().parents[1] / "prompts" / "agents.yaml"
PROMPT_VERSION = "agent-v1-feed"

_REPORT_CACHE: dict[str, dict[str, Any]] = {}


def _load_prompts() -> dict[str, Any]:
    try:
        import yaml
    except ImportError:
        return _prompts_fallback()
    if not PROMPTS_PATH.is_file():
        return _prompts_fallback()
    raw = PROMPTS_PATH.read_text(encoding="utf-8")
    data = yaml.safe_load(raw) or {}
    shared = data.get("shared_rules") or ""
    agents = data.get("agents") or {}
    for cfg in agents.values():
        if isinstance(cfg, dict) and "system" in cfg:
            cfg["system"] = str(cfg["system"]).replace("{shared_rules}", shared)
    return agents


def _prompts_fallback() -> dict[str, Any]:
    base = "你是市场研究顾问。仅基于类目级指标JSON分析。禁止商品ID店铺名链接。输出JSON。"
    return {
        "market": {"system": base + ' 输出{"trend_summary":"","market_drivers":[]}'},
        "data": {"system": base + ' 输出{"metric_interpretation":"","data_highlights":[]}'},
        "risk": {"system": base + ' 输出{"risk_assessment":"","risk_level":"中"}'},
        "ops": {
            "system": base
            + ' 输出{"action_plan":{"enter":false,"category_focus":"","price_band":"","content_format":[],"timeline_days":14}}'
        },
        "ceo": {
            "system": base
            + ' 输出{"executive_summary":"","opportunity_stars":3,"confidence":0.7,"verdict":"继续观察"}'
        },
    }


def _metrics_prompt(metrics: dict[str, Any]) -> str:
    keys = (
        "report_date",
        "category",
        "sub_category",
        "window_days",
        "growth_rate_pct",
        "competition_index",
        "blue_ocean_score",
        "heat_score",
        "new_product_score",
        "lifecycle_stage",
        "season_score",
        "price_band",
        "trend_label",
        "trend_7d",
        "price_distribution",
        "similar_categories",
        "keyword_themes",
        "selection_summary",
    )
    allowed = {k: metrics[k] for k in keys if k in metrics}
    return json.dumps(allowed, ensure_ascii=False)


def _run_agent(
    name: str,
    prompts: dict,
    metrics: dict,
    prior: dict | None = None,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    cfg = prompts.get(name) or {}
    system = cfg.get("system") or ""
    user = f"类目级指标：\n{_metrics_prompt(metrics)}"
    if prior:
        user += f"\n\n前序分析摘要：\n{json.dumps(prior, ensure_ascii=False)[:2000]}"
    parsed, usage = chat_json_with_usage(system, user, agent=name, temperature=0.25)
    validated = validate_agent_output(name, parsed)
    return validated, {
        "agent": name,
        "model": usage.model,
        "prompt_tokens": usage.prompt_tokens,
        "completion_tokens": usage.completion_tokens,
    }


def _parallel_first_pass(
    prompts: dict,
    metrics: dict,
) -> tuple[dict, dict, dict, list[str], list[dict[str, Any]]]:
    errors: list[str] = []
    results: dict[str, dict] = {}
    usage_log: list[dict[str, Any]] = []

    def task(name: str):
        return name, *_run_agent(name, prompts, metrics)

    with ThreadPoolExecutor(max_workers=3) as pool:
        futs = {pool.submit(task, n): n for n in ("market", "data", "risk")}
        for fut in as_completed(futs):
            name = futs[fut]
            try:
                _, data, usage = fut.result()
                results[name] = data
                if usage:
                    usage_log.append(usage)
            except Exception as e:
                errors.append(f"{name}:{e}")
                results[name] = {}
    return (
        results.get("market", {}),
        results.get("data", {}),
        results.get("risk", {}),
        errors,
        usage_log,
    )


def _sum_usage(usage_log: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "calls": len(usage_log),
        "prompt_tokens": sum(u.get("prompt_tokens") or 0 for u in usage_log),
        "completion_tokens": sum(u.get("completion_tokens") or 0 for u in usage_log),
        "agents": usage_log,
    }


def _state_to_report(state: dict[str, Any], metrics: dict[str, Any]) -> InsightReport:
    market = state.get("market") or {}
    data = state.get("data") or {}
    risk = state.get("risk") or {}
    ops = state.get("ops") or {}
    ceo = state.get("ceo") or {}

    trend_summary = market.get("trend_summary") or ""
    metric_interpretation = data.get("metric_interpretation") or ""
    risk_assessment = risk.get("risk_assessment") or ""
    action_plan = ops.get("action_plan") or {}
    executive_summary = ceo.get("executive_summary") or ""
    stars = max(1, min(5, int(ceo.get("opportunity_stars") or 3)))
    conf_val = ceo.get("confidence")
    raw_conf = float(conf_val) if conf_val is not None else 0.7
    confidence = max(0.0, min(1.0, raw_conf / 100 if raw_conf > 1 else raw_conf))
    verdict = ceo.get("verdict") or "继续观察"
    growth = float(metrics.get("growth_rate_pct") or 0)
    comp_idx = int(metrics.get("competition_index") or 50)
    comp = "低" if comp_idx < 40 else "中" if comp_idx < 70 else "高"

    pages = [
        {"page": 1, "title": "本周趋势评分", "stars": stars},
        {"page": 2, "title": "AI 总结", "body": trend_summary},
        {"page": 3, "title": "市场机会", "growth": f"{growth:.0f}%", "competition": comp, "stars": stars},
        {
            "page": 4,
            "title": "AI 建议",
            "focus": action_plan.get("category_focus") or metrics.get("category"),
            "price": action_plan.get("price_band") or metrics.get("price_band"),
            "format": "、".join(action_plan.get("content_format") or [])[:120],
            "action": action_plan,
        },
        {"page": 5, "title": "风险提示", "body": risk_assessment},
        {"page": 6, "title": "总结", "verdict": verdict, "action": f"置信度 {confidence:.0%}"},
    ]
    if state.get("errors"):
        executive_summary += f"（Agent 部分降级: {len(state['errors'])}）"

    return InsightReport(
        executive_summary=executive_summary,
        trend_summary=trend_summary,
        metric_interpretation=metric_interpretation,
        action_plan=action_plan,
        risk_assessment=risk_assessment,
        opportunity_stars=stars,
        confidence=confidence,
        pages=pages,
        llm_meta={
            "prompt_version": PROMPT_VERSION,
            "agent_mode": "5-agent",
            "usage": _sum_usage(state.get("llm_usage") or []),
            "errors": state.get("errors") or [],
        },
    )


def _fallback_mock_enabled() -> bool:
    v = (os.environ.get("INSIGHT_LLM_FALLBACK_MOCK") or "1").strip().lower()
    return v not in ("0", "false", "no")


def run_agents_graph(
    metrics: dict[str, Any],
    *,
    force_mock: bool = False,
    on_usage: Callable[[dict[str, Any]], None] | None = None,
) -> InsightReport:
    """5 Agent 主入口；on_usage 回调用于日 token 预算累加。"""
    if force_mock or not llm_configured():
        return run_agents_mock(metrics)

    try:
        prompts = _load_prompts()
        market, data, risk, errors, usage_log = _parallel_first_pass(prompts, metrics)
        state: dict[str, Any] = {
            "metrics": metrics,
            "market": market,
            "data": data,
            "risk": risk,
            "errors": list(errors),
            "llm_usage": list(usage_log),
        }

        prior_ops = {"market": market, "data": data, "risk": risk}
        try:
            ops, u_ops = _run_agent("ops", prompts, metrics, prior_ops)
            state["ops"] = ops
            if u_ops:
                state["llm_usage"].append(u_ops)
        except Exception as e:
            state["errors"].append(f"ops:{e}")
            state["ops"] = {}

        prior_ceo = {
            "market": market,
            "data": data,
            "risk": risk,
            "ops": state.get("ops"),
        }
        try:
            ceo, u_ceo = _run_agent("ceo", prompts, metrics, prior_ceo)
            state["ceo"] = ceo
            if u_ceo:
                state["llm_usage"].append(u_ceo)
        except Exception as e:
            state["errors"].append(f"ceo:{e}")
            state["ceo"] = {}

        if not (state.get("ceo") or {}).get("executive_summary"):
            state["errors"].append("ceo:missing_executive_summary")

        if on_usage and state.get("llm_usage"):
            on_usage(_sum_usage(state["llm_usage"]))

        report = _state_to_report(state, metrics)
        if not report.executive_summary and not report.trend_summary:
            if _fallback_mock_enabled():
                return run_agents_mock(metrics)
            raise LLMError("5 Agent 输出为空")
        if any(str(e).startswith("ceo:") for e in (state.get("errors") or [])):
            if _fallback_mock_enabled():
                print("[insight-agent-graph] CEO 失败，fallback mock", flush=True)
                return run_agents_mock(metrics)
            raise LLMError("CEO Agent 未成功完成")

        print(
            f"[insight-agent-graph] ok {metrics.get('category')} "
            f"calls={report.llm_meta.get('usage', {}).get('calls', 0)}",
            flush=True,
        )
        return report
    except (LLMError, AgentOutputError) as e:
        print(f"[insight-agent-graph] failed: {e}", flush=True)
        if _fallback_mock_enabled():
            return run_agents_mock(metrics)
        raise
