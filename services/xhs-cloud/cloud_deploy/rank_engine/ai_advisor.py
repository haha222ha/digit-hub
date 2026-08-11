# -*- coding: utf-8 -*-
"""云侧 AI 顾问批量生成 — LLM 主路径 + 模板兜底。

主路径：每个榜单独立 LLM 调用 + daily_overview + 跨榜综述。
兜底  ：LLM 未配置 / 整体失败 → 走 pre_analysis 或模板。
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from typing import Any, Callable

from cloud_deploy.rank_engine.compliance import sanitize_context, validate_advisory_output
from cloud_deploy.rank_engine.entity_type import enrich_advice_directions, infer_category_type

# 默认每个榜单送给 LLM 的最大条目数（控制 token 与成本）
_TOP_ITEMS_PER_RANKING = 30
# 跨榜综述最多取的榜单数
_MAX_RANKINGS_FOR_CROSS = 12
# LLM 主路径最多处理的榜单数（避免类目榜过多导致调用爆炸）
_MAX_RANKINGS_FOR_LLM = 30
# 虚实配额（在 cap 内尽量均衡）
_MAX_PHYSICAL_FOR_LLM = 15
_MAX_VIRTUAL_FOR_LLM = 15
# LLM 并发调用数（5 路并发，30 榜约 72s 完成，< 180s HTTP 超时）
_LLM_CONCURRENCY = 5

# DeepSeek V4 Flash 定价（参考）— 单位：CNY / 1K tokens
# 实际成本由 ab_test.record_metric 写入，这里仅用于估算（admin 可改）
_PRICE_PROMPT_PER_1K = 0.001   # 输入 ¥0.001 / 1K
_PRICE_COMPLETION_PER_1K = 0.002  # 输出 ¥0.002 / 1K


def _estimate_cost_cny(prompt_tokens: int, completion_tokens: int) -> float:
    """根据 token 数估算 CNY 成本（DeepSeek V4 Flash 单价）。"""
    return round(
        prompt_tokens / 1000.0 * _PRICE_PROMPT_PER_1K
        + completion_tokens / 1000.0 * _PRICE_COMPLETION_PER_1K,
        6,
    )


class _UsageCollector:
    """包装 chat_fn，收集每次调用的 token usage + 计时，按 ranking_key 聚合。

    用法：
        col = _UsageCollector(chat_fn)
        parsed, _u = col.call("burst_top100", system, user, temperature=0.4)
        col.summary  # {"burst_top100": {"prompt_tokens":.., "completion_tokens":.., "duration_ms":.., "calls":1}, ...}
    """

    def __init__(self, chat_fn: Callable):
        self._chat_fn = chat_fn
        self.summary: dict[str, dict[str, Any]] = {}

    def call(
        self,
        ranking_key: str,
        system: str,
        user: str,
        *,
        temperature: float = 0.3,
        agent: str = "",
    ) -> tuple[dict[str, Any], Any]:
        t0 = time.time()
        parsed, usage = self._chat_fn(system, user, temperature=temperature, agent=agent)
        dt_ms = int((time.time() - t0) * 1000)
        entry = self.summary.setdefault(
            ranking_key,
            {
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
                "duration_ms": 0,
                "calls": 0,
                "model": "",
            },
        )
        entry["prompt_tokens"] += int(getattr(usage, "prompt_tokens", 0) or 0)
        entry["completion_tokens"] += int(getattr(usage, "completion_tokens", 0) or 0)
        entry["total_tokens"] = entry["prompt_tokens"] + entry["completion_tokens"]
        entry["duration_ms"] += dt_ms
        entry["calls"] += 1
        entry["model"] = getattr(usage, "model", "") or entry["model"]
        return parsed, usage


class AiAdvisor:
    def run_batch(
        self,
        *,
        target_date: str,
        context: dict[str, Any],
        llm_enhance: bool = False,
    ) -> dict[str, Any]:
        ctx = sanitize_context(context or {})
        report_date = str(
            target_date
            or (ctx.get("meta") or {}).get("target_date")
            or ctx.get("target_date")
            or ""
        )[:10]
        if not report_date:
            raise ValueError("缺少 target_date")

        from cloud_deploy.reporting.insight_llm_client import llm_configured

        # doc 49：研究包 / 本地预生成机会卡为发布主路径（LLM 仅可选润色）
        research = ctx.get("research_pack") if isinstance(ctx.get("research_pack"), dict) else {}
        pre = ctx.get("pre_analysis") or ctx.get("advice")
        if isinstance(pre, dict) and (
            pre.get("opportunity_cards")
            or pre.get("daily_overview")
            or pre.get("direction_advices")
        ):
            advice = self._normalize_pregen(report_date, pre)
            if research.get("opportunity_cards") and not advice.get("opportunity_cards"):
                advice["opportunity_cards"] = research.get("opportunity_cards")
            if llm_enhance and llm_configured():
                advice = self._maybe_llm_enhance_opportunities(report_date, advice, ctx)
            return self._finalize_advice(advice, ctx)

        if research.get("opportunity_cards"):
            advice = self._advice_from_research_pack(report_date, research)
            if llm_enhance and llm_configured():
                advice = self._maybe_llm_enhance_opportunities(report_date, advice, ctx)
            return self._finalize_advice(advice, ctx)

        # 兼容旧路径：无研究包时才走全量榜单 LLM
        use_llm = llm_enhance or llm_configured()
        if use_llm and llm_configured():
            if ctx.get("feature_summaries"):
                try:
                    advice = self._llm_generate_b_mode(report_date, ctx)
                    return self._finalize_advice(advice, ctx)
                except Exception as e:
                    print(f"[advisor] B 模式 LLM 失败，回退 A 模式: {e}", file=sys.stderr, flush=True)

            try:
                advice = self._llm_generate(report_date, ctx)
                return self._finalize_advice(advice, ctx)
            except Exception as e:
                print(f"[advisor] LLM 主路径失败，回退模板: {e}", file=sys.stderr, flush=True)

        advice = self._template_generate(report_date, ctx)
        if llm_enhance and llm_configured():
            advice = self._maybe_llm_enhance(report_date, advice, ctx)
        return self._finalize_advice(advice, ctx)

    def _finalize_advice(self, advice: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
        """补齐 category_type、虚实排序后做合规校验。"""
        advice = enrich_advice_directions(advice, context=ctx)
        validate_advisory_output(advice)
        return advice

    # ---------- A/B 测试入口 ----------

    def run_ab_batch(
        self,
        *,
        target_date: str,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        """A/B 并行生成：同时跑 A 模式（100% AI）和 B 模式（80%程序+20%AI）。

        - A 模式：从 context 去掉 feature_summaries（强制走原始 items 路径）
        - B 模式：保留 feature_summaries（走程序预计算 + LLM 润色）
        - 两份报告分别用 _UsageCollector 收集 token/耗时
        - 指标写入 ab_test_metrics 表

        返回：
            {
              "report_date": str,
              "mode_a": advice_dict,
              "mode_b": advice_dict,
              "metrics": {
                "A": {ranking_key: {prompt_tokens, completion_tokens, total_tokens, duration_ms, calls, cost_cny}, ...},
                "B": {...},
                "totals": {"A": {...}, "B": {...}, "savings_cny": ..., "savings_pct": ...}
              }
            }
        """
        from cloud_deploy.reporting.insight_llm_client import chat_json_with_usage, llm_configured

        if not llm_configured():
            raise RuntimeError("A/B 测试需要 LLM 已配置（admin 后台「情报 LLM」）")

        ctx_full = sanitize_context(context or {})
        report_date = str(
            target_date
            or (ctx_full.get("meta") or {}).get("target_date")
            or ctx_full.get("target_date")
            or ""
        )[:10]
        if not report_date:
            raise ValueError("缺少 target_date")

        # B 模式要求 ctx 含 feature_summaries；A 模式要去除（避免走 B 分支）
        ctx_a = dict(ctx_full)
        ctx_a.pop("feature_summaries", None)
        ctx_a_meta = dict(ctx_a.get("meta") or {})
        ctx_a_meta["ab_mode"] = "A"
        ctx_a["meta"] = ctx_a_meta

        ctx_b = dict(ctx_full)
        if not ctx_b.get("feature_summaries"):
            raise RuntimeError("A/B 测试要求 context 已注入 feature_summaries（B 模式预计算）")
        ctx_b_meta = dict(ctx_b.get("meta") or {})
        ctx_b_meta["ab_mode"] = "B"
        ctx_b["meta"] = ctx_b_meta

        # ---- A 模式 ----
        col_a = _UsageCollector(chat_json_with_usage)
        t_a_start = time.time()
        try:
            advice_a = self._llm_generate(report_date, ctx_a, collector=col_a)
            validate_advisory_output(advice_a)
        except Exception as e:
            print(f"[advisor-AB] A 模式失败: {e}", file=sys.stderr, flush=True)
            advice_a = None
        duration_a_total_ms = int((time.time() - t_a_start) * 1000)

        # ---- B 模式 ----
        col_b = _UsageCollector(chat_json_with_usage)
        t_b_start = time.time()
        try:
            advice_b = self._llm_generate_b_mode(report_date, ctx_b, collector=col_b)
            validate_advisory_output(advice_b)
        except Exception as e:
            print(f"[advisor-AB] B 模式失败: {e}", file=sys.stderr, flush=True)
            advice_b = None
        duration_b_total_ms = int((time.time() - t_b_start) * 1000)

        # ---- 写入 ab_test_metrics（含质量指标） ----
        metrics_summary = self._record_ab_metrics(
            report_date=report_date,
            col_a=col_a,
            col_b=col_b,
            duration_a_ms=duration_a_total_ms,
            duration_b_ms=duration_b_total_ms,
            advice_a=advice_a,
            advice_b=advice_b,
            ctx_b=ctx_b,
        )

        return {
            "report_date": report_date,
            "mode_a": advice_a,
            "mode_b": advice_b,
            "metrics": metrics_summary,
        }

    def _record_ab_metrics(
        self,
        *,
        report_date: str,
        col_a: _UsageCollector,
        col_b: _UsageCollector,
        duration_a_ms: int,
        duration_b_ms: int,
        advice_a: dict[str, Any] | None = None,
        advice_b: dict[str, Any] | None = None,
        ctx_b: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """把两份 collector 的累计指标 + 质量指标写入 ab_test_metrics 表。"""
        try:
            from cloud_deploy.rank_engine.ab_test import record_metric, compute_quality_metrics
        except ImportError as e:
            print(f"[advisor-AB] ab_test 模块不可用，跳过指标写入: {e}", file=sys.stderr, flush=True)
            return {"A": {}, "B": {}, "totals": {}}

        # 预构建 ranking_key → advice_item 映射（用于按 key 查找质量指标）
        def _build_advice_map(advice):
            m: dict[str, dict[str, Any]] = {}
            if not advice:
                return m
            if advice.get("daily_overview"):
                m["daily_overview"] = advice["daily_overview"]
            for d in advice.get("direction_advices") or []:
                k = str(d.get("key") or "")
                if k:
                    m[k] = d
            if advice.get("cross_summary"):
                m["cross_summary"] = advice["cross_summary"]
            return m

        advice_map_a = _build_advice_map(advice_a)
        advice_map_b = _build_advice_map(advice_b)
        # B 模式的草稿映射（ranking_key → draft_content），用于 data_accuracy
        draft_map: dict[str, str] = {}
        if ctx_b and ctx_b.get("feature_summaries"):
            for k, s in ctx_b["feature_summaries"].items():
                draft_map[k] = str(s.get("draft_content") or "")

        def _flush(collector, mode, total_duration_ms, advice_map):
            per_key: dict[str, dict[str, Any]] = {}
            for key, e in collector.summary.items():
                cost = _estimate_cost_cny(e["prompt_tokens"], e["completion_tokens"])
                # 计算质量指标
                advice_item = advice_map.get(key, {})
                draft = draft_map.get(key, "") if mode == "B" else ""
                quality = compute_quality_metrics(advice_item, draft_text=draft) if advice_item else None
                extra = {"calls": e["calls"]}
                if quality:
                    extra["quality"] = quality
                try:
                    record_metric(
                        test_date=report_date,
                        ranking_key=key,
                        mode=mode,
                        prompt_tokens=e["prompt_tokens"],
                        completion_tokens=e["completion_tokens"],
                        total_tokens=e["total_tokens"],
                        cost_cny=cost,
                        duration_ms=e["duration_ms"],
                        model=e.get("model", ""),
                        extra=extra,
                    )
                except Exception as ex:
                    print(f"[advisor-AB] 写入指标失败 ({mode}/{key}): {ex}", file=sys.stderr, flush=True)
                per_key[key] = {
                    "prompt_tokens": e["prompt_tokens"],
                    "completion_tokens": e["completion_tokens"],
                    "total_tokens": e["total_tokens"],
                    "duration_ms": e["duration_ms"],
                    "calls": e["calls"],
                    "cost_cny": cost,
                    "model": e.get("model", ""),
                    "quality": quality,
                }
            # 写入一条「总计」行（ranking_key = "__total__"），用于整体对比
            sum_prompt = sum(e["prompt_tokens"] for e in collector.summary.values())
            sum_completion = sum(e["completion_tokens"] for e in collector.summary.values())
            sum_tokens = sum_prompt + sum_completion
            sum_cost = _estimate_cost_cny(sum_prompt, sum_completion)
            # 质量汇总：所有 ranking 的平均值
            all_quality = [v["quality"] for v in per_key.values() if v.get("quality")]
            avg_quality = None
            if all_quality:
                avg_quality = {
                    "content_chars": round(sum(q["content_chars"] for q in all_quality) / len(all_quality), 1),
                    "structure_score": round(sum(q["structure_score"] for q in all_quality) / len(all_quality), 2),
                    "emoji_count": round(sum(q["emoji_count"] for q in all_quality) / len(all_quality), 1),
                    "markdown_score": round(sum(q["markdown_score"] for q in all_quality) / len(all_quality), 2),
                    "key_points_count": round(sum(q["key_points_count"] for q in all_quality) / len(all_quality), 2),
                    "data_accuracy": (
                        round(sum(q["data_accuracy"] for q in all_quality if q["data_accuracy"] is not None) /
                              max(1, sum(1 for q in all_quality if q["data_accuracy"] is not None)), 4)
                        if any(q["data_accuracy"] is not None for q in all_quality) else None
                    ),
                }
            try:
                record_metric(
                    test_date=report_date,
                    ranking_key="__total__",
                    mode=mode,
                    prompt_tokens=sum_prompt,
                    completion_tokens=sum_completion,
                    total_tokens=sum_tokens,
                    cost_cny=sum_cost,
                    duration_ms=total_duration_ms,
                    extra={"ranking_count": len(collector.summary), "avg_quality": avg_quality},
                )
            except Exception as ex:
                print(f"[advisor-AB] 写入总计行失败 ({mode}): {ex}", file=sys.stderr, flush=True)
            return per_key

        per_a = _flush(col_a, "A", duration_a_ms, advice_map_a)
        per_b = _flush(col_b, "B", duration_b_ms, advice_map_b)

        totals_a = {
            "prompt_tokens": sum(v["prompt_tokens"] for v in per_a.values()),
            "completion_tokens": sum(v["completion_tokens"] for v in per_a.values()),
            "total_tokens": sum(v["total_tokens"] for v in per_a.values()),
            "duration_ms": duration_a_ms,
            "cost_cny": round(sum(v["cost_cny"] for v in per_a.values()), 6),
            "ranking_count": len(per_a),
        }
        totals_b = {
            "prompt_tokens": sum(v["prompt_tokens"] for v in per_b.values()),
            "completion_tokens": sum(v["completion_tokens"] for v in per_b.values()),
            "total_tokens": sum(v["total_tokens"] for v in per_b.values()),
            "duration_ms": duration_b_ms,
            "cost_cny": round(sum(v["cost_cny"] for v in per_b.values()), 6),
            "ranking_count": len(per_b),
        }
        savings_cny = round(totals_a["cost_cny"] - totals_b["cost_cny"], 6)
        savings_pct = (
            round(savings_cny / totals_a["cost_cny"] * 100, 2)
            if totals_a["cost_cny"] > 0 else 0.0
        )
        return {
            "A": per_a,
            "B": per_b,
            "totals": {
                "A": totals_a,
                "B": totals_b,
                "savings_cny": savings_cny,
                "savings_pct": savings_pct,
            },
        }

    # ---------- LLM 主路径 ----------

    def _select_rankings_for_llm(self, rankings: dict[str, Any]) -> dict[str, Any]:
        """从全部榜单里选出最有价值的 _MAX_RANKINGS_FOR_LLM 个送给 LLM。

        优先级：实体专榜 / 虚拟专榜 → 全局 / 价格带 → 类目榜；
        虚实配额约 15+15，避免全部落在 mixed。
        """
        def _score(k: str) -> int:
            board = rankings[k] if isinstance(rankings.get(k), dict) else {}
            return int(board.get("item_count") or len(board.get("items") or []))

        def _ctype(k: str) -> str:
            board = rankings.get(k) if isinstance(rankings.get(k), dict) else {}
            ef = str((board or {}).get("entity_filter") or "")
            return infer_category_type(
                key=k,
                entity_filter=ef,
                items=(board or {}).get("items") if isinstance(board, dict) else None,
                title=str((board or {}).get("ranking_title") or (board or {}).get("title") or ""),
            )

        keys = list(rankings.keys())
        if len(keys) <= _MAX_RANKINGS_FOR_LLM:
            # 仍按虚实排序，方便下游展示稳定
            return {k: rankings[k] for k in sorted(keys, key=lambda x: (_ctype(x) != "physical", _ctype(x) != "virtual", -_score(x)))}

        phys = sorted([k for k in keys if _ctype(k) == "physical"], key=_score, reverse=True)
        virt = sorted([k for k in keys if _ctype(k) == "virtual"], key=_score, reverse=True)
        mixed = sorted([k for k in keys if _ctype(k) not in ("physical", "virtual")], key=_score, reverse=True)

        selected: dict[str, Any] = {}
        for k in phys[:_MAX_PHYSICAL_FOR_LLM]:
            selected[k] = rankings[k]
        for k in virt[:_MAX_VIRTUAL_FOR_LLM]:
            selected[k] = rankings[k]
        for k in mixed:
            if len(selected) >= _MAX_RANKINGS_FOR_LLM:
                break
            selected[k] = rankings[k]
        # 一侧不足时用另一侧补齐
        for bucket in (phys[_MAX_PHYSICAL_FOR_LLM:], virt[_MAX_VIRTUAL_FOR_LLM:]):
            for k in bucket:
                if len(selected) >= _MAX_RANKINGS_FOR_LLM:
                    break
                selected[k] = rankings[k]
            if len(selected) >= _MAX_RANKINGS_FOR_LLM:
                break
        return selected

    def _llm_generate(
        self,
        report_date: str,
        ctx: dict[str, Any],
        *,
        collector: _UsageCollector | None = None,
    ) -> dict[str, Any]:
        """LLM 主路径：daily_overview + 每榜独立调用 + 跨榜综述。

        collector：可选的 _UsageCollector，用于 A/B 测试时按 ranking_key 收集 token 与计时。
        """
        from cloud_deploy.reporting.insight_llm_client import chat_json_with_usage

        chat_fn = collector.call if collector else chat_json_with_usage
        started_at = datetime.now(timezone.utc).isoformat()

        # 1) daily_overview（1 次 LLM 调用）
        overview = self._llm_daily_overview_collected(report_date, ctx, chat_fn, collector)

        # 2) 每个榜单并发调用 — 限制最多 _MAX_RANKINGS_FOR_LLM 个，_LLM_CONCURRENCY 路并发
        rankings = ctx.get("rankings") or {}
        selected = self._select_rankings_for_llm(rankings)
        print(f"[advisor] LLM 处理 {len(selected)}/{len(rankings)} 个榜单（并发 {_LLM_CONCURRENCY}）", flush=True)
        directions: list[dict[str, Any]] = []
        import concurrent.futures

        def _process_one(key_ranking):
            key, ranking = key_ranking
            try:
                item = self._llm_ranking_collected(report_date, ranking, chat_fn, collector, key)
                if item:
                    return (key, item)
            except Exception as e:
                print(f"[advisor] ranking '{key}' LLM 失败，模板兜底: {e}", file=sys.stderr, flush=True)
                fallback = self._template_ranking(report_date, ranking)
                if fallback:
                    return (key, fallback)
            return (key, None)

        with concurrent.futures.ThreadPoolExecutor(max_workers=_LLM_CONCURRENCY) as pool:
            results = pool.map(_process_one, selected.items())
            for key, item in results:
                if item:
                    directions.append(item)
        print(f"[advisor] LLM 完成 {len(directions)}/{len(selected)} 个榜单", flush=True)

        # 3) 跨榜综述（1 次 LLM 调用）
        cross = None
        try:
            cross = self._llm_cross_summary_collected(report_date, ctx, directions, chat_fn, collector)
        except Exception as e:
            print(f"[advisor] 跨榜综述 LLM 失败，跳过: {e}", file=sys.stderr, flush=True)

        finished_at = datetime.now(timezone.utc).isoformat()
        return {
            "report_date": report_date,
            "generated_at": finished_at,
            "meta": {
                "target_date": report_date,
                "mode": "llm",
                "generator": "cloud_llm",
                "started_at": started_at,
                "finished_at": finished_at,
                "schema_version": "1.0",
                "ranking_count": len(rankings),
                "directions_count": len(directions),
            },
            "daily_overview": overview,
            "direction_advices": directions,
            "cross_summary": cross,
            "disclaimer": "以上内容由 AI 基于榜单数据生成，仅供参考，不构成投资或经营建议。",
        }

    def _llm_daily_overview_collected(self, report_date, ctx, chat_fn, collector):
        """带 collector 的 daily_overview（A 模式）。"""
        if collector is None:
            return self._llm_daily_overview(report_date, ctx, chat_fn)
        # 临时包装：collector.call 已包含 chat_fn 调用与 usage 累计
        wrapped = lambda system, user, **kw: collector.call(
            "daily_overview", system, user, **kw
        )
        return self._llm_daily_overview(report_date, ctx, wrapped)

    def _llm_ranking_collected(self, report_date, ranking, chat_fn, collector, key):
        """带 collector 的单榜（A 模式）。"""
        if collector is None:
            return self._llm_ranking(report_date, ranking, chat_fn)
        wrapped = lambda system, user, **kw: collector.call(key, system, user, **kw)
        return self._llm_ranking(report_date, ranking, wrapped)

    def _llm_cross_summary_collected(self, report_date, ctx, directions, chat_fn, collector):
        """带 collector 的跨榜综述（A 模式）。"""
        if collector is None:
            return self._llm_cross_summary(report_date, ctx, directions, chat_fn)
        wrapped = lambda system, user, **kw: collector.call(
            "cross_summary", system, user, **kw
        )
        return self._llm_cross_summary(report_date, ctx, directions, wrapped)

    # ---------- B 模式：程序预计算 80% + LLM 润色 20% ----------

    def _llm_generate_b_mode(
        self,
        report_date: str,
        ctx: dict[str, Any],
        *,
        collector: _UsageCollector | None = None,
    ) -> dict[str, Any]:
        """B 模式：feature_summaries 已含草稿内容 + key_points → LLM 只润色。

        vs A 模式区别：
        - A 模式：LLM 从原始 items 生成全文（重 token、重计算）
        - B 模式：LLM 只润色草稿（轻 token、快响应、成本低）

        collector：可选的 _UsageCollector，A/B 测试时按 ranking_key 收集 token 与计时。
        """
        from cloud_deploy.reporting.insight_llm_client import chat_json_with_usage

        started_at = datetime.now(timezone.utc).isoformat()
        summaries = ctx.get("feature_summaries") or {}

        # 1) daily_overview（1 次 LLM 调用，基于预计算 brief）
        overview = self._llm_b_mode_overview_collected(report_date, ctx, chat_json_with_usage, collector)

        # 2) 每个榜单并发润色
        print(f"[advisor-B] LLM 润色 {len(summaries)} 个榜单（并发 {_LLM_CONCURRENCY}）", flush=True)
        directions: list[dict[str, Any]] = []
        import concurrent.futures

        def _polish_one(key_summary):
            key, summary = key_summary
            try:
                item = self._llm_b_mode_ranking_collected(report_date, summary, chat_json_with_usage, collector, key)
                if item:
                    return (key, item)
            except Exception as e:
                print(f"[advisor-B] ranking '{key}' 润色失败，用草稿兜底: {e}", file=sys.stderr, flush=True)
                # B 模式兜底：直接用程序预计算的草稿
                fallback = {
                    "key": key,
                    "title": summary.get("title", key),
                    "summary": (summary.get("draft_content") or "")[:200],
                    "content": summary.get("draft_content") or "",
                    "key_points": summary.get("key_points") or [],
                    "category_type": "mixed",  # 兜底默认混合
                    "category_tags": [],
                    "source_refs": self._source_refs_from_summary(summary),
                }
                return (key, fallback)
            return (key, None)

        with concurrent.futures.ThreadPoolExecutor(max_workers=_LLM_CONCURRENCY) as pool:
            results = pool.map(_polish_one, summaries.items())
            for key, item in results:
                if item:
                    directions.append(item)
        print(f"[advisor-B] LLM 完成 {len(directions)}/{len(summaries)} 个榜单", flush=True)

        # 3) 跨榜综述（1 次 LLM 调用）
        cross = None
        try:
            cross = self._llm_b_mode_cross_collected(report_date, ctx, directions, chat_json_with_usage, collector)
        except Exception as e:
            print(f"[advisor-B] 跨榜综述 LLM 失败，跳过: {e}", file=sys.stderr, flush=True)

        finished_at = datetime.now(timezone.utc).isoformat()
        return {
            "report_date": report_date,
            "generated_at": finished_at,
            "meta": {
                "target_date": report_date,
                "mode": "b_mode",
                "generator": "cloud_llm_b_mode",
                "started_at": started_at,
                "finished_at": finished_at,
                "schema_version": "1.1",
                "source_ref_policy": "programmatic_facts_v1",
                "ranking_count": len(summaries),
                "directions_count": len(directions),
            },
            "daily_overview": overview,
            "direction_advices": directions,
            "cross_summary": cross,
            "disclaimer": "以上内容由 AI 基于榜单数据生成，仅供参考，不构成投资或经营建议。数字均可对照 source_refs。",
        }

    def _llm_b_mode_overview_collected(self, report_date, ctx, chat_fn, collector):
        if collector is None:
            return self._llm_b_mode_overview(report_date, ctx, chat_fn)
        wrapped = lambda system, user, **kw: collector.call(
            "daily_overview", system, user, **kw
        )
        return self._llm_b_mode_overview(report_date, ctx, wrapped)

    def _llm_b_mode_ranking_collected(self, report_date, summary, chat_fn, collector, key):
        if collector is None:
            return self._llm_b_mode_ranking(report_date, summary, chat_fn)
        wrapped = lambda system, user, **kw: collector.call(key, system, user, **kw)
        return self._llm_b_mode_ranking(report_date, summary, wrapped)

    def _llm_b_mode_cross_collected(self, report_date, ctx, directions, chat_fn, collector):
        if collector is None:
            return self._llm_b_mode_cross(report_date, ctx, directions, chat_fn)
        wrapped = lambda system, user, **kw: collector.call(
            "cross_summary", system, user, **kw
        )
        return self._llm_b_mode_cross(report_date, ctx, directions, wrapped)

    def _overview_source_refs(self, brief: dict[str, Any], summaries: dict[str, Any]) -> list[dict[str, Any]]:
        refs: list[dict[str, Any]] = [{
            "id": "sr_ov_active",
            "label": "活跃方向数",
            "value": brief.get("active_direction_count", len(summaries)),
            "origin": "daily_brief",
            "ranking_key": "daily_overview",
        }, {
            "id": "sr_ov_total",
            "label": "总样本数",
            "value": brief.get("total_products"),
            "origin": "daily_brief",
            "ranking_key": "daily_overview",
        }, {
            "id": "sr_ov_burst",
            "label": "平均爆发指数",
            "value": brief.get("avg_burst"),
            "origin": "daily_brief",
            "ranking_key": "daily_overview",
        }]
        for i, p in enumerate((brief.get("top_price_bands") or [])[:5]):
            refs.append({
                "id": f"sr_ov_pb_{i}",
                "label": f"价格带:{p.get('band', '?')}",
                "value": p.get("count", 0),
                "origin": "daily_brief.top_price_bands",
                "ranking_key": "daily_overview",
            })
        return [r for r in refs if r.get("value") is not None][:40]

    def _llm_b_mode_overview(self, report_date: str, ctx: dict[str, Any], chat_fn) -> dict[str, Any]:
        """B 模式 daily_overview：基于预计算 brief 润色。"""
        brief = ctx.get("daily_brief") or {}
        summaries = ctx.get("feature_summaries") or {}
        source_refs = self._overview_source_refs(brief, summaries)

        # 用预计算数据构建摘要
        ranking_titles = "\n".join(
            f"  - {s.get('title','?')}（{s.get('item_count',0)}条，平均爆发{s.get('stats',{}).get('burst_index',{}).get('avg',0)}）"
            for s in list(summaries.values())[:_MAX_RANKINGS_FOR_CROSS]
        ) or "  （暂无）"

        price_bands = brief.get("top_price_bands") or []
        price_text = "\n".join(
            f"  - {p.get('band','?')}: {p.get('count',0)} 条"
            for p in price_bands[:5]
        ) or "  （暂无）"
        refs_text = "\n".join(
            f"  [{r.get('id')}] {r.get('label')} = {r.get('value')}"
            for r in source_refs[:20]
        ) or "  （无）"

        system = (
            "你是小红书选品顾问首席分析师。基于程序预计算的市场数据，"
            "输出一段生动、有温度的当日市场观察。\n\n"
            "排版要求：\n"
            "1. 用 emoji 标注重点（如 🔥 强势、💎 蓝海、⚠️ 风险、📈 增长、💰 高客单）\n"
            "2. 用 markdown 标题分节（## / ###），每节 2-4 段\n"
            "3. 关键数据用 **加粗**，并在首次出现处标注引用如 [sr_ov_total]\n"
            "4. 用 > 引用块突出核心洞察\n"
            "5. 语言口语化、有节奏感，像朋友聊天而非机械报告\n\n"
            "重要：禁止编造清单外的数字。凡出现具体数值必须能对应 source_refs 中的 id。\n"
            "合规：禁止 goods_id、店铺名、商品链接、完整商品标题。\n"
            "输出 JSON: {\"title\": str(带emoji), \"summary\": str(<=240字), \"content\": str(600-1200字markdown)}"
        )
        user = (
            f"报告日期：{report_date}\n"
            f"可引用事实（source_refs）：\n{refs_text}\n\n"
            f"活跃方向数：{brief.get('active_direction_count', len(summaries))}\n"
            f"总样本数：{brief.get('total_products', '未知')}\n"
            f"平均爆发指数：{brief.get('avg_burst', '未知')}\n\n"
            f"价格带分布：\n{price_text}\n\n"
            f"今日榜单清单：\n{ranking_titles}\n\n"
            "请输出今日市场观察：概述市场温度、识别强势价格带、点出值得关注的方向。"
            "标题要带 emoji 且有画面感。"
        )
        parsed, _u = chat_fn(system, user, temperature=0.4, agent="ceo")
        return {
            "title": str(parsed.get("title") or "今日市场观察"),
            "summary": str(parsed.get("summary") or "")[:240],
            "content": str(parsed.get("content") or parsed.get("summary") or ""),
            "source_refs": source_refs,
        }

    @staticmethod
    def _source_refs_from_summary(summary: dict[str, Any]) -> list[dict[str, Any]]:
        """从 feature_summaries 组装可溯源事实砖块（程序权威，不信 LLM 编造）。"""
        existing = summary.get("source_refs")
        if isinstance(existing, list) and existing:
            return [r for r in existing if isinstance(r, dict) and r.get("id")][:40]
        key = str(summary.get("key") or "")
        refs: list[dict[str, Any]] = [{
            "id": "sr_count",
            "label": "样本数",
            "value": summary.get("item_count") or 0,
            "origin": "feature_summaries",
            "ranking_key": key,
        }]
        stats = summary.get("stats") or {}
        for field in (
            "burst_index", "blue_ocean_index", "opportunity_score",
            "growth_rate_pct", "price", "daily_delta",
        ):
            st = stats.get(field) or {}
            for metric in ("avg", "max", "median"):
                if st.get(metric) is None:
                    continue
                refs.append({
                    "id": f"sr_{field}_{metric}",
                    "label": f"{field}.{metric}",
                    "value": st.get(metric),
                    "origin": "product_features.stats",
                    "ranking_key": key,
                })
        return refs[:40]

    def _llm_b_mode_ranking(self, report_date: str, summary: dict[str, Any], chat_fn) -> dict[str, Any] | None:
        """B 模式单榜润色：程序已生成草稿 + key_points → LLM 只增强表达。"""
        title = summary.get("title") or summary.get("key") or "维度解读"
        draft = summary.get("draft_content") or ""
        key_points = summary.get("key_points") or []
        item_count = summary.get("item_count", 0)
        source_refs = self._source_refs_from_summary(summary)
        if not draft and not key_points:
            return None

        refs_text = "\n".join(
            f"  [{r.get('id')}] {r.get('label')} = {r.get('value')} （来源:{r.get('origin')}）"
            for r in source_refs[:20]
        ) or "  （无）"

        system = (
            "你是小红书选品顾问分析师。程序已基于特征引擎预计算了榜单的统计数据、分布和关键洞察。"
            "你的任务是将这些数据增强为生动、有深度的分析文章。\n\n"
            "排版要求：\n"
            "1. 用 emoji 标注重点（🔥 爆款、💎 蓝海、⚠️ 风险、📈 增长、🎯 精准、💡 建议）\n"
            "2. 用 markdown 标题分节（## / ###），每节 2-3 段\n"
            "3. key_points 每条以 emoji 开头\n"
            "4. 关键数据用 **加粗**，并在首次出现处标注引用如 [sr_count]\n"
            "5. 结尾用 > 引用块给出选品建议\n\n"
            "重要：禁止编造清单外的数字。凡出现具体数值必须能对应 source_refs 中的 id；不确定就写定性表述。\n"
            "合规：禁止 goods_id、店铺名、商品链接、完整商品标题。\n\n"
            "分类标注：请根据榜单内容判断主要商品类型，返回 category_type 字段：\n"
            "- physical：实体商品（需要物流发货，如服装/美妆/食品/家居/3C/宠物用品/植物/收纳袋）\n"
            "- virtual：虚拟商品（无需物流，如教育资料/电子课程/电子书/软件序列号/会员卡/服务/设计素材）\n"
            "- mixed：混合（实体和虚拟各占相当比例）\n\n"
            "输出 JSON: {\"key\": str, \"title\": str(带emoji), \"summary\": str(<=200字), "
            "\"content\": str(400-800字markdown), \"key_points\": [str], "
            "\"category_type\": \"physical|virtual|mixed\", \"category_tags\": [str]}"
        )
        user = (
            f"报告日期：{report_date}\n"
            f"榜单：{title}\n"
            f"条目数：{item_count}\n\n"
            f"可引用事实（source_refs，仅允许使用这些数字）：\n{refs_text}\n\n"
            f"程序预计算草稿：\n{draft}\n\n"
            f"已识别的关键洞察：\n" + "\n".join(f"- {p}" for p in key_points) + "\n\n"
            "请将以上草稿增强为有洞察力的分析文章。保持数据准确，优化语言和排版。"
            "标题要带 emoji 且有洞察力。"
            "同时请判断该榜单主要涉及实体商品还是虚拟商品，返回 category_type 字段。"
        )
        parsed, _u = chat_fn(system, user, temperature=0.3)
        # category_type 校验：只接受 physical/virtual/mixed，其余默认 mixed
        ct = str(parsed.get("category_type") or "").strip().lower()
        if ct not in ("physical", "virtual", "mixed"):
            ct = "mixed"
        return {
            "key": str(summary.get("key") or parsed.get("key") or ""),
            "title": str(parsed.get("title") or title),
            "summary": str(parsed.get("summary") or "")[:200],
            "content": str(parsed.get("content") or draft),
            "key_points": list(parsed.get("key_points") or key_points)[:8],
            "category_type": ct,
            "category_tags": list(parsed.get("category_tags") or [])[:5],
            "source_refs": source_refs,
        }

    def _llm_b_mode_cross(
        self,
        report_date: str,
        ctx: dict[str, Any],
        directions: list[dict[str, Any]],
        chat_fn,
    ) -> dict[str, Any] | None:
        """B 模式跨榜综述：基于已润色的方向解读发现交集信号。"""
        if len(directions) < 3:
            return None
        snippets = "\n\n".join(
            f"【{d.get('title','?')}】\n{(d.get('summary') or d.get('content') or '')[:200]}"
            for d in directions[:_MAX_RANKINGS_FOR_CROSS]
        )
        system = (
            "你是小红书选品顾问首席分析师。基于已生成的多个方向解读，"
            "输出跨榜综述：发现交集信号、识别矛盾点、给出综合选品方向。\n\n"
            "排版要求：\n"
            "1. 用 emoji 标注重点（🤝 共识、⚡ 矛盾、🎯 优先、💡 建议、✅ 行动）\n"
            "2. 用 markdown 标题分节（## / ###）\n"
            "3. action_items 每条以 ✅ 开头，具体到品类+价格带+操作\n"
            "4. 关键数据用 **加粗**\n\n"
            "合规：禁止 goods_id、店铺名、商品链接、完整商品标题。\n"
            "输出 JSON: {\"title\": str(带emoji), \"content\": str(400-800字markdown), "
            "\"action_items\": [str]}"
        )
        user = (
            f"报告日期：{report_date}\n"
            f"已生成 {len(directions)} 个方向解读：\n{snippets}\n\n"
            "请输出跨榜综述：哪些方向出现共识？哪些信号冲突？中小商家应优先关注哪 2-3 个方向？"
            "标题要带 emoji 且有总结性。"
        )
        parsed, _u = chat_fn(system, user, temperature=0.4, agent="ceo")
        return {
            "title": str(parsed.get("title") or "跨榜综述"),
            "content": str(parsed.get("content") or ""),
            "action_items": list(parsed.get("action_items") or [])[:6],
        }

    def _llm_daily_overview(self, report_date: str, ctx: dict[str, Any], chat_fn) -> dict[str, Any]:
        brief = ctx.get("daily_brief") or {}
        rankings = ctx.get("rankings") or {}
        top_cats = brief.get("top_categories") or []
        cats_text = "\n".join(
            f"  - {c.get('category','未知')}: 占比 {c.get('share_pct', c.get('count','?'))}"
            for c in top_cats[:10]
        ) or "  （暂无）"

        ranking_titles = "\n".join(
            f"  - {r.get('title','?')}（{r.get('item_count',0)}条）"
            for r in list(rankings.values())[:_MAX_RANKINGS_FOR_CROSS]
        ) or "  （暂无）"

        system = (
            "你是小红书选品顾问首席分析师。基于榜单 brief（不含商品 ID/店铺名/真实标题），"
            "输出一段生动、有温度的当日市场观察。\n\n"
            "排版要求：\n"
            "1. 用 emoji 标注重点（如 🔥 强势、💎 蓝海、⚠️ 风险、📈 增长、💰 高客单）\n"
            "2. 用 markdown 标题分节（## / ###），每节 2-4 段\n"
            "3. 关键数据用 **加粗** 或 `代码` 标注\n"
            "4. 用 > 引用块突出核心洞察\n"
            "5. 语言口语化、有节奏感，像朋友聊天而非机械报告\n\n"
            "合规：禁止 goods_id、店铺名、商品链接、完整商品标题；可提及类目、价格带、关注度等级。\n"
            "输出 JSON: {\"title\": str(带emoji), \"summary\": str(<=240字), \"content\": str(800-1500字markdown)}"
        )
        user = (
            f"报告日期：{report_date}\n"
            f"活跃方向数：{brief.get('active_direction_count', len(rankings))}\n"
            f"总样本数：{(ctx.get('meta') or {}).get('pool_size', '未知')}\n"
            f"TOP 类目分布：\n{cats_text}\n\n"
            f"今日榜单清单：\n{ranking_titles}\n\n"
            "请输出今日市场观察：概述市场温度、识别强势类目与价格带、点出值得关注的方向。"
            "标题要带 emoji 且有画面感（如「🔥 送礼季引爆，50元以下成主战场」）。"
        )
        parsed, _u = chat_fn(system, user, temperature=0.5, agent="ceo")
        return {
            "title": str(parsed.get("title") or "今日市场观察"),
            "summary": str(parsed.get("summary") or "")[:240],
            "content": str(parsed.get("content") or parsed.get("summary") or ""),
        }

    def _llm_ranking(self, report_date: str, ranking: dict[str, Any], chat_fn) -> dict[str, Any] | None:
        title = ranking.get("title") or ranking.get("key") or "维度解读"
        description = ranking.get("description") or ""
        items = ranking.get("items") or []
        if not items:
            return None

        items_text = self._format_items_for_llm(items[:_TOP_ITEMS_PER_RANKING])
        system = (
            "你是小红书选品顾问分析师。基于一个榜单的条目（reference_no + 抽象标签），"
            "输出该方向的结构化解读。\n\n"
            "排版要求：\n"
            "1. 用 emoji 标注重点（🔥 爆款、💎 蓝海、⚠️ 风险、📈 增长、🎯 精准、💡 建议）\n"
            "2. 用 markdown 标题分节（## / ###），每节 2-3 段\n"
            "3. key_points 每条以 emoji 开头（如「🔥 TOP3 集中在50元以下」）\n"
            "4. 关键数据用 **加粗**\n"
            "5. 结尾用 > 引用块给出选品建议\n\n"
            "合规：禁止 goods_id、店铺名、商品链接、完整商品标题；只能引用 reference_no 编号。\n"
            "输出 JSON: {\"key\": str, \"title\": str(带emoji), \"summary\": str(<=200字), "
            "\"content\": str(600-1200字markdown), \"key_points\": [str]}"
        )
        user = (
            f"报告日期：{report_date}\n"
            f"榜单：{title}\n描述：{description}\n"
            f"条目数：{ranking.get('item_count', len(items))}\n"
            f"TOP {min(len(items), _TOP_ITEMS_PER_RANKING)} 条数据：\n{items_text}\n\n"
            "请输出该方向的深度解读：识别共性特征、解释排序逻辑、给出可执行选品建议。"
            "标题要带 emoji 且有洞察力（如「💎 低竞争蓝海：家居收纳的3个突破口」）。"
        )
        parsed, _u = chat_fn(system, user, temperature=0.5)
        return {
            "key": str(ranking.get("key") or parsed.get("key") or ""),
            "title": str(parsed.get("title") or title),
            "summary": str(parsed.get("summary") or "")[:200],
            "content": str(parsed.get("content") or ""),
            "key_points": list(parsed.get("key_points") or [])[:8],
        }

    def _llm_cross_summary(
        self,
        report_date: str,
        ctx: dict[str, Any],
        directions: list[dict[str, Any]],
        chat_fn,
    ) -> dict[str, Any] | None:
        """跨榜综述：发现多榜交集与隐含信号。"""
        if len(directions) < 3:
            return None
        snippets = "\n\n".join(
            f"【{d.get('title','?')}】\n{(d.get('summary') or d.get('content') or '')[:200]}"
            for d in directions[:_MAX_RANKINGS_FOR_CROSS]
        )
        system = (
            "你是小红书选品顾问首席分析师。基于已生成的多个方向解读，"
            "输出跨榜综述：发现交集信号、识别矛盾点、给出综合选品方向。\n\n"
            "排版要求：\n"
            "1. 用 emoji 标注重点（🤝 共识、⚡ 矛盾、🎯 优先、💡 建议、✅ 行动）\n"
            "2. 用 markdown 标题分节（## / ###）\n"
            "3. action_items 每条以 ✅ 开头，具体到品类+价格带+操作\n"
            "4. 关键数据用 **加粗**\n\n"
            "合规：禁止 goods_id、店铺名、商品链接、完整商品标题。\n"
            "输出 JSON: {\"title\": str(带emoji), \"content\": str(500-1000字markdown), "
            "\"action_items\": [str]}"
        )
        user = (
            f"报告日期：{report_date}\n"
            f"已生成 {len(directions)} 个方向解读：\n{snippets}\n\n"
            "请输出跨榜综述：哪些方向出现共识？哪些信号冲突？中小商家应优先关注哪 2-3 个方向？"
            "标题要带 emoji 且有总结性（如「🎯 三榜共振：50元以下养猫好物成最大机会」）。"
        )
        parsed, _u = chat_fn(system, user, temperature=0.5, agent="ceo")
        return {
            "title": str(parsed.get("title") or "跨榜综述"),
            "content": str(parsed.get("content") or ""),
            "action_items": list(parsed.get("action_items") or [])[:6],
        }

    def _format_items_for_llm(self, items: list[dict[str, Any]]) -> str:
        lines = []
        for it in items:
            lines.append(
                f"  #{it.get('reference_no','?')} | 类目:{it.get('category_tag','未知')} | "
                f"价格带:{it.get('price_range_label','未知')} | "
                f"日增量:{it.get('daily_sales_increment',0)} | "
                f"增速:{it.get('growth_rate_pct',0)}% | "
                f"关注度:{it.get('attention_level_label','未知')} | "
                f"竞争:{it.get('competition_level_label','未知')} | "
                f"趋势信号:{it.get('trend_signal_label','未知')}"
            )
        return "\n".join(lines) if lines else "  （无数据）"

    def _template_ranking(self, report_date: str, ranking: dict[str, Any]) -> dict[str, Any] | None:
        """单榜 LLM 失败时的模板兜底。"""
        items = ranking.get("items") or []
        if not items:
            return None
        title = ranking.get("title") or ranking.get("key") or "维度解读"
        top3 = items[:3]
        lines = [f"- #{it.get('reference_no','?')} {it.get('category_tag','')} 价位{it.get('price_range_label','')} 增量{it.get('daily_sales_increment',0)}"
                 for it in top3]
        return {
            "key": str(ranking.get("key") or ""),
            "title": title,
            "summary": f"Top3 占该榜 {len(items)} 条，呈现 {top3[0].get('trend_signal_label','变化')} 特征。",
            "content": f"本方向共 {len(items)} 条条目。TOP3：\n" + "\n".join(lines) +
                       "\n\n（本方向 LLM 调用失败，已用模板兜底，建议稍后重试生成。）",
            "key_points": [],
        }

    # ---------- 旧路径保留（向后兼容） ----------

    def _normalize_pregen(self, report_date: str, pre: dict[str, Any]) -> dict[str, Any]:
        meta = pre.get("meta") or {}
        overview = pre.get("daily_overview") or {}
        directions = pre.get("direction_advices") or pre.get("decision_briefs") or []
        cards = pre.get("opportunity_cards") or []
        return {
            "report_date": report_date,
            "generated_at": meta.get("finished_at") or datetime.now(timezone.utc).isoformat(),
            "meta": {
                "target_date": report_date,
                "mode": meta.get("mode") or "pregen_research",
                "generator": meta.get("generator") or "local_pregen",
                "finished_at": meta.get("finished_at"),
                "schema_version": meta.get("schema_version") or ("2.0" if cards else "1.0"),
                "pack_type": meta.get("pack_type") or ("research_v1" if cards else ""),
                "opportunity_count": len(cards),
            },
            "daily_overview": {
                "title": overview.get("title") or "今日选品研究",
                "summary": (overview.get("summary") or overview.get("content") or "")[:240],
                "content": overview.get("content") or overview.get("summary") or "",
            },
            "opportunity_cards": cards,
            "direction_advices": directions,
            "decision_briefs": directions,
            "disclaimer": pre.get("disclaimer") or "仅供参考，不构成投资建议。",
            "dynamic": pre.get("dynamic"),
        }

    def _advice_from_research_pack(self, report_date: str, research: dict[str, Any]) -> dict[str, Any]:
        """无本地 advice 时，直接从 research_pack 组装会员可读结构。"""
        cards = list(research.get("opportunity_cards") or [])
        briefs = []
        for d in research.get("directions") or []:
            keys = set(d.get("cluster_keys") or [])
            picked = [c for c in cards if c.get("cluster_key") in keys][:6]
            if not picked:
                continue
            top = picked[0]
            lines = [
                f"一、核心判断\n「{d.get('title')}」优先概念「{top.get('concept_name')}」"
                f"（指数 {top.get('opportunity_score')}）。",
                "二、机会清单",
            ]
            for c in picked:
                lines.append(
                    f"- {c.get('concept_name')}｜指数{c.get('opportunity_score')}｜"
                    f"{c.get('price_band')}｜竞争{c.get('competition_level')}"
                )
            lines.append(f"三、怎么做\n{top.get('how_to_act') or ''}")
            lines.append("四、风险")
            for r in (top.get("risks") or [])[:3]:
                lines.append(f"- {r}")
            briefs.append({
                "key": d.get("key"),
                "title": f"{d.get('title')}解读",
                "summary": (top.get("why_now") or "")[:200],
                "content": "\n".join(lines),
                "category_type": top.get("entity_class") or "mixed",
            })
        heads = "、".join(f"{c.get('concept_name')}({c.get('opportunity_score')})" for c in cards[:3]) or "暂无"
        overview = (
            f"一、核心结论\n{report_date} 共筛选 {len(cards)} 个研究机会概念。头条：{heads}。\n\n"
            f"二、操作提示\n优先阅读指数≥80且竞争为「低」的机会卡。\n\n"
            f"三、免责声明\n仅供参考，不构成投资建议。"
        )
        return {
            "report_date": report_date,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "meta": {
                "target_date": report_date,
                "mode": "research_pack",
                "schema_version": "2.0",
                "pack_type": "research_v1",
                "opportunity_count": len(cards),
            },
            "daily_overview": {
                "title": "今日选品研究",
                "summary": overview.split("\n\n")[0][:240],
                "content": overview,
            },
            "opportunity_cards": cards,
            "direction_advices": briefs,
            "decision_briefs": briefs,
            "disclaimer": "仅供参考，不构成投资建议。",
        }

    def _maybe_llm_enhance_opportunities(
        self, report_date: str, advice: dict[str, Any], ctx: dict[str, Any]
    ) -> dict[str, Any]:
        """仅对前若干机会卡润色 why/how/risk（不回写标题/销量）。"""
        cards = list(advice.get("opportunity_cards") or [])
        if not cards:
            return self._maybe_llm_enhance(report_date, advice, ctx)
        try:
            from cloud_deploy.reporting.insight_llm_client import chat_json_with_usage

            payload = [
                {
                    "opportunity_id": c.get("opportunity_id"),
                    "concept_name": c.get("concept_name"),
                    "opportunity_score": c.get("opportunity_score"),
                    "competition_level": c.get("competition_level"),
                    "lifecycle_stage": c.get("lifecycle_stage"),
                    "price_band": c.get("price_band"),
                }
                for c in cards[:8]
            ]
            system = (
                "你是电商选品研究顾问。根据机会概念特征，为每张卡生成 why_now/how_to_act/risks。"
                "禁止商品ID、店铺名、链接、完整标题、绝对销量数字。返回 JSON："
                '{"cards":[{"opportunity_id":"...","why_now":"...","how_to_act":"...","risks":["..."]}]}'
            )
            user = json.dumps({"report_date": report_date, "cards": payload}, ensure_ascii=False)[:12000]
            parsed, _ = chat_json_with_usage(system, user, temperature=0.35, agent="ceo")
            enrich_map = {}
            if isinstance(parsed, dict):
                for row in parsed.get("cards") or []:
                    if isinstance(row, dict) and row.get("opportunity_id"):
                        enrich_map[str(row["opportunity_id"])] = row
            if enrich_map:
                advice = dict(advice)
                new_cards = []
                for c in cards:
                    row = enrich_map.get(str(c.get("opportunity_id")))
                    if row:
                        c = dict(c)
                        if row.get("why_now"):
                            c["why_now"] = str(row["why_now"])[:500]
                        if row.get("how_to_act"):
                            c["how_to_act"] = str(row["how_to_act"])[:500]
                        if isinstance(row.get("risks"), list) and row["risks"]:
                            c["risks"] = [str(x)[:120] for x in row["risks"][:4]]
                    new_cards.append(c)
                advice["opportunity_cards"] = new_cards
                meta = dict(advice.get("meta") or {})
                meta["llm_opportunity_polish"] = True
                advice["meta"] = meta
        except Exception as e:
            print(f"[advisor] opportunity polish skipped: {e}", file=sys.stderr, flush=True)
        return advice

    def _maybe_llm_enhance(self, report_date: str, advice: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
        """旧路径可选 LLM 补充（保留以兼容老调用方）。"""
        try:
            from cloud_deploy.reporting.insight_llm_client import llm_configured

            if not llm_configured():
                return advice
            snippet = self._llm_supplement_snippet(report_date, advice, ctx)
            if snippet:
                advice = dict(advice)
                advice["dynamic"] = {
                    "query": "今日市场补充观察",
                    "content": snippet,
                    "source": "llm_supplement",
                }
        except Exception:
            pass
        return advice

    def _llm_supplement_snippet(self, report_date: str, advice: dict[str, Any], ctx: dict[str, Any]) -> str:
        from cloud_deploy.reporting.insight_llm_client import chat_json_with_usage

        system = (
            "你是选品研究顾问。根据已有研究摘要，输出 200 字以内补充观察。"
            "禁止 goods_id、店铺名、商品链接、完整标题、绝对销量子段。"
        )
        user = json.dumps(
            {
                "report_date": report_date,
                "overview": advice.get("daily_overview"),
                "opportunities": [
                    {"concept": c.get("concept_name"), "score": c.get("opportunity_score")}
                    for c in (advice.get("opportunity_cards") or [])[:8]
                ],
            },
            ensure_ascii=False,
        )[:8000]
        parsed, _ = chat_json_with_usage(system, user, temperature=0.3, agent="ceo")
        if isinstance(parsed, dict):
            return str(parsed.get("content") or parsed.get("snippet") or "")
        return ""

    def _template_generate(self, report_date: str, ctx: dict[str, Any]) -> dict[str, Any]:
        summary = str(ctx.get("market_summary") or ctx.get("summary") or "研究数据已接收，正在生成解读。")
        directions = []
        for block in ctx.get("direction_advices") or ctx.get("directions") or ctx.get("direction_blocks") or []:
            if not isinstance(block, dict):
                continue
            key = str(block.get("key") or block.get("direction") or "")
            if not key:
                continue
            text = str(block.get("content") or block.get("summary") or "")
            directions.append({
                "key": key,
                "title": block.get("title") or key,
                "summary": text[:200],
                "content": text or block.get("summary") or "",
            })
        cards = []
        research = ctx.get("research_pack") if isinstance(ctx.get("research_pack"), dict) else {}
        if research.get("opportunity_cards"):
            cards = list(research["opportunity_cards"])
        return {
            "report_date": report_date,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "meta": {
                "schema_version": "2.0" if cards else "1.0",
                "pack_type": "research_v1" if cards else "",
                "opportunity_count": len(cards),
            },
            "daily_overview": {
                "title": "今日选品研究",
                "summary": summary[:240],
                "content": summary,
            },
            "opportunity_cards": cards,
            "direction_advices": directions[:8],
            "disclaimer": "仅供参考，不构成投资建议。",
        }
