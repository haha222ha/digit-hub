# -*- coding: utf-8 -*-
"""Import CodeBuddy 秋招 5 SKU prototypes into psy-dist with PsyTestValidator auth.

- Strip paywall / mockPay (distribution link auth replaces payment)
- Inject link-validator + ceping-bridge
- Register packages/psy-dist/tests-catalog.json + cloud mirror
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(r"c:\Users\Administrator\CodeBuddy\20260819223835")
OUT_TESTS = ROOT / "apps" / "psy-dist" / "tests"
CATALOG = ROOT / "packages" / "psy-dist" / "tests-catalog.json"
CATALOG_CLOUD = (
    ROOT / "services" / "xhs-cloud" / "cloud_deploy" / "assets" / "psy-dist" / "tests-catalog.json"
)

# (source filename, dist_code, catalog name, questions, minutes)
SKUS: list[tuple[str, str, str, int, int]] = [
    ("offer概率测试_原型.html", "ofpr", "秋招 offer 概率测算", 12, 3),
    ("简历竞争力体检_原型.html", "jlpf", "简历竞争力评分", 18, 5),
    ("四路径适配_原型.html", "slpz", "考公考研大厂留学 · 四路径适配", 24, 7),
    ("校招测评练习_原型.html", "xzcp", "求职性格测评 · 校招练习版", 14, 8),
    ("i人面试守护灵_原型.html", "irms", "i人面试生存指南", 10, 3),
]

AUTH_TAIL = """
<script>window.__PSY_TEST_CODE__ = "{code}";</script>
<script src="/static/js/link-validator.js"></script>
<script src="/static/js/ceping-bridge.js"></script>
"""

SECURITY_HEAD = """
  <!-- 引入安全工具库（必须在head中尽早加载） -->
  <script src="/static/js/test-security.js"></script>
