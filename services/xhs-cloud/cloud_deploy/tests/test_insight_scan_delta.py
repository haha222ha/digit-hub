# -*- coding: utf-8 -*-
"""AI 观察池 scan_delta 数据源。"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest import mock

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from cloud_deploy.reporting.pg_reader import (
    fetch_items_for_insight,
    insight_min_delta,
    insight_scan_window_days,
)


def test_insight_min_delta_default():
    with mock.patch.dict(os.environ, {}, clear=False):
        os.environ.pop("INSIGHT_MIN_DELTA", None)
        assert insight_min_delta() == 1


def test_insight_min_delta_env():
    with mock.patch.dict(os.environ, {"INSIGHT_MIN_DELTA": "3"}):
        assert insight_min_delta() == 3


def test_insight_min_delta_invalid():
    with mock.patch.dict(os.environ, {"INSIGHT_MIN_DELTA": "x"}):
        assert insight_min_delta() == 1


def test_insight_scan_window_days_default():
    with mock.patch.dict(os.environ, {}, clear=False):
        os.environ.pop("INSIGHT_SCAN_WINDOW_DAYS", None)
        assert insight_scan_window_days() == 1


def test_insight_scan_window_days_env():
    with mock.patch.dict(os.environ, {"INSIGHT_SCAN_WINDOW_DAYS": "2"}):
        assert insight_scan_window_days() == 2


def test_fetch_items_for_insight_routes_scan_delta():
    conn = object()
    with mock.patch(
        "cloud_deploy.reporting.pg_reader.fetch_items_from_scan_delta",
        return_value=[["g1"]],
    ) as fn:
        out = fetch_items_for_insight(conn, "2026-07-12", source="scan_delta")
        assert out == [["g1"]]
        fn.assert_called_once_with(conn, "2026-07-12")


def test_fetch_items_for_insight_default_source():
    conn = object()
    with mock.patch.dict(os.environ, {"INSIGHT_PG_SOURCE": "scan_delta"}):
        with mock.patch(
            "cloud_deploy.reporting.pg_reader.fetch_items_from_scan_delta",
            return_value=[["g1"]],
        ) as fn:
            out = fetch_items_for_insight(conn, "2026-07-12")
            assert out == [["g1"]]
            fn.assert_called_once()


def test_fetch_items_for_insight_scan_delta_fallback_pg_items():
    conn = object()
    with mock.patch(
        "cloud_deploy.reporting.pg_reader.fetch_items_from_scan_delta",
        return_value=[],
    ) as fn_scan:
        with mock.patch(
            "cloud_deploy.reporting.pg_reader.fetch_items_from_daily_table",
            return_value=[["from_pg"]],
        ) as fn_pg:
            out = fetch_items_for_insight(conn, "2026-07-12", source="scan_delta")
            assert out == [["from_pg"]]
            fn_scan.assert_called_once()
            fn_pg.assert_called_once()


def test_fetch_items_for_insight_unknown():
    try:
        fetch_items_for_insight(object(), "2026-07-12", source="nope")
        assert False, "expected ValueError"
    except ValueError as e:
        assert "INSIGHT_PG_SOURCE" in str(e)


if __name__ == "__main__":
    test_insight_min_delta_default()
    test_insight_min_delta_env()
    test_insight_min_delta_invalid()
    test_insight_scan_window_days_default()
    test_insight_scan_window_days_env()
    test_fetch_items_for_insight_routes_scan_delta()
    test_fetch_items_for_insight_default_source()
    test_fetch_items_for_insight_scan_delta_fallback_pg_items()
    test_fetch_items_for_insight_unknown()
    print("test_insight_scan_delta OK")
