# -*- coding: utf-8 -*-
"""T1：get_plan 支持 insight SKU + L1 cache 键。"""
from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from cloud_deploy.cloud_api.payment_plans import get_plan, v2_launch_enabled
from cloud_deploy.reporting.daily_metrics_store import metrics_hash
from cloud_deploy.reporting.insight_cache_store import PROMPT_VERSION


def test_get_plan_insight_sku():
    plan = get_plan("insight_pro_monthly")
    assert plan is not None
    assert plan["plan_code"] == "insight_pro_monthly"
    assert plan.get("entitlements_template", {}).get("insight_only") is True


def test_get_plan_legacy_still_works():
    plan = get_plan("monthly")
    assert plan is not None
    assert plan["plan_code"] == "monthly"


def test_metrics_hash_stable():
    m = {"category": "美甲", "growth_rate_pct": 1.2, "blue_ocean_score": 80}
    h1 = metrics_hash(m)
    h2 = metrics_hash(m)
    assert h1 == h2
    assert len(h1) == 32


def test_prompt_version():
    assert PROMPT_VERSION == "agent-v1-feed"


if __name__ == "__main__":
    test_get_plan_insight_sku()
    test_get_plan_legacy_still_works()
    test_metrics_hash_stable()
    test_prompt_version()
    print("test_t1_batch OK")
