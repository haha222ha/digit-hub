# -*- coding: utf-8 -*-
"""从热库全量增量生成心象测超管「测评选品报告」精简快照。

覆盖策略：
  1) 固化选题包（与我们题库对齐）→ themes
  2) 测评门禁扫全量 advice → 噪声排除 → 未归类自动聚类 → discovered_themes
  3) 分层短名单：high / mid / avoid / discover

用法:
  python tools/build_psy_selection_intel.py
  python tools/build_psy_selection_intel.py --day 0816
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
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
CATALOG = ROOT / "packages" / "psy-dist" / "tests-catalog.json"

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

# 宽门禁：标题像「测评/人格/心理…」才进池
ASSESS_GATE = re.compile(
    r"(测试|测评|测验|量表|人格|心理|MBTI|SCL|霍兰德|依恋|内耗|倦怠|"
    r"安全感|高敏感|原生家庭|暧昧|恋爱脑|吸渣|脱单|母单|正缘|复合|"
    r"分手|七宗罪|危险人格|松弛感|讨好型|PUA|心理年龄|症状自评|"
    r"暗恋|九型|黑暗三角|动物塑|天赋|腹黑|山海经|心软)",
    re.I,
)

# 噪声：试卷/校招笔试/实物周边/外教课等，不算我们的测评选品
NOISE = re.compile(
    r"(单元测试|期末测试|期中|试卷|试题|题库|笔试|校招|社招|实习|"
    r"毕马威|德勤|普华|安永|北森|华为|百度|腾讯|平安测评|"
    r"普通话|幼升小|幼小衔接|新概念|人教版|沪粤版|"
    r"第五人格|动漫周边|实物|包邮|外教课|绘本|"
    r"软件测试|入职测评|综合素质测评|人才测评|网申|"
    r"漫画|台版|纸质书|直播课)",
    re.I,
)

# (name, keywords, psy_code|None, premium_fit, suggest_price_band)
# premium_fit: high=音视频旗舰候选 / mid=可做标准品 / low=引流 / avoid=合规回避
PACKS: list[tuple[str, list[str], str | None, str, str]] = [
    ("SCL-90完整90题", ["SCL-90", "SCL90", "症状自评", "90题", "scl90"], "scl90", "avoid", "仅文字·合规包装"),
    ("抑郁焦虑筛查包装", ["抑郁测试", "焦虑测试", "抑郁焦虑", "双相情感"], None, "avoid", "不做视频旗舰"),
    ("童年创伤", ["童年创伤"], "tncs", "avoid", "合规包装·慎做旗舰"),
    ("MBTI十六型人格", ["MBTI", "16人格", "16型人格", "十六型", "mbti", "MBT测试"], "mbti", "mid", "¥29–59"),
    ("新16人格/心智阶位", ["心智阶位", "新16人格", "16rg"], "16rg2", "mid", "¥29–59"),
    ("七宗罪/危险人格", ["七宗罪", "危险人格", "七美德", "暗面人格"], "7v7", "mid", "¥29–59"),
    ("黑暗三角人格", ["黑暗三角", "马基雅维利"], "dt", "mid", "¥29–59"),
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
    ("暧昧段位/暧昧拉扯", ["暧昧段位", "暧昧拉扯", "暧昧测试", "暧昧期"], "amdw", "high", "¥39–99"),
    ("暗恋指数", ["暗恋测试", "暗恋·", "暗恋指数", "他有多喜欢你"], "taxh", "high", "¥39–79"),
    ("被爱体质/桃花体质", ["被爱体质", "桃花体质"], "batz", "high", "¥39–79"),
    ("脱单/母单", ["母单", "脱单难度", "脱单卡点"], "mdnd", "mid", "¥29–59"),
    ("职场PUA/讨好型", ["职场PUA", "讨好型人格", "讨好型"], "zcpua", "mid", "¥39–69"),
    ("松弛感", ["松弛感"], "scgz", "mid", "¥29–59"),
    ("奶茶/咖啡人格趣味", ["奶茶人格", "咖啡人格"], "ncrg", "low", "¥1.99 引流"),
    ("正缘/真心", ["正缘", "真心程度", "对方真心"], "zytz", "high", "¥39–79"),
    ("该不该复合", ["该不该复合", "复合测试", "分手复合"], "gbfh", "high", "¥39–79"),
    ("分手自愈/前任执念", ["分手自愈", "前任执念"], "fszy", "high", "¥39–79"),
    ("35岁危机", ["35岁危机", "35岁"], "wl35", "mid", "¥39–69"),
    ("性格城市匹配", ["性格城市", "城市匹配", "天选之城", "五行城市"], "cmt", "mid", "¥19–49"),
    ("天赋/职业测评", ["天赋测评", "职业测评", "天赋测试", "天赋潜能", "十大天赋"], "apt", "mid", "¥29–59"),
    ("动物塑/动物人格", ["动物塑", "动物系人格", "动物性格", "灵魂动物"], "ast", "low", "¥9.9–29 趣味"),
    ("人格阴影/腹黑", ["人格阴影", "腹黑人格", "深层恐惧"], "amt", "mid", "¥29–59"),
    ("九型人格", ["九型人格"], None, "mid", "¥29–59"),
    ("颜值/骨相皮相", ["颜值测试", "面部分析", "骨相", "皮相美"], "yzt", "low", "¥9.9–29"),
    ("山海经/历史人物趣味", ["山海经", "历史人物", "文学人物", "大明王朝"], "shjss", "low", "¥9.9–29 趣味"),
    ("工作性价比/这b班", ["工作性价比", "这b班", "这B班", "班值不值"], "wjt", "mid", "¥19–49"),
    ("考研/读博适配", ["适合考研", "适合读博", "考研适配", "读博吗"], "phd", "mid", "¥29–59"),
    ("ABO/同人趣味", ["ABO人格", "ABO测试", "同人女"], "abo", "low", "¥9.9 引流"),
    ("哈利波特/IP趣味", ["哈利波特", "HPTI", "原神角色"], None, "low", "¥9.9–19 引流"),
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


def _catalog_name_map() -> dict[str, str]:
    if not CATALOG.is_file():
        return {}
    try:
        data = json.loads(CATALOG.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    out: dict[str, str] = {}
    for t in data.get("tests") or []:
        code = str(t.get("code") or "")
        name = str(t.get("name") or "")
        if code and name:
            out[code] = name
    return out


def _row_from_item(it: dict, gid_buckets: dict[str, set[str]], theme: str) -> dict:
    title = str(it.get("title") or "")
    gid = str(it.get("goods_id") or "")
    bs = gid_buckets.get(gid) or set()
    best, bestw = "market", 0
    for b in bs:
        w = BUCKET_WEIGHT.get(b, 0)
        if w > bestw:
            best, bestw = b, w
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
    return {
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
        "theme": theme,
    }


def _score_theme(hits: list[dict], premium_fit: str, has_pack: bool) -> float:
    urgency = 0.0
    for h in hits[:15]:
        urgency += h["bw"] + min(40.0, h["delta"] * 0.15) + min(20.0, h["gr"])
    if has_pack:
        urgency += 25
    if any(h["bucket"] in ("climb", "burst", "priority") for h in hits[:10]):
        urgency += 35
    if premium_fit == "avoid":
        urgency *= 0.5
    elif premium_fit == "low":
        urgency *= 0.85
    return round(urgency, 1)


def _theme_payload(
    name: str,
    keys: list[str],
    psy_code: str | None,
    premium_fit: str,
    price_band: str,
    hits: list[dict],
    psy: set[str],
    *,
    source: str = "curated",
) -> dict:
    hits = sorted(hits, key=lambda x: (x["bw"], x["delta"], x["gr"]), reverse=True)
    has_pack = bool(psy_code and psy_code in psy)
    prices = [h["price"] for h in hits if isinstance(h["price"], (int, float))]
    avg_price = round(sum(prices) / len(prices), 2) if prices else None
    bucket_counts: dict[str, int] = defaultdict(int)
    for h in hits:
        bucket_counts[h["bucket"]] += 1
    return {
        "name": name,
        "keywords": keys,
        "psy_code": psy_code or "",
        "hit_count": len(hits),
        "sum_delta": round(sum(h["delta"] for h in hits), 1),
        "avg_price": avg_price,
        "max_delta": round(max((h["delta"] for h in hits), default=0), 1),
        "buckets": dict(bucket_counts),
        "urgency_score": _score_theme(hits, premium_fit, has_pack),
        "has_psy_pack": has_pack,
        "premium_fit": premium_fit,
        "suggest_price_band": price_band,
        "source": source,
        "top": [
            {
                "goods_id": h["goods_id"],
                "title": h["title"],
                "price": h["price"],
                "delta": h["delta"],
                "pool": h["pool"],
                "bucket": h["bucket"],
            }
            for h in hits[:5]
        ],
    }


def _discover_themes(
    leftover: list[dict],
    gid_buckets: dict[str, set[str]],
    psy: set[str],
    catalog: dict[str, str],
) -> tuple[list[dict], list[dict]]:
    """从剩余测评标题聚类；返回 (discovered_themes, still_uncategorized_rows)."""
    phrase_re = re.compile(r"([\u4e00-\u9fffA-Za-z0-9·]{2,12})(?:测试|测评|测验|量表|人格)")
    junk_in_phrase = ("专业", "官方", "正版", "完整", "免费", "在线", "最新", "高清", "电子", "资料", "合集", "打包", "全套", "趣味自测", "趣味小", "原创")
    phrase_hits: dict[str, list[dict]] = defaultdict(list)
    used: set[str] = set()

    for it in leftover:
        title = str(it.get("title") or "")
        gid = str(it.get("goods_id") or "")
        phrases = []
        for m in phrase_re.finditer(title):
            phrase = m.group(0)
            if any(j in phrase for j in junk_in_phrase):
                continue
            if len(phrase) < 4:
                continue
            phrases.append(phrase)
        if not phrases:
            continue
        # 取最长短语作为主题名
        phrase = max(phrases, key=len)
        row = _row_from_item(it, gid_buckets, phrase)
        phrase_hits[phrase].append(row)
        used.add(gid)

    discovered: list[dict] = []
    for phrase, hits in phrase_hits.items():
        if len(hits) < 2 and max((h["delta"] for h in hits), default=0) < 40:
            # 单条且增量不高 → 留在未归类
            for h in hits:
                used.discard(h["goods_id"])
            continue
        # 尝试映射题库名
        psy_code = None
        for code, cname in catalog.items():
            if phrase[:4] in cname or cname[:4] in phrase:
                psy_code = code
                break
        # 发现池默认 mid（有热度待评估），极低价趣味标 low
        prices = [h["price"] for h in hits if isinstance(h["price"], (int, float))]
        avg = (sum(prices) / len(prices)) if prices else 0
        fit = "low" if avg and avg < 5 else "mid"
        band = "待评估·先观察" if fit == "mid" else "¥1.99–9.9 趣味"
        theme = _theme_payload(
            f"发现·{phrase}",
            [phrase],
            psy_code,
            fit,
            band,
            hits,
            psy,
            source="discovered",
        )
        discovered.append(theme)

    discovered.sort(key=lambda t: t["urgency_score"], reverse=True)
    uncategorized: list[dict] = []
    for it in leftover:
        gid = str(it.get("goods_id") or "")
        if gid and gid not in used:
            uncategorized.append(_row_from_item(it, gid_buckets, "未归类"))
    uncategorized.sort(key=lambda x: (x["bw"], x["delta"]), reverse=True)
    return discovered[:40], uncategorized[:60]


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
    catalog = _catalog_name_map()

    # 1) 测评门禁 + 去噪
    assess_pool: list[dict] = []
    noise_count = 0
    for it in items:
        title = str(it.get("title") or "")
        if not title or not ASSESS_GATE.search(title):
            continue
        if NOISE.search(title):
            noise_count += 1
            continue
        assess_pool.append(it)

    assigned: set[str] = set()
    themes: list[dict] = []
    top_pool: list[dict] = []

    # 2) 固化选题包
    for name, keys, psy_code, premium_fit, price_band in PACKS:
        hits: list[dict] = []
        for it in assess_pool:
            title = str(it.get("title") or "")
            tl = title.lower()
            if not any(k.lower() in tl for k in keys):
                continue
            gid = str(it.get("goods_id") or "")
            row = _row_from_item(it, gid_buckets, name)
            hits.append(row)
            if gid:
                assigned.add(gid)
        theme = _theme_payload(name, keys, psy_code, premium_fit, price_band, hits, psy)
        themes.append(theme)
        for h in hits[:8]:
            top_pool.append(h)

    leftover = [
        it
        for it in assess_pool
        if str(it.get("goods_id") or "") not in assigned
    ]
    discovered, uncategorized = _discover_themes(leftover, gid_buckets, psy, catalog)
    for t in discovered:
        for h in t.get("top") or []:
            # rebuild minimal for top_pool
            top_pool.append(
                {
                    **h,
                    "bw": BUCKET_WEIGHT.get(str(h.get("bucket") or ""), 0),
                    "gr": 0,
                    "advice_score": None,
                    "sold": None,
                    "theme": t["name"],
                }
            )

    themes.sort(key=lambda t: (t["hit_count"] > 0, t["urgency_score"]), reverse=True)
    discovered.sort(key=lambda t: t["urgency_score"], reverse=True)

    top_pool.sort(key=lambda x: (x.get("bw", 0), x.get("delta", 0)), reverse=True)
    seen: set[str] = set()
    top_items: list[dict] = []
    for h in top_pool:
        gid = h.get("goods_id") or ""
        if not gid or gid in seen:
            continue
        seen.add(gid)
        top_items.append(
            {
                "goods_id": gid,
                "title": h.get("title"),
                "price": h.get("price"),
                "sold": h.get("sold"),
                "delta": h.get("delta"),
                "pool": h.get("pool"),
                "advice_score": h.get("advice_score"),
                "theme": h.get("theme"),
            }
        )
        if len(top_items) >= 120:
            break

    active = [t for t in themes if t["hit_count"] > 0]
    premium_shortlist = [
        {
            "name": t["name"],
            "psy_code": t["psy_code"],
            "urgency_score": t["urgency_score"],
            "hit_count": t["hit_count"],
            "sum_delta": t["sum_delta"],
            "avg_price": t["avg_price"],
            "max_delta": t["max_delta"],
            "has_psy_pack": t["has_psy_pack"],
            "suggest_price_band": t["suggest_price_band"],
            "premium_fit": t["premium_fit"],
        }
        for t in active
        if t["premium_fit"] == "high"
    ][:15]

    mid_shortlist = [
        {
            "name": t["name"],
            "psy_code": t["psy_code"],
            "urgency_score": t["urgency_score"],
            "hit_count": t["hit_count"],
            "sum_delta": t["sum_delta"],
            "avg_price": t["avg_price"],
            "has_psy_pack": t["has_psy_pack"],
            "suggest_price_band": t["suggest_price_band"],
            "premium_fit": t["premium_fit"],
        }
        for t in active
        if t["premium_fit"] == "mid"
    ][:12]

    avoid_list = [
        {
            "name": t["name"],
            "hit_count": t["hit_count"],
            "sum_delta": t["sum_delta"],
            "urgency_score": t["urgency_score"],
            "suggest_price_band": t["suggest_price_band"],
            "premium_fit": "avoid",
        }
        for t in active
        if t["premium_fit"] == "avoid"
    ]

    catalog_gap = [
        {
            "name": t["name"],
            "psy_code": t["psy_code"],
            "has_psy_pack": t["has_psy_pack"],
            "premium_fit": t["premium_fit"],
            "suggest_price_band": t["suggest_price_band"],
        }
        for t in themes
        if t["hit_count"] == 0 and t["has_psy_pack"]
    ]

    report_date = _report_date_from_dir(day_dir)
    assess_hit_ids = {str(it.get("goods_id") or "") for it in assess_pool if it.get("goods_id")}
    payload = {
        "meta": {
            "report_date": report_date,
            "source_dir": str(day_dir),
            "source_name": day_dir.name,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "advice_total": int((adv.get("meta") or {}).get("total") or len(items)),
            "assess_gate_count": len(assess_pool) + noise_count,
            "noise_filtered": noise_count,
            "assess_hit_count": len(assess_hit_ids),
            "curated_assigned": len(assigned),
            "discovered_theme_count": len(discovered),
            "uncategorized_count": len(uncategorized),
            "theme_count": len(themes),
            "active_theme_count": len(active),
            "schema_version": 2,
        },
        "action_tiers": {
            "high": premium_shortlist,
            "mid": mid_shortlist,
            "avoid": avoid_list,
            "discover": [
                {
                    "name": t["name"],
                    "urgency_score": t["urgency_score"],
                    "hit_count": t["hit_count"],
                    "sum_delta": t["sum_delta"],
                    "avg_price": t["avg_price"],
                    "has_psy_pack": t["has_psy_pack"],
                    "psy_code": t["psy_code"],
                    "suggest_price_band": t["suggest_price_band"],
                    "premium_fit": t["premium_fit"],
                }
                for t in discovered[:12]
            ],
        },
        "themes": themes,
        "discovered_themes": discovered,
        "catalog_gap": catalog_gap,
        "top_items": top_items,
        "uncategorized_top": [
            {
                "goods_id": h["goods_id"],
                "title": h["title"],
                "price": h["price"],
                "delta": h["delta"],
                "pool": h["pool"],
                "theme": "未归类",
            }
            for h in uncategorized[:40]
        ],
        "premium_shortlist": premium_shortlist,  # 兼容旧 UI
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
    stamp = OUT_DIR / f"{payload['meta']['report_date'].replace('-', '')}.json"
    stamp.write_text(text, encoding="utf-8")
    meta = payload["meta"]
    tiers = payload["action_tiers"]
    print(
        f"OK {meta['source_name']} date={meta['report_date']} "
        f"assess={meta['assess_hit_count']} (noise={meta['noise_filtered']}) "
        f"curated_active={meta['active_theme_count']}/{meta['theme_count']} "
        f"discovered={meta['discovered_theme_count']} uncat={meta['uncategorized_count']} "
        f"high={len(tiers['high'])} mid={len(tiers['mid'])} "
        f"-> {latest}"
    )


if __name__ == "__main__":
    main()
