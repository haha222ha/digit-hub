# -*- coding: utf-8 -*-
"""Q2：compare / timeline 纯函数。"""
from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from cloud_deploy.cloud_api.insight_compare import build_category_compare
from cloud_deploy.cloud_api.insight_timeline import build_category_timeline


class _FakeCursor:
    def execute(self, sql, params=None):
        self.last_sql = sql or ""
        self.last_params = params

    def fetchone(self):
        sql = self.last_sql
        if "information_schema.tables" in sql:
            return (1,)
        if "MAX(report_date)" in sql:
            return ("2026-07-12",)
        if "category = %s" in sql and self.last_params:
            cat = self.last_params[1] if len(self.last_params) > 1 else ""
            if cat == "美妆护肤":
                return ("美妆护肤", 12.0, 80, 40, 70, "上升", "50-100", 100)
            if cat == "女装":
                return ("女装", 8.0, 65, 55, 60, "平稳", "100-200", 80)
        return None

    def fetchall(self):
        if "report_date >=" in self.last_sql:
            return [
                ("2026-07-10", 10.0, 70, 45, 60, "平稳", "50-100"),
                ("2026-07-12", 15.0, 75, 42, 65, "上升", "50-100"),
            ]
        return []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class _FakeConn:
    def cursor(self):
        return _FakeCursor()


def test_compare_order():
    data = build_category_compare(_FakeConn(), ["女装", "美妆护肤"])
    assert data["report_date"] == "2026-07-12"
    assert len(data["categories"]) == 2
    assert data["recommendation_order"][0] == "美妆护肤"


def test_timeline_ai_weekly():
    data = build_category_timeline(_FakeConn(), "美妆护肤", days=7)
    assert data["category"] == "美妆护肤"
    assert len(data["points"]) == 2
    assert "增速" in data["ai_weekly"]


if __name__ == "__main__":
    test_compare_order()
    test_timeline_ai_weekly()
    print("test_insight_q2 OK")
