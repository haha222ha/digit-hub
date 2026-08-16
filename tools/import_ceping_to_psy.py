# -*- coding: utf-8 -*-
"""Import 测评系统完整版 apps into psy-dist with original skins preserved.

Copies each app folder to apps/psy-dist/tests/{code}/, strips legacy auth UI,
remaps purple-clone packs onto their style.css palette when present, and injects
PsyTestValidator + ceping-bridge so distribution links work.

Usage:
  python tools/import_ceping_to_psy.py --batch priority
  python tools/import_ceping_to_psy.py --batch wave2
  python tools/import_ceping_to_psy.py --batch wave3
  python tools/import_ceping_to_psy.py --batch thin
  python tools/import_ceping_to_psy.py --batch reskin
  python tools/import_ceping_to_psy.py --app 恋爱心软测试 --code lxrx
  python tools/import_ceping_to_psy.py --batch all --dry-run
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEGACY_CANDIDATES = [
    Path(r"D:\测评系统完整版\apps"),
    Path(r"D:\选品报告\资料生产工厂\测评系统完整版\apps"),
]
OUT_TESTS = ROOT / "apps" / "psy-dist" / "tests"
CATALOG = ROOT / "packages" / "psy-dist" / "tests-catalog.json"
ASSETS_CATALOG = (
    ROOT / "services" / "xhs-cloud" / "cloud_deploy" / "assets" / "psy-dist" / "tests-catalog.json"
)

# Prefer unique-skin HTML folders over purple data.json clones when both exist.
PREFERRED_APP: dict[str, str] = {
    "lxrx": "lianai_xinruan",
    "mbtidili": "MBTI地理人格",
    "hwcs": "海外城市适配",
    "dymx": "电影美学类型",
    "tfql": "天赋潜力测试",
    "zyjd": "职业倦怠程度测试",
    "zcnh": "职场内耗等级检测",
    "gqtf": "搞钱天赋检测",
    "zhsp": "转行适配度检测",
}

# Priority batch: market-hot themes (unique skin preferred via PREFERRED_APP / style remap).
PRIORITY: list[tuple[str, str, str]] = [
    ("恋爱心软测试", "lxrx", "恋爱心软测试"),
    ("恋爱脑程度检测", "lnnd", "恋爱脑程度检测"),
    ("恋爱人格测试", "largv", "恋爱人格测试"),
    ("吸渣体质测试", "xzzt", "吸渣体质测试"),
    ("吸渣体质深度检测", "xzsd", "吸渣体质深度检测"),
    ("该不该复合测试", "gbfh", "该不该复合测试"),
    ("暧昧段位深度检测", "amdw", "暧昧段位深度检测"),
    ("暧昧拉扯天赋测试", "amlc", "暧昧拉扯天赋测试"),
    ("依恋类型测试", "yllx", "依恋类型测试"),
    ("情感安全感测试", "qgaq", "情感安全感测试"),
    ("情感安全感缺失测试", "qgqs", "情感安全感缺失测试"),
    ("被爱体质检测", "batz", "被爱体质检测"),
    ("桃花体质类型测试", "thtz", "桃花体质类型测试"),
    ("母单脱单难度测试", "mdnd", "母单脱单难度测试"),
    ("母单脱单核心卡点测试", "mdkd", "母单脱单核心卡点测试"),
    ("职场PUA敏感度检测", "zcpua", "职场PUA敏感度检测"),
    ("职场讨好型人格检测", "zcth", "职场讨好型人格检测"),
    ("职业倦怠程度测试", "zyjd", "职业倦怠程度测试"),
    ("松弛感指数测试", "scgz", "松弛感指数测试"),
    ("高敏感天赋测试", "gmgt", "高敏感天赋测试"),
    ("职场内耗等级检测", "zcnh", "职场内耗等级检测"),
    ("月度精神内耗复测", "ydnh", "月度精神内耗复测"),
    ("正缘特征测试", "zytz", "正缘特征测试"),
    ("对方真心程度测试", "dfzx", "对方真心程度测试"),
    ("穿搭风格精准测试", "cdfg", "穿搭风格精准测试"),
    ("骨相美皮相美测试", "gxpx", "骨相美皮相美测试"),
    ("奶茶人格测试", "ncrg", "奶茶人格测试"),
    ("咖啡人格", "kfrg", "咖啡人格"),
]

# Wave2: standalone unique :root skins not yet in catalog (or distinct from existing).
WAVE2: list[tuple[str, str, str]] = [
    ("霍兰德职业兴趣测试", "holland", "霍兰德职业兴趣测试"),
    ("情绪检查表", "qxjc", "情绪检查表"),
    ("分手自愈能力测试", "fszy", "分手自愈能力测试"),
    ("前任执念程度测试", "qrzh", "前任执念程度测试"),
    ("MBTI地理人格", "mbtidili", "MBTI地理人格"),
    ("诗人气质", "srrq", "诗人气质"),
    ("中国诗人气质", "zgsr", "中国诗人气质"),
    ("电影美学类型", "dymx", "电影美学类型"),
    ("城市氛围感", "csfw", "城市氛围感"),
    ("婚前焦虑检测", "hqjl", "婚前焦虑检测"),
    ("单身快乐指数测试", "dskl", "单身快乐指数测试"),
    ("职场沟通风格测试", "zcgt", "职场沟通风格测试"),
    ("搞钱天赋检测", "gqtf", "搞钱天赋检测"),
    ("灵魂动物测试", "lhdw", "灵魂动物测试"),
    ("领导力潜质测试", "ldlqz", "领导力潜质测试"),
    ("国风气质测试", "gfqz", "国风气质测试"),
    ("情侣婚恋适配度测试", "qlhl", "情侣婚恋适配度测试"),
    ("宝宝天赋测试", "bbtf", "宝宝天赋测试"),
    ("出厂设置", "ccsz", "出厂设置"),
    ("追星人格测试", "zxrg", "追星人格测试"),
    ("山海经神兽", "shjss", "山海经神兽"),
    ("吃什么", "chish", "吃什么"),
    ("原生家庭影响测试", "ysjtyx", "原生家庭影响测试"),
    ("哲学测试", "zxcs", "哲学测试"),
    ("文风测试", "wfcs", "文风测试"),
    ("天赋潜力测试", "tfql", "天赋潜力测试"),
    ("Kpop女团成员", "kpopnt", "Kpop女团成员"),
    ("Kpop男团", "kpopntm", "Kpop男团"),
    ("海外城市适配", "hwcs", "海外城市适配"),
    ("考研适配测试", "kysp", "考研适配测试"),
    ("TA喜欢什么", "taxh", "TA喜欢什么"),
    ("你读不懂", "ndbd", "你读不懂"),
    ("职场人设类型测试", "zcrs", "职场人设类型测试"),
    ("转行适配度检测", "zhsp", "转行适配度检测"),
    ("艾薇鉴赏测试", "avjs", "艾薇鉴赏测试"),
    ("情绪稳定度月度检测", "qxwd", "情绪稳定度月度检测"),
]

# Wave3: remaining unique :root skins from 完整版 not yet in catalog.
WAVE3: list[tuple[str, str, str]] = [
    ("35岁危机风险检测", "wl35", "35岁危机风险检测"),
    ("副业适配度测试", "fysp", "副业适配度测试"),
    ("同事职场默契测试", "tsmq", "同事职场默契测试"),
    ("吵架原因深度", "cjyy", "吵架原因深度"),
    ("女生情感测试", "nsqg", "女生情感测试"),
    ("工作生活平衡测试", "gzph", "工作生活平衡测试"),
    ("爱的语言匹配", "ydyy", "爱的语言匹配"),
    ("闺蜜性格反差测试", "gmxg", "闺蜜性格反差测试"),
]

# Thin shells that share identical purple CSS in 完整版 — give each a semantic palette.
THEME_OVERRIDES: dict[str, dict[str, str]] = {
    "xzzt": {  # 吸渣 — 警示玫红
        "primary": "#be123c",
        "secondary": "#9f1239",
        "bg_start": "#fff1f2",
        "bg_end": "#ffe4e6",
    },
    "amlc": {  # 暧昧拉扯 — 暖橙
        "primary": "#ea580c",
        "secondary": "#c2410c",
        "bg_start": "#fff7ed",
        "bg_end": "#ffedd5",
    },
    "thtz": {  # 桃花 — 樱花粉
        "primary": "#db2777",
        "secondary": "#be185d",
        "bg_start": "#fdf2f8",
        "bg_end": "#fce7f3",
    },
    "zytz": {  # 正缘 — 蔷薇紫（与桃花粉区分）
        "primary": "#c026d3",
        "secondary": "#a21caf",
        "bg_start": "#faf5ff",
        "bg_end": "#f5d0fe",
    },
    "dfzx": {  # 真心 — 赤诚红
        "primary": "#dc2626",
        "secondary": "#b91c1c",
        "bg_start": "#fef2f2",
        "bg_end": "#fecaca",
    },
    "cdfg": {  # 穿搭 — 时尚墨绿
        "primary": "#0f766e",
        "secondary": "#115e59",
        "bg_start": "#f0fdfa",
        "bg_end": "#ccfbf1",
    },
    "gbfh": {  # 复合 — 抉择琥珀
        "primary": "#d97706",
        "secondary": "#b45309",
        "bg_start": "#fffbeb",
        "bg_end": "#fde68a",
    },
    "gxpx": {  # 骨相皮相 — 石色金
        "primary": "#a16207",
        "secondary": "#854d0e",
        "bg_start": "#fafaf9",
        "bg_end": "#e7e5e4",
    },
    "qgqs": {  # 安全感缺失 — 冷静蓝
        "primary": "#2563eb",
        "secondary": "#1d4ed8",
        "bg_start": "#eff6ff",
        "bg_end": "#dbeafe",
    },
    "scgz": {  # 松弛感 — 鼠尾草绿
        "primary": "#65a30d",
        "secondary": "#4d7c0f",
        "bg_start": "#f7fee7",
        "bg_end": "#ecfccb",
    },
}

RESKIN_CODES = [
    "lxrx",
    "xzzt",
    "amlc",
    "thtz",
    "zytz",
    "dfzx",
    "cdfg",
    "gbfh",
    "gxpx",
    "qgqs",
    "scgz",
]

AUTH_SCRIPT_RE = re.compile(
    r"<!--\s*System Auth\s*-->\s*<script>[\s\S]*?</script>",
    re.I,
)
COMMON_JS_RE = re.compile(
    r'<script[^>]+src=["\']/static/js/common\.js["\'][^>]*>\s*</script>\s*',
    re.I,
)
COMMON_CSS_RE = re.compile(
    r'<link[^>]+href=["\']/static/css/common\.css["\'][^>]*>\s*',
    re.I,
)
GLOBAL_AUTH_MODAL_RE = re.compile(
    r'<div[^>]+id=["\']global-auth-modal["\'][\s\S]*?</div>\s*(?=<nav|<div|<!--|<script|</body>)',
    re.I,
)
SYS_AUTH_GATE_RE = re.compile(
    r"if\s*\(\s*sessionStorage\.getItem\(\s*['\"]sys_authed['\"]\s*\)\s*!==\s*['\"]true['\"]\s*\)\s*\{[\s\S]*?return;\s*\}",
    re.I,
)
PURPLE_A = "#667eea"
PURPLE_B = "#764ba2"


def find_legacy_apps() -> Path:
    for p in LEGACY_CANDIDATES:
        if p.is_dir():
            return p
    raise SystemExit("找不到测评系统完整版/apps，请确认 D:\\测评系统完整版 存在")


def _expand_hex(h: str) -> str:
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return "#" + h.lower()


def _hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = _expand_hex(h).lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def extract_theme_from_css(css: str) -> dict[str, str] | None:
    """Pull a distinct palette from style.css (body bg + button accents)."""
    if not css.strip():
        return None
    body_m = re.search(
        r"body\s*\{[^}]*?background(?:-image)?\s*:\s*([^;]+)",
        css,
        re.I | re.S,
    )
    btn_m = re.search(
        r"(?:^|\n)\s*(?:button|\.btn)\s*\{[^}]*?background(?:-image)?\s*:\s*([^;]+)",
        css,
        re.I | re.S,
    )
    body_hexes = re.findall(r"#[0-9a-fA-F]{3,8}", body_m.group(1) if body_m else "")
    btn_hexes = re.findall(r"#[0-9a-fA-F]{3,8}", btn_m.group(1) if btn_m else "")
    # Fallback: any warm/cool accent often used as h2 / progress
    if not btn_hexes:
        accent_m = re.search(
            r"(?:h2|\.question-num|\.progress-fill|color)\s*:\s*(#[0-9a-fA-F]{3,8})",
            css,
            re.I,
        )
        if accent_m:
            btn_hexes = [accent_m.group(1)]
    if not body_hexes and not btn_hexes:
        return None
    primary = _expand_hex(btn_hexes[0] if btn_hexes else body_hexes[0])
    secondary = _expand_hex(
        btn_hexes[1] if len(btn_hexes) > 1 else (body_hexes[-1] if body_hexes else primary)
    )
    bg_start = _expand_hex(body_hexes[0] if body_hexes else primary)
    bg_end = _expand_hex(body_hexes[1] if len(body_hexes) > 1 else secondary)
    # Skip if CSS is still the same purple clone
    if primary in (PURPLE_A, PURPLE_B) and secondary in (PURPLE_A, PURPLE_B):
        return None
    return {
        "primary": primary,
        "secondary": secondary,
        "bg_start": bg_start,
        "bg_end": bg_end,
    }


def remap_purple_theme(html: str, theme: dict[str, str]) -> str:
    """Replace shared purple-shell colors with per-test palette from style.css.

    Soft bg colors apply only to page/body backgrounds; buttons/progress/accents
    use primary→secondary so text stays readable on CTA.
    """
    p, s = theme["primary"], theme["secondary"]
    bg_a, bg_b = theme["bg_start"], theme["bg_end"]
    purple_grad = f"linear-gradient(135deg, {PURPLE_A} 0%, {PURPLE_B} 100%)"
    accent_grad = f"linear-gradient(135deg, {p} 0%, {s} 100%)"
    soft_grad = f"linear-gradient(135deg, {bg_a} 0%, {bg_b} 100%)"

    # Body/page soft wash first (before global gradient replace)
    html = re.sub(
        rf"((?:html,\s*)?body\s*\{{[^}}]*?background:\s*){re.escape(purple_grad)}",
        rf"\1{soft_grad}",
        html,
        flags=re.I | re.S,
    )
    # Remaining purple gradients (btn / progress / level chips) → accent
    if purple_grad in html:
        html = html.replace(purple_grad, accent_grad)

    # Solid purple accents → primary/secondary
    if PURPLE_A in html or PURPLE_B in html:
        html = html.replace(PURPLE_A, p)
        html = html.replace(PURPLE_B, s)
        html = html.replace(PURPLE_A.upper(), p)
        html = html.replace(PURPLE_B.upper(), s)

    pr, pg, pb = _hex_to_rgb(p)
    html = re.sub(
        r"rgba\(\s*102\s*,\s*126\s*,\s*234\s*,",
        f"rgba({pr}, {pg}, {pb},",
        html,
    )

    # Ensure CTA / progress keep accent even if a prior bad reskin washed them
    html = _force_accent_overrides(html, theme)
    return html


def _force_accent_overrides(html: str, theme: dict[str, str]) -> str:
    """Append a small override block so thin shells keep distinctive accents."""
    p, s = theme["primary"], theme["secondary"]
    bg_a, bg_b = theme["bg_start"], theme["bg_end"]
    pr, pg, pb = _hex_to_rgb(p)
    marker = "/* psy-skin-accent */"
    if marker in html:
        html = re.sub(
            rf"{re.escape(marker)}[\s\S]*?/\* /psy-skin-accent \*/",
            "",
            html,
            count=1,
        )
    block = f"""{marker}
