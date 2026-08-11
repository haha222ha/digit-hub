# -*- coding: utf-8 -*-
"""T2：health + workflow 纯函数。"""
from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from cloud_deploy.cloud_api.insight_health import compute_health_score


class _FakeCursor:
    def __init__(self, rows):
        self._rows = rows
        self._step = 0

    def execute(self, sql, params=None):
        self._step += 1

    def fetchone(self):
        if self._step == 1:
            return (1,)
        return None

    def fetchall(self):
        return self._rows

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class _FakeConn:
    def __init__(self, rows):
        self._rows = rows

    def cursor(self):
        return _FakeCursor(self._rows)


def test_health_score_basic():
    conn = _FakeConn([("view", 3, None), ("generate", 1, None)])
    data = compute_health_score(conn, 1)
    assert 0 <= data["score"] <= 100
    assert "band" in data


if __name__ == "__main__":
    test_health_score_basic()
    print("test_insight_t2 OK")
