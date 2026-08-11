# -*- coding: utf-8 -*-
"""从全量选品报告或 PG 生成「免费体验包」：三层漏斗 + 综合分，虚拟/实体分轨，总量≤3000。"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import zipfile
from datetime import datetime
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from cloud_deploy.scripts.bootstrap_env import bootstrap

bootstrap()

from cloud_deploy.reporting.constants import item_at
from cloud_deploy.reporting.data_js_builder import build_report_payload, resolve_report_assets_dir
from cloud_deploy.reporting.report_charts import build_charts_and_tops

MAX_ITEMS = 3000
MAX_PER_TRACK = 1500
TIER_ORDER = ("S", "A", "B", "C")
TIER_S_BURST = 25.0
TIER_A_ACTUAL = 5.0
TIER_A_SOLD = 100
TIER_B_FSR = 0.05
TIER_B_ACTUAL = 3.0

TRIAL_UPSELL = {
    "custom_keyword_member_price": 9.9,
    "custom_keyword_guest_price": 29.9,
    "custom_keyword_unit": "次",
    "pc_client_paid_only": True,
    "contact_hint": "开通会员后在 PC 端「使用说明」提交定制词库需求，或联系会员客服",
}

TRIAL_DISCLAIMER = {
    "title": "免费体验包 · 合规使用须知",
    "version": "2026-07",
    "lines": [
        "本体验包为基于公开页面信息与系统计算的选品数据样本，仅供研究参考，不构成投资建议或收益承诺。",
        "体验包限量展示，数据存在延迟与误差；「24h加购指数」为系统按扫描间隔推算的参考指标，非平台官方加购数。",
        "免费用户可通过网页预览/下载本体验包；完整日报/周报/月报及 PC 端选品分析工具仅向付费会员开放。",
        "禁止将本包数据批量转售、公开传播或用于侵权抄款、虚假宣传等违法违规用途。",
        "继续使用即视为已阅读并理解上述条款。",
    ],
}

TRIAL_SELECTION_GUIDE = {
    "title": "体验包选品指引（高转化版）",
    "principle": "三层榜单：加购加速 → 真实热卖 → 低粉高销；虚拟/实体分轨对比。",
    "workflow": [
        {"step": "1", "name": "选榜单", "text": "顶部切换「加购加速 / 真实热卖 / 低粉高销 / 综合精选」四大榜。"},
        {"step": "2", "name": "选赛道", "text": "左侧切换「虚拟 / 实体」；虚拟交付轻，实体需供应链。"},
        {"step": "3", "name": "看加购", "text": "加购加速榜优先 acc>0 或爆发分≥25 的短周期意向商品。"},
        {"step": "4", "name": "验动销", "text": "真实热卖榜：真实增量≥5 且销量≥100；低粉高销榜：粉销比≤0.05。"},
        {"step": "5", "name": "要完整", "text": "体验包为精选样本；开通会员获取每日全量报告 + PC 监控工具。"},
    ],
    "upsell": [
        "会员定制词库：¥9.9/次（定向分析，稳定产出）",
        "非会员定制词库：¥29.9/次",
        "PC 选品分析工具：仅付费会员可用",
    ],
}


def load_report_data(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read().strip()
    if raw.startswith("var REPORT_DATA"):
        raw = raw.split("=", 1)[1].strip()
        if raw.endswith(";"):
            raw = raw[:-1]
    return json.loads(raw)


def recompute_acc(row: list) -> float:
    acc = float(item_at(row, "acc", 0) or 0)
    if acc > 0:
        return acc
    v1h = float(item_at(row, "v1h", 0) or 0)
    v6h = float(item_at(row, "v6h", 0) or 0)
    if v1h > 0 and v6h > 0:
        return max(0.0, v1h * 24.0 - v6h * 4.0)
    if v1h > 0:
        return v1h * 24.0
    return 0.0


def field_complete(row: list) -> bool:
    gid = str(item_at(row, "goods_id", "") or "").strip()
    title = str(item_at(row, "title", "") or "").strip()
    sold = float(item_at(row, "sold", 0) or 0)
    return bool(gid) and bool(title) and sold > 0


def classify_tier(row: list, acc: float) -> str:
    burst = float(item_at(row, "burst", 0) or 0)
    actual = float(item_at(row, "actual_v1d", 0) or 0)
    sold = float(item_at(row, "sold", 0) or 0)
    fsr = float(item_at(row, "goods_fsr", 0) or 0)
    if acc > 0 or burst >= TIER_S_BURST:
        return "S"
    if actual >= TIER_A_ACTUAL and sold >= TIER_A_SOLD:
        return "A"
    if fsr > 0 and fsr <= TIER_B_FSR and actual >= TIER_B_ACTUAL:
        return "B"
    return "C"


def trial_score(row: list, acc: float) -> float:
    actual = float(item_at(row, "actual_v1d", 0) or 0)
    burst = float(item_at(row, "burst", 0) or 0)
    gr = float(item_at(row, "actual_gr", 0) or 0)
    sold = float(item_at(row, "sold", 0) or 0)
    fsr = float(item_at(row, "goods_fsr", 0) or 0)
    low_fan = max(0.0, min(1.0, (TIER_B_FSR - fsr) / TIER_B_FSR)) if fsr > 0 else 0.0
    return (
        min(acc / 100.0, 1.0) * 0.30
        + min(actual / 50.0, 1.0) * 0.28
        + min(burst / 50.0, 1.0) * 0.18
        + min(gr, 1.0) * 0.12
        + min(sold / 1000.0, 1.0) * 0.07
        + low_fan * 0.05
    )


def _select_track(rows: list, limit: int) -> tuple[list, dict[str, int]]:
    """按 S→A→B→C 漏斗选取，同层按 trial_score 降序。"""
    buckets: dict[str, list[tuple[float, list]]] = {t: [] for t in TIER_ORDER}
    for row in rows:
        acc = recompute_acc(row)
        tier = classify_tier(row, acc)
        buckets[tier].append((trial_score(row, acc), row))
    picked: list = []
    tier_counts: dict[str, int] = {t: 0 for t in TIER_ORDER}
    seen: set[str] = set()
    for tier in TIER_ORDER:
        if len(picked) >= limit:
            break
        candidates = sorted(buckets[tier], key=lambda x: (-x[0], -float(item_at(x[1], "actual_v1d", 0) or 0)))
        for _score, row in candidates:
            gid = str(item_at(row, "goods_id", "") or "")
            if gid in seen:
                continue
            seen.add(gid)
            picked.append(row)
            tier_counts[tier] += 1
            if len(picked) >= limit:
                break
    return picked, tier_counts


def filter_trial_items(items: list) -> tuple[list, list, list, dict[str, Any], dict[str, str]]:
    complete = [row for row in items if field_complete(row)]
    virtual_src = [r for r in complete if int(item_at(r, "is_virtual", 0) or 0) == 1]
    physical_src = [r for r in complete if int(item_at(r, "is_virtual", 0) or 0) != 1]

    virtual, v_tiers = _select_track(virtual_src, MAX_PER_TRACK)
    physical, p_tiers = _select_track(physical_src, MAX_PER_TRACK)
    merged = virtual + physical
    if len(merged) > MAX_ITEMS:
        merged = merged[:MAX_ITEMS]

    tier_map: dict[str, str] = {}
    tier_totals = {t: 0 for t in TIER_ORDER}
    for row in merged:
        acc = recompute_acc(row)
        tier = classify_tier(row, acc)
        gid = str(item_at(row, "goods_id", "") or "")
        tier_map[gid] = tier
        tier_totals[tier] += 1

    stats = {
        "source_total": len(items),
        "source_complete": len(complete),
        "virtual_source": len(virtual_src),
        "physical_source": len(physical_src),
        "tier_counts": tier_totals,
        "virtual_tier_counts": v_tiers,
        "physical_tier_counts": p_tiers,
    }
    return merged, virtual, physical, stats, tier_map


def fetch_items_from_pg(report_date: str, source: str = "auto") -> list:
    from cloud_deploy.cloud_api.config import get_settings
    from cloud_deploy.cloud_api.database_pg import _conn, init_db
    from cloud_deploy.reporting.pg_reader import (
        fetch_items_auto,
        fetch_items_from_daily_table,
    )

    s = get_settings()
    if not s.xhs_database_url.startswith("postgres"):
        raise RuntimeError("--from-pg 需要配置 XHS_DATABASE_URL")
    init_db()
    conn = _conn()
    try:
        if source == "pg_items":
            return fetch_items_from_daily_table(conn, report_date, reconcile_sold=True)
        return fetch_items_auto(conn, report_date)
    finally:
        conn.close()


def build_trial_payload(source_items: list, report_date: str, source_meta: dict | None = None) -> dict:
    items, virtual_rows, physical_rows, stats, tier_map = filter_trial_items(source_items)
    if not items:
        raise RuntimeError("无可用商品，请换一份更新的全量报告或检查 PG 数据")
    full_count = stats["source_total"]
    payload = build_report_payload(
        items,
        report_date,
        scope="trial",
        scope_label=(
            f"体验包 v2：S/A/B/C 三层漏斗；虚拟{len(virtual_rows)}+实体{len(physical_rows)}；"
            f"源{full_count}→样本{len(items)}；上限{MAX_ITEMS}"
        ),
        source="trial_experience_pack_v2",
    )
    meta = payload["meta"]
    meta["pack_type"] = "trial_experience"
    meta["pack_version"] = "v2"
    meta["trial"] = True
    meta["max_items"] = MAX_ITEMS
    meta["virtual_count"] = len(virtual_rows)
    meta["physical_count"] = len(physical_rows)
    meta["source_total"] = full_count
    meta["source_complete"] = stats["source_complete"]
    meta["tier_counts"] = stats["tier_counts"]
    meta["virtual_tier_counts"] = stats["virtual_tier_counts"]
    meta["physical_tier_counts"] = stats["physical_tier_counts"]
    meta["trial_tiers"] = tier_map
    meta["disclaimer"] = TRIAL_DISCLAIMER
    meta["upsell"] = TRIAL_UPSELL
    meta["title"] = "选品报告 · 免费体验包"
    meta["subtitle"] = "加购加速 · 真实热卖 · 低粉高销 · 虚拟/实体分轨"
    if source_meta:
        meta["full_report_count"] = source_meta.get("count") or full_count
    charts, top_keywords, top_stores = build_charts_and_tops(items)
    payload["charts"] = charts
    payload["top_keywords"] = top_keywords
    payload["top_stores"] = top_stores
    payload["selection_guide"] = TRIAL_SELECTION_GUIDE
    acc_guide = {
        "field": "24h加购指数",
        "key": "acc",
        "formula": "v1h×24 − v6h×4（双速度有效时）",
        "desc": "反映近 24 小时购买意向强度的参考指数，越高表示短周期加购/动销越活跃。",
        "reference": "加购加速榜(S) 优先 acc>0 或爆发分≥25；请配合真实增量交叉验证。",
    }
    guides = list(payload.get("field_guide") or [])
    if not any(g.get("key") == "acc" for g in guides):
        guides.insert(8, acc_guide)
    payload["field_guide"] = guides
    return payload


def write_trial_dir(output_dir: str, payload: dict, assets_dir: str) -> None:
    os.makedirs(output_dir, exist_ok=True)
    for stale in ("index_trial.html", "index_with_gr.html"):
        path = os.path.join(output_dir, stale)
        if os.path.isfile(path):
            os.remove(path)
    js_path = os.path.join(output_dir, "data.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("var REPORT_DATA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
        f.write(";\n")
    bundle = (
        "trial_preview.html",
        "index_trial_gr.html",
        "index_vue.html",
        "trial_theme.css",
        "trial_gr_theme.css",
        "report_theme.js",
        "report_theme.css",
    )
    for name in bundle:
        src = os.path.join(assets_dir, name)
        if os.path.isfile(src):
            shutil.copy2(src, os.path.join(output_dir, name))
    readme = os.path.join(output_dir, "README.txt")
    meta = payload["meta"]
    with open(readme, "w", encoding="utf-8") as f:
        f.write(
            "选品报告 · 免费体验包 v2\n"
            f"生成时间：{datetime.now():%Y-%m-%d %H:%M:%S}\n"
            f"商品数：{meta.get('count', 0)}（源 {meta.get('source_total', '?')} → 样本，上限 {MAX_ITEMS}）\n"
            f"分层 S/A/B/C：{meta.get('tier_counts')}\n"
            "打开 index_trial_gr.html 或 trial_preview.html（默认表格 GR 明亮主题，可切换 Vue）。\n"
            "完整功能与 PC 端工具需开通付费会员。\n"
        )


def zip_dir(src_dir: str, zip_path: str) -> None:
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _dirs, files in os.walk(src_dir):
            for name in files:
                full = os.path.join(root, name)
                arc = os.path.relpath(full, src_dir).replace("\\", "/")
                zf.write(full, arc)


def main() -> int:
    parser = argparse.ArgumentParser(description="生成选品免费体验包 v2")
    parser.add_argument(
        "--source",
        default=os.path.join(ROOT, "server_sync_pack", "historical_reports", "全量0619", "data.js"),
        help="源全量报告 data.js（非 --from-pg 时使用）",
    )
    parser.add_argument(
        "--output-dir",
        default=os.path.join(ROOT, "cloud_deploy", "assets", "trial_experience"),
    )
    parser.add_argument("--date", default="", help="报告日期 YYYY-MM-DD")
    parser.add_argument("--from-pg", action="store_true", help="从 PG 读取最新日报数据")
    parser.add_argument(
        "--pg-source",
        default="auto",
        choices=("auto", "pg_items"),
        help="PG 数据源：auto=精品+监控增量，pg_items=report_daily_items",
    )
    args = parser.parse_args()

    source_meta: dict | None = None
    if args.from_pg:
        report_date = (args.date or datetime.now().strftime("%Y-%m-%d"))[:10]
        source_items = fetch_items_from_pg(report_date, args.pg_source)
        print(f"PG {args.pg_source} {report_date}: {len(source_items)} 行")
    else:
        if not os.path.isfile(args.source):
            print(f"源文件不存在: {args.source}", file=sys.stderr)
            return 1
        source = load_report_data(args.source)
        source_meta = source.get("meta") or {}
        source_items = source.get("items") or []
        report_date = (args.date or source_meta.get("date") or datetime.now().strftime("%Y-%m-%d"))[:10]

    payload = build_trial_payload(source_items, report_date, source_meta)
    assets_dir = resolve_report_assets_dir()
    write_trial_dir(args.output_dir, payload, assets_dir)
    zip_path = args.output_dir.rstrip("/\\") + ".zip"
    zip_dir(args.output_dir, zip_path)
    meta = payload["meta"]
    print(f"OK 体验包 v2 已生成: {args.output_dir}")
    print(
        f"   商品 {meta.get('count')}（虚拟 {meta.get('virtual_count')} / 实体 {meta.get('physical_count')}）"
        f" 源 {meta.get('source_total')} → 样本"
    )
    print(f"   分层 S/A/B/C: {meta.get('tier_counts')}")
    print(f"   ZIP: {zip_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
