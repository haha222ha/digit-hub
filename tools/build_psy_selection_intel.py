# -*- coding: utf-8 -*-
"""从热库全量增量生成心象测超管「测评选品报告」精简快照。

用法:
  python tools/build_psy_selection_intel.py
  python tools/build_psy_selection_intel.py --day 0816
"""
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOTLIB_ROOT = Path(r"D:\选品报告\热库全量增量")
OUT_DIR = ROOT / "packages" / "psy-dist" / "selection-intel"
ASSETS_DIR = (
    ROOT
    / "services"
    / "xhs-cloud"
    / "cloud_deploy"
    / "assets"
    / "psy-dist"
    / "selection-intel"
)
PSY_TESTS = ROOT / "apps" / "psy-dist" / "tests"

BUCKET_WEIGHT = {
    "priority": 120,
    "burst": 95,
    "climb": 70,
    "blue": 55,
    "streak15": 50,
    "streak7": 42,
    "streak5": 32,
    "streak3": 22,
    "stable": 12,
    "watch": 5,
    "decline": 0,
}

# (name, keywords, psy_code|None, premium_fit, suggest_price_band)
PACKS: list[tuple[str, list[str], str | None, str, str]] = [
    ("SCL-90完整90题", ["SCL-90", "SCL90", "症状自评", "90题", "scl90"], "scl90", "avoid", "仅文字·合规包装"),
    ("抑郁焦虑筛查包装", ["抑郁测试", "焦虑测试", "抑郁焦虑"], None, "avoid", "不做视频旗舰"),
    ("MBTI十六型人格", ["MBTI", "16人格", "16型人格", "十六型", "mbti"], "mbti", "mid", "¥29–59"),
    ("七宗罪/危险人格", ["七宗罪", "危险人格", "七美德"], None, "mid", "¥29–59"),
    ("恋爱人格/恋爱脑/心软", ["恋爱人格", "恋爱脑", "恋爱心软", "心软测试"], "lxrx", "high", "¥39–99"),
    ("心理年龄", ["心理年龄"], "xlnl2", "mid", "¥29–59"),
    ("吸渣体质", ["吸渣"], "xzzt", "high", "¥39–79"),
    ("原生家庭", ["原生家庭"], "ysjt", "high", "¥39–99"),
    ("精神内耗/职场内耗", ["精神内耗", "职场内耗", "内耗测试", "内耗检测"], "ydnh", "high", "¥39–79"),
    ("职业倦怠", ["职业倦怠", "倦怠测试"], "zyjd", "high", "¥39–79"),
    ("依恋类型", ["依恋类型", "依恋测试"], "yllx", "high", "¥49–99"),
    ("情感安全感", ["情感安全感", "安全感缺失", "安全感测试"], "qgaq", "high", "¥49–99"),
    ("高敏感", ["高敏感"], "gmgt", "mid", "¥29–59"),
    ("霍兰德职业兴趣", ["霍兰德", "职业兴趣"], "holland", "mid", "¥29–59"),
    ("暧昧段位/暧昧拉扯", ["暧昧段位", "暧昧拉扯", "暧昧测试"], "amdw", "high", "¥39–99"),
    ("被爱体质/桃花体质", ["被爱体质", "桃花体质"], "batz", "high", "¥39–79"),
    ("脱单/母单", ["母单", "脱单难度", "脱单卡点"], "mdnd", "mid", "¥29–59"),
    ("职场PUA/讨好型", ["职场PUA", "讨好型人格", "讨好型"], "zcpua", "mid", "¥39–69"),
    ("松弛感", ["松弛感"], "scgz", "mid", "¥29–59"),
    ("奶茶/咖啡人格趣味", ["奶茶人格", "咖啡人格"], "ncrg", "low", "¥1.99 引流"),
    ("正缘/真心", ["正缘", "真心程度", "对方真心"], "zytz", "high", "¥39–79"),
    ("该不该复合", ["该不该复合", "复合测试"], "gbfh", "high", "¥39–79"),
    ("分手自愈/前任执念", ["分手自愈", "前任执念"], "fszy", "high", "¥39–79"),
    ("35岁危机", ["35岁危机", "35岁"], "wl35", "mid", "¥39–69"),
]