html, body {{ background: linear-gradient(135deg, {bg_a} 0%, {bg_b} 100%) !important; }}
.btn, button.btn, .result-level, .progress-fill {{
  background: linear-gradient(135deg, {p} 0%, {s} 100%) !important;
  color: #fff !important;
}}
.question-num, .result-score, h2 {{ color: {p} !important; }}
.option-btn:hover {{ border-color: {p} !important; background: rgba({pr},{pg},{pb},0.08) !important; }}
.spinner {{ border-top-color: {p} !important; }}
/* /psy-skin-accent */
"""
    if re.search(r"</style>", html, re.I):
        return re.sub(r"</style>", block + "</style>", html, count=1, flags=re.I)
    return block + html


def ensure_style_css_cascade(html: str, dest: Path) -> str:
    """If style.css exists and is not linked, append it after inline styles so it can refine look.

    For purple clones we still remapped hexes; linking helps packs whose HTML already
    expects style.css class names (e.g. scgz).
    """
    css_path = dest / "style.css"
    if not css_path.exists():
        return html
    if re.search(r'href=["\']style\.css["\']', html, re.I):
        return html
    link = '<link rel="stylesheet" href="style.css">\n'
    if re.search(r"</head>", html, re.I):
        return re.sub(r"</head>", link + "</head>", html, count=1, flags=re.I)
    return link + html


def count_questions(src: Path) -> int:
    data = src / "data.json"
    if data.exists():
        try:
            raw = json.loads(data.read_text(encoding="utf-8"))
            if isinstance(raw, list):
                return len(raw)
            if isinstance(raw, dict):
                qs = raw.get("questions") or raw.get("items") or []
                return len(qs) if isinstance(qs, list) else 0
        except json.JSONDecodeError:
            pass  # fall through to HTML parse (some legacy data.json are broken)
    html = (src / "index.html").read_text(encoding="utf-8", errors="ignore")
    for name in ("questions", "qs", "QUESTIONS"):
        m = re.search(rf"(?:const|let|var)\s+{name}\s*=\s*\[", html)
        if not m:
            continue
        start = m.end() - 1
        depth = 0
        for i, ch in enumerate(html[start:], start):
            if ch == "[":
                depth += 1
            elif ch == "]":
                depth -= 1
                if depth == 0:
                    chunk = html[start : i + 1]
                    # Top-level-ish question objects (avoid nested option blobs)
                    n = len(re.findall(r"\{\s*(?:id|q|title)\s*:", chunk))
                    if n == 0:
                        n = len(re.findall(r"\{\s*(?:d|text)\s*:", chunk))
                    if n == 0:
                        n = chunk.count("{")
                    # Guard against counting result catalogs / poet banks as questions
                    if n > 80:
                        n2 = len(re.findall(r"\{\s*id\s*:", chunk))
                        if 5 <= n2 <= 80:
                            n = n2
                        else:
                            n = min(n, 40)
                    return n
    return 20


def strip_auth_ui(html: str) -> str:
    html = AUTH_SCRIPT_RE.sub("", html)
    html = COMMON_JS_RE.sub("", html)
    html = COMMON_CSS_RE.sub("", html)
    html = GLOBAL_AUTH_MODAL_RE.sub("", html)
    html = SYS_AUTH_GATE_RE.sub("", html)
    return html


def _replace_balanced_function(html: str, name: str, replacement: str) -> str:
    m = re.search(rf"function\s+{name}\s*\(\s*\)\s*\{{", html)
    if not m:
        return html
    start = m.start()
    i = m.end() - 1  # at '{'
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
        if ch in ("'", '"', "`"):
            in_str = ch
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return html[:start] + replacement + html[j + 1 :]
    return html


def adapt_auth_page_flow(html: str) -> str:
    """Convert #auth + login()/api/auth into intro + token start."""
    if 'id="auth"' not in html and "id='auth'" not in html:
        return html

    # Auto-load on localStorage auth would skip startTest — neutralize.
    html = re.sub(
        r"if\s*\(\s*localStorage\.getItem\(\s*[\"']auth[\"']\s*\)\s*\)\s*load\s*\(\s*\)\s*;?",
        "// psy: no auto-load; wait for start",
        html,
    )

    html = _replace_balanced_function(
        html,
        "login",
        """function login(){
            Promise.resolve(window.__psyEnsureStart && window.__psyEnsureStart()).then(function(ok){
                if (ok === false) return;
                load();
            }).catch(function(e){ alert((e&&e.message)||'无法开始测试'); });
        }""",
    )

    # Drop auth code input; keep start button
    html = re.sub(
        r"<input[^>]*id=[\"']code[\"'][^>]*>\s*",
        "",
        html,
        count=1,
        flags=re.I,
    )
    html = re.sub(
        r"<p[^>]*id=[\"']msg[\"'][^>]*>[\s\S]*?</p>\s*",
        "",
        html,
        count=1,
        flags=re.I,
    )
    # Neutralize /api/result/submit noise
    html = re.sub(
        r"fetch\(\s*[\"']/api/result/submit[\"'][\s\S]*?\)\.catch\(\(\)\s*=>\s*\{\s*\}\)\s*;?",
        "if (window.__psyComplete) window.__psyComplete({ score: score });",
        html,
    )
    return html


