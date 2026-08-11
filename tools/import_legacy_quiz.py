# -*- coding: utf-8 -*-
"""Import legacy HTML quizzes from 测评系统完整版 into Skin JSON drafts.

Usage:
  python tools/import_legacy_quiz.py --app 恋爱脑程度检测 --id love_brain --mode score_bands
  python tools/import_legacy_quiz.py --app 霍兰德职业兴趣测试 --id holland --mode holland
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEGACY = Path(r"D:\选品报告\资料生产工厂\测评系统完整版\apps")
OUT = ROOT / "packages" / "skins"
WEB = ROOT / "apps" / "web" / "skins"


def strip_js_comments(s: str) -> str:
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    s = re.sub(r"(?m)^\s*//.*?$", "", s)
    return s


def extract_balanced(html: str, name: str) -> str:
    m = re.search(rf"const\s+{name}\s*=\s*", html)
    if not m:
        raise ValueError(f"const {name} not found")
    i = m.end()
    while i < len(html) and html[i].isspace():
        i += 1
    if i >= len(html) or html[i] not in "[{":
        raise ValueError(f"const {name} not array/object")
    open_ch = html[i]
    close_ch = "]" if open_ch == "[" else "}"
    depth = 0
    in_str = None
    esc = False
    for j in range(i, len(html)):
        ch = html[j]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == in_str:
                in_str = None
            continue
        if ch in ("'", '"'):
            in_str = ch
            continue
        if ch == open_ch:
            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:
                return html[i : j + 1]
    raise ValueError(f"const {name} unbalanced")


def fix_raw_embedded_quotes(literal: str) -> str:
    """Fix legacy copy that puts raw " inside double-quoted JS strings."""

    def fix_field(s: str, key: str) -> str:
        out = []
        i = 0
        key_re = re.compile(rf"\b{key}\s*:\s*\"")
        while True:
            m = key_re.search(s, i)
            if not m:
                out.append(s[i:])
                break
            out.append(s[i : m.end()])
            start = m.end()
            rest = s[start:]
            end_m = re.search(r'"\s*(?:,\s*[A-Za-z_]|\s*[}\]])', rest)
            if not end_m:
                out.append(rest)
                break
            body = rest[: end_m.start()]
            out.append(body.replace("\\", "\\\\").replace('"', '\\"'))
            out.append('"')
            i = start + end_m.start() + 1
        return "".join(out)

    s = literal
    for key in ("q", "t", "d", "l", "advice", "desc", "name"):
        s = fix_field(s, key)
    return s


def js_literal_to_py(s: str):
    s = strip_js_comments(s)
    s = s.replace("{t.", '{t:"')
    s = s.replace(",{{", ",{")
    s = s.replace("{ {{", "{ {")
    s = fix_raw_embedded_quotes(s)
    out = []
    i = 0
    n = len(s)
    while i < n:
        ch = s[i]
        if ch in "'\"":
            quote = ch
            j = i + 1
            buf = ['"']
            while j < n:
                c = s[j]
                if c == "\\" and j + 1 < n:
                    nxt = s[j + 1]
                    if nxt == '"':
                        buf.append('\\"')
                    elif nxt == "'":
                        buf.append("'")
                    else:
                        buf.append(s[j : j + 2])
                    j += 2
                    continue
                if c == quote:
                    buf.append('"')
                    j += 1
                    break
                if c == '"':
                    buf.append('\\"')
                    j += 1
                    continue
                buf.append(c)
                j += 1
            out.append("".join(buf))
            i = j
            continue
        if ch.isalpha() or ch == "_":
            j = i + 1
            while j < n and (s[j].isalnum() or s[j] == "_"):
                j += 1
            word = s[i:j]
            k = j
            while k < n and s[k].isspace():
                k += 1
            prev = ""
            for prev_ch in reversed(out):
                stripped = prev_ch.rstrip()
                if stripped:
                    prev = stripped[-1]
                    break
            if k < n and s[k] == ":" and prev in "{[,":
                out.append(f'"{word}"')
                i = j
                continue
            out.append(word)
            i = j
            continue
        out.append(ch)
        i += 1
    text = "".join(out)
    text = re.sub(r",\s*([}\]])", r"\1", text)
    return json.loads(text)


