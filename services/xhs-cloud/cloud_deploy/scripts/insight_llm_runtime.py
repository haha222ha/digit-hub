# -*- coding: utf-8 -*-
"""从 admin「情报 LLM」配置加载运行时环境（PG → os.environ）。"""
from __future__ import annotations

import sys
from typing import Any


def apply_admin_insight_llm(*, log_prefix: str = "insight-llm") -> dict[str, Any]:
    """复用 insight_pipeline 同一套 PG 配置，供 advisor / insight 脚本共用。"""
    try:
        from cloud_deploy.cloud_api.insight_settings import apply_runtime_env, resolve_runtime_config

        cfg = apply_runtime_env(resolve_runtime_config())
        enabled = bool(cfg.get("enabled"))
        print(
            f"[{log_prefix}] LLM mode={'on' if enabled else 'off'} "
            f"provider={cfg.get('provider')} model={cfg.get('model')}",
            flush=True,
        )
        return cfg
    except Exception as e:
        print(f"[{log_prefix}] admin LLM settings skipped: {e}", file=sys.stderr, flush=True)
        return {}
