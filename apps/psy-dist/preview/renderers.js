import { renderPastResult } from '../shared/past-result-ui.js';

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

function renderStats(host, stats) {
  const maxV = Math.max(...stats.map((s) => s.value), 1);
  host.innerHTML = stats.map((s) => {
    const pct = Math.round((s.value / maxV) * 100);
    return `<div class="radar-row"><span>${s.label}</span><div class="radar-bar"><div class="radar-fill" style="width:${pct}%"></div></div><span>${s.value}</span></div>`;
  }).join('');
}

function renderScoreBars(host, scores) {
  const entries = Object.entries(scores || {});
  const maxV = Math.max(...entries.map(([, v]) => Number(v)), 1);
  host.innerHTML = entries.map(([label, value]) => {
    const pct = Math.round((Number(value) / maxV) * 100);
    return `<div class="radar-row"><span>${label}</span><div class="radar-bar"><div class="radar-fill" style="width:${pct}%"></div></div><span>${value}</span></div>`;
  }).join('');
}

export function renderVariant(root, rendererId, item) {
  root.replaceChildren();
  if (rendererId === 'xlx_past_v1') {
    renderPast(root, item);
    return;
  }
  if (rendererId === 'xlx_muse_v1') {
    renderMuse(root, item);
    return;
  }
  if (rendererId === 'skin_v1') {
    renderSkin(root, item);
    return;
  }
  root.append(el('div', 'empty', '暂不支持该测题的结果渲染器'));
}

function renderSkin(root, item) {
  const r = item.result || {};
  const hero = el('div', 'result-hero');
  hero.innerHTML = `
    <div class="result-type"></div>
    <div class="result-sub"></div>
    <div class="result-quote"></div>
    <div class="tag-row"></div>`;
  if (r.emoji) {
    const em = el('div', '', r.emoji);
    em.style.fontSize = '42px';
    em.style.marginBottom = '8px';
    hero.prepend(em);
  }
  hero.querySelector('.result-type').textContent = r.type || item.name || '';
  hero.querySelector('.result-sub').textContent = r.short || item.label || '';
  hero.querySelector('.result-quote').textContent = r.quote || '';
  hero.querySelector('.tag-row').innerHTML = (r.tags || []).map((t) => `<span class="tag">${t}</span>`).join('');

  const sections = el('div');
  (r.full || []).forEach((sec) => {
    sections.append(el('div', 'full-section', `<h3>${sec.h || ''}</h3><p>${sec.p || ''}</p>`));
  });

  let radar = null;
  if (r.totals && Object.keys(r.totals).length) {
    radar = el('div', 'radar-wrap');
    const stats = Object.entries(r.totals).map(([label, value]) => ({ label, value: Number(value) }));
    renderStats(radar, stats);
  }

  root.append(hero);
  if (radar) root.append(radar);
  root.append(sections);
}

function renderPast(root, item) {
  const host = el('div', 'past-result-host');
  renderPastResult(host, item.result, {
    showActions: true,
    showOrder: true,
    orderText: `匹配度 ${item.result?.primary?.orderIndex}/${item.result?.primary?.totalArchetypes} · ${item.label || item.code}`,
    onRetry: () => {
      if (typeof window.__previewGoIndex === 'function') window.__previewGoIndex();
    },
  });
  root.append(host);
}

function renderMuse(root, item) {
  const result = item.result;
  const hero = el('div', 'result-hero');
  hero.innerHTML = `
    <div class="result-type"></div>
    <div class="result-sub"></div>
    <div class="result-score"></div>
    <div class="tag-row"></div>`;
  hero.querySelector('.result-type').textContent = result.title || item.name || '';
  hero.querySelector('.result-sub').textContent = result.description || item.alias || '';
  hero.querySelector('.result-score').textContent = `匹配度 ${result.extra?.primaryScore ?? '--'}%`;
  hero.querySelector('.tag-row').innerHTML = (result.tags || []).map((t) => `<span class="tag">${t}</span>`).join('');

  const sections = el('div');
  const sug = result.suggestions || [];
  if (sug[0]) sections.append(el('div', 'full-section', `<h3>铠甲 · 你的力量</h3><p>${sug[0]}</p>`));
  if (sug[1]) sections.append(el('div', 'full-section', `<h3>裂缝 · 你的张力</h3><p>${sug[1]}</p>`));
  const echo = result.extra?.echo;
  if (echo) {
    sections.append(el('div', 'full-section', `<h3>精神共振 · 第二名</h3><p><strong>${echo.name}</strong> · ${echo.alias || ''}</p><p class="echo-score">共振度 ${result.extra.echoScore || 0}%</p>`));
  }

  const radar = el('div', 'radar-wrap');
  renderScoreBars(radar, result.scores || {});
  root.append(hero, sections, radar);
}

export function itemSearchText(item) {
  return [item.id, item.code, item.name, item.label, item.alias, item.author, item.source, item.result?.title]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function normalizeItems(data) {
  const raw = data.items || [];
  return raw.map((it) => ({
    ...it,
    id: String(it.id || it.code || it.variant_id || ''),
  }));
}
