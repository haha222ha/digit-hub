# -*- coding: utf-8 -*-
"""Q3-5 notifications。"""
from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from cloud_deploy.cloud_api.insight_notifications import build_insight_notifications


class _FakeCursor:
    def execute(self, sql, params=None):
        self.last_sql = sql or ""
        self.last_params = params or ()

    def fetchone(self):
        sql = self.last_sql
        if "information_schema.tables" in sql:
            t = self.last_params[1] if len(self.last_params) > 1 else ""
            if t in ("member_insight_workflow", "daily_category_metrics", "member_insight_watchlist"):
                return (1,)
            return None
        if "MAX(report_date)" in sql:
            return ("2026-07-12",)
        if "daily_category_metrics" in sql and "growth_rate_pct" in sql:
            return (30.0, 80, 50, "上升")
        return None

    def fetchall(self):
        if "member_insight_workflow" in self.last_sql and "remind_at" in self.last_sql:
            return [(1, "美妆护肤", "2026-06-12", "stocked", "2026-07-10")]
        if "member_insight_watchlist" in self.last_sql:
            return [("美妆护肤",)]
        return []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class _FakeConn:
    def cursor(self):
        return _FakeCursor()


def test_notifications_mixed():
    data = build_insight_notifications(_FakeConn(), 42)
    assert data["count"] >= 1
    types = {it["type"] for it in data["items"]}
    assert "workflow_reminder" in types or "opportunity" in types


if __name__ == "__main__":
    test_notifications_mixed()
    print("test_insight_notifications OK")