def inject_bridge(html: str, code: str) -> str:
    snippet = f"""
<script>window.__PSY_TEST_CODE__ = {json.dumps(code)};</script>
<script src="/static/js/link-validator.js"></script>
<script src="/static/js/ceping-bridge.js"></script>
"""
    if "ceping-bridge.js" in html:
        return html
    if re.search(r"</body>", html, re.I):
        return re.sub(r"</body>", snippet + "</body>", html, count=1, flags=re.I)
    return html + snippet


def fix_home_nav(html: str) -> str:
    # Keep skin; point home to psy landing instead of broken Flask /
    html = re.sub(
        r"""href=(['"])/\1""",
        r"""href=\1https://psy.xhs365.cn/\1""",
        html,
    )
    # Unique skins often leave purple nav accents; align to --primary when present
    if "--primary:" in html or "--primary :" in html:
        html = re.sub(
            r"(\.nav-home\s*\{[^}]*?color:\s*)#667eea",
            r"\1var(--primary)",
            html,
            flags=re.I | re.S,
        )
        html = re.sub(
            r"(\.nav-home:hover\s*\{[^}]*?color:\s*)#764ba2",
            r"\1var(--primary-dark, var(--primary))",
            html,
            flags=re.I | re.S,
        )
    return html


def apply_unique_skin(html: str, dest: Path, code: str = "") -> str:
    theme = THEME_OVERRIDES.get(code)
    if not theme:
        css_path = dest / "style.css"
        if css_path.exists():
            theme = extract_theme_from_css(
                css_path.read_text(encoding="utf-8", errors="ignore")
            )
    if theme:
        html = remap_purple_theme(html, theme)
    html = ensure_style_css_cascade(html, dest)
    return html


