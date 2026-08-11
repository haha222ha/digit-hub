# -*- coding: utf-8 -*-
"""insight_settings 加密与 resolve 单元测试。"""
from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from cloud_deploy.cloud_api import insight_settings as st  # noqa: E402


def test_encrypt_roundtrip():
    os.environ["XHS_SETTINGS_SECRET"] = "test-secret-key"
    enc = st._encrypt("sk-test-key-12345")
    assert enc
    assert st._decrypt(enc) == "sk-test-key-12345"


def test_mask_api_key():
    assert st._mask_api_key("sk-abcd1234wxyz") == "sk-a…wxyz"


def test_resolve_runtime_env_fallback(monkeypatch):
    monkeypatch.delenv("INSIGHT_LLM_API_KEY", raising=False)
    monkeypatch.setenv("INSIGHT_USE_LLM", "0")
    cfg = st.resolve_runtime_config(conn=None)
    assert cfg["enabled"] is False
