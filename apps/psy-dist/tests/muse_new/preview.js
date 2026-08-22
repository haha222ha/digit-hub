const $ = (id) => document.getElementById(id);
let items = [];
let currentIdx = 0;

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
}

function renderScoreBars(scores) {
  const entries = Object.entries(scores || {});
  const maxV = Math.max(...entries.map(([, v]) => Number(v)), 1);
  $('radar-wrap').innerHTML = entries.map(([label, value]) => {
    const pct = Math.round((Number(value) / maxV) * 100);
    return `<div class="radar-row"><span>${label}</span><div class="radar-bar"><div class="radar-fill" style="width:${pct}%"></div></div><span>${value}</span></div>`;
  }).join('');
}

function renderResult(item) {
  const result = item.result;
  const accent = result.color || '#2d4a6f';
  document.documentElement.style.setProperty('--accent', accent);
  $('result-type').textContent = result.title || item.name || '';
  $('result-sub').textContent = result.description || item.alias || '';
  $('result-score').textContent = `匹配度 ${result.extra?.primaryScore ?? '--'}%`;
  $('result-tags').innerHTML = (result.tags || []).map((t) => `<span class="tag">${t}</span>`).join('');
  const sug = result.suggestions || [];
  $('full-sections').innerHTML = '';
  if (sug[0]) {
    $('full-sections').innerHTML += `<div class="full-section"><h3>铠甲 · 你的力量</h3><p>${sug[0]}</p></div>`;
  }
  if (sug[1]) {
    $('full-sections').innerHTML += `<div class="full-section crack"><h3>裂缝 · 你的张力</h3><p>${sug[1]}</p></div>`;
  }
  const echo = result.extra?.echo;
  if (echo) {
    $('full-sections').innerHTML += `<div class="full-section echo"><h3>精神共振 · 第二名</h3><p><strong>${echo.name}</strong> · ${echo.alias || ''}</p><p class="echo-score">共振度 ${result.extra.echoScore || 0}%</p></div>`;
  }
  renderScoreBars(result.scores || {});
  $('preview-pos').textContent = `${currentIdx + 1} / ${items.length}`;
  showScreen('screen-result');
  window.scrollTo(0, 0);
}

function renderIndex(filter = '') {
  const q = filter.trim().toLowerCase();
  const list = q
    ? items.filter((it) =>
        [it.name, it.code, it.alias, it.result?.title].some((v) => String(v || '').toLowerCase().includes(q))
      )
    : items;
  $('index-count').textContent = `${list.length} 种结果`;
  $('index-grid').innerHTML = list.map((it) => {
    const idx = items.indexOf(it);
    return `<button class="index-card" data-idx="${idx}"><div class="index-name">${it.name || it.result?.title}</div><div class="index-meta">${it.alias || ''}</div><div class="index-code">${it.code}</div></button>`;
  }).join('');
  $('index-grid').querySelectorAll('.index-card').forEach((btn) => {
    btn.onclick = () => {
      currentIdx = Number(btn.dataset.idx);
      renderResult(items[currentIdx]);
    };
  });
}

function bindUi() {
  $('search-input').addEventListener('input', (e) => renderIndex(e.target.value));
  $('btn-prev').onclick = () => {
    if (!items.length) return;
    currentIdx = (currentIdx - 1 + items.length) % items.length;
    renderResult(items[currentIdx]);
  };
  $('btn-next-result').onclick = () => {
    if (!items.length) return;
    currentIdx = (currentIdx + 1) % items.length;
    renderResult(items[currentIdx]);
  };
  $('btn-back-index').onclick = () => showScreen('screen-index');
}

async function init() {
  const res = await fetch('./preview_results.json');
  const data = await res.json();
  items = (data.items || []).sort((a, b) => (a.name || a.result?.title || '').localeCompare(b.name || b.result?.title || '', 'zh-CN'));
  if (!items.length) {
    $('index-grid').innerHTML = '<p class="empty">暂无预览数据</p>';
    return;
  }
  renderIndex();
  bindUi();
  showScreen('screen-index');
}

init();
