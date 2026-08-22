import { renderVariant, itemSearchText, normalizeItems } from './renderers.js';

const $ = (id) => document.getElementById(id);
let manifest = null;
let items = [];
let currentIdx = 0;
let testCode = '';

function urlParams() {
  return new URLSearchParams(window.location.search);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
}

function applyTheme(theme) {
  document.body.classList.remove('theme-default', 'theme-muse', 'theme-past');
  if (theme === 'muse') document.body.classList.add('theme-muse');
  else if (theme === 'past') document.body.classList.add('theme-past');
  else document.body.classList.add('theme-default');
}

function setVariantInUrl(variantId) {
  const p = urlParams();
  if (variantId) p.set('variant', variantId);
  else p.delete('variant');
  const qs = p.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
  window.history.replaceState(null, '', next);
}

function findVariantIndex(id) {
  if (!id) return -1;
  const key = String(id).toLowerCase();
  return items.findIndex((it) =>
    [it.id, it.code, it.name, it.label].some((v) => String(v || '').toLowerCase() === key)
  );
}

function showResultAt(idx, { updateUrl = true } = {}) {
  if (!items.length || idx < 0 || idx >= items.length) return;
  currentIdx = idx;
  const item = items[currentIdx];
  if (updateUrl) setVariantInUrl(item.id || item.code);
  renderVariant($('result-root'), manifest.renderer, item);
  $('preview-pos').textContent = `${currentIdx + 1} / ${items.length}`;
  showScreen('screen-result');
  window.scrollTo(0, 0);
}

function renderIndex(filter = '') {
  const q = filter.trim().toLowerCase();
  const list = q ? items.filter((it) => itemSearchText(it).includes(q)) : items;
  $('index-count').textContent = `${list.length} 种结果`;
  $('index-grid').innerHTML = '';
  if (!list.length) {
    $('index-grid').innerHTML = '<p class="empty">无匹配结果</p>';
    return;
  }
  list.forEach((it) => {
    const idx = items.indexOf(it);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'index-card';
    btn.innerHTML = `<div class="index-name">${it.name || it.result?.title || it.code}</div><div class="index-meta">${it.author || it.alias || it.result?.description || ''}</div><div class="index-code">${it.label || it.code || it.id}</div>`;
    btn.onclick = () => showResultAt(idx);
    $('index-grid').appendChild(btn);
  });
}

function showError(msg) {
  $('error-msg').textContent = msg;
  showScreen('screen-error');
}

function bindUi() {
  $('search-input').addEventListener('input', (e) => renderIndex(e.target.value));
  $('btn-prev').onclick = () => {
    if (!items.length) return;
    showResultAt((currentIdx - 1 + items.length) % items.length);
  };
  $('btn-next-result').onclick = () => {
    if (!items.length) return;
    showResultAt((currentIdx + 1) % items.length);
  };
  $('btn-back-index').onclick = () => {
    setVariantInUrl('');
    showScreen('screen-index');
  };
}

async function loadManifestAndData(code) {
  const manifestRes = await fetch(`/tests/${code}/preview_manifest.json`);
  if (!manifestRes.ok) throw new Error('该测题暂未开通结果直显');
  manifest = await manifestRes.json();
  if (!manifest.supported) throw new Error('该测题暂未开通结果直显');

  const dataUrl = manifest.data_url || 'preview_results.json';
  const dataRes = await fetch(`/tests/${code}/${dataUrl}`);
  if (!dataRes.ok) throw new Error('预览数据加载失败');
  const data = await dataRes.json();
  items = normalizeItems(data).sort((a, b) =>
    (a.name || a.result?.title || '').localeCompare(b.name || b.result?.title || '', 'zh-CN')
  );
  if (!items.length) throw new Error('暂无预览结果数据');
}

function initAuth(code) {
  return new Promise((resolve) => {
    if (typeof PsyTestValidator === 'undefined') {
      document.body.classList.remove('page-disabled');
      resolve(false);
      return;
    }
    PsyTestValidator.init(code, {
      onSuccess() {
        document.body.classList.remove('page-disabled');
        resolve(true);
      },
      onError() {
        document.body.classList.remove('page-disabled');
        resolve(false);
      },
    });
    if (typeof TestSecurity !== 'undefined') TestSecurity.enable();
  });
}

async function boot() {
  const params = urlParams();
  testCode = (params.get('test') || '').trim();
  if (!testCode) {
    showError('请在链接中指定测题参数 test=测题代码。可从商家后台「结果直显」获取链接。');
    document.body.classList.remove('page-disabled');
    return;
  }

  await initAuth(testCode);

  try {
    await loadManifestAndData(testCode);
  } catch (e) {
    showError(e.message || '加载失败');
    return;
  }

  applyTheme(manifest.theme);
  $('hero-title').textContent = manifest.test_name || testCode;
  $('nav-badge').textContent = '结果直显';
  document.title = `${manifest.test_name || testCode} · 结果直显`;

  bindUi();
  renderIndex();

  const variant = params.get('variant');
  const view = params.get('view');
  const vIdx = findVariantIndex(variant);
  if (variant && vIdx >= 0) {
    showResultAt(vIdx, { updateUrl: false });
  } else if (view !== 'list') {
    showScreen('screen-index');
  } else {
    showScreen('screen-index');
  }
}

boot();