def _find_day_dir(day: str | None) -> Path:
    if not HOTLIB_ROOT.is_dir():
        raise SystemExit(f"找不到热库目录: {HOTLIB_ROOT}")
    if day:
        day = day.strip().lstrip("全量")
        cand = HOTLIB_ROOT / f"全量{day}"
        if not cand.is_dir():
            raise SystemExit(f"找不到日目录: {cand}")
        return cand
    dirs = sorted(
        [p for p in HOTLIB_ROOT.iterdir() if p.is_dir() and p.name.startswith("全量")],
        key=lambda p: p.name,
    )
    if not dirs:
        raise SystemExit("热库下没有 全量MMDD 目录")
    return dirs[-1]


def _load_advice(day_dir: Path) -> dict:
    path = day_dir / "advice_data.js"
    if not path.exists():
        raise SystemExit(f"缺少 advice_data.js: {path}")
    text = path.read_text(encoding="utf-8", errors="replace")
    i = text.find("{")
    if i < 0:
        raise SystemExit("advice_data.js 无法解析")
    return json.loads(text[i:].rstrip().rstrip(";"))


def _report_date_from_dir(day_dir: Path) -> str:
    m = re.search(r"全量(\d{4})", day_dir.name)
    if not m:
        return day_dir.name
    mmdd = m.group(1)
    year = datetime.now().year
    return f"{year}-{mmdd[:2]}-{mmdd[2:]}"


def _psy_codes() -> set[str]:
    if not PSY_TESTS.is_dir():
        return set()
    return {p.name for p in PSY_TESTS.iterdir() if p.is_dir()}


