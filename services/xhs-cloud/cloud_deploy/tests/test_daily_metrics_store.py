# -*- coding: utf-8 -*-
"""daily_metrics_store 单元测试（无 PG 时测纯函数）。"""
from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from cloud_deploy.reporting.daily_metrics_store import metrics_hash


def test_metrics_hash_stable():
    a = {"category": "美甲美睫", "growth_rate_pct": 12.5, "blue_ocean_score": 68}
    b = dict(a)
    assert metrics_hash(a) == metrics_hash(b)
    assert len(metrics_hash(a)) == 32


def test_metrics_hash_ignores_disclaimer():
    m1 = {"category": "X", "disclaimer": "a"}
    m2 = {"category": "X", "disclaimer": "b"}
    assert metrics_hash(m1) == metrics_hash(m2)


if __name__ == "__main__":
    test_metrics_hash_stable()
    test_metrics_hash_ignores_disclaimer()
    print("test_daily_metrics_store OK")
