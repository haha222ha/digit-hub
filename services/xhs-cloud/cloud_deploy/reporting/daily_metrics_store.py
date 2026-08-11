# -*- coding: utf-8 -*-
"""daily_category_metrics 读写 + 7 日趋势（doc 27 REQ-PG-*）。"""
from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any


_MONITOR_SCHEMA = "xhs_monitor"


def _set_search_path(conn) -> None:
    with conn.cursor() as cur:
        cur.execute("SET search_path TO xhs_monitor, public")


def _table_exists(conn, table: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = %s AND table_name = %s
            LIMIT 1
            """,
            (_MONITOR_SCHEMA, table),
        )
        return cur.fetchone() is not None


def upsert_daily_metrics(conn, report_date: str, insights: list[Any]) -> int:
    """将 InsightMetrics 列表 UPSERT 到 daily_category_metrics。表不存在时返回 0。"""
    if not insights or not _table_exists(conn, "daily_category_metrics"):
        return 0
    _set_search_path(conn)
    n = 0
    with conn.cursor() as cur:
        for m in insights:
            d = m.to_public_dict() if hasattr(m, "to_public_dict") else dict(m)
            cur.execute(
                """
                INSERT INTO daily_category_metrics (
                    report_date, category, sub_category, sample_size,
                    growth_rate_pct, competition_index, blue_ocean_score,
                    heat_score, new_product_score, season_score, price_band,
                    lifecycle_stage, trend_label, formula_version
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'v2.2'
                )
                ON CONFLICT (report_date, category, sub_category) DO UPDATE SET
                    sample_size = EXCLUDED.sample_size,
                    growth_rate_pct = EXCLUDED.growth_rate_pct,
                    competition_index = EXCLUDED.competition_index,
                    blue_ocean_score = EXCLUDED.blue_ocean_score,
                    heat_score = EXCLUDED.heat_score,
                    new_product_score = EXCLUDED.new_product_score,
                    season_score = EXCLUDED.season_score,
                    price_band = EXCLUDED.price_band,
                    lifecycle_stage = EXCLUDED.lifecycle_stage,
                    trend_label = EXCLUDED.trend_label,
                    formula_version = EXCLUDED.formula_version
                """,
                (
                    report_date,
                    d.get("category") or "",
                    d.get("sub_category") or "",
                    getattr(m, "sample_size", None) or d.get("sample_size"),
                    d.get("growth_rate_pct"),
                    d.get("competition_index"),
                    d.get("blue_ocean_score"),
                    d.get("heat_score"),
                    d.get("new_product_score"),
                    d.get("season_score"),
                    d.get("price_band"),
                    d.get("lifecycle_stage"),
                    d.get("trend_label"),
                ),
            )
            n += 1
    conn.commit()
    return n


def load_trend_7d(
    conn,
    category: str,
    end_date: str,
    *,
    sub_category: str = "",
    days: int = 7,
) -> list[dict[str, Any]]:
    """读取类目近 N 日指标序列（供 LLM trend_7d）。"""
    if not _table_exists(conn, "daily_category_metrics"):
        return []
    _set_search_path(conn)
    try:
        end = date.fromisoformat(end_date[:10])
    except ValueError:
        return []
    start = end - timedelta(days=max(days - 1, 0))
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT report_date, growth_rate_pct, blue_ocean_score, heat_score,
                   competition_index, trend_label
            FROM daily_category_metrics
            WHERE category = %s AND sub_category = %s
              AND report_date >= %s AND report_date <= %s
            ORDER BY report_date ASC
            """,
            (category, sub_category or "", start.isoformat(), end.isoformat()),
        )
        rows = cur.fetchall()
    out: list[dict[str, Any]] = []
    for row in rows:
        if isinstance(row, dict):
            rd = row.get("report_date")
            out.append(
                {
                    "date": rd.isoformat() if hasattr(rd, "isoformat") else str(rd)[:10],
                    "growth": float(row.get("growth_rate_pct") or 0),
                    "blue": int(row.get("blue_ocean_score") or 0),
                    "heat": int(row.get("heat_score") or 0),
                    "competition": int(row.get("competition_index") or 0),
                    "trend": row.get("trend_label") or "",
                }
            )
        else:
            rd = row[0]
            out.append(
                {
                    "date": rd.isoformat() if hasattr(rd, "isoformat") else str(rd)[:10],
                    "growth": float(row[1] or 0),
                    "blue": int(row[2] or 0),
                    "heat": int(row[3] or 0),
                    "competition": int(row[4] or 0),
                    "trend": row[5] or "",
                }
            )
    return out


def load_peer_categories(
    conn,
    category: str,
    report_date: str,
    *,
    limit: int = 3,
) -> list[str]:
    """同日其他赛道（按蓝海指数，供 similar_categories 提示）。"""
    if not category or not _table_exists(conn, "daily_category_metrics"):
        return []
    _set_search_path(conn)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT category FROM daily_category_metrics
            WHERE report_date = %s AND category <> %s
            ORDER BY blue_ocean_score DESC, growth_rate_pct DESC
            LIMIT %s
            """,
            (report_date[:10], category, int(limit)),
        )
        rows = cur.fetchall()
    out: list[str] = []
    for row in rows:
        if isinstance(row, dict):
            c = row.get("category")
        else:
            c = row[0]
        if c and str(c) not in out:
            out.append(str(c))
    return out


def enrich_metrics_for_llm(conn, metrics: dict[str, Any], report_date: str) -> dict[str, Any]:
    """在公开指标上附加 trend_7d / similar_categories（若 PG 有历史）。"""
    out = dict(metrics)
    cat = str(metrics.get("category") or "")
    sub = str(metrics.get("sub_category") or "")
    if not cat:
        return out
    _set_search_path(conn)
    trend = load_trend_7d(conn, cat, report_date, sub_category=sub, days=7)
    if trend:
        out["trend_7d"] = trend
    peers = load_peer_categories(conn, cat, report_date, limit=3)
    if peers:
        out["similar_categories"] = peers
    return out


def metrics_hash(metrics: dict[str, Any]) -> str:
    """L1 缓存键（忽略 disclaimer）。"""
    import hashlib

    payload = {k: metrics[k] for k in sorted(metrics) if k not in ("disclaimer", "top_keywords")}
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]
