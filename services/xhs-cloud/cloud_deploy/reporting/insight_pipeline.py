# -*- coding: utf-8 -*-
"""
V2 情报全量管道 — 读 PG（XHS_DATABASE_URL）→ 类目指标 → mock/LLM 报告 → HTML bundle。

由 cloud_insight_report.py --playbook full 调用。
"""
from __future__ import annotations

import json
import os
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any

from cloud_deploy.reporting.insight_ai_llm import run_agents_auto
from cloud_deploy.reporting.insight_metric_engine import aggregate_items_to_insights
from cloud_deploy.reporting.insight_report_builder import (
    pg_items_to_rows,
    render_insight_html,
    write_insight_bundle,
)
from cloud_deploy.reporting.pg_reader import fetch_items_for_insight, insight_min_delta, insight_scan_window_days


def _log(msg: str) -> None:
    print(f"[insight-pipeline] {msg}", flush=True)


def run_insight_pipeline(
    report_date: str,
    *,
    shadow: bool = True,
    source: str = "scan_delta",
    min_sample: int | None = None,
    max_categories: int | None = None,
) -> dict[str, Any]:
    from cloud_deploy.cloud_api.database_pg import _conn, init_db

    min_sample = int(os.environ.get("INSIGHT_MIN_SAMPLE", min_sample or 3))
    max_categories = int(os.environ.get("INSIGHT_MAX_CATEGORIES", max_categories or 20))

    from cloud_deploy.reporting.insight_compliance_gate import k_anonymity_threshold, passes_k_anonymity

    k_anon = k_anonymity_threshold()

    # 从 PG admin 配置加载 LLM Key（优先于 .env 明文）
    try:
        from cloud_deploy.cloud_api.insight_settings import apply_runtime_env, resolve_runtime_config

        llm_cfg = apply_runtime_env(resolve_runtime_config())
        budget = int(llm_cfg.get("budget_tokens_per_day") or 200_000)
        use_llm = bool(llm_cfg.get("enabled"))
        _log(f"LLM mode={'on' if use_llm else 'mock'} agents=5 provider={llm_cfg.get('provider')} model={llm_cfg.get('model')}")
    except Exception as e:
        budget = int(os.environ.get("INSIGHT_LLM_BUDGET_TOKENS_PER_DAY", 200_000))
        use_llm = os.environ.get("INSIGHT_USE_LLM", "").strip().lower() in ("1", "true", "yes")
        _log(f"LLM settings load skipped: {e}; use_llm={use_llm}")

    init_db()
    conn = _conn()
    try:
        raw_items = fetch_items_for_insight(conn, report_date, source=source)
        _log(
            f"PG rows={len(raw_items)} date={report_date} source={source} "
            f"min_delta={insight_min_delta()} scan_window_days={insight_scan_window_days()}"
        )
    finally:
        conn.close()

    if not raw_items:
        raise RuntimeError(f"PG 无 {report_date} 选品数据，请先跑日报 pipeline")

    rows = pg_items_to_rows(raw_items)
    insights = aggregate_items_to_insights(report_date, rows, min_sample=min_sample)
    if not insights:
        raise RuntimeError(f"样本不足（min_sample={min_sample}），无法生成类目情报")

    if len(insights) > max_categories:
        tagged = [m for m in insights if getattr(m, "from_report_tag", False)]
        inferred = [m for m in insights if not getattr(m, "from_report_tag", False)]
        insights = (tagged + inferred)[:max_categories]
        _log(
            f"cap categories to max={max_categories} "
            f"(report_tags={len(tagged)} inferred_fill={max(0, max_categories - len(tagged))})"
        )
    insights = [m for m in insights if passes_k_anonymity(m.sample_size, k=k_anon)]
    if not insights:
        raise RuntimeError(f"无类目通过 k-匿名（k={k_anon}）")
    _log(f"publishable categories={len(insights)} k_anon={k_anon}")

    metrics_conn = None
    try:
        from cloud_deploy.reporting.daily_metrics_store import upsert_daily_metrics

        metrics_conn = _conn()
        n_dcm = upsert_daily_metrics(metrics_conn, report_date, insights)
        if n_dcm:
            _log(f"daily_category_metrics upsert {n_dcm} rows")
    except Exception as e:
        _log(f"daily_category_metrics skipped: {e}")
        if metrics_conn is not None:
            try:
                metrics_conn.close()
            except Exception:
                pass
        metrics_conn = None

    root = os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud")
    export_override = os.environ.get("XHS_INSIGHT_EXPORT_DIR", "").strip()
    if export_override:
        out_base = export_override
    else:
        sub = "insight_shadow" if shadow else "report_archives"
        out_base = os.path.join(root, "data", sub)

    summaries: list[dict[str, Any]] = []
    from cloud_deploy.reporting.insight_llm_feed import (
        build_llm_feed,
        feed_to_agent_metrics,
        filter_rows_for_category,
        write_llm_feed_files,
    )

    for insight in insights:
        cat_rows = filter_rows_for_category(rows, insight.category)
        public = insight.to_public_dict()
        if metrics_conn is not None:
            try:
                from cloud_deploy.reporting.daily_metrics_store import enrich_metrics_for_llm

                public = enrich_metrics_for_llm(metrics_conn, public, report_date)
            except Exception as e:
                _log(f"trend_7d enrich skipped {insight.category}: {e}")

        if source in ("local_delta", "local"):
            sel_rule = (
                f"local premium_goods_daily.delta>={insight_min_delta()} (delta_only), "
                f"scanned within {insight_scan_window_days()}d"
            )
        else:
            sel_rule = (
                f"goods_sold_daily.delta>={insight_min_delta()} (delta_only), "
                f"scanned within {insight_scan_window_days()}d, unique per product"
            )
        llm_feed = build_llm_feed(
            insight,
            cat_rows,
            raw_selection_rows=len(raw_items),
            pg_source=source,
            k_anonymity_min=k_anon,
            enriched={
                **public,
                "selection_rule": sel_rule,
            },
        )
        agent_metrics = feed_to_agent_metrics(llm_feed)
        internal = asdict(insight)
        from cloud_deploy.reporting.daily_metrics_store import metrics_hash as calc_metrics_hash
        from cloud_deploy.reporting.insight_cache_store import (
            PROMPT_VERSION,
            get_cached_report,
            upsert_cached_report,
        )

        mh = calc_metrics_hash(agent_metrics)
        report: dict[str, Any] | None = None
        cache_hit = False
        if metrics_conn is not None:
            report = get_cached_report(metrics_conn, mh, PROMPT_VERSION)
            if report:
                cache_hit = True
                _log(f"cache HIT {insight.category} hash={mh[:8]}")

        if not report:
            report_obj = run_agents_auto(agent_metrics, budget_tokens=budget)
            report = report_obj.to_public_dict()
            if metrics_conn is not None and use_llm:
                try:
                    tokens = 0
                    if hasattr(report_obj, "llm_meta") and isinstance(report_obj.llm_meta, dict):
                        usage = report_obj.llm_meta.get("usage") or {}
                        tokens = int(usage.get("prompt_tokens") or 0) + int(
                            usage.get("completion_tokens") or 0
                        )
                    upsert_cached_report(
                        metrics_conn,
                        mh,
                        report,
                        prompt_version=PROMPT_VERSION,
                        llm_tokens_used=tokens,
                    )
                except Exception as e:
                    _log(f"cache write skipped {insight.category}: {e}")

        html = render_insight_html(report, agent_metrics)
        meta = {
            "metrics": agent_metrics,
            "llm_feed": llm_feed,
            "report": report,
            "meta": {
                "data_source": "pg",
                "pipeline": "cloud_insight_report",
                "feed_schema": llm_feed.get("schema_version"),
                "selection_rows": len(cat_rows),
                "raw_selection_rows": len(raw_items),
                "shadow": shadow,
                "llm": use_llm,
                "cache_hit": cache_hit,
                "metrics_hash": mh,
                "generated_at": datetime.now().isoformat(),
            },
        }
        bundle = write_insight_bundle(out_base, report_date, insight.category, html, meta)
        write_llm_feed_files(bundle, llm_feed)
        summaries.append(
            {
                "category": insight.category,
                "report_date": report_date,
                "stars": report.get("opportunity_stars"),
                "bundle": str(bundle),
                "sample_size": insight.sample_size,
                "feed_schema": llm_feed.get("schema_version"),
            }
        )
        _log(f"OK {insight.category} sample={insight.sample_size} feed={llm_feed.get('schema_version')} → {bundle}")

    if metrics_conn is not None:
        try:
            metrics_conn.close()
        except Exception:
            pass

    summary = {
        "report_date": report_date,
        "shadow": shadow,
        "categories": len(summaries),
        "summaries": summaries,
    }
    summary_path = Path(out_base) / f"insight_{report_date.replace('-', '')}" / "pipeline_summary.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    _maybe_upsert_pg(report_date, summaries, shadow=shadow)
    return summary


def _maybe_upsert_pg(report_date: str, summaries: list[dict], *, shadow: bool) -> None:
    if shadow or os.environ.get("INSIGHT_SKIP_PG_UPSERT", "").strip().lower() in ("1", "true", "yes"):
        return
    try:
        from cloud_deploy.cloud_api.database_pg import _conn

        conn = _conn()
        try:
            with conn.cursor() as cur:
                cur.execute("SET search_path TO xhs_monitor, public")
                for s in summaries:
                    cur.execute(
                        """
                        INSERT INTO insight_reports (report_date, category, archive_path, summary_json)
                        VALUES (%s, %s, %s, %s::jsonb)
                        ON CONFLICT (report_date, category) DO UPDATE SET
                          archive_path = EXCLUDED.archive_path,
                          summary_json = EXCLUDED.summary_json,
                          created_at = NOW()
                        """,
                        (
                            report_date,
                            s["category"],
                            s.get("bundle"),
                            json.dumps({"stars": s.get("stars"), "sample_size": s.get("sample_size")}),
                        ),
                    )
            conn.commit()
            _log(f"PG insight_reports upsert {len(summaries)} rows")
        finally:
            conn.close()
    except Exception as e:
        _log(f"PG upsert skipped: {e}")
