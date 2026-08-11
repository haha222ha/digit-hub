# -*- coding: utf-8 -*-
"""
数据保留策略（对标成熟选品数据平台）。

分层：
  L1 永久 — report_daily_items / goods_sold_daily / goods_metrics_daily / report_archives
            年度选品、同比环比的主数据源，永不自动删除。
  L2 可配置 — goods_sold_snapshots（日内扫描轨迹）
            XHS_SNAPSHOT_RETENTION_DAYS=0  → 永久保留（默认，推荐）
            XHS_SNAPSHOT_RETENTION_DAYS>0  → 仅删超窗快照，日汇总已在 L1 固化

环境变量：
  XHS_SNAPSHOT_RETENTION_DAYS  默认 0（不删）；90 表示仅保留近 90 天快照
  XHS_ENABLE_SNAPSHOT_PRUNE    1/0，显式开关定时清理（默认随 retention 自动）
"""
from __future__ import annotations

import os


def snapshot_retention_days() -> int:
    """0 = 永久保留快照；>0 = 滚动窗口天数。"""
    return int(os.environ.get("XHS_SNAPSHOT_RETENTION_DAYS", "0"))


def snapshot_prune_enabled() -> bool:
    if not snapshot_retention_days():
        return False
    flag = os.environ.get("XHS_ENABLE_SNAPSHOT_PRUNE", "auto").strip().lower()
    if flag in ("0", "false", "no", "off"):
        return False
    if flag in ("1", "true", "yes", "on"):
        return True
    return snapshot_retention_days() > 0


def retention_policy_summary() -> dict:
    days = snapshot_retention_days()
    return {
        "snapshot_retention_days": days,
        "snapshot_prune_enabled": snapshot_prune_enabled(),
        "snapshot_policy": "forever" if days <= 0 else f"rolling_{days}d",
        "daily_report_items": "forever",
        "goods_sold_daily": "forever",
        "report_archives": "forever",
    }
