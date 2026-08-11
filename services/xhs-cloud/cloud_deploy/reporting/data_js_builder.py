# -*- coding: utf-8
"""生成 data.js 与报告目录。"""
from __future__ import annotations

import json
import os
import shutil
from collections import Counter
from datetime import date, datetime, timedelta
from typing import Any

from cloud_deploy.reporting.constants import (
    DEFAULT_MIN_ACTUAL,
    DEFAULT_MIN_ACTUAL_VIRTUAL,
    DEFAULT_MIN_V1D,
    DEFAULT_MIN_V1D_VIRTUAL,
    FIELD_GUIDE,
    REPORT_COLUMNS,
    REPORT_DISCLAIMER,
    SELECTION_GUIDE,
    item_at,
)
from cloud_deploy.reporting.report_charts import build_charts_and_tops


def _agg(items: list) -> dict:
    physical = virtual = 0
    pool_map: Counter = Counter()
    for item in items:
        if item_at(item, "is_virtual") == 1:
            virtual += 1
        elif item_at(item, "is_virtual") == 0:
            physical += 1
        pool_map[item_at(item, "pool", "WATCH") or "WATCH"] += 1
    return {"physical_v1d": physical, "virtual_v1d": virtual, "pool_map": dict(pool_map)}


def build_report_payload(
    items: list,
    report_date: str,
    *,
    scope: str = "daily",
    scope_label: str = "",
    min_v1d=DEFAULT_MIN_V1D,
    min_actual=DEFAULT_MIN_ACTUAL,
    min_v1d_virtual=DEFAULT_MIN_V1D_VIRTUAL,
    min_actual_virtual=DEFAULT_MIN_ACTUAL_VIRTUAL,
    source: str = "cloud_gen_report",
    period_start: str = "",
    period_end: str = "",
    pool_stats: dict | None = None,
) -> dict[str, Any]:
    now = datetime.now()
    pool_stats = pool_stats or {}
    try:
        yesterday_date = (date.fromisoformat(report_date) - timedelta(days=1)).isoformat()
    except ValueError:
        yesterday_date = ""
    agg = _agg(items)
    prices = sorted([float(item_at(item, "price", 0) or 0) for item in items if float(item_at(item, "price", 0) or 0) > 0])
    median_price = round(prices[len(prices) // 2], 1) if prices else 0
    avg_price = round(sum(prices) / len(prices), 1) if prices else 0
    avg_v1d = round(sum(float(item_at(item, "v1d", 0) or 0) for item in items) / len(items), 1) if items else 0
    actual_values = [float(item_at(item, "actual_v1d", 0) or 0) for item in items if float(item_at(item, "actual_v1d", 0) or 0) > 0]
    avg_actual_v1d = round(sum(actual_values) / len(actual_values), 1) if actual_values else 0
    gr_values = [float(item_at(item, "actual_gr", 0) or 0) for item in items if float(item_at(item, "actual_gr", 0) or 0) > 0]
    avg_actual_gr = round(sum(gr_values) / len(gr_values), 2) if gr_values else 0
    vsr_values = [float(item_at(item, "actual_vsr", 0) or 0) for item in items if float(item_at(item, "actual_vsr", 0) or 0) > 0]
    avg_actual_vsr = round(sum(vsr_values) / len(vsr_values), 4) if vsr_values else 0
    est_gr_values = [float(item_at(item, "gr", 0) or 0) for item in items if float(item_at(item, "gr", 0) or 0) > 0]
    avg_gr = round(sum(est_gr_values) / len(est_gr_values), 2) if est_gr_values else 0
    vsr_est_values = [float(item_at(item, "vsr", 0) or 0) for item in items if float(item_at(item, "vsr", 0) or 0) > 0]
    avg_vsr = round(sum(vsr_est_values) / len(vsr_est_values), 4) if vsr_est_values else 0
    anomaly_count = sum(1 for item in items if int(item_at(item, "anomaly", 0) or 0) == 1)
    charts, top_keywords, top_stores = build_charts_and_tops(items)

    filter_label = scope_label or (
        f"实体 v1d>{min_v1d}/真实>={min_actual}；"
        f"虚拟 v1d>{min_v1d_virtual}/真实>={min_actual_virtual}"
    )

    meta = {
        "date": report_date,
        "scope": scope,
        "period_start": period_start or report_date,
        "period_end": period_end or report_date,
        "filter_mode": "v1d_or_actual_split",
        "filter_label": filter_label,
        "min_v1d": min_v1d,
        "min_actual": min_actual,
        "min_v1d_virtual": min_v1d_virtual,
        "min_actual_virtual": min_actual_virtual,
        "time": now.strftime("%Y-%m-%d %H:%M:%S"),
        "count": len(items),
        "physical_v1d": agg["physical_v1d"],
        "virtual_v1d": agg["virtual_v1d"],
        "avg_price": avg_price,
        "median_price": median_price,
        "avg_v1d": avg_v1d,
        "avg_actual_v1d": avg_actual_v1d,
        "avg_gr": avg_gr,
        "avg_actual_gr": avg_actual_gr,
        "avg_vsr": avg_vsr,
        "avg_actual_vsr": avg_actual_vsr,
        "anomaly_count": anomaly_count,
        "metric_mode": "cloud_pg",
        "metric_note": "云端 PG 自算；主数据源=premium_goods+premium_goods_daily（可叠加 report_daily_items）",
        "deduped": True,
        "source": source,
        "disclaimer": REPORT_DISCLAIMER,
        "pool_new": agg["pool_map"].get("NEW", 0),
        "pool_watch": agg["pool_map"].get("WATCH", 0),
        "pool_accel": agg["pool_map"].get("ACCEL", 0),
        "pool_burst": agg["pool_map"].get("BURST", 0),
        "active_goods": int(pool_stats.get("active_goods") or 0),
        "total_goods": int(pool_stats.get("total_goods") or 0),
        "premium_goods": int(pool_stats.get("premium_goods") or 0),
        "yesterday_date": yesterday_date,
        "method": "cloud_pg",
    }
    return {
        "meta": meta,
        "columns": REPORT_COLUMNS,
        "items": items,
        "charts": charts,
        "top_keywords": top_keywords,
        "top_stores": top_stores,
        "field_guide": FIELD_GUIDE,
        "selection_guide": SELECTION_GUIDE,
    }


REPORT_BUNDLE_FILES = (
    "index_with_gr.html",
    "index_vue.html",
    "report_theme.css",
    "report_theme.js",
)


def resolve_report_assets_dir() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets"))


def write_report_dir(
    output_dir: str,
    payload: dict,
    assets_dir: str = "",
) -> str:
    assets_dir = assets_dir or resolve_report_assets_dir()
    os.makedirs(output_dir, exist_ok=True)
    js_path = os.path.join(output_dir, "data.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("var REPORT_DATA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
        f.write(";\n")

    copied = []
    missing = []
    for name in REPORT_BUNDLE_FILES:
        src = os.path.join(assets_dir, name)
        dst = os.path.join(output_dir, name)
        if os.path.isfile(src):
            shutil.copy2(src, dst)
            copied.append(name)
        else:
            missing.append(name)

    if "index_with_gr.html" in missing and not os.path.isfile(os.path.join(output_dir, "index_with_gr.html")):
        with open(os.path.join(output_dir, "index_with_gr.html"), "w", encoding="utf-8") as f:
            f.write("<!DOCTYPE html><html><head><meta charset=utf-8><title>选品报告</title></head>"
                    "<body><p>请配置报告模板目录（cloud_deploy/assets）</p>"
                    "<script src=data.js></script></body></html>")

    readme = os.path.join(output_dir, "README.txt")
    disc = payload["meta"].get("disclaimer", "")
    if isinstance(disc, dict):
        disc = "\n".join(disc.get("lines") or [])
    with open(readme, "w", encoding="utf-8") as f:
        f.write(
            str(disc)
            + "\n解压后请右键 index_with_gr.html，选择「打开方式」→ Google Chrome 打开\n"
            + f"报告包文件: data.js, {', '.join(REPORT_BUNDLE_FILES)}\n"
            + "默认主题为「极光清新」，可在报告页右上角切换；亦支持经典深色。\n"
            + "（gen_report.py 为本地生成脚本，不包含在会员 zip 中）\n"
        )
    return output_dir


def resolve_output_dir(report_root: str, report_date: str, scope: str = "daily") -> str:
    d = report_date.replace("-", "")[4:]  # MMDD
    if scope == "daily":
        name = f"全量{d}"
    elif scope == "weekly":
        name = f"周报{d}"
    else:
        name = f"月报{report_date[:7].replace('-', '')}"
    return os.path.join(report_root, name)
