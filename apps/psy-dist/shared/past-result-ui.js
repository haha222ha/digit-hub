import {
  esc,
  renderMirrorRadarBlock,
  sectionTitle,
  sectionKicker,
} from './past-result-ui-core.js';
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
  const profiles = p.profile || [];

  const profileHtml = profiles.map((txt, i) => {
    const cls = i === 0 ? 'persona-text persona-text--lead' : 'persona-text';
    return `<p class="${cls}">${esc(txt)}</p>`;
  }).join('');

  const stepsHtml = steps.map((step) => `
    <div class="bottom-report-step">
      <div class="bottom-report-step-index">${esc(step.label)}</div>
      <div>
        <div class="bottom-report-step-title">${esc(step.title)}</div>
        <div class="bottom-report-step-copy">${esc(step.copy)}</div>
      </div>
    </div>`).join('');

  const scenesHtml = scenes.map((scene, i) => `
    <article class="scene-entry">
      <div class="scene-entry-meta">
        <span class="scene-entry-index">${String(i + 1).padStart(2, '0')}</span>
        <span class="scene-entry-label">${esc(scene.label)}</span>
      </div>
      <div class="scene-entry-content">
        <h3 class="scene-entry-title">${esc(scene.title)}</h3>
        <p class="scene-entry-copy">${esc(scene.copy)}</p>
        ${scene.signal ? `<div class="scene-entry-signal"><span class="scene-entry-signal-copy">${esc(scene.signal)}</span></div>` : ''}
      </div>
    </article>`).join('');

  const actionsHtml = showActions ? `
    <div class="bottom-area">
      <div class="actions">
        <button type="button" class="action-btn action-btn-outline" data-past-action="share">截图分享</button>
        <button type="button" class="action-btn action-btn-solid reward-btn-inline" data-past-action="reward">
          <span class="reward-btn__text">晒单有礼</span>
        </button>
      </div>
      <button type="button" class="restart-btn retake-btn-secondary" data-past-action="retry">重新探索</button>
    </div>` : '';

  const heroMeta = [p.author, p.source].filter(Boolean).join(' · ');
  const heroLabel = showOrder && orderText ? orderText : 'Historical Archetype';

  return `<div class="past-history-result" data-past-result>
    <div class="result-inner">
      <div class="capture-area">
        <div class="brand-bar">
          <div class="logo">心象测</div>
          <div class="meta">历史人物原型</div>
        </div>
        <header class="hero">
          <div class="hero-label">${esc(heroLabel)}</div>
          ${heroMeta ? `<div class="hero-meaning">${esc(heroMeta)}</div>` : ''}
          <div class="hero-cn-name">${esc(p.name)}</div>
          <blockquote class="epigraph">${esc(p.quote)}</blockquote>
          <div class="tags">${(p.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
        </header>
        <section class="section result-section">
          ${sectionTitle('你的核心轮廓')}
          ${profileHtml}
        </section>
        <section class="meter-card">
          ${sectionTitle('你的行为画像')}
          ${renderMirrorRadarBlock(result.stats, refStats)}
        </section>
        <section class="path-report result-section">
          ${sectionKicker(`你与${p.name || 'TA'}的相照之处`)}
          ${path.summary ? `<p class="bottom-report-summary">${esc(path.summary)}</p>` : ''}
          <div class="bottom-report-steps">${stepsHtml}</div>
        </section>
        <section class="modern-section result-section">
          ${sectionKicker('现实中的你')}
          <div class="scene-entries">${scenesHtml}</div>
        </section>
        ${br.intro ? `<div class="result-closing-note"><p>${esc(br.intro)}</p></div>` : ''}
      </div>
      ${actionsHtml}
    </div>
  </div>`;
}

export function bindPastResultActions(root, options = {}) {
  if (!root) return;
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