def extract_const(html: str, name: str):
    literal = extract_balanced(html, name)
    try:
        return js_literal_to_py(literal)
    except json.JSONDecodeError as e:
        raise ValueError(f"const {name} unparseable: {e}") from e


def extract_const_optional(html: str, name: str):
    try:
        return extract_const(html, name)
    except ValueError:
        return None


def questions_to_skin_qs(raw):
    out = []
    for i, q in enumerate(raw):
        out.append(
            {
                "id": f"q{i + 1}",
                "d": q["d"],
                "q": q["q"],
                "o": [{"t": o["t"], "s": o["s"]} for o in q["o"]],
            }
        )
    return out


def dims_from_questions(raw, label_map=None):
    seen = []
    labels = {}
    for q in raw:
        d = q["d"]
        if d not in seen:
            seen.append(d)
            labels[d] = (label_map or {}).get(d) or q.get("t") or d
    dims = []
    for d in seen:
        lab = str(labels[d])
        lab = re.sub(r"[A-Z]$", "", lab).strip() or lab
        dims.append({"id": d, "label": lab})
    return dims


def bands_from_levels(levels):
    bands = []
    for lv in levels:
        label = lv.get("l") or lv.get("label") or lv.get("age") or ""
        bands.append(
            {
                "max": lv["max"],
                "label": label,
                "emoji": lv.get("emoji", ""),
                "color": lv.get("c") or lv.get("color"),
                "quote": lv.get("d") or lv.get("quote") or "",
                "advice": lv.get("advice") or "",
                "tags": [label] if label else ["段位"],
            }
        )
    return bands


def dim_full_for(dims):
    out = {}
    for d in dims:
        lab = d["label"]
        out[d["id"]] = {
            "h": lab,
            "high": f"「{lab}」偏高：这一维在把总分往上推，完整报告会给出调节切口。",
            "low": f"「{lab}」相对低：可作本月训练场，用小承诺验证。",
        }
    return out


def write_skin(skin: dict):
    OUT.mkdir(parents=True, exist_ok=True)
    WEB.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{skin['id']}.json"
    path.write_text(json.dumps(skin, ensure_ascii=False, indent=2), encoding="utf-8")
    shutil.copy2(path, WEB / f"{skin['id']}.json")
    print(f"wrote {path} ({len(skin.get('questions', []))} questions)")
    return path


