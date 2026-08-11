# -*- coding: utf-8 -*-
"""OpenAI 兼容 LLM 客户端 — 读 insight_settings / 环境变量。"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


class LLMError(RuntimeError):
    pass


@dataclass
class LLMUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    model: str = ""


def _env(key: str, default: str = "") -> str:
    return (os.environ.get(key) or default).strip()


def _api_key() -> str:
    key = _env("INSIGHT_LLM_API_KEY") or _env("DEEPSEEK_API_KEY")
    if not key:
        raise LLMError("INSIGHT_LLM_API_KEY 未配置（请在 admin 后台「情报 LLM」填写）")
    return key


def llm_configured() -> bool:
    return bool(_env("INSIGHT_LLM_API_KEY") or _env("DEEPSEEK_API_KEY"))


def _parse_json_content(content: str) -> dict[str, Any]:
    text = (content or "").strip()
    if not text:
        raise LLMError("LLM 返回空内容")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        return json.loads(m.group(1).strip())
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        return json.loads(m.group(0))
    raise LLMError(f"LLM 响应非 JSON: {text[:200]}")


def chat_json_with_usage(
    system: str,
    user: str,
    *,
    temperature: float = 0.3,
    agent: str = "",
) -> tuple[dict[str, Any], LLMUsage]:
    base = (_env("INSIGHT_LLM_BASE_URL") or "https://www.packyapi.com/v1").rstrip("/")
    ceo_model = _env("INSIGHT_LLM_MODEL_CEO")
    default_model = _env("INSIGHT_LLM_MODEL") or "deepseek-v4-flash"
    model = ceo_model if agent == "ceo" and ceo_model else default_model
    provider = _env("INSIGHT_LLM_PROVIDER") or "packy_deepseek"
    thinking_disabled = _env("INSIGHT_LLM_THINKING", "disabled").lower() in (
        "0",
        "false",
        "no",
        "disabled",
        "off",
    )
    timeout = int(_env("INSIGHT_LLM_TIMEOUT") or "90")
    max_retries = int(_env("INSIGHT_LLM_MAX_RETRIES") or "2")

    payload: dict[str, Any] = {
        "model": model,
        "temperature": temperature,
        "messages": [
            {
                "role": "system",
                "content": system + "\n\n你必须只输出一个 JSON 对象，不要 markdown 代码块。",
            },
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
    }
    if thinking_disabled and "deepseek-v4" in model.lower():
        payload["thinking"] = {"type": "disabled"}

    url = f"{base}/chat/completions"
    last_err: Exception | None = None

    for attempt in range(max_retries + 1):
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {_api_key()}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            content = body["choices"][0]["message"]["content"]
            parsed = _parse_json_content(content)
            usage_raw = body.get("usage") or {}
            usage = LLMUsage(
                prompt_tokens=int(usage_raw.get("prompt_tokens") or 0),
                completion_tokens=int(usage_raw.get("completion_tokens") or 0),
                model=model,
            )
            return parsed, usage
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:500]
            last_err = LLMError(f"LLM HTTP {e.code} [{model}@{provider}]: {detail}")
            if e.code in (429, 500, 502, 503, 504) and attempt < max_retries:
                time.sleep(min(2**attempt, 8))
                continue
            raise last_err from e
        except (LLMError, json.JSONDecodeError) as e:
            last_err = e if isinstance(e, LLMError) else LLMError(str(e))
            if attempt < max_retries:
                time.sleep(1)
                continue
            raise last_err from e
        except Exception as e:
            raise LLMError(str(e)) from e

    raise last_err or LLMError("LLM 调用失败")