def transform_index(html: str, code: str, dest: Path) -> str:
    html = strip_auth_ui(html)
    html = adapt_auth_page_flow(html)
    html = fix_home_nav(html)
    html = apply_unique_skin(html, dest, code)
    html = inject_bridge(html, code)
    return html


def resolve_src(legacy_root: Path, app_name: str, code: str) -> Path:
    preferred = PREFERRED_APP.get(code)
    if preferred:
        p = legacy_root / preferred
        if p.is_dir() and (p / "index.html").exists():
            return p
    src = legacy_root / app_name
    if not src.is_dir():
        raise FileNotFoundError(src)
    if not (src / "index.html").exists():
        raise FileNotFoundError(src / "index.html")
    return src


def import_one(legacy_root: Path, app_name: str, code: str, title: str, dry_run: bool) -> dict:
    src = resolve_src(legacy_root, app_name, code)

    dest = OUT_TESTS / code
    qn = count_questions(src)
    minutes = max(3, min(15, round(qn / 5) or 3))
    meta = {
        "code": code,
        "name": title,
        "questions": qn,
        "duration_min": minutes,
        "hot": True,
        "dual_perspective": False,
        "source_app": src.name,
        "skin_preserved": True,
    }
    if dry_run:
        print(f"[dry-run] {src.name} -> {code} ({qn}q)")
        return meta

    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(
        src,
        dest,
        ignore=shutil.ignore_patterns("*.pyc", "__pycache__", ".DS_Store"),
    )
    index = dest / "index.html"
    html = index.read_text(encoding="utf-8", errors="ignore")
    index.write_text(transform_index(html, code, dest), encoding="utf-8")
    if code in THEME_OVERRIDES and (dest / "style.css").exists():
        _rewrite_style_css_palette(dest / "style.css", THEME_OVERRIDES[code])
    print(f"imported {src.name} -> tests/{code}/ ({qn}q)")
    return meta