def synthesize_levels_from_dims(qs_raw):
    """When legacy app has no levels[], build coarse bands from max possible score."""
    max_score = 0
    for q in qs_raw:
        max_score += max(o.get("s", 0) for o in q.get("o", [{"s": 0}]))
    step = max(1, max_score // 5)
    labels = ["低信号", "偏轻", "中等", "偏高", "高信号"]
    bands = []
    for i, lab in enumerate(labels):
        bands.append(
            {
                "max": max_score if i == len(labels) - 1 else step * (i + 1),
                "l": lab,
                "d": f"总分落在「{lab}」区间。完整报告会拆开维度贡献。",
                "advice": "选一个最高维或最低维，本周只做一个可勾选动作。",
                "emoji": "",
                "c": "",
            }
        )
    return bands


def build_score_bands(app_name: str, skin_id: str, title: str | None = None):
    html = (LEGACY / app_name / "index.html").read_text(encoding="utf-8")
    qs_raw = extract_const(html, "questions")
    levels = extract_const_optional(html, "levels") or synthesize_levels_from_dims(qs_raw)
    dims = dims_from_questions(qs_raw)
    title = title or app_name
    skin = {
        "id": skin_id,
        "title": title,
        "minutes": max(3, round(len(qs_raw) / 4)),
        "intro": f"迁自生产版「{app_name}」：维度累加后映射段位。用于自我觉察，不构成临床诊断。",
        "disclaimer": "娱乐向自我探索，非心理咨询或临床评估。",
        "youGet": ["段位称号", "多维得分结构", "场景解读与本周动作（完整报告）"],
        "dimensions": dims,
        "scoring": "score_bands",
        "scoreCap": max(lv.get("max", 0) for lv in levels),
        "bands": bands_from_levels(levels),
        "dim_full": dim_full_for(dims),
        "fullTemplate": [
            {
                "h": "如何使用本报告",
                "p": "先看段位建立共同语言，再看维度找调节切口；选一个本周动作连续 7 天，30 天后复测对照。",
            }
        ],
        "questions": questions_to_skin_qs(qs_raw),
        "source": app_name,
    }
    return write_skin(skin)


def build_holland(app_name: str, skin_id: str = "holland"):
    html = (LEGACY / app_name / "index.html").read_text(encoding="utf-8")
    qs_raw = extract_const(html, "questions")
    type_info = extract_const(html, "typeInfo")
    careers = extract_const(html, "careersByType")
    combos = extract_const(html, "careerCombos")
    label_map = {k: v.get("name", k) for k, v in type_info.items()}
    dims = dims_from_questions(qs_raw, label_map)
    results = {}
    for k, v in type_info.items():
        career_names = [c["name"] if isinstance(c, dict) else c for c in careers.get(k, [])[:4]]
        results[k] = {
            "type": f"{v.get('name', k)}主导",
            "short": v.get("name", k),
            "quote": v.get("desc") or f"你更倾向{v.get('name', k)}相关活动与环境。",
            "tags": [v.get("name", k), k, "RIASEC"],
            "advice": f"优先在「{v.get('name', k)}」相关环境里验证兴趣，再谈转行成本。",
            "full": [
                {
                    "h": f"{v.get('name', k)}画像",
                    "p": f"{v.get('desc', '')}。兴趣是匹配提示，请结合能力与现实约束验证。",
                },
                {
                    "h": "邻近职业参考",
                    "p": "、".join(career_names) + "（参考，非求职承诺）。",
                },
            ],
        }
    combo_map = {
        code: {"name": meta.get("name"), "desc": meta.get("desc")}
        for code, meta in combos.items()
    }
    skin = {
        "id": skin_id,
        "title": "霍兰德职业兴趣",
        "minutes": 5,
        "intro": "基于 Holland RIASEC 六型兴趣：18 题得出三联兴趣码。用于自我探索与环境匹配，不作求职承诺。",
        "disclaimer": "兴趣测评仅供参考，不构成职业指导或录用建议。",
        "youGet": ["RIASEC 六维分布", "三联兴趣码", "邻近职业参考与场景建议（完整报告）"],
        "dimensions": dims,
        "scoring": "holland",
        "results": results,
        "careers": careers,
        "combos": combo_map,
        "fullTemplate": [
            {
                "h": "使用方式",
                "p": "用三联码缩小环境选项，再用收入/地点/门槛二次过滤；30 天后可复测对照兴趣稳定性。",
            }
        ],
        "questions": questions_to_skin_qs(qs_raw),
        "source": app_name,
    }
    return write_skin(skin)


def sync_catalog():
    src = OUT / "catalog.json"
    if src.exists():
        shutil.copy2(src, WEB / "catalog.json")
        print(f"synced catalog -> {WEB / 'catalog.json'}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True, help="folder name under 测评系统完整版/apps")
    ap.add_argument("--id", required=True, help="skin id")
    ap.add_argument("--mode", choices=["score_bands", "holland"], required=True)
    ap.add_argument("--title", default=None)
    args = ap.parse_args()
    if args.mode == "score_bands":
        build_score_bands(args.app, args.id, args.title)
    else:
        build_holland(args.app, args.id)
    sync_catalog()


if __name__ == "__main__":
    main()
