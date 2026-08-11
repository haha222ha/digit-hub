#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
T2: 类目 pgvector 嵌入批处理 → category_embeddings。

用法:
  cd /opt/xhs-cloud
  PYTHONPATH=/opt/xhs-cloud python3 cloud_deploy/scripts/run_category_embeddings.py
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import sys
import urllib.error
import urllib.request
from typing import Any

ROOT = os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud")
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from cloud_deploy.cloud_api.database_pg import _conn, init_db
from cloud_deploy.cloud_api.insight_settings import resolve_runtime_config

_MONITOR_SCHEMA = "xhs_monitor"


def _set_search_path(conn) -> None:
    with conn.cursor() as cur:
        cur.execute("SET search_path TO xhs_monitor, public")


def _fetch_categories(conn) -> list[str]:
    _set_search_path(conn)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = %s AND table_name = 'daily_category_metrics'
            LIMIT 1
            """,
            (_MONITOR_SCHEMA,),
        )
        if cur.fetchone():
            cur.execute(
                """
                SELECT DISTINCT category FROM daily_category_metrics
                WHERE category IS NOT NULL AND category <> ''
                ORDER BY category
                """
            )
            rows = cur.fetchall()
            if rows:
                return [str(r[0] if not isinstance(r, dict) else r["category"]) for r in rows]

        cur.execute(
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = %s AND table_name = 'category_embeddings'
            LIMIT 1
            """,
            (_MONITOR_SCHEMA,),
        )
        if not cur.fetchone():
            return []

    # 兜底：Shadow 磁盘类目（无 DCM 时）
    try:
        from cloud_deploy.cloud_api.insight_routes import _list_items_from_disk

        items = _list_items_from_disk()
        cats = sorted({str(it.get("category") or "") for it in items if it.get("category")})
        return [c for c in cats if c]
    except Exception:
        return []


def _deterministic_embed(text: str, *, dim: int) -> list[float]:
    """无 embedding API 时的兜底向量（固定维、可复现；非语义相似）。"""
    seed = hashlib.sha256(f"category:{text}".encode("utf-8")).digest()
    out: list[float] = []
    counter = 0
    while len(out) < dim:
        block = hashlib.sha256(seed + counter.to_bytes(4, "big")).digest()
        counter += 1
        for i in range(0, len(block), 4):
            if len(out) >= dim:
                break
            chunk = int.from_bytes(block[i : i + 4], "big", signed=False)
            out.append((chunk / 2**32) * 2.0 - 1.0)
    norm = math.sqrt(sum(x * x for x in out)) or 1.0
    return [x / norm for x in out]


def _resolve_embed_config(cfg: dict[str, Any]) -> dict[str, Any]:
    chat_base = str(cfg.get("base_url") or os.environ.get("INSIGHT_LLM_BASE_URL") or "").rstrip("/")
    embed_base = (
        os.environ.get("INSIGHT_EMBED_BASE_URL", "").strip()
        or os.environ.get("OPENAI_API_BASE", "").strip().rstrip("/")
        or chat_base
        or "https://www.packyapi.com/v1"
    )
    embed_key = (
        os.environ.get("INSIGHT_EMBED_API_KEY", "").strip()
        or os.environ.get("OPENAI_API_KEY", "").strip()
        or (cfg.get("api_key") or "").strip()
        or os.environ.get("INSIGHT_LLM_API_KEY", "").strip()
        or os.environ.get("DEEPSEEK_API_KEY", "").strip()
    )
    model = os.environ.get("INSIGHT_EMBED_MODEL", "")
    provider = os.environ.get("INSIGHT_EMBED_PROVIDER", "openai").strip().lower()
    if not model:
        if provider == "zhipu":
            model = "embedding-2"
        else:
            model = "text-embedding-3-small"
    if provider == "zhipu" and not os.environ.get("INSIGHT_EMBED_BASE_URL"):
        embed_base = embed_base if embed_base != chat_base else "https://open.bigmodel.cn/api/paas/v4"
    dim = int(os.environ.get("INSIGHT_EMBED_DIM", "768"))
    fallback = os.environ.get("INSIGHT_EMBED_FALLBACK", "").strip().lower()
    return {
        "base_url": embed_base,
        "api_key": embed_key,
        "model": model,
        "dim": dim,
        "fallback": fallback,
        "chat_base": chat_base,
        "provider": provider,
    }