def reskin_existing(code: str, dry_run: bool) -> dict | None:
    """Re-apply palette remap on an already-imported purple/thin pack."""
    dest = OUT_TESTS / code
    index = dest / "index.html"
    if not index.exists():
        print(f"skip reskin {code}: missing index")
        return None
    html = index.read_text(encoding="utf-8", errors="ignore")
    theme = THEME_OVERRIDES.get(code)
    css_path = dest / "style.css"
    if not theme and css_path.exists():
        theme = extract_theme_from_css(css_path.read_text(encoding="utf-8", errors="ignore"))
    if not theme:
        print(f"skip reskin {code}: no theme override / style.css palette")
        return None
    if dry_run:
        print(f"[dry-run] reskin {code} -> {theme}")
        return {"code": code, "theme": theme}
    new_html = remap_purple_theme(html, theme)
    new_html = ensure_style_css_cascade(new_html, dest)
    if "ceping-bridge.js" not in new_html:
        new_html = inject_bridge(new_html, code)
    index.write_text(new_html, encoding="utf-8")
    # Keep style.css in sync for thin shells so linked CSS matches accent
    if code in THEME_OVERRIDES and css_path.exists():
        _rewrite_style_css_palette(css_path, theme)
    print(f"reskinned {code}: {theme['bg_start']}→{theme['primary']}")
    return {"code": code, "theme": theme}


