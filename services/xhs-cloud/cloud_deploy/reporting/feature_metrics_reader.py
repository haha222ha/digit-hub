# -*- coding: utf-8 -*-
"""
Feature Metrics Reader — 从 goods_feature_metrics 表读取 PG 预计算指标。

优先读取 PG 预计算数据；若表不存在或无数据，返回空列表（由调用方 fallback 到 Python 计算）。
对应需求文档 48 §P2（Feature Engine PG 改造）。

用法:
    from cloud_deploy.reporting.feature_metrics_reader import get_feature_metrics, get_top_growth

    metrics = get_feature_metrics("2026-07-14")
    top_growth = get_top_growth("2026-07-14", limit=50)
"""
from __future__ import annotations

from typing import Any


def _get_conn():
    """获取 PG 连接（READ COMMITTED）。

    优先使用 XHS_PREMIUM_DATABASE_URL (本地爬虫 PG)，fallback 到 XHS_DATABASE_URL。
    """
    import os
    import psycopg2

    db_url = os.environ.get("XHS_PREMIUM_DATABASE_URL") or os.environ.get("XHS_DATABASE_URL", "")
    if not db_url or not db_url.startswith("postgres"):
        from cloud_deploy.cloud_api.config import get_settings
        s = get_settings()
        db_url = s.xhs_database_url
    if not db_url or not db_url.startswith("postgres"):
        raise RuntimeError("未配置 XHS_PREMIUM_DATABASE_URL 或 XHS_DATABASE_URL")
    conn = psycopg2.connect(db_url)
    conn.set_session(isolation_level="READ COMMITTED")
    return conn


def get_feature_metrics(snap_date: str) -> list[dict[str, Any]]:
    """获取指定日期所有商品的预计算指标（delta >= 1）。

    返回 [{goods_id, snap_date, sold_num, delta, velocity_1d,
           growth_rate, acceleration, consecutive_days}, ...]
    """
    conn = None
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("SET search_path TO xhs_monitor, public")
        cur.execute(
            """
            SELECT goods_id, snap_date, sold_num, delta, velocity_1d,
                   growth_rate, acceleration, consecutive_days
            FROM goods_feature_metrics
            WHERE snap_date = %s
            ORDER BY growth_rate DESC
            """,
            (snap_date,),
        )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    except Exception:
        return []
    finally:
        if conn:
            conn.close()


def get_top_growth(snap_date: str, *, limit: int = 50) -> list[dict[str, Any]]:
    """获取增速 Top N。"""
    conn = None
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("SET search_path TO xhs_monitor, public")
        cur.execute(
            """
            SELECT goods_id, snap_date, sold_num, delta, velocity_1d,
                   growth_rate, acceleration, consecutive_days
            FROM goods_feature_metrics
            WHERE snap_date = %s AND growth_rate > 0
            ORDER BY growth_rate DESC
            LIMIT %s
            """,
            (snap_date, limit),
        )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    except Exception:
        return []
    finally:
        if conn:
            conn.close()


def get_top_acceleration(snap_date: str, *, limit: int = 50) -> list[dict[str, Any]]:
    """获取加速度 Top N（加速增长的商品）。"""
    conn = None
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("SET search_path TO xhs_monitor, public")
        cur.execute(
            """
            SELECT goods_id, snap_date, sold_num, delta, velocity_1d,
                   growth_rate, acceleration, consecutive_days
            FROM goods_feature_metrics
            WHERE snap_date = %s AND acceleration > 0
            ORDER BY acceleration DESC
            LIMIT %s
            """,
            (snap_date, limit),
        )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    except Exception:
        return []
    finally:
        if conn:
            conn.close()


def get_top_consecutive(snap_date: str, *, limit: int = 50, min_days: int = 3) -> list[dict[str, Any]]:
    """获取连续上榜 Top N。"""
    conn = None
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("SET search_path TO xhs_monitor, public")
        cur.execute(
            """
            SELECT goods_id, snap_date, sold_num, delta, velocity_1d,
                   growth_rate, acceleration, consecutive_days
            FROM goods_feature_metrics
            WHERE snap_date = %s AND consecutive_days >= %s
            ORDER BY consecutive_days DESC
            LIMIT %s
            """,
            (snap_date, min_days, limit),
        )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    except Exception:
        return []
    finally:
        if conn:
            conn.close()


def get_metrics_by_goods(goods_ids: list[str], snap_date: str) -> dict[str, dict[str, Any]]:
    """批量获取指定商品的指标，返回 {goods_id: metrics_dict}。"""
    if not goods_ids:
        return {}
    conn = None
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("SET search_path TO xhs_monitor, public")
        cur.execute(
            """
            SELECT goods_id, snap_date, sold_num, delta, velocity_1d,
                   growth_rate, acceleration, consecutive_days
            FROM goods_feature_metrics
            WHERE snap_date = %s AND goods_id = ANY(%s)
            """,
            (snap_date, list(goods_ids)),
        )
        cols = [d[0] for d in cur.description]
        return {row[0]: dict(zip(cols, row)) for row in cur.fetchall()}
    except Exception:
        return {}
    finally:
        if conn:
            conn.close()