def _embed_text(
    text: str, *, base_url: str, api_key: str, model: str, dimensions: int | None = None
) -> list[float]:
    url = base_url.rstrip("/") + "/embeddings"
    payload: dict[str, Any] = {"model": model, "input": text}
    if dimensions:
        payload["dimensions"] = dimensions
    body_bytes = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body_bytes,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    data = body.get("data") or []
    if not data:
        raise RuntimeError(f"embedding 空响应: {body!r:.200}")
    emb = data[0].get("embedding")
    if not isinstance(emb, list) or not emb:
        raise RuntimeError("embedding 格式异常")
    return [float(x) for x in emb]


def _embed_category(
    cat: str,
    *,
    embed_cfg: dict[str, Any],
) -> tuple[list[float], str]:
    """返回 (vector, model_name)。"""
    dim = int(embed_cfg["dim"])
    model = str(embed_cfg["model"])
    fallback = embed_cfg.get("fallback") or ""
    use_det = fallback in ("deterministic", "1", "true", "yes", "auto")

    if use_det and fallback != "auto":
        return _deterministic_embed(cat, dim=dim), "deterministic-sha256-v1"

    api_key = str(embed_cfg.get("api_key") or "").strip()
    if not api_key:
        if use_det:
            print("[category-embed] 无 embedding API Key，使用 deterministic 兜底", flush=True)
            return _deterministic_embed(cat, dim=dim), "deterministic-sha256-v1"
        raise RuntimeError("缺少 INSIGHT_EMBED_API_KEY / INSIGHT_LLM_API_KEY")

    try:
        vec = _embed_text(
            cat,
            base_url=str(embed_cfg["base_url"]),
            api_key=api_key,
            model=model,
            dimensions=dim,
        )
        if len(vec) != dim:
            raise RuntimeError(f"dim={len(vec)} != {dim}")
        return vec, model
    except (urllib.error.HTTPError, urllib.error.URLError, RuntimeError) as e:
        if fallback in ("deterministic", "auto", "1", "true", "yes"):
            print(f"[category-embed] {cat}: API 失败 ({e})，deterministic 兜底", flush=True)
            return _deterministic_embed(cat, dim=dim), "deterministic-sha256-v1"
        raise


def _upsert_embedding(
    conn,
    *,
    category: str,
    model: str,
    vector: list[float],
) -> None:
    _set_search_path(conn)
    vec_lit = "[" + ",".join(f"{x:.8f}" for x in vector) + "]"
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO category_embeddings (category, sub_category, model, embedding, updated_at)
            VALUES (%s, '', %s, %s::vector, NOW())
            ON CONFLICT (category, sub_category, model)
            DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = NOW()
            """,
            (category, model, vec_lit),
        )
    conn.commit()


def main() -> int:
    init_db()
    conn = _conn()
    try:
        _set_search_path(conn)
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1 FROM pg_extension WHERE extname = 'vector'
                """
            )
            if not cur.fetchone():
                print("[category-embed] pgvector 扩展未安装", flush=True)
                return 1
            cur.execute(
                """
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = %s AND table_name = 'category_embeddings'
                LIMIT 1
                """,
                (_MONITOR_SCHEMA,),
            )
            if not cur.fetchone():
                print("[category-embed] category_embeddings 表不存在", flush=True)
                return 1

        categories = _fetch_categories(conn)
        if not categories:
            print("[category-embed] 无类目可嵌入", flush=True)
            return 1

        try:
            cfg: dict[str, Any] = resolve_runtime_config(conn)
        except Exception as e:
            cfg = {}
            print(f"[category-embed] LLM settings skipped: {e}", flush=True)

        embed_cfg = _resolve_embed_config(cfg)
        if "packyapi.com" in embed_cfg["base_url"] and not os.environ.get("INSIGHT_EMBED_BASE_URL"):
            print(
                "[category-embed] 提示: PackyAPI DeepSeek 分组通常不支持 /embeddings；"
                "可设 INSIGHT_EMBED_BASE_URL + INSIGHT_EMBED_API_KEY（OpenAI/智谱），"
                "或 INSIGHT_EMBED_FALLBACK=auto 先入库",
                flush=True,
            )

        ok_n = 0
        for cat in categories:
            try:
                vec, model = _embed_category(cat, embed_cfg=embed_cfg)
                _upsert_embedding(conn, category=cat, model=model, vector=vec)
                ok_n += 1
                print(f"[category-embed] ok {cat} ({model})", flush=True)
            except (urllib.error.HTTPError, urllib.error.URLError, RuntimeError) as e:
                print(f"[category-embed] fail {cat}: {e}", flush=True)

        print(f"[category-embed] done {ok_n}/{len(categories)}", flush=True)
        return 0 if ok_n else 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
