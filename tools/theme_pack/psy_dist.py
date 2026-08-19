# -*- coding: utf-8 -*-
"""Generate psy-dist static test bundle from theme pack / skin."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _esc(s: str) -> str:
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def render_index_html(
    *,
    dist_code: str,
    title: str,
    skin: dict[str, Any],
    design: dict[str, Any],
    interaction: dict[str, Any],
) -> str:
    tokens = design.get("tokens") or {}
    paper = tokens.get("--theme-paper", "#f3ede3")
    ink = tokens.get("--theme-ink", "#1c1814")
    accent = tokens.get("--theme-accent", "#6b4c2a")
    accent_soft = tokens.get("--theme-accent-soft", "#d4c4a8")

    dims = skin.get("dimensions") or []
    results = skin.get("results") or {}
    questions = skin.get("questions") or []
    intro = skin.get("intro", "")
    disclaimer = skin.get("disclaimer", "")
    minutes = interaction.get("minutes", 5)
    hero = design.get("hero") or {}

    dim_cards = "".join(
        f'<div class="dim-card"><div class="d-icon">{_esc(d.get("icon", "·"))}</div>'
        f'<div><div class="d-text">{_esc(d.get("label", ""))}</div>'
        f'<div class="d-sub">{_esc(results.get(d["id"], {}).get("type", "")[:12])}</div></div></div>'
        for d in dims
        if d.get("id")
    )

    result_previews = ""
    for d in dims:
        rid = d.get("id")
        r = results.get(rid, {})
        result_previews += (
            f'<div class="result-ex"><div class="ex-left">'
            f'<div class="ex-icon">{_esc(r.get("emoji", d.get("icon", "")))}</div>'
            f'<div class="ex-info"><div class="ex-name">{_esc(r.get("type", ""))}</div>'
            f'<div class="ex-desc">{_esc(r.get("quote", "")[:36])}…</div></div></div></div>'
        )

    data_json = json.dumps(
        {
            "dimensions": dims,
            "questions": questions,
            "results": results,
        },
        ensure_ascii=False,
    )

    title_plain = _esc(hero.get("title_plain") or title.split("·")[0].strip())
    title_grad = _esc(hero.get("title_grad") or (title.split("·")[1].strip() if "·" in title else "主题测"))

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="description" content="{_esc(title)} - 心象测主题限定">
  <title>{_esc(title)}</title>
  <script src="/static/js/test-security.js"></script>
  <style>
    * {{ margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Serif SC', serif;
      background: {paper}; color: {ink};
      min-height:100vh; max-width:480px; margin:0 auto; overflow-x:hidden;
    }}
    body.page-disabled {{ pointer-events:none; opacity:.65; }}
    .screen {{ display:none; animation: fadeUp .45s ease both; }}
    .screen.active {{ display:block; }}
    nav {{ display:flex; justify-content:space-between; align-items:center; padding:18px 20px 0; }}
    .logo {{ font-size:12px; font-weight:800; color:#9a8f82; letter-spacing:.12em; }}
    .nav-badge {{ font-size:11px; color:{accent}; background:{accent_soft}; padding:4px 10px; border-radius:20px; }}
    .hero {{ padding:28px 20px 24px; }}
    .live-badge {{
      display:inline-flex; align-items:center; gap:6px; background:#fff; border:1px solid #e8e0d4;
      color:#666; font-size:12px; padding:6px 12px; border-radius:20px; margin-bottom:20px;
    }}
    .live-dot {{ width:6px; height:6px; border-radius:50%; background:#22c55e; }}
    h1 {{ font-size:42px; font-weight:900; line-height:1.08; letter-spacing:-.02em; margin-bottom:14px; }}
    .h1-plain {{ color:{ink}; font-family:'Noto Serif SC',serif; }}
    .h1-grad {{ color:{accent}; font-family:'Noto Serif SC',serif; }}
    .hero-sub {{ font-size:14px; color:#6b635a; line-height:1.75; margin-bottom:28px; }}
    .btn {{
      width:100%; border:none; cursor:pointer; font-size:16px; font-weight:700;
      padding:16px; border-radius:14px; transition:transform .15s;
    }}
    .btn:active {{ transform:scale(.98); }}
    .btn-primary {{ background:{ink}; color:#fff; box-shadow:0 4px 18px rgba(0,0,0,.12); }}
    .btn-ghost {{ background:#fff; color:{ink}; border:1.5px solid #e8e0d4; margin-top:10px; }}
    .cta-hint {{ text-align:center; font-size:12px; color:#b0a89c; margin-top:10px; }}
    .dims-section {{ padding:0 20px 24px; }}
    .dims-label {{ font-size:11px; font-weight:700; color:#b0a89c; letter-spacing:.1em; margin-bottom:12px; }}
    .dims-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }}
    .dim-card {{
      background:#fff; border-radius:12px; padding:12px; display:flex; gap:10px; align-items:center;
      box-shadow:0 1px 4px rgba(0,0,0,.04);
    }}
    .d-icon {{ font-size:20px; width:36px; height:36px; background:{paper}; border-radius:10px;
      display:flex; align-items:center; justify-content:center; }}
    .d-text {{ font-size:13px; font-weight:700; }}
    .d-sub {{ font-size:11px; color:#aaa; margin-top:2px; }}
    .preview-section {{ padding:0 20px 32px; }}
    .result-ex {{
      background:#fff; border-radius:12px; padding:12px 14px; margin-bottom:8px;
      box-shadow:0 1px 4px rgba(0,0,0,.04);
    }}
    .ex-left {{ display:flex; gap:10px; align-items:center; }}
    .ex-icon {{ font-size:22px; }}
    .ex-name {{ font-size:13px; font-weight:700; }}
    .ex-desc {{ font-size:11px; color:#999; margin-top:2px; }}
    .disclaimer {{ padding:0 20px 40px; font-size:11px; color:#b0a89c; line-height:1.6; }}

    /* quiz */
    #screen-quiz {{ height:100dvh; display:none; flex-direction:column; max-width:480px; margin:0 auto; }}
    #screen-quiz.active {{ display:flex; }}
    .top-bar {{ padding:16px 20px 10px; flex-shrink:0; }}
    .progress-meta {{ display:flex; justify-content:space-between; font-size:12px; color:#aaa; margin-bottom:8px; }}
    .progress-track {{ height:5px; background:#e8e0d4; border-radius:3px; overflow:hidden; }}
    .progress-fill {{ height:100%; background:{accent}; border-radius:3px; transition:width .35s ease; width:0; }}
    .q-body {{ flex:1; overflow-y:auto; padding:20px 20px 8px; }}
    .q-tag {{ display:inline-block; font-size:11px; font-weight:700; color:{accent};
      background:{accent_soft}; padding:4px 10px; border-radius:999px; margin-bottom:14px; }}
    .q-title {{ font-size:22px; font-weight:900; line-height:1.35; margin-bottom:22px; }}
    .opt {{
      background:#fff; border:2px solid #e8e0d4; border-radius:12px; padding:14px 16px;
      margin-bottom:10px; cursor:pointer; transition:all .15s;
    }}
    .opt.selected {{ border-color:{accent}; background:rgba(107,76,42,.06); }}
    .opt-text {{ font-size:14px; line-height:1.55; font-weight:600; }}
    .quiz-bar {{ padding:12px 20px 28px; flex-shrink:0; }}

    /* result */
    .result-hero {{ padding:32px 20px 20px; text-align:center; }}
    .result-emoji {{ font-size:56px; margin-bottom:12px; }}
    .result-type {{ font-size:22px; font-weight:900; color:{accent}; margin-bottom:10px; }}
    #result-level {{ display:none; }}
    .result-quote {{ font-size:14px; color:#5c534a; line-height:1.8; margin-bottom:20px; padding:0 8px; }}
    .radar-wrap {{ margin:0 20px 16px; background:#fff; border-radius:16px; padding:16px; }}
    .radar-row {{ display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; font-size:13px; }}
    .radar-bar {{ flex:1; height:6px; background:#eee; border-radius:3px; margin:0 10px; overflow:hidden; }}
    .radar-fill {{ height:100%; background:{accent}; border-radius:3px; }}
    .full-section {{ margin:0 20px 12px; background:#fff; border-radius:12px; padding:14px 16px; }}
    .full-section h3 {{ font-size:14px; margin-bottom:6px; }}
    .full-section p {{ font-size:13px; color:#666; line-height:1.7; }}
    @keyframes fadeUp {{ from{{opacity:0;transform:translateY(12px)}} to{{opacity:1;transform:none}} }}
  </style>
</head>
<body class="page-disabled">
  <div id="screen-intro" class="screen active">
    <nav><div class="logo">心象测</div><div class="nav-badge">{_esc(interaction.get("badge", "主题限定"))}</div></nav>
    <div class="hero">
      <div class="live-badge"><div class="live-dot"></div>主题限定 · {len(questions)} 题</div>
      <h1><div class="h1-plain">{title_plain}</div><div class="h1-grad">{title_grad}</div></h1>
      <p class="hero-sub">{_esc(intro)}</p>
      <button class="btn btn-primary" id="btn-start">开始测试 →</button>
      <div class="cta-hint">约 {minutes} 分钟 · 娱乐向自我探索</div>
    </div>
    <div class="dims-section">
      <div class="dims-label">四型成长原型</div>
      <div class="dims-grid">{dim_cards}</div>
    </div>
    <div class="preview-section">
      <div class="dims-label">可能的结果</div>
      {result_previews}
    </div>
    <div class="disclaimer">{_esc(disclaimer)}</div>
    <footer class="welcome-footer"></footer>
  </div>

  <div id="screen-quiz">
    <div class="top-bar">
      <div class="progress-meta"><span id="q-progress">1 / {len(questions)}</span><span id="q-dim-label"></span></div>
      <div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div>
    </div>
    <div class="q-body">
      <div class="q-tag" id="q-tag"></div>
      <div class="q-title" id="q-title"></div>
      <div id="q-options"></div>
    </div>
    <div class="quiz-bar">
      <button class="btn btn-primary" id="btn-next" disabled>下一题</button>
      <button class="btn btn-ghost" id="btn-back" style="display:none">上一题</button>
    </div>
  </div>

  <div id="screen-result" class="screen">
    <nav><div class="logo">心象测</div><div class="nav-badge">结果</div></nav>
    <div class="result-hero">
      <div class="result-emoji" id="result-emoji"></div>
      <div class="result-type" id="result-type"></div>
      <div id="result-level"></div>
      <p class="result-quote" id="result-quote"></p>
    </div>
    <div class="radar-wrap" id="radar-wrap"></div>
    <div id="full-sections"></div>
    <div style="padding:0 20px 40px">
      <button class="btn btn-primary" id="btn-retry">重新测试</button>
    </div>
    <div class="disclaimer">{_esc(disclaimer)}</div>
  </div>

  <script>
  const TEST_DATA = {data_json};
  let qi = 0;
  let answers = new Array(TEST_DATA.questions.length).fill(null);

  function scoreResult() {{
    const totals = {{}};
    TEST_DATA.dimensions.forEach(d => totals[d.id] = 0);
    TEST_DATA.questions.forEach((q, i) => {{
      const ai = answers[i];
      if (ai != null) totals[q.d] += q.o[ai].s;
    }});
    let topId = TEST_DATA.dimensions[0].id;
    let max = -1;
    Object.entries(totals).forEach(([id, v]) => {{
      if (v > max) {{ max = v; topId = id; }}
    }});
    return {{ totals, topId }};
  }}

  function showScreen(id) {{
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) {{ el.classList.add('active'); }}
    if (id === 'screen-quiz') {{
      document.getElementById('screen-quiz').style.display = 'flex';
    }} else {{
      document.getElementById('screen-quiz').style.display = 'none';
    }}
  }}

  function renderQuestion() {{
    const q = TEST_DATA.questions[qi];
    const total = TEST_DATA.questions.length;
    document.getElementById('q-progress').textContent = (qi + 1) + ' / ' + total;
    document.getElementById('q-dim-label').textContent = q.t || '';
    document.getElementById('progress-fill').style.width = ((qi + 1) / total * 100) + '%';
    document.getElementById('q-tag').textContent = q.t || '题目';
    document.getElementById('q-title').textContent = q.q;
    const host = document.getElementById('q-options');
    host.innerHTML = q.o.map((opt, i) =>
      '<div class="opt' + (answers[qi] === i ? ' selected' : '') + '" data-i="' + i + '">' +
      '<div class="opt-text">' + opt.t + '</div></div>'
    ).join('');
    host.querySelectorAll('.opt').forEach(el => {{
      el.onclick = () => {{
        answers[qi] = parseInt(el.dataset.i, 10);
        host.querySelectorAll('.opt').forEach(x => x.classList.remove('selected'));
        el.classList.add('selected');
        document.getElementById('btn-next').disabled = false;
      }};
    }});
    document.getElementById('btn-next').textContent = qi === total - 1 ? '查看结果' : '下一题';
    document.getElementById('btn-back').style.display = qi > 0 ? 'block' : 'none';
    document.getElementById('btn-next').disabled = answers[qi] == null;
  }}

  function showResult() {{
    const {{ totals, topId }} = scoreResult();
    const r = TEST_DATA.results[topId] || {{}};
    document.getElementById('result-emoji').textContent = r.emoji || '';
    document.getElementById('result-type').textContent = r.type || '';
    document.getElementById('result-level').textContent = r.type || '';
    document.getElementById('result-quote').textContent = r.quote || '';
    window.totalScore = totals[topId];
    const maxV = Math.max(...Object.values(totals), 1);
    document.getElementById('radar-wrap').innerHTML = TEST_DATA.dimensions.map(d => {{
      const v = totals[d.id] || 0;
      const pct = Math.round(v / maxV * 100);
      return '<div class="radar-row"><span>' + d.label + '</span><div class="radar-bar"><div class="radar-fill" style="width:' + pct + '%"></div></div><span>' + v + '</span></div>';
    }}).join('');
    const full = r.full || [];
    document.getElementById('full-sections').innerHTML = full.map(s =>
      '<div class="full-section"><h3>' + s.h + '</h3><p>' + s.p + '</p></div>'
    ).join('');
    showScreen('screen-result');
    if (window.__psyComplete) {{
      window.__psyComplete({{ test_code: '{dist_code}', type: topId, score: totals[topId], totals }});
    }}
  }}

  document.getElementById('btn-next').onclick = () => {{
    if (answers[qi] == null) return;
    if (qi < TEST_DATA.questions.length - 1) {{ qi++; renderQuestion(); }}
    else showResult();
  }};
  document.getElementById('btn-back').onclick = () => {{ if (qi > 0) {{ qi--; renderQuestion(); }} }};
  document.getElementById('btn-retry').onclick = () => {{
    qi = 0; answers = new Array(TEST_DATA.questions.length).fill(null);
    showScreen('screen-intro');
    document.body.classList.remove('page-disabled');
  }};

  document.getElementById('btn-start').onclick = async function() {{
    if (window.linkValidator) {{
      if (typeof window.linkValidator.validateForUserAction === 'function') {{
        const ok = await window.linkValidator.validateForUserAction();
        if (!ok) return;
      }}
      try {{ await window.linkValidator.startTest(); }} catch(e) {{ console.error(e); return; }}
    }}
    qi = 0; answers = new Array(TEST_DATA.questions.length).fill(null);
    showScreen('screen-quiz');
    renderQuestion();
  }};
  </script>

  <script src="/static/js/link-validator.js"></script>
  <script>
  if (typeof PsyTestValidator !== 'undefined') {{
    PsyTestValidator.init('{dist_code}', {{
      onSuccess: function() {{ document.body.classList.remove('page-disabled'); }},
      onError: function() {{ document.body.classList.remove('page-disabled'); }},
      onLoad: function(data) {{
        setTimeout(function() {{
          if (typeof PsyTestValidator.addPromotionLink === 'function') PsyTestValidator.addPromotionLink();
        }}, 100);
      }}
    }});
  }} else {{
    document.body.classList.remove('page-disabled');
  }}
  if (typeof TestSecurity !== 'undefined') TestSecurity.enable();
  </script>
  <script>window.__PSY_TEST_CODE__ = "{dist_code}";</script>
  <script src="/static/js/ceping-bridge.js"></script>
</body>
</html>
"""


def write_psy_dist_bundle(
    *,
    out_dir: Path,
    dist_code: str,
    title: str,
    skin: dict[str, Any],
    design: dict[str, Any],
    interaction: dict[str, Any],
) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    html = render_index_html(
        dist_code=dist_code,
        title=title,
        skin=skin,
        design=design,
        interaction=interaction,
    )
    index = out_dir / "index.html"
    index.write_text(html, encoding="utf-8")
    return index
