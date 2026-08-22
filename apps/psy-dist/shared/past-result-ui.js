import { esc, renderRadarSvg, renderDimGrid } from './past-result-ui-core.js';
import { openSharePreview, openRewardModal } from './past-share-modal.js';

export { renderRadarSvg } from './past-result-ui-core.js';

export function buildPastResultHtml(result, options = {}) {
  const p = result.primary || {};
  const br = p.bottomReport || {};
  const path = br.path || {};
  const steps = path.steps || [];
  const scenes = br.scenes || [];
  const refStats = result.referenceStats || [];
  const showActions = options.showActions !== false;
  const showOrder = options.showOrder === true;
  const orderText = options.orderText || (p.orderIndex ? `匹配度 ${p.orderIndex}/${p.totalArchetypes}` : '');

  const profileHtml = (p.profile || []).map((txt) => `<p>${esc(txt)}</p>`).join('');
  const stepsHtml = steps.map((step) => `
    <div class="past-step">
      <div class="past-step-label">${esc(step.label)}</div>
      <div class="past-step-title">${esc(step.title)}</div>
      <div class="past-step-copy">${esc(step.copy)}</div>
    </div>`).join('');
  const scenesHtml = scenes.map((scene) => `
    <div class="past-scene">
      <div class="past-scene-pill">${esc(scene.label)}</div>
      <div class="past-scene-title">${esc(scene.title)}</div>
      <div class="past-scene-copy">${esc(scene.copy)}</div>
      <div class="past-scene-signal">${esc(scene.signal || '')}</div>
    </div>`).join('');

  const actionsHtml = showActions ? `
    <div class="past-actions">
      <button type="button" class="btn btn-ghost past-action-share" data-past-action="share">截图分享</button>
      <button type="button" class="btn btn-primary past-action-reward" data-past-action="reward">晒单有礼</button>
    </div>
    <div class="past-actions-stack">
      <button type="button" class="btn btn-ghost" data-past-action="retry">重新探索</button>
    </div>` : '';

  return `<article class="past-result" data-past-result>
    <header class="past-hero">
      <div class="past-hero-name">${esc(p.name)}</div>
      <div class="past-hero-sub">${esc(p.author)} · ${esc(p.source)}</div>
      ${showOrder && orderText ? `<div class="past-order">${esc(orderText)}</div>` : ''}
      <p class="past-hero-quote">${esc(p.quote)}</p>
      <div class="past-tag-row">${(p.tags || []).map((t) => `<span class="past-tag">${esc(t)}</span>`).join('')}</div>
    </header>
    <section class="past-block past-profile">
      <h2 class="past-section-title">你的核心轮廓</h2>
      ${profileHtml}
    </section>
    <section class="past-block">
      <h2 class="past-section-title">你的行为画像</h2>
      ${renderRadarSvg(result.stats, refStats)}
      ${renderDimGrid(result.stats, refStats)}
    </section>
    <section class="past-block">
      <h2 class="past-section-title">你与${esc(p.name)}的相照之处</h2>
      ${path.summary ? `<p class="past-mirror-summary">${esc(path.summary)}</p>` : ''}
      ${stepsHtml}
    </section>
    <section class="past-block">
      <h2 class="past-section-title">现实中的你</h2>
      ${scenesHtml}
    </section>
    ${br.intro ? `<div class="past-closing">${esc(br.intro)}</div>` : ''}
    ${actionsHtml}
  </article>`;
}

export function bindPastResultActions(root, options = {}) {
  if (!root) return;
  const resultNode = root.querySelector('[data-past-result]') || root;
  const resultData = options.result;

  root.querySelector('[data-past-action="share"]')?.addEventListener('click', () => {
    if (typeof options.onShare === 'function') {
      options.onShare(resultData);
      return;
    }
    if (resultData) {
      openSharePreview(resultData);
      return;
    }
    alert('分享图生成失败，请直接截图结果页。');
  });

  root.querySelector('[data-past-action="reward"]')?.addEventListener('click', () => {
    if (typeof options.onReward === 'function') {
      options.onReward();
      return;
    }
    if (typeof window.PsyTestValidator?.addPromotionLink === 'function') {
      window.PsyTestValidator.addPromotionLink();
    }
    openRewardModal(options.rewardConfig);
  });

  root.querySelector('[data-past-action="retry"]')?.addEventListener('click', () => {
    if (typeof options.onRetry === 'function') options.onRetry();
  });
}

export function renderPastResult(container, result, options = {}) {
  if (!container || !result) return;
  container.innerHTML = buildPastResultHtml(result, options);
  bindPastResultActions(container, { ...options, result });
}