"""


def _remove_div_by_id(html: str, elem_id: str) -> str:
    """Remove a single balanced <div … id="elem_id">…</div> block."""
    marker = f'id="{elem_id}"'
    pos = html.find(marker)
    if pos < 0:
        return html
    start = html.rfind("<div", 0, pos)
    if start < 0:
        return html
    i, depth, end = start, 0, None
    while i < len(html):
        if html.startswith("<div", i):
            depth += 1
            gt = html.find(">", i)
            if gt < 0:
                break
            i = gt + 1
            continue
        if html.startswith("</div>", i):
            depth -= 1
            i += 6
            if depth == 0:
                end = i
                break
            continue
        i += 1
    if end is None:
        return html
    # also drop following whitespace / comment about 付费
    j = end
    while j < len(html) and html[j] in " \t\r\n":
        j += 1
    if html.startswith("<!--", j):
        cend = html.find("-->", j)
        if cend > 0:
            j = cend + 3
    return html[:start] + html[j:]


def strip_paywall_html(html: str) -> str:
    return _remove_div_by_id(html, "paywall")


def patch_js_skip_pay(html: str, code: str) -> str:
    """Replace paywall navigation with direct result / unbox / report."""
    # offer: after calc show unbox (keep envelope) instead of paywall
    html = html.replace(
        "setTimeout(()=>{calc();show('paywall');},2500);",
        "setTimeout(()=>{calc();show('unbox');},2500);",
    )
    # resume: calc then paywall → result
    html = html.replace(
        "setTimeout(()=>{calc();show('paywall');},3400);",
        "setTimeout(()=>{calc();showResult();},3400);",
    )
    # four path
    html = html.replace(
        "setTimeout(()=>{show('paywall');},3600);",
        "setTimeout(()=>{showResult();},3600);",
    )
    # exam practice grading
    html = html.replace(
        "setTimeout(()=>{calc();show('paywall');},2200);",
        "setTimeout(()=>{calc();showReport();},2200);",
    )
    # generic leftover paywall shows
    html = re.sub(r"show\(['\"]paywall['\"]\)", "showResult()", html)
    # if showResult not defined but showReport is, the exam file uses showReport already

    # neutralize mockPay if still referenced
    html = re.sub(
        r"function mockPay\(\)\{[^}]+\}",
        "function mockPay(){if(typeof showResult==='function')showResult();else if(typeof showReport==='function')showReport();}",
        html,
    )

    # Hook result visibility → completeTest for report screen (xzcp uses #report)
    if code == "xzcp":
        html = html.replace(
            "function showReport()",
            "function showReport()",
        )
        # inject after showReport definition starts - append complete call via patch at end of showReport body is hard;
        # rename report id to result OR add mutation-friendly id
        html = html.replace('id="report"', 'id="result" class="screen"')
        # if it was already class="screen" might duplicate - fix
        html = html.replace('id="result" class="screen" class="screen"', 'id="result" class="screen"')
        # also replace show('report') with show('result')
        html = html.replace("show('report')", "show('result')")
        html = html.replace('show("report")', 'show("result")')

    # Ensure completeTest on result reveal for all
    complete_hook = (
        "\n  function __psyHookComplete(payload){"
        "if(window.__psyComplete){try{window.__psyComplete(payload||{});}catch(e){}}"
        "window.totalScore=(payload&&payload.score)||window.totalScore;"
        "}\n"
    )
    if "function __psyHookComplete" not in html:
        # insert before first function or after const QS
        m = re.search(r"(const QS\s*=\s*\[[\s\S]*?\];)", html)
        if m:
            html = html[: m.end()] + complete_hook + html[m.end() :]
        else:
            html = html.replace("<script>", "<script>" + complete_hook, 1)

    # After show('result') in functions, hook — patch common showResult endings
    # Call hook at start of showResult / showReport
    for fn in ("showResult", "showReport"):
        html = re.sub(
            rf"function {fn}\(\)\{{",
            f"function {fn}(){{__psyHookComplete({{test_code:'{code}',source:'autumn-sku'}});",
            html,
            count=1,
        )

    # offer unbox → result path: also hook when result shown
    if "show('result')" in html and code == "ofpr":
        html = html.replace(
            "show('result')",
            "(__psyHookComplete({test_code:'ofpr',score:(RESULT&&RESULT.prob)||0}),show('result'))",
            1,
        )

    return html


def inject_auth(html: str, code: str) -> str:
    if "test-security.js" not in html:
        html = html.replace("</head>", SECURITY_HEAD + "</head>", 1)

    # Normalize start CTAs so ceping-bridge can intercept (开始测试 / #start-btn)
    html = re.sub(
        r'(<(?:button)[^>]*class="btn-go"[^>]*)>([^<]*)<',
        r'\1 id="start-btn">开始测试<',
        html,
        count=1,
    )
    html = re.sub(
        r'(<(?:button)[^>]*class="btn-start"[^>]*)>([^<]*)<',
        r'\1 id="start-btn">开始测试<',
        html,
        count=1,
    )
    # xzcp: [ 开始测评 ]
    html = re.sub(
        r'(onclick="beginExam\(\)"[^>]*>)\[[^\]]*\]',
        r'\1开始测试',
        html,
        count=1,
    )
    if 'id="start-btn"' not in html and 'onclick="beginExam()"' in html:
        html = html.replace('onclick="beginExam()"', 'id="start-btn" onclick="beginExam()"', 1)
    if 'id="start-btn"' not in html and 'onclick="startQuiz()"' in html:
        html = html.replace('onclick="startQuiz()"', 'id="start-btn" onclick="startQuiz()"', 1)
    if 'id="start-btn"' not in html and 'onclick="start()"' in html:
        html = html.replace('onclick="start()"', 'id="start-btn" onclick="start()"', 1)

    # jlpf wires .btn-go via querySelector — ensure id exists after class patch
    if code == "jlpf" and 'id="start-btn"' not in html:
        html = html.replace('class="btn-go"', 'class="btn-go" id="start-btn"', 1)
        html = html.replace(">开始体检<", ">开始测试<")

    # Remove free-preview / skip payment buttons if any
    html = re.sub(
        r'<button[^>]*class="btn-free"[^>]*>[\s\S]*?</button>',
        "",
        html,
    )

    # Soften leftover pay CTA labels in dead CSS only — leave content as-is
    if "__PSY_TEST_CODE__" not in html:
        html = html.replace("</body>", AUTH_TAIL.format(code=code) + "\n</body>", 1)
    else:
        html = re.sub(
            r'window\.__PSY_TEST_CODE__\s*=\s*"[^"]*"',
            f'window.__PSY_TEST_CODE__ = "{code}"',
            html,
        )

    # Disclaimer: strip upsell that implies in-page payment for result
    html = re.sub(
        r'<a class="upsell"[^>]*>[\s\S]*?</a>',
        '<p class="upsell" style="font-size:12px;color:#6b7280;margin-top:12px">完整报告仅供娱乐参考 · 非求职承诺</p>',
        html,
    )
    return html


def convert_one(src_name: str, code: str) -> Path:
    src = SRC / src_name
    if not src.is_file():
        raise SystemExit(f"missing source: {src}")
    html = src.read_text(encoding="utf-8")
    html = strip_paywall_html(html)
    html = patch_js_skip_pay(html, code)
    html = inject_auth(html, code)

    # Soften paywall CSS leftover (harmless) + add page-disabled support
    if "page-disabled" not in html:
        html = html.replace(
            "</style>",
            "\n  body.page-disabled{pointer-events:none;opacity:.65;}\n</style>",
            1,
        )

    dest_dir = OUT_TESTS / code
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / "index.html"
    dest.write_text(html, encoding="utf-8")
    return dest


def register_catalog(entries: list[dict]) -> None:
    for cat_path in (CATALOG, CATALOG_CLOUD):
        if not cat_path.is_file():
            continue
        cat = json.loads(cat_path.read_text(encoding="utf-8"))
        tests = cat.get("tests") or []
        by_code = {t.get("code"): i for i, t in enumerate(tests)}
        for e in entries:
            if e["code"] in by_code:
                tests[by_code[e["code"]]] = {**tests[by_code[e["code"]]], **e}
            else:
                tests.append(e)
        cat["tests"] = tests
        cat["total"] = len(tests)
        cat_path.write_text(json.dumps(cat, ensure_ascii=False, indent=2), encoding="utf-8")
        print("catalog", cat_path.name, "total", cat["total"])


def main() -> None:
    entries = []
    for src_name, code, name, qn, mins in SKUS:
        out = convert_one(src_name, code)
        print("wrote", out)
        entries.append(
            {
                "code": code,
                "name": name,
                "questions": qn,
                "duration_min": mins,
                "hot": True,
                "dual_perspective": False,
            }
        )
    register_catalog(entries)

    # homepage shelf: prepend autumn SKUs (keep nly if present)
    home = ROOT / "apps" / "psy-dist" / "home.js"
    if home.is_file():
        text = home.read_text(encoding="utf-8")
        shelf_items = [
            '{ code: "ofpr", title: "秋招 offer 概率" }',
            '{ code: "jlpf", title: "简历竞争力评分" }',
            '{ code: "slpz", title: "四路径适配" }',
            '{ code: "xzcp", title: "校招测评练习" }',
            '{ code: "irms", title: "i人面试守护灵" }',
        ]
        # insert after SHELF = [
        if "code: \"ofpr\"" not in text and "code: 'ofpr'" not in text:
            text = text.replace(
                "const SHELF = [\n",
                "const SHELF = [\n    "
                + ",\n    ".join(shelf_items)
                + ",\n",
                1,
            )
            home.write_text(text, encoding="utf-8")
            print("updated home.js SHELF")


if __name__ == "__main__":
    main()
