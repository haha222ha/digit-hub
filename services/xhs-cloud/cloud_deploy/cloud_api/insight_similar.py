# -*- coding: utf-8 -*-
"""相关赛道 — pgvector 语义相似，兜底同日蓝海排序（Q3-4）。"""
from __future__ import annotations

from typing import Any

from cloud_deploy.cloud_api.insight_pg import set_search_path, table_exists
from cloud_deploy.reporting.daily_metrics_store import load_peer_categories


def _latest_report_date(conn) -> str | None:
    if not table_exists(conn, "daily_category_metrics"):
        return None
    set_search_path(conn)
    with conn.cursor() as cur:
        cur.execute("SELECT MAX(report_date) FROM daily_category_metrics")
        row = cur.fetchone()
    if not row:
        return None
    val = row[0] if not isinstance(row, dict) else row.get("max")
    return str(val)[:10] if val else None


def _pgvector_available(conn) -> bool:
    set_search_path(conn)
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_extension WHERE extname = 'vector' LIMIT 1")
        if not cur.fetchone():
            return False
        cur.execute(
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = current_schema() AND table_name = 'category_embeddings'
            LIMIT 1
            """
        )
        return bool(cur.fetchone())


def _load_category_vector(conn, category: str) -> tuple[list[float] | None, str | None]:
    set_search_path(conn)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT embedding::text, model
            FROM category_embeddings
            WHERE category = %s AND sub_category = ''
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (category,),
        )
        row = cur.fetchone()
    if not row:
        return None, None
    if isinstance(row, dict):
        raw, model = row.get("embedding"), row.get("model")
    else:
        raw, model = row[0], row[1]
    model_s = str(model or "")
    if model_s.startswith("deterministic"):
        return None, model_s
    if raw is None:
        return None, model_s
    text = str(raw).strip()
    if text.startswith("[") and text.endswith("]"):
        try:
            return [float(x) for x in text[1:-1].split(",") if x.strip()], model_s
        except ValueError:
            return None, model_s
    return None, model_s


def _similar_by_pgvector(conn, category: str, *, limit: int = 3) -> list[dict[str, Any]]:
    vec, model = _load_category_vector(conn, category)
    if not vec:
        return []
    vec_str = "[" + ",".join(str(x) for x in vec) + "]"
    set_search_path(conn)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT category, 1 - (embedding <=> %s::vector) AS score
            FROM category_embeddings
            WHERE category <> %s AND sub_category = ''
              AND model NOT LIKE 'deterministic%%'
            ORDER BY embedding <=> %s::vector
            LIMIT %s
            """,
            (vec_str, category, vec_str, int(limit)),
        )
        rows = cur.fetchall()
    out: list[dict[str, Any]] = []
    for row in rows:
        if isinstance(row, dict):
            cat = row.get("category")
            score = float(row.get("score") or 0)
        else:
            cat, score = row[0], float(row[1] or 0)
        if cat:
            out.append({"category": str(cat), "score": round(score, 3), "model": model})
    return out


def build_similar_categories(conn, category: str, *, limit: int = 3) -> dict[str, Any]:
    category = str(category or "").strip()
    if not category:
        return {"category": "", "items": [], "source": "none"}

    items: list[dict[str, Any]] = []
    source = "peer_metrics"

    if _pgvector_available(conn):
        try:
            items = _similar_by_pgvector(conn, category, limit=limit)
            if items:
                source = "pgvector"
        except Exception:
            items = []

    if not items:
        report_date = _latest_report_date(conn) or ""
        peers = load_peer_categories(conn, category, report_date, limit=limit) if report_date else []
        items = [{"category": c, "score": None} for c in peers]
        source = "peer_metrics" if peers else "none"

    return {"category": category, "items": items[:limit], "source": source}
