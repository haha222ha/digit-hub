/* 选品报告主题切换 — 默认极光清新，与 PC 端 pa_ui_theme / xhs_report_theme 对齐 */
(function () {
  var KEY = 'xhs_report_theme';
  var THEMES = ['aurora', 'classic'];
  var LABELS = { aurora: '极光清新', classic: '经典深色' };

  function apply(name) {
    var theme = THEMES.indexOf(name) >= 0 ? name : 'aurora';
    document.documentElement.dataset.theme = theme;
    return theme;
  }

  function get() {
    try {
      var q = new URLSearchParams(location.search).get('theme');
      if (q && THEMES.indexOf(q) >= 0) return q;
      var stored = localStorage.getItem(KEY);
      if (stored && THEMES.indexOf(stored) >= 0) return stored;
      var pa = localStorage.getItem('pa_ui_theme');
      if (pa && THEMES.indexOf(pa) >= 0) return pa;
    } catch (e) { /* ignore */ }
    return 'aurora';
  }

  function set(name) {
    var theme = apply(name);
    try {
      localStorage.setItem(KEY, theme);
      localStorage.setItem('pa_ui_theme', theme);
    } catch (e) { /* ignore */ }
    syncUi();
    return theme;
  }

  function syncUi() {
    var cur = document.documentElement.dataset.theme || get();
    document.querySelectorAll('.xhs-theme-switch select').forEach(function (sel) {
      sel.value = cur;
    });
  }

  function buildSwitcher() {
    var wrap = document.createElement('label');
    wrap.className = 'xhs-theme-switch';
    wrap.id = 'xhs-theme-switch';
    wrap.title = '报告界面主题';
    wrap.innerHTML = '<span>主题</span><select aria-label="报告主题"></select>';
    var sel = wrap.querySelector('select');
    THEMES.forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t;
      opt.textContent = LABELS[t] || t;
      sel.appendChild(opt);
    });
    sel.value = get();
    sel.addEventListener('change', function () { set(sel.value); });
    return wrap;
  }

  function injectSwitcher() {
    if (document.getElementById('xhs-theme-switch')) return;
    var node = buildSwitcher();
    var toolbar = document.querySelector('.toolbar');
    if (toolbar) {
      toolbar.appendChild(node);
      return;
    }
    var bar = document.querySelector('.gr-theme-bar');
    if (bar) {
      bar.appendChild(node);
      return;
    }
    var sub = document.getElementById('subtitle');
    if (sub && sub.parentNode) {
      var row = document.createElement('div');
      row.className = 'gr-theme-bar';
      row.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px;padding:8px 12px;border:1px solid #30363d;border-radius:8px;background:#161b22';
      row.appendChild(node);
      sub.parentNode.insertBefore(row, sub.nextSibling);
    }
  }

  apply(get());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSwitcher);
  } else {
    injectSwitcher();
  }

  window.XHS_REPORT_THEME = {
    apply: apply,
    get: get,
    set: set,
    THEMES: THEMES,
    LABELS: LABELS,
    injectSwitcher: injectSwitcher,
    syncUi: syncUi,
  };
})();
