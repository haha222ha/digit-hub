# -*- coding: utf-8 -*-
"""V2 情报 LLM 配置 — PG 存储 + 加密，供 admin 后台与 pipeline 读取。"""
from __future__ import annotations

import base64
import hashlib
import json
import os
from datetime import datetime, timezone
from typing import Any, Optional

SETTINGS_KEY = "insight_llm"

DEFAULT_PUBLIC = {
    "enabled": False,
    "provider": "packy_deepseek",
    "base_url": "https://www.packyapi.com/v1",
    "model": "deepseek-v4-flash",
    "thinking_disabled": True,
    "budget_tokens_per_day": 200_000,
    "api_key_set": False,
    "api_key_hint": "",
    "updated_at": None,
}

PROVIDER_PRESETS: dict[str, dict[str, str]] = {
    "packy_deepseek": {
        "base_url": "https://www.packyapi.com/v1",
        "model": "deepseek-v4-flash",
    },
    "deepseek_direct": {
        "base_url": "https://api.deepseek.com",
        "model": "deepseek-v4-flash",
    },
    "zhipu": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "model": "glm-4-flash",
    },
}


def _encryption_secret() -> str:
    return (
        os.environ.get("XHS_SETTINGS_SECRET")
        or os.environ.get("XHS_CLOUD_JWT_SECRET")
        or os.environ.get("XHS_CLOUD_SYNC_KEY")
        or "change-me"
    )


def _encrypt(plain: str) -> str:
    if not plain:
        return ""
    key = hashlib.sha256(_encryption_secret().encode()).digest()
    data = plain.encode("utf-8")
    out = bytes(b ^ key[i % len(key)] for i, b in enumerate(data))
    return base64.urlsafe_b64encode(out).decode("ascii")


def _decrypt(blob: str) -> str:
    if not blob:
        return ""
    key = hashlib.sha256(_encryption_secret().encode()).digest()
    raw = base64.urlsafe_b64decode(blob.encode("ascii"))
    out = bytes(b ^ key[i % len(key)] for i, b in enumerate(raw))
    return out.decode("utf-8")


def _mask_api_key(key: str) -> str:
    key = (key or "").strip()
    if not key:
        return ""
    if len(key) <= 8:
        return "****"
    return f"{key[:4]}…{key[-4:]}"


def _ensure_table(conn) -> None:
    with conn.cursor() as cur:
        cur.execute("SET search_path TO xhs_monitor, public")
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS system_settings (
                key VARCHAR(64) PRIMARY KEY,
                value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )


def _load_raw(conn) -> dict[str, Any]:
    _ensure_table(conn)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT value_json FROM system_settings WHERE key = %s",
            (SETTINGS_KEY,),
        )
        row = cur.fetchone()
    if not row:
        return {}
    val = row[0]
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        return json.loads(val)
    return {}


def get_public_config(conn) -> dict[str, Any]:
    """Admin GET — 不含明文 Key。"""
    raw = _load_raw(conn)
    api_key = ""
    if raw.get("api_key_enc"):
        try:
            api_key = _decrypt(str(raw["api_key_enc"]))
        except Exception:
            api_key = ""
    out = {**DEFAULT_PUBLIC}
    for k in (
        "enabled",
        "provider",
        "base_url",
        "model",
        "thinking_disabled",
        "budget_tokens_per_day",
        "updated_at",
    ):
        if k in raw and raw[k] is not None:
            out[k] = raw[k]
    out["api_key_set"] = bool(api_key or os.environ.get("INSIGHT_LLM_API_KEY") or os.environ.get("DEEPSEEK_API_KEY"))
    out["api_key_hint"] = _mask_api_key(api_key) if api_key else _mask_api_key(os.environ.get("INSIGHT_LLM_API_KEY", ""))
    env_llm = os.environ.get("INSIGHT_USE_LLM", "").strip().lower() in ("1", "true", "yes")
    out["env_insight_use_llm"] = env_llm
    out["effective_enabled"] = bool(out["enabled"] or env_llm) and out["api_key_set"]
    return out