def _rewrite_style_css_palette(css_path: Path, theme: dict[str, str]) -> None:
    css = css_path.read_text(encoding="utf-8", errors="ignore")
    p, s = theme["primary"], theme["secondary"]
    bg_a, bg_b = theme["bg_start"], theme["bg_end"]
    css = re.sub(
        r"(body\s*\{[^}]*?background:\s*)linear-gradient\([^)]+\)",
        rf"\1linear-gradient(135deg, {bg_a} 0%, {bg_b} 100%)",
        css,
        count=1,
        flags=re.I | re.S,
    )
    css = re.sub(
        r"(button\s*\{[^}]*?background:\s*)linear-gradient\([^)]+\)",
        rf"\1linear-gradient(135deg, {p} 0%, {s} 100%)",
        css,
        count=1,
        flags=re.I | re.S,
    )
    css = re.sub(r"(h2\s*\{[^}]*?color:\s*)#[0-9a-fA-F]{3,8}", rf"\1{p}", css, count=1, flags=re.I | re.S)
    css_path.write_text(css, encoding="utf-8")


def upsert_catalog(entries: list[dict]) -> None:
    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    by_code = {t["code"]: t for t in cat.get("tests", [])}
    for e in entries:
        if "questions" not in e:
            continue
        slim = {
            "code": e["code"],
            "name": e["name"],
            "questions": e["questions"],
            "duration_min": e["duration_min"],
            "hot": e.get("hot", True),
            "dual_perspective": e.get("dual_perspective", False),
        }
        by_code[e["code"]] = slim
    # Keep original order, append new at end
    ordered: list[dict] = []
    seen = set()
    for t in cat.get("tests", []):
        code = t["code"]
        if code in by_code:
            ordered.append(by_code[code])
            seen.add(code)
    for code, t in by_code.items():
        if code not in seen:
            ordered.append(t)
    cat["tests"] = ordered
    cat["total"] = len(ordered)
    text = json.dumps(cat, ensure_ascii=False, indent=2) + "\n"
    CATALOG.write_text(text, encoding="utf-8")
    ASSETS_CATALOG.parent.mkdir(parents=True, exist_ok=True)
    ASSETS_CATALOG.write_text(text, encoding="utf-8")
    print(f"catalog updated: {len(ordered)} tests -> {CATALOG}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", help="folder name under 完整版/apps")
    ap.add_argument("--code", help="psy-dist test code")
    ap.add_argument("--title", default=None)
    ap.add_argument(
        "--batch",
        choices=["priority", "wave2", "wave3", "reskin", "all", "thin"],
        default=None,
    )
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    legacy = find_legacy_apps()
    jobs: list[tuple[str, str, str]] = []
    if args.batch == "priority":
        jobs = PRIORITY
    elif args.batch == "wave2":
        jobs = WAVE2
    elif args.batch == "wave3":
        jobs = WAVE3
    elif args.batch == "all":
        jobs = PRIORITY + WAVE2 + WAVE3
    elif args.batch == "thin":
        # Re-copy thin shells from legacy then apply fixed accent remap
        thin = [
            ("吸渣体质测试", "xzzt", "吸渣体质测试"),
            ("暧昧拉扯天赋测试", "amlc", "暧昧拉扯天赋测试"),
            ("桃花体质类型测试", "thtz", "桃花体质类型测试"),
            ("正缘特征测试", "zytz", "正缘特征测试"),
            ("对方真心程度测试", "dfzx", "对方真心程度测试"),
            ("穿搭风格精准测试", "cdfg", "穿搭风格精准测试"),
            ("该不该复合测试", "gbfh", "该不该复合测试"),
            ("骨相美皮相美测试", "gxpx", "骨相美皮相美测试"),
            ("情感安全感缺失测试", "qgqs", "情感安全感缺失测试"),
            ("松弛感指数测试", "scgz", "松弛感指数测试"),
        ]
        jobs = thin
    elif args.batch == "reskin":
        entries_r: list[dict] = []
        for code in RESKIN_CODES:
            if code == "lxrx":
                entries_r.append(
                    import_one(legacy, "恋爱心软测试", "lxrx", "恋爱心软测试", args.dry_run)
                )
            else:
                reskin_existing(code, args.dry_run)
        if entries_r and not args.dry_run:
            upsert_catalog(entries_r)
        return
    elif args.app and args.code:
        jobs = [(args.app, args.code, args.title or args.app)]
    else:
        ap.error("需要 --batch priority|wave2|wave3|reskin|thin|all 或 --app + --code")

    entries = []
    for app_name, code, title in jobs:
        try:
            entries.append(import_one(legacy, app_name, code, title, args.dry_run))
        except Exception as e:
            print(f"FAIL {app_name}: {e}")
    if entries and not args.dry_run:
        upsert_catalog(entries)


if __name__ == "__main__":
    main()
