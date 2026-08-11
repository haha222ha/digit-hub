# -*- coding: utf-8 -*-
"""Q3：similar / watchlist recommend。"""
from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from cloud_deploy.cloud_api.insight_similar import build_similar_categories


class _FakeCursor:
    def execute(self, sql, params=None):
        self.last_sql = sql or ""
        self.last_params = params

    def fetchone(self):
        sql = self.last_sql
        params = self.last_params or ()
        if "information_schema.tables" in sql:
            if len(params) >= 2 and params[1] == "daily_category_metrics":
                return (1,)
            return None
        if "pg_extension" in sql:
            return None
        if "MAX(report_date)" in sql:
            return ("2026-07-12",)
        return None

    def fetchall(self):
        if "category <> %s" in self.last_sql and "daily_category_metrics" in self.last_sql:
            return [("女装",), ("潮玩玩具",)]
        return []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class _FakeConn:
    def cursor(self):
        return _FakeCursor()


def test_similar_peer_fallback():
    data = build_similar_categories(_FakeConn(), "美妆护肤", limit=3)
    assert data["category"] == "美妆护肤"
    assert len(data["items"]) >= 1
    assert data["source"] == "peer_metrics"


if __name__ == "__main__":
    test_similar_peer_fallback()
    print("test_insight_q3 OK")
