#!/usr/bin/env python3
"""Quick PG counts for report regeneration."""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
from cloud_deploy.scripts.bootstrap_env import bootstrap

bootstrap()
from cloud_deploy.cloud_api.database_pg import _conn, init_db

init_db()
conn = _conn()
cur = conn.cursor()
cur.execute("SET search_path TO xhs_monitor, public")

queries = [
    ("goods_sold_daily today", "SELECT COUNT(*) FROM goods_sold_daily WHERE snapshot_date=CURRENT_DATE"),
    ("goods_sold_daily yesterday", "SELECT COUNT(*) FROM goods_sold_daily WHERE snapshot_date=CURRENT_DATE-1"),
    ("goods_sold_daily total rows", "SELECT COUNT(*) FROM goods_sold_daily"),
    ("goods_sold_daily distinct goods", "SELECT COUNT(DISTINCT goods_id) FROM goods_sold_daily"),
    ("goods_sold_daily today distinct", "SELECT COUNT(DISTINCT goods_id) FROM goods_sold_daily WHERE snapshot_date=CURRENT_DATE"),
    (
        "sold_daily incr (delta>0)",
        """SELECT COUNT(*) FROM goods_sold_daily sd
           WHERE sd.snapshot_date=CURRENT_DATE AND COALESCE(sd.delta,0)>0""",
    ),
    (
        "sold_daily incr (sold vs prev)",
        """SELECT COUNT(*) FROM goods_sold_daily sd
           JOIN goods_sold_daily sp ON sp.goods_id=sd.goods_id AND sp.snapshot_date=CURRENT_DATE-1
           WHERE sd.snapshot_date=CURRENT_DATE AND sd.sold_num > sp.sold_num""",
    ),
    ("monitor_goods active", "SELECT COUNT(*) FROM monitor_goods WHERE monitor_status IN ('active','idle')"),
    ("premium_goods_daily today", "SELECT COUNT(*) FROM premium_goods_daily WHERE snap_date=CURRENT_DATE::text"),
    ("goods_sold_snapshots since yesterday", "SELECT COUNT(*) FROM goods_sold_snapshots WHERE snapshot_time>=CURRENT_DATE-1"),
    ("goods_sold_snapshots total", "SELECT COUNT(*) FROM goods_sold_snapshots"),
    ("report_daily_items today", "SELECT COUNT(*) FROM xhs_monitor.report_daily_items WHERE report_date=CURRENT_DATE"),
    ("report_daily_items total", "SELECT COUNT(*) FROM report_daily_items"),
    (
        "goods_metrics_daily today",
        "SELECT COUNT(*) FROM goods_metrics_daily WHERE metric_date=CURRENT_DATE",
    ),
    (
        "goods_metrics_daily today actual>0",
        "SELECT COUNT(*) FROM goods_metrics_daily WHERE metric_date=CURRENT_DATE AND COALESCE(actual_v1d,0)>0",
    ),
    (
        "sold_daily rows last 7d goods",
        "SELECT COUNT(DISTINCT goods_id) FROM goods_sold_daily WHERE snapshot_date >= CURRENT_DATE - 7",
    ),
    (
        "sold_daily delta>=1 today distinct",
        """SELECT COUNT(DISTINCT goods_id) FROM goods_sold_daily
           WHERE snapshot_date=CURRENT_DATE AND COALESCE(delta,0)>=1""",
    ),
    (
        "distinct snapshot goods 1d",
        "SELECT COUNT(DISTINCT goods_id) FROM goods_sold_snapshots WHERE snapshot_time >= CURRENT_DATE - 1",
    ),
]

for name, q in queries:
    try:
        cur.execute(q)
        print(f"{name}: {cur.fetchone()[0]}")
    except Exception as e:
        conn.rollback()
        print(f"{name}: ERR {e}")

conn.close()
