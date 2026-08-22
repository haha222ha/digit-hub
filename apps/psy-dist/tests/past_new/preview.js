const $ = (id) => document.getElementById(id);
let items = [];
let currentIdx = 0;

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
}

function renderStats(stats) {
  const maxV = Math.max(...stats.map((s) => s.value), 1);
  $('radar-wrap').innerHTML = stats.map((s) => {
    const pct = Math.round((s.value / maxV) * 100);
    return `<div class="radar-row"><span>${s.label}</span><div class="radar-bar"><div class="radar-fill" style="width:${pct}%"></div></div><span>${s.value}</span></div>`;
  }).join('');
}

function renderResult(item) {
  const result = item.result;
  const p = result.primary;
  $('result-type').textContent = p.name;
  $('result-sub').textContent = `${p.author} · ${p.source}`;
  $('result-quote').textContent = p.quote || '';
  $('result-tags').innerHTML = (p.tags || []).map((t) => `<span class="tag">${t}</span>`).join('');
  $('result-order').textContent = `匹配度 ${p.orderIndex}/${p.totalArchetypes} · ${item.label || item.code}`;
  const profiles = p.profile || [];
  $('full-sections').innerHTML = profiles.map((txt, i) =>
    `<div class="full-section"><h3>${i === 0 ? '精神画像' : '内在张力'}</h3><p>${txt}</p></div>`
  ).join('');
  const br = p.bottomReport || {};
  const steps = (br.path && br.path.steps) || [];
  const scenes = br.scenes || [];
  let extra = '';
  if (br.intro) extra += `<div class="full-section"><h3>报告导语</h3><p>${br.intro}</p></div>`;
  steps.forEach((step) => {
    extra += `<div class="full-section"><h3>${step.label} ${step.title}</h3><p>${step.copy}</p></div>`;
  });
  scenes.forEach((scene) => {
    extra += `<div class="full-section scene-card"><h3>${scene.label}</h3><p class="scene-title">${scene.title}</p><p>${scene.copy}</p><p class="scene-signal">${scene.actionLabel || ''}：${scene.signal || ''}</p></div>`;
  });
  $('full-sections').innerHTML += extra;
  renderStats(result.stats || []);
  $('preview-pos').textContent = `${currentIdx + 1} / ${items.length}`;
  showScreen('screen-result');
  window.scrollTo(0, 0);
}

function renderIndex(filter = '') {
  const q = filter.trim().toLowerCase();
  const list = q
    ? items.filter((it) =>
        [it.name, it.code, it.label, it.author, it.source].some((v) => String(v || '').toLowerCase().includes(q))
      )
    : items;
  $('index-count').textContent = `${list.length} 种结果`;
  $('index-grid').innerHTML = list.map((it) => {
    const idx = items.indexOf(it);
    return `<button class="index-card" data-idx="${idx}"><div class="index-name">${it.name}</div><div class="index-meta">${it.author || ''}</div><div class="index-code">${it.label || it.code}</div></button>`;
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
  items = (data.items || []).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-CN'));
  if (!items.length) {
    $('index-grid').innerHTML = '<p class="empty">暂无预览数据</p>';
    return;
  }
  renderIndex();
  bindUi();
  showScreen('screen-index');
}

init();
