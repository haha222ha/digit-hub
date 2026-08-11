# -*- coding: utf-8 -*-
"""T1：insight 配额 + 雷达纯函数测试。"""
from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from cloud_deploy.cloud_api.entitlements_v2 import can_insight_generate
from cloud_deploy.reporting.insight_radar import load_radar_from_disk


def test_can_insight_generate():
    ent = {"insight_enabled": True, "insight_categories_per_day": 2}
    ok, _ = can_insight_generate(ent, already_today=0)
    assert ok is True
    ok2, msg = can_insight_generate(ent, already_today=2)
    assert ok2 is False
    assert "额度" in msg


def test_radar_from_disk_empty():
    data = load_radar_from_disk(lambda: [], limit=3)
    assert data["source"] == "shadow_disk"
    assert data["summary"]["categories_tracked"] == 0


def test_radar_from_disk_items():
    items = [
        {"category": "美甲美睫", "report_date": "2026-07-12", "stars": 4},
        {"category": "综合类目", "report_date": "2026-07-12", "stars": 3},
    ]
    data = load_radar_from_disk(lambda: items, limit=2)
    assert data["summary"]["categories_tracked"] == 2
    assert len(data["highlights"]) == 2


if __name__ == "__main__":
    test_can_insight_generate()
    test_radar_from_disk_empty()
    test_radar_from_disk_items()
    print("test_insight_t1 OK")
