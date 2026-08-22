# -*- coding: utf-8 -*-
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT))

from cloud_deploy.cloud_api.sms_hook_routes import _extract_code  # noqa: E402


SAMPLE = (
    "106980095188000001【支付宝】支付宝验证码：313773，"
    "请勿向他人泄露您的验证码！唯一热线9518813592497214"
)
SAMPLE_TAIL = (
    "106980095188000001【支付宝】支付宝验证码：313773，"
    "请勿向他人泄露您的验证码！唯一热线95188{{7214}}2026-08-22 20:23:42"
)


def test_alipay_sender_prefix_does_not_steal_code():
    assert _extract_code(SAMPLE) == "313773"
    assert _extract_code(SAMPLE_TAIL) == "313773"


def test_reject_sender_tail_only():
    assert _extract_code("106980095188000001") is None
