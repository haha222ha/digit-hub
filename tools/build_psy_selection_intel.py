# -*- coding: utf-8 -*-
"""从热库全量增量生成心象测超管「测评选品报告」精简快照。

默认扫热库内所有 全量MMDD：优先 advice_data.js，否则从 data.js（columns+行）提取。
覆盖 6/7 月仅有 data.js 的日期，与 8 月 advice 日一并做跨日联动观测。

用法:
  python tools/build_psy_selection_intel.py              # 全库多日（默认）
  python tools/build_psy_selection_intel.py --scope all
  python tools/build_psy_selection_intel.py --day 0616   # 仅单日（data.js 也可）
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

ASSESS_GATE = re.compile(
    r"(测试|测评|测验|量表|人格|心理|MBTI|SCL|霍兰德|依恋|内耗|倦怠|"
    r"安全感|高敏感|原生家庭|暧昧|恋爱脑|吸渣|脱单|母单|正缘|复合|"
    r"分手|七宗罪|危险人格|松弛感|讨好型|PUA|心理年龄|症状自评|"
    r"暗恋|九型|黑暗三角|动物塑|天赋|腹黑|山海经|心软)",
    re.I,
)

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


def _day_key(day_dir: Path) -> str:
    m = re.search(r"全量(\d{4})", day_dir.name)
    return m.group(1) if m else day_dir.name


def _report_date_from_dir(day_dir: Path) -> str:
    mmdd = _day_key(day_dir)
    if not re.fullmatch(r"\d{4}", mmdd):
        return day_dir.name
    year = datetime.now().year
    return f"{year}-{mmdd[:2]}-{mmdd[2:]}"


def _list_report_days() -> list[Path]:
    """所有可分析日：有 advice_data.js 或 data.js。"""
    if not HOTLIB_ROOT.is_dir():
        raise SystemExit(f"找不到热库目录: {HOTLIB_ROOT}")
    days = []
    for p in HOTLIB_ROOT.iterdir():
        if not (p.is_dir() and p.name.startswith("全量")):
            continue
        if (p / "advice_data.js").is_file() or (p / "data.js").is_file():
            days.append(p)
    return sorted(days, key=lambda p: p.name)


def _list_advice_days() -> list[Path]:
    """兼容旧名：等同全库可分析日。"""
    return _list_report_days()


def _find_day_dir(day: str | None) -> Path:
    if day:
        day = day.strip().lstrip("全量")
        cand = HOTLIB_ROOT / f"全量{day}"
        if not cand.is_dir():
            raise SystemExit(f"找不到日目录: {cand}")
        if not ((cand / "advice_data.js").is_file() or (cand / "data.js").is_file()):
            raise SystemExit(f"该日缺少 advice_data.js / data.js: {cand}")
        return cand
    days = _list_report_days()
    if not days:
        raise SystemExit("热库下没有带 advice_data.js / data.js 的 全量MMDD 目录")
    return days[-1]


def _parse_js_object(path: Path) -> dict:
    text = path.read_text(encoding="utf-8", errors="replace")
    i = text.find("{")
    if i < 0:
        raise SystemExit(f"无法解析 JS 对象: {path}")
    return json.loads(text[i:].rstrip().rstrip(";"))


def _load_advice(day_dir: Path) -> dict:
    return _parse_js_object(day_dir / "advice_data.js")


def _normalize_data_row(cols: list[str], row: list) -> dict:
    """把 data.js 的 columns+数组行，收成与 advice items 相近的 dict。"""
    raw: dict = {}
    for i, col in enumerate(cols):
        if i < len(row):
            raw[str(col)] = row[i]
    title = str(raw.get("title") or "")
    gid = str(raw.get("goods_id") or "")
    # 增量：新版有 delta；6月部分只有 actual_v1d / v1d
    delta = raw.get("delta")
    if delta is None:
        delta = raw.get("delta_24h")
    if delta is None:
        delta = raw.get("actual_v1d")
    if delta is None:
        delta = raw.get("v1d")
    try:
        delta_f = float(delta or 0)
    except (TypeError, ValueError):
        delta_f = 0.0
    price = raw.get("price")
    try:
        price_f = float(price) if price is not None and price != "" else None
    except (TypeError, ValueError):
        price_f = None
    pool = str(raw.get("pool") or "").strip()
    return {
        "goods_id": gid,
        "title": title,
        "price": price_f,
        "sold": raw.get("sold"),
        "delta": delta_f,
        "sold_delta": delta_f,
        "actual_gr": raw.get("actual_gr") or raw.get("gr") or 0,
        "gr": raw.get("actual_gr") or raw.get("gr") or 0,
        "pool": pool,
        "keyword": raw.get("keyword"),
        "advice_score": None,
        "is_virtual": raw.get("is_virtual"),
        "_source": "data.js",
    }


def _load_data_as_advice_shape(day_dir: Path) -> dict:
    obj = _parse_js_object(day_dir / "data.js")
    cols = obj.get("columns") or []
    raw_items = obj.get("items") or []
    if not isinstance(cols, list) or not cols:
        raise SystemExit(f"data.js 缺少 columns: {day_dir}")
    items: list[dict] = []
    for row in raw_items:
        if isinstance(row, dict):
            # 少数可能已是 dict
            title = str(row.get("title") or "")
            if not title:
                continue
            delta = row.get("delta")
            if delta is None:
                delta = row.get("actual_v1d") or row.get("v1d") or 0
            try:
                delta_f = float(delta or 0)
            except (TypeError, ValueError):
                delta_f = 0.0
            items.append(
                {
                    "goods_id": str(row.get("goods_id") or ""),
                    "title": title,
                    "price": row.get("price"),
                    "sold": row.get("sold"),
                    "delta": delta_f,
                    "sold_delta": delta_f,
                    "actual_gr": row.get("actual_gr") or 0,
                    "gr": row.get("actual_gr") or 0,
                    "pool": str(row.get("pool") or ""),
                    "keyword": row.get("keyword"),
                    "advice_score": None,
                    "_source": "data.js",
                }
            )
            continue
        if not isinstance(row, (list, tuple)):
            continue
        it = _normalize_data_row([str(c) for c in cols], list(row))
        if it.get("title"):
            items.append(it)
    meta = obj.get("meta") or {}
    return {
        "meta": {
            **meta,
            "total": int(meta.get("count") or meta.get("total_goods") or len(items)),
            "source_kind": "data.js",
        },
        "items": items,
        "buckets": {},  # data.js 无 advice 桶；紧急度用 pool 字段兜底
    }


def _load_day_payload(day_dir: Path) -> dict:
    """优先 advice_data.js；否则整理 data.js 全量提取。"""
    adv_path = day_dir / "advice_data.js"
    data_path = day_dir / "data.js"
    if adv_path.is_file():
        adv = _load_advice(day_dir)
        meta = dict(adv.get("meta") or {})
        meta["source_kind"] = "advice_data.js"
        adv["meta"] = meta
        return adv
    if data_path.is_file():
        return _load_data_as_advice_shape(day_dir)
    raise SystemExit(f"缺少 advice_data.js / data.js: {day_dir}")


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


def _row_from_item(it: dict, gid_buckets: dict[str, set[str]], theme: str, day: str = "") -> dict:
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
        "day": day,
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
    day: str = "",
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
        "day": day,
        "top": [
            {
                "goods_id": h["goods_id"],
                "title": h["title"],
                "price": h["price"],
                "delta": h["delta"],
                "pool": h["pool"],
                "bucket": h["bucket"],
                "day": h.get("day") or day,
            }
            for h in hits[:5]
        ],
    }


def _discover_themes(
    leftover: list[dict],
    gid_buckets: dict[str, set[str]],
    psy: set[str],
    catalog: dict[str, str],
    day: str,
) -> tuple[list[dict], list[dict]]:
    phrase_re = re.compile(r"([\u4e00-\u9fffA-Za-z0-9·]{2,12})(?:测试|测评|测验|量表|人格)")
    junk_in_phrase = (
        "专业", "官方", "正版", "完整", "免费", "在线", "最新", "高清", "电子",
        "资料", "合集", "打包", "全套", "趣味自测", "趣味小", "原创",
    )
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
        phrase = max(phrases, key=len)
        row = _row_from_item(it, gid_buckets, phrase, day=day)
        phrase_hits[phrase].append(row)
        used.add(gid)

    discovered: list[dict] = []
    for phrase, hits in phrase_hits.items():
        if len(hits) < 2 and max((h["delta"] for h in hits), default=0) < 40:
            for h in hits:
                used.discard(h["goods_id"])
            continue
        psy_code = None
        for code, cname in catalog.items():
            if phrase[:4] in cname or cname[:4] in phrase:
                psy_code = code
                break
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
            day=day,
        )
        discovered.append(theme)

    discovered.sort(key=lambda t: t["urgency_score"], reverse=True)
    uncategorized: list[dict] = []
    for it in leftover:
        gid = str(it.get("goods_id") or "")
        if gid and gid not in used:
            uncategorized.append(_row_from_item(it, gid_buckets, "未归类", day=day))
    uncategorized.sort(key=lambda x: (x["bw"], x["delta"]), reverse=True)
    return discovered[:40], uncategorized[:60]


def _analyze_day(day_dir: Path, psy: set[str], catalog: dict[str, str]) -> dict:
    """单日分析，返回日摘要 + 主题列表 + top 明细。"""
    day = _day_key(day_dir)
    adv = _load_day_payload(day_dir)
    items = adv.get("items") or []
    buckets = adv.get("buckets") or {}
    source_kind = str((adv.get("meta") or {}).get("source_kind") or "unknown")
    gid_buckets: dict[str, set[str]] = defaultdict(set)
    for bname, ids in buckets.items():
        for gid in ids or []:
            gid_buckets[str(gid)].add(str(bname))

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

    for name, keys, psy_code, premium_fit, price_band in PACKS:
        hits: list[dict] = []
        for it in assess_pool:
            title = str(it.get("title") or "")
            tl = title.lower()
            if not any(k.lower() in tl for k in keys):
                continue
            gid = str(it.get("goods_id") or "")
            row = _row_from_item(it, gid_buckets, name, day=day)
            hits.append(row)
            if gid:
                assigned.add(gid)
        theme = _theme_payload(
            name, keys, psy_code, premium_fit, price_band, hits, psy, day=day
        )
        themes.append(theme)
        for h in hits[:8]:
            top_pool.append(h)

    leftover = [it for it in assess_pool if str(it.get("goods_id") or "") not in assigned]
    discovered, uncategorized = _discover_themes(
        leftover, gid_buckets, psy, catalog, day=day
    )
    for t in discovered:
        for h in t.get("top") or []:
            top_pool.append(
                {
                    **h,
                    "bw": BUCKET_WEIGHT.get(str(h.get("bucket") or ""), 0),
                    "gr": 0,
                    "advice_score": None,
                    "sold": None,
                    "theme": t["name"],
                    "day": day,
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
                "day": day,
            }
        )
        if len(top_items) >= 80:
            break

    assess_ids = {str(it.get("goods_id") or "") for it in assess_pool if it.get("goods_id")}
    active = [t for t in themes if t["hit_count"] > 0]
    return {
        "day": day,
        "report_date": _report_date_from_dir(day_dir),
        "source_name": day_dir.name,
        "source_dir": str(day_dir),
        "source_kind": source_kind,
        "advice_total": int((adv.get("meta") or {}).get("total") or len(items)),
        "assess_gate_count": len(assess_pool) + noise_count,
        "noise_filtered": noise_count,
        "assess_hit_count": len(assess_ids),
        "curated_assigned": len(assigned),
        "active_theme_count": len(active),
        "themes": themes,
        "discovered_themes": discovered,
        "top_items": top_items,
        "uncategorized_top": [
            {
                "goods_id": h["goods_id"],
                "title": h["title"],
                "price": h["price"],
                "delta": h["delta"],
                "pool": h["pool"],
                "theme": "未归类",
                "day": day,
            }
            for h in uncategorized[:30]
        ],
    }


def _spark(values: list[float], width: int = 8) -> str:
    if not values:
        return ""
    blocks = "▁▂▃▄▅▆▇█"
    mx = max(values) or 1.0
    out = []
    for v in values[-width:]:
        idx = int(round((v / mx) * (len(blocks) - 1)))
        out.append(blocks[max(0, min(len(blocks) - 1, idx))])
    return "".join(out)


def _trend_label(series: list[dict]) -> str:
    """根据紧急度序列判断 rising/falling/stable/new/fading。"""
    if not series:
        return "none"
    urg = [float(p.get("urgency_score") or 0) for p in series]
    hits = [int(p.get("hit_count") or 0) for p in series]
    if len(series) <= 2 and hits[-1] > 0:
        return "new"
    if hits[-1] == 0 and any(h > 0 for h in hits[:-1]):
        return "fading"
    if len(urg) < 3:
        return "stable"
    recent = sum(urg[-3:]) / 3
    prior = sum(urg[:-3]) / max(1, len(urg) - 3)
    if prior <= 0 and recent > 0:
        return "rising"
    if recent >= prior * 1.25:
        return "rising"
    if recent <= prior * 0.7:
        return "falling"
    return "stable"


def _composite_urgency(series: list[dict], days_present: int, day_count: int) -> float:
    if not series:
        return 0.0
    urg = [float(p.get("urgency_score") or 0) for p in series]
    latest = urg[-1]
    mean_u = sum(urg) / len(urg)
    present_ratio = days_present / max(1, day_count)
    # 连出天数奖励：最近连续命中
    streak = 0
    for p in reversed(series):
        if int(p.get("hit_count") or 0) > 0:
            streak += 1
        else:
            break
    return round(0.45 * latest + 0.30 * mean_u + 0.15 * present_ratio * 100 + 0.10 * streak * 8, 1)


def _aggregate_themes(
    day_results: list[dict], psy: set[str]
) -> tuple[list[dict], list[dict]]:
    """跨日聚合固化主题 + 发现主题。"""
    day_keys = [d["day"] for d in day_results]
    day_count = len(day_keys)

    # curated: fixed pack order
    pack_meta = {
        name: (keys, psy_code, fit, band) for name, keys, psy_code, fit, band in PACKS
    }
    curated_series: dict[str, list[dict]] = {name: [] for name, *_ in PACKS}
    curated_tops: dict[str, list[dict]] = defaultdict(list)

    for day_res in day_results:
        by_name = {t["name"]: t for t in day_res["themes"]}
        for name in curated_series:
            t = by_name.get(name)
            if not t:
                curated_series[name].append(
                    {
                        "day": day_res["day"],
                        "hit_count": 0,
                        "sum_delta": 0,
                        "urgency_score": 0,
                        "avg_price": None,
                    }
                )
                continue
            curated_series[name].append(
                {
                    "day": day_res["day"],
                    "hit_count": t["hit_count"],
                    "sum_delta": t["sum_delta"],
                    "urgency_score": t["urgency_score"],
                    "avg_price": t["avg_price"],
                }
            )
            for row in t.get("top") or []:
                curated_tops[name].append(row)

    themes: list[dict] = []
    for name, keys, psy_code, fit, band in PACKS:
        series = curated_series[name]
        hits_total = sum(int(p["hit_count"]) for p in series)
        delta_total = round(sum(float(p["sum_delta"]) for p in series), 1)
        days_present = sum(1 for p in series if int(p["hit_count"]) > 0)
        latest = series[-1] if series else {}
        has_pack = bool(psy_code and psy_code in psy)
        # 跨日 top：按 delta 去重
        tops = sorted(curated_tops[name], key=lambda x: float(x.get("delta") or 0), reverse=True)
        seen: set[str] = set()
        top_dedup: list[dict] = []
        for row in tops:
            gid = str(row.get("goods_id") or "")
            if not gid or gid in seen:
                continue
            seen.add(gid)
            top_dedup.append(row)
            if len(top_dedup) >= 8:
                break
        prices = [
            float(p["avg_price"])
            for p in series
            if isinstance(p.get("avg_price"), (int, float))
        ]
        themes.append(
            {
                "name": name,
                "keywords": keys,
                "psy_code": psy_code or "",
                "premium_fit": fit,
                "suggest_price_band": band,
                "has_psy_pack": has_pack,
                "source": "curated",
                "hit_count": int(latest.get("hit_count") or 0),  # 兼容：最新日
                "sum_delta": float(latest.get("sum_delta") or 0),
                "avg_price": latest.get("avg_price"),
                "max_delta": max((float(p.get("sum_delta") or 0) for p in series), default=0),
                "urgency_score": _composite_urgency(series, days_present, day_count),
                "latest_urgency": float(latest.get("urgency_score") or 0),
                "total_hits": hits_total,
                "total_delta": delta_total,
                "days_present": days_present,
                "day_count": day_count,
                "trend": _trend_label(series),
                "spark": _spark([float(p.get("urgency_score") or 0) for p in series]),
                "day_series": series,
                "top": top_dedup,
            }
        )

    # discovered: merge by name across days
    disc_map: dict[str, list[dict]] = defaultdict(list)
    disc_meta: dict[str, dict] = {}
    disc_tops: dict[str, list[dict]] = defaultdict(list)
    for day_res in day_results:
        for t in day_res.get("discovered_themes") or []:
            name = t["name"]
            disc_map[name].append(
                {
                    "day": day_res["day"],
                    "hit_count": t["hit_count"],
                    "sum_delta": t["sum_delta"],
                    "urgency_score": t["urgency_score"],
                    "avg_price": t["avg_price"],
                }
            )
            disc_meta[name] = t
            for row in t.get("top") or []:
                disc_tops[name].append(row)

    discovered: list[dict] = []
    for name, points in disc_map.items():
        # align to full day axis (fill zeros)
        by_day = {p["day"]: p for p in points}
        series = []
        for dk in day_keys:
            series.append(
                by_day.get(
                    dk,
                    {
                        "day": dk,
                        "hit_count": 0,
                        "sum_delta": 0,
                        "urgency_score": 0,
                        "avg_price": None,
                    },
                )
            )
        days_present = sum(1 for p in series if int(p["hit_count"]) > 0)
        if days_present < 1:
            continue
        # 单日偶发且增量低 → 丢掉，减噪
        total_delta = sum(float(p["sum_delta"]) for p in series)
        if days_present == 1 and total_delta < 80:
            continue
        base = disc_meta[name]
        latest = series[-1]
        tops = sorted(disc_tops[name], key=lambda x: float(x.get("delta") or 0), reverse=True)
        seen = set()
        top_dedup = []
        for row in tops:
            gid = str(row.get("goods_id") or "")
            if not gid or gid in seen:
                continue
            seen.add(gid)
            top_dedup.append(row)
            if len(top_dedup) >= 5:
                break
        discovered.append(
            {
                "name": name,
                "keywords": base.get("keywords") or [],
                "psy_code": base.get("psy_code") or "",
                "premium_fit": base.get("premium_fit") or "mid",
                "suggest_price_band": base.get("suggest_price_band") or "待评估",
                "has_psy_pack": bool(base.get("has_psy_pack")),
                "source": "discovered",
                "hit_count": int(latest.get("hit_count") or 0),
                "sum_delta": float(latest.get("sum_delta") or 0),
                "avg_price": latest.get("avg_price"),
                "max_delta": max((float(p.get("sum_delta") or 0) for p in series), default=0),
                "urgency_score": _composite_urgency(series, days_present, day_count),
                "latest_urgency": float(latest.get("urgency_score") or 0),
                "total_hits": sum(int(p["hit_count"]) for p in series),
                "total_delta": round(total_delta, 1),
                "days_present": days_present,
                "day_count": day_count,
                "trend": _trend_label(series),
                "spark": _spark([float(p.get("urgency_score") or 0) for p in series]),
                "day_series": series,
                "top": top_dedup,
            }
        )

    themes.sort(
        key=lambda t: (t["days_present"] > 0, t["urgency_score"], t["total_delta"]),
        reverse=True,
    )
    discovered.sort(key=lambda t: (t["days_present"], t["urgency_score"]), reverse=True)
    return themes, discovered[:30]


def _short_card(t: dict) -> dict:
    return {
        "name": t["name"],
        "psy_code": t.get("psy_code") or "",
        "urgency_score": t.get("urgency_score"),
        "latest_urgency": t.get("latest_urgency"),
        "hit_count": t.get("hit_count"),
        "total_hits": t.get("total_hits"),
        "sum_delta": t.get("sum_delta"),
        "total_delta": t.get("total_delta"),
        "avg_price": t.get("avg_price"),
        "max_delta": t.get("max_delta"),
        "has_psy_pack": t.get("has_psy_pack"),
        "suggest_price_band": t.get("suggest_price_band"),
        "premium_fit": t.get("premium_fit"),
        "days_present": t.get("days_present"),
        "trend": t.get("trend"),
        "spark": t.get("spark"),
    }


def build_all() -> dict:
    days = _list_report_days()
    if not days:
        raise SystemExit("没有可分析的 全量MMDD（advice_data.js / data.js）")
    psy = _psy_codes()
    catalog = _catalog_name_map()

    day_results: list[dict] = []
    for day_dir in days:
        one = _analyze_day(day_dir, psy, catalog)
        print(
            f"... {day_dir.name} kind={one.get('source_kind')} "
            f"assess={one['assess_hit_count']} active={one['active_theme_count']}",
            flush=True,
        )
        day_results.append(one)

    themes, discovered = _aggregate_themes(day_results, psy)
    latest = day_results[-1]
    day_count = len(day_results)

    active = [t for t in themes if t["days_present"] > 0]
    high = [_short_card(t) for t in active if t["premium_fit"] == "high"][:15]
    mid = [_short_card(t) for t in active if t["premium_fit"] == "mid"][:12]
    avoid = [_short_card(t) for t in active if t["premium_fit"] == "avoid"]
    # 联动优先：连出多日且上升
    watchlist = sorted(
        [t for t in active if t["days_present"] >= max(2, day_count // 3)],
        key=lambda t: (t["trend"] == "rising", t["urgency_score"]),
        reverse=True,
    )[:12]

    rising = [_short_card(t) for t in active if t["trend"] == "rising"][:10]
    new_themes = [_short_card(t) for t in active if t["trend"] == "new"][:8]

    daily_digest = []
    for d in day_results:
        top_names = [
            {"name": t["name"], "urgency_score": t["urgency_score"], "hit_count": t["hit_count"]}
            for t in d["themes"]
            if t["hit_count"] > 0
        ][:8]
        daily_digest.append(
            {
                "day": d["day"],
                "report_date": d["report_date"],
                "source_name": d["source_name"],
                "source_kind": d.get("source_kind") or "",
                "advice_total": d["advice_total"],
                "assess_hit_count": d["assess_hit_count"],
                "noise_filtered": d["noise_filtered"],
                "active_theme_count": d["active_theme_count"],
                "top_themes": top_names,
                "top_items": d["top_items"][:25],
            }
        )

    # 跨日 top items：带 day 字段，按 delta
    all_items = []
    for d in day_results:
        all_items.extend(d["top_items"])
    all_items.sort(key=lambda x: float(x.get("delta") or 0), reverse=True)
    seen = set()
    top_items = []
    for it in all_items:
        gid = str(it.get("goods_id") or "")
        key = f"{gid}:{it.get('day')}"
        if not gid or key in seen:
            continue
        seen.add(key)
        top_items.append(it)
        if len(top_items) >= 150:
            break

    catalog_gap = [
        {
            "name": t["name"],
            "psy_code": t["psy_code"],
            "has_psy_pack": t["has_psy_pack"],
            "premium_fit": t["premium_fit"],
            "suggest_price_band": t["suggest_price_band"],
            "days_present": t["days_present"],
        }
        for t in themes
        if t["days_present"] == 0 and t["has_psy_pack"]
    ]

    uncat = []
    for d in day_results[-3:]:  # 近 3 日未归类
        uncat.extend(d.get("uncategorized_top") or [])
    uncat.sort(key=lambda x: float(x.get("delta") or 0), reverse=True)

    payload = {
        "meta": {
            "scope": "hotlib_all",
            "report_date": latest["report_date"],
            "latest_day": latest["day"],
            "days_covered": [d["day"] for d in day_results],
            "day_count": day_count,
            "day_range": f"{day_results[0]['day']}-{day_results[-1]['day']}",
            "source_dir": HOTLIB_ROOT.as_posix(),
            "source_name": f"热库全量×{day_count}日",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "advice_total": sum(d["advice_total"] for d in day_results),
            "assess_hit_count": sum(d["assess_hit_count"] for d in day_results),
            "assess_hit_latest": latest["assess_hit_count"],
            "noise_filtered": sum(d["noise_filtered"] for d in day_results),
            "curated_assigned": sum(d["curated_assigned"] for d in day_results),
            "discovered_theme_count": len(discovered),
            "uncategorized_count": len(uncat),
            "theme_count": len(themes),
            "active_theme_count": len(active),
            "schema_version": 3,
            "advice_day_count": sum(1 for d in day_results if d.get("source_kind") == "advice_data.js"),
            "datajs_day_count": sum(1 for d in day_results if d.get("source_kind") == "data.js"),
            "note": "全库：有 advice 用紧急度桶；6/7月等仅 data.js 的日期按 columns 提取，pool 字段兜底分桶",
        },
        "daily_digest": daily_digest,
        "action_tiers": {
            "high": high,
            "mid": mid,
            "avoid": avoid,
            "rising": rising,
            "new": new_themes,
            "watchlist": [_short_card(t) for t in watchlist],
            "discover": [_short_card(t) for t in discovered[:12]],
        },
        "themes": themes,
        "discovered_themes": discovered,
        "catalog_gap": catalog_gap,
        "top_items": top_items,
        "latest_top_items": latest["top_items"],
        "uncategorized_top": uncat[:40],
        "premium_shortlist": high,
    }
    return payload


def build(day: str | None = None) -> dict:
    """兼容：指定 --day 时只出单日（schema 仍尽量带 day_series 长度1）。"""
    if day is None:
        return build_all()
    day_dir = _find_day_dir(day)
    psy = _psy_codes()
    catalog = _catalog_name_map()
    one = _analyze_day(day_dir, psy, catalog)
    # wrap as single-day all
    return build_all_from_results([one], psy)


def build_all_from_results(day_results: list[dict], psy: set[str]) -> dict:
    themes, discovered = _aggregate_themes(day_results, psy)
    latest = day_results[-1]
    day_count = len(day_results)
    active = [t for t in themes if t["days_present"] > 0]
    high = [_short_card(t) for t in active if t["premium_fit"] == "high"][:15]
    mid = [_short_card(t) for t in active if t["premium_fit"] == "mid"][:12]
    avoid = [_short_card(t) for t in active if t["premium_fit"] == "avoid"]
    daily_digest = [
        {
            "day": d["day"],
            "report_date": d["report_date"],
            "source_name": d["source_name"],
            "advice_total": d["advice_total"],
            "assess_hit_count": d["assess_hit_count"],
            "noise_filtered": d["noise_filtered"],
            "active_theme_count": d["active_theme_count"],
            "top_themes": [
                {
                    "name": t["name"],
                    "urgency_score": t["urgency_score"],
                    "hit_count": t["hit_count"],
                }
                for t in d["themes"]
                if t["hit_count"] > 0
            ][:8],
            "top_items": d["top_items"][:25],
        }
        for d in day_results
    ]
    return {
        "meta": {
            "scope": "single_day" if day_count == 1 else "hotlib_all",
            "report_date": latest["report_date"],
            "latest_day": latest["day"],
            "days_covered": [d["day"] for d in day_results],
            "day_count": day_count,
            "day_range": f"{day_results[0]['day']}-{day_results[-1]['day']}",
            "source_dir": latest["source_dir"],
            "source_name": latest["source_name"] if day_count == 1 else f"热库全量×{day_count}日",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "advice_total": sum(d["advice_total"] for d in day_results),
            "assess_hit_count": sum(d["assess_hit_count"] for d in day_results),
            "assess_hit_latest": latest["assess_hit_count"],
            "noise_filtered": sum(d["noise_filtered"] for d in day_results),
            "curated_assigned": sum(d["curated_assigned"] for d in day_results),
            "discovered_theme_count": len(discovered),
            "uncategorized_count": len(latest.get("uncategorized_top") or []),
            "theme_count": len(themes),
            "active_theme_count": len(active),
            "schema_version": 3,
        },
        "daily_digest": daily_digest,
        "action_tiers": {
            "high": high,
            "mid": mid,
            "avoid": avoid,
            "rising": [_short_card(t) for t in active if t["trend"] == "rising"][:10],
            "new": [_short_card(t) for t in active if t["trend"] == "new"][:8],
            "watchlist": [_short_card(t) for t in active if t["days_present"] >= 1][:12],
            "discover": [_short_card(t) for t in discovered[:12]],
        },
        "themes": themes,
        "discovered_themes": discovered,
        "catalog_gap": [
            {
                "name": t["name"],
                "psy_code": t["psy_code"],
                "has_psy_pack": t["has_psy_pack"],
                "premium_fit": t["premium_fit"],
                "suggest_price_band": t["suggest_price_band"],
                "days_present": t["days_present"],
            }
            for t in themes
            if t["days_present"] == 0 and t["has_psy_pack"]
        ],
        "top_items": latest["top_items"],
        "latest_top_items": latest["top_items"],
        "uncategorized_top": latest.get("uncategorized_top") or [],
        "premium_shortlist": high,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", default=None, help="MMDD 单日；省略则扫全库有 advice 的日期")
    ap.add_argument(
        "--scope",
        choices=["all", "day"],
        default=None,
        help="all=全库（默认）；day=需配合 --day",
    )
    args = ap.parse_args()
    if args.scope == "day" and not args.day:
        raise SystemExit("--scope day 需要同时传 --day MMDD")
    if args.day:
        payload = build(args.day)
    else:
        payload = build_all()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    latest = OUT_DIR / "latest.json"
    latest.write_text(text, encoding="utf-8")
    (ASSETS_DIR / "latest.json").write_text(text, encoding="utf-8")
    stamp_name = (
        f"range_{payload['meta']['day_range']}.json"
        if payload["meta"].get("day_count", 1) > 1
        else f"{payload['meta']['report_date'].replace('-', '')}.json"
    )
    (OUT_DIR / stamp_name).write_text(text, encoding="utf-8")
    meta = payload["meta"]
    tiers = payload["action_tiers"]
    print(
        f"OK scope={meta.get('scope')} range={meta.get('day_range')} "
        f"days={meta.get('day_count')} assess_sum={meta['assess_hit_count']} "
        f"latest={meta.get('assess_hit_latest')} "
        f"active={meta['active_theme_count']}/{meta['theme_count']} "
        f"rising={len(tiers.get('rising') or [])} high={len(tiers['high'])} "
        f"-> {latest}"
    )


if __name__ == "__main__":
    main()