def build(day: str | None = None) -> dict:
    day_dir = _find_day_dir(day)
    adv = _load_advice(day_dir)
    items = adv.get("items") or []
    buckets = adv.get("buckets") or {}
    gid_buckets: dict[str, set[str]] = defaultdict(set)
    for bname, ids in buckets.items():
        for gid in ids or []:
            gid_buckets[str(gid)].add(str(bname))

    psy = _psy_codes()
    themes: list[dict] = []
    top_pool: list[dict] = []
    assess_hit_ids: set[str] = set()

    for name, keys, psy_code, premium_fit, price_band in PACKS:
        hits: list[dict] = []
        for it in items:
            title = str(it.get("title") or "")
            if not title:
                continue
            tl = title.lower()
            if not any(k.lower() in tl for k in keys):
                continue
            gid = str(it.get("goods_id") or "")
            bs = gid_buckets.get(gid) or set()
            best, bestw = "market", 0
            for b in bs:
                w = BUCKET_WEIGHT.get(b, 0)
                if w > bestw:
                    best, bestw = b, w
            # pool string fallback
            pool = str(it.get("pool") or "").lower()
            if best == "market" and pool:
                best = pool if pool in BUCKET_WEIGHT else best
                bestw = BUCKET_WEIGHT.get(best, 0)
            delta = float(it.get("delta") or it.get("sold_delta") or 0)
            gr = float(it.get("actual_gr") or it.get("gr") or 0)
            price = it.get("price")
            try:
                price_f = float(price) if price is not None else None
            except (TypeError, ValueError):
                price_f = None
            row = {
                "goods_id": gid,
                "title": title[:120],
                "price": price_f,
                "sold": it.get("sold"),
                "delta": delta,
                "gr": gr,
                "pool": str(it.get("pool") or best),
                "bucket": best,
                "bw": bestw,
                "advice_score": it.get("advice_score"),
                "theme": name,
            }
            hits.append(row)
            assess_hit_ids.add(gid)

        hits.sort(key=lambda x: (x["bw"], x["delta"], x["gr"]), reverse=True)
        urgency = 0.0
        for h in hits[:15]:
            urgency += h["bw"] + min(40.0, h["delta"] * 0.15) + min(20.0, h["gr"])
        has_pack = bool(psy_code and psy_code in psy)
        if has_pack:
            urgency += 25  # 已有题包 → 优先做高价升级，不降权
        if any(h["bucket"] in ("climb", "burst", "priority") for h in hits[:10]):
            urgency += 35
        if premium_fit == "avoid":
            urgency *= 0.5

        prices = [h["price"] for h in hits if isinstance(h["price"], (int, float))]
        avg_price = round(sum(prices) / len(prices), 2) if prices else None
        sum_delta = round(sum(h["delta"] for h in hits), 1)
        max_delta = round(max((h["delta"] for h in hits), default=0), 1)
        bucket_counts: dict[str, int] = defaultdict(int)
        for h in hits:
            bucket_counts[h["bucket"]] += 1

        theme = {
            "name": name,
            "keywords": keys,
            "psy_code": psy_code or "",
            "hit_count": len(hits),
            "sum_delta": sum_delta,
            "avg_price": avg_price,
            "max_delta": max_delta,
            "buckets": dict(bucket_counts),
            "urgency_score": round(urgency, 1),
            "has_psy_pack": has_pack,
            "premium_fit": premium_fit,
            "suggest_price_band": price_band,
            "top": hits[:5],
        }
        themes.append(theme)
        for h in hits[:8]:
            top_pool.append(h)

    themes.sort(key=lambda t: t["urgency_score"], reverse=True)
    top_pool.sort(key=lambda x: (x["bw"], x["delta"]), reverse=True)
    # dedupe top items by goods_id
    seen: set[str] = set()
    top_items: list[dict] = []
    for h in top_pool:
        gid = h["goods_id"]
        if not gid or gid in seen:
            continue
        seen.add(gid)
        top_items.append(
            {
                "goods_id": gid,
                "title": h["title"],
                "price": h["price"],
                "sold": h["sold"],
                "delta": h["delta"],
                "pool": h["pool"],
                "advice_score": h["advice_score"],
                "theme": h["theme"],
            }
        )
        if len(top_items) >= 80:
            break

    premium_shortlist = [
        {
            "name": t["name"],
            "psy_code": t["psy_code"],
            "urgency_score": t["urgency_score"],
            "hit_count": t["hit_count"],
            "avg_price": t["avg_price"],
            "max_delta": t["max_delta"],
            "has_psy_pack": t["has_psy_pack"],
            "suggest_price_band": t["suggest_price_band"],
            "premium_fit": t["premium_fit"],
        }
        for t in themes
        if t["premium_fit"] == "high" and t["hit_count"] > 0
    ][:12]

    report_date = _report_date_from_dir(day_dir)
    payload = {
        "meta": {
            "report_date": report_date,
            "source_dir": str(day_dir),
            "source_name": day_dir.name,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "advice_total": int((adv.get("meta") or {}).get("total") or len(items)),
            "assess_hit_count": len(assess_hit_ids),
            "theme_count": len(themes),
        },
        "themes": themes,
        "top_items": top_items,
        "premium_shortlist": premium_shortlist,
    }
    return payload


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", default=None, help="MMDD，如 0816；默认最新全量日")
    args = ap.parse_args()
    payload = build(args.day)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    latest = OUT_DIR / "latest.json"
    latest.write_text(text, encoding="utf-8")
    (ASSETS_DIR / "latest.json").write_text(text, encoding="utf-8")
    # also stamp by date
    stamp = OUT_DIR / f"{payload['meta']['report_date'].replace('-', '')}.json"
    stamp.write_text(text, encoding="utf-8")
    meta = payload["meta"]
    print(
        f"OK {meta['source_name']} date={meta['report_date']} "
        f"themes={meta['theme_count']} hits={meta['assess_hit_count']} "
        f"premium={len(payload['premium_shortlist'])} -> {latest}"
    )


if __name__ == "__main__":
    main()
