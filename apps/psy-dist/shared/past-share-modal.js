import { renderRadarSvg, esc } from './past-result-ui-core.js';
import { openShareImagePreview } from './psy-result-modals.js';

export { openRewardModal } from './psy-result-modals.js';

export function buildShareCardHtml(result) {
  const p = result.primary || {};
  const profileLead = (p.profile || [])[0] || '';
  const tags = (p.tags || []).slice(0, 4);
  const orderText = p.orderIndex && p.totalArchetypes
    ? `匹配度 ${p.orderIndex}/${p.totalArchetypes}`
    : '历史人物匹配';

  return `<div class="past-share-card" data-past-share-card>
    <div class="past-share-brand">
      <div class="past-share-logo">心象测</div>
      <div class="past-share-meta">${esc(orderText)}</div>
    </div>
    <div class="past-share-hero">
      <div class="past-share-label">Historical Archetype</div>
      <div class="past-share-name">${esc(p.name)}</div>
      <div class="past-share-sub">${esc(p.author)} · ${esc(p.source)}</div>
      <blockquote class="past-share-quote">${esc(p.quote)}</blockquote>
      <div class="past-share-tags">${tags.map((t) => `<span class="past-share-tag">${esc(t)}</span>`).join('')}</div>
    </div>
    <section class="past-share-section">
      <div class="past-share-kicker">你的核心轮廓</div>
      <p class="past-share-lead">${esc(profileLead)}</p>
    </section>
    <section class="past-share-section past-share-radar-section">
      <div class="past-share-kicker">你的行为画像</div>
      ${renderRadarSvg(result.stats, result.referenceStats || [])}
    </section>
    <div class="past-share-foot">心象测 · 历史人物精神原型 · 娱乐向自我探索</div>
  </div>`;
}

export async function openSharePreview(result) {
  return openShareImagePreview({
    cardHtml: buildShareCardHtml(result),
    cardSelector: '[data-past-share-card]',
    backgroundColor: '#faf7f0',
    fileName: 'past-result.png',
    shareTitle: '历史人物匹配结果',
    brandNote: '心象测 · 历史人物匹配',
  });
}
