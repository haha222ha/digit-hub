import { esc } from './past-result-ui-core.js';
import { openShareImagePreview } from './psy-result-modals.js';

function renderScoreBarsHtml(scores, accent = '#2d4a6f') {
  const entries = Object.entries(scores || {});
  const maxV = Math.max(...entries.map(([, v]) => Number(v)), 1);
  return entries.map(([label, value]) => {
    const pct = Math.round(Number(value) / maxV * 100);
    return `<div class="muse-share-bar-row">
      <span class="muse-share-bar-label">${esc(label)}</span>
      <div class="muse-share-bar-track"><div class="muse-share-bar-fill" style="width:${pct}%;background:${accent}"></div></div>
      <span class="muse-share-bar-val">${esc(value)}</span>
    </div>`;
  }).join('');
}

export function buildMuseShareCardHtml(result) {
  const accent = result.color || '#2d4a6f';
  const tags = (result.tags || []).slice(0, 4);
  const lead = (result.suggestions || [])[0] || result.description || '';
  const score = result.extra?.primaryScore ?? '--';

  return `<div class="muse-share-card" data-muse-share-card style="--muse-accent:${accent}">
    <div class="muse-share-brand">
      <div class="muse-share-logo">心象测</div>
      <div class="muse-share-meta">匹配度 ${esc(score)}%</div>
    </div>
    <div class="muse-share-hero">
      <div class="muse-share-label">Literary Archetype</div>
      <div class="muse-share-name">${esc(result.title)}</div>
      <div class="muse-share-sub">${esc(result.description)}</div>
      <div class="muse-share-tags">${tags.map((t) => `<span class="muse-share-tag">${esc(t)}</span>`).join('')}</div>
    </div>
    <section class="muse-share-section">
      <div class="muse-share-kicker">铠甲 · 你的力量</div>
      <p class="muse-share-lead">${esc(lead)}</p>
    </section>
    <section class="muse-share-section">
      <div class="muse-share-kicker">六维气质坐标</div>
      ${renderScoreBarsHtml(result.scores, accent)}
    </section>
    <div class="muse-share-foot">心象测 · 文学精神原型 · 娱乐向自我探索</div>
  </div>`;
}

export async function openMuseSharePreview(result) {
  return openShareImagePreview({
    cardHtml: buildMuseShareCardHtml(result),
    cardSelector: '[data-muse-share-card]',
    backgroundColor: '#f8f5ef',
    fileName: 'muse-result.png',
    shareTitle: '文学原型匹配结果',
    brandNote: '心象测 · 文学原型·新',
  });
}