def save_config(conn, payload: dict[str, Any]) -> dict[str, Any]:
    """Admin PUT — api_key 留空表示不修改。"""
    raw = _load_raw(conn)
    merged = {**raw}
    for k in ("enabled", "provider", "base_url", "model", "thinking_disabled", "budget_tokens_per_day"):
        if k in payload and payload[k] is not None:
            merged[k] = payload[k]
    api_key = (payload.get("api_key") or "").strip()
    if api_key:
        merged["api_key_enc"] = _encrypt(api_key)
    merged["updated_at"] = datetime.now(timezone.utc).isoformat()
    _ensure_table(conn)
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO system_settings (key, value_json, updated_at)
            VALUES (%s, %s::jsonb, NOW())
            ON CONFLICT (key) DO UPDATE SET
              value_json = EXCLUDED.value_json,
              updated_at = NOW()
            """,
            (SETTINGS_KEY, json.dumps(merged, ensure_ascii=False)),
        )
    conn.commit()
    return get_public_config(conn)


def resolve_runtime_config(conn: Optional[Any] = None) -> dict[str, Any]:
    """Pipeline / LLM client — 含解密 api_key（勿对外返回）。"""
    raw: dict[str, Any] = {}
    if conn is not None:
        try:
            raw = _load_raw(conn)
        except Exception:
            raw = {}
    elif os.environ.get("XHS_DATABASE_URL", "").startswith("postgres"):
        try:
            from cloud_deploy.cloud_api.database_pg import _conn, init_db

            init_db()
            c = _conn()
            try:
                raw = _load_raw(c)
            finally:
                c.close()
        except Exception:
            raw = {}

    provider = str(raw.get("provider") or os.environ.get("INSIGHT_LLM_PROVIDER") or "packy_deepseek")
    preset = PROVIDER_PRESETS.get(provider, PROVIDER_PRESETS["packy_deepseek"])
    base_url = (
        str(raw.get("base_url") or os.environ.get("INSIGHT_LLM_BASE_URL") or preset["base_url"]).rstrip("/")
    )
    model = str(raw.get("model") or os.environ.get("INSIGHT_LLM_MODEL") or preset["model"])
    api_key = ""
    if raw.get("api_key_enc"):
        try:
            api_key = _decrypt(str(raw["api_key_enc"]))
        except Exception:
            api_key = ""
    if not api_key:
        api_key = (os.environ.get("INSIGHT_LLM_API_KEY") or os.environ.get("DEEPSEEK_API_KEY") or "").strip()

    env_flag = os.environ.get("INSIGHT_USE_LLM", "").strip().lower() in ("1", "true", "yes")
    db_enabled = bool(raw.get("enabled"))
    enabled = (env_flag or db_enabled) and bool(api_key)

    return {
        "enabled": enabled,
        "provider": provider,
        "base_url": base_url,
        "model": model,
        "api_key": api_key,
        "thinking_disabled": bool(raw.get("thinking_disabled", True)),
        "budget_tokens_per_day": int(
            raw.get("budget_tokens_per_day")
            or os.environ.get("INSIGHT_LLM_BUDGET_TOKENS_PER_DAY")
            or 200_000
        ),
    }


def apply_runtime_env(cfg: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """将 PG 配置注入当前进程 os.environ（供 insight_llm_client 读取）。"""
    cfg = cfg or resolve_runtime_config()
    if cfg.get("api_key"):
        os.environ["INSIGHT_LLM_API_KEY"] = cfg["api_key"]
    if cfg.get("base_url"):
        os.environ["INSIGHT_LLM_BASE_URL"] = cfg["base_url"]
    if cfg.get("model"):
        os.environ["INSIGHT_LLM_MODEL"] = cfg["model"]
    if cfg.get("provider"):
        os.environ["INSIGHT_LLM_PROVIDER"] = cfg["provider"]
    if cfg.get("enabled"):
        os.environ["INSIGHT_USE_LLM"] = "1"
    return cfg


def describe_public(cfg: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    cfg = cfg or resolve_runtime_config()
    return {
        "configured": bool(cfg.get("api_key")),
        "enabled": bool(cfg.get("enabled")),
        "provider": cfg.get("provider"),
        "base_url": cfg.get("base_url"),
        "model": cfg.get("model"),
        "budget_tokens_per_day": cfg.get("budget_tokens_per_day"),
    }
