import { esc } from './past-result-ui-core.js';
import { openMuseSharePreview } from './muse-share-modal.js';
import { openRewardModal } from './psy-result-modals.js';

function renderScoreBars(scores, accent) {
  const entries = Object.entries(scores || {});
  const maxV = Math.max(...entries.map(([, v]) => Number(v)), 1);
  return entries.map(([label, value]) => {
    const pct = Math.round(Number(value) / maxV * 100);
    return `<div class="muse-radar-row">
      <span>${esc(label)}</span>
      <div class="muse-radar-bar"><div class="muse-radar-fill" style="width:${pct}%;background:${accent}"></div></div>
      <span>${esc(value)}</span>
    </div>`;
  }).join('');
}

export function buildMuseResultHtml(result, options = {}) {
  const accent = result.color || '#2d4a6f';
  const showActions = options.showActions !== false;
  const score = result.extra?.primaryScore ?? '--';
  const sug = result.suggestions || [];
  const echo = result.extra?.echo;

  let sectionsHtml = '';
  if (sug[0]) {
    sectionsHtml += `<section class="muse-block"><h2 class="muse-section-title">铠甲 · 你的力量</h2><p class="muse-text">${esc(sug[0])}</p></section>`;
  }
  if (sug[1]) {
    sectionsHtml += `<section class="muse-block muse-block-crack"><h2 class="muse-section-title">裂缝 · 你的张力</h2><p class="muse-text">${esc(sug[1])}</p></section>`;
  }
  if (echo) {
    sectionsHtml += `<section class="muse-block muse-block-echo">
      <h2 class="muse-section-title">精神共振 · 第二名</h2>
      <p class="muse-echo-name"><strong>${esc(echo.name)}</strong> · ${esc(echo.alias || '')}</p>
      <p class="muse-echo-score">共振度 ${esc(result.extra.echoScore || 0)}%</p>
    </section>`;
  }

  const actionsHtml = showActions ? `
    <div class="muse-actions">
      <button type="button" class="btn btn-ghost muse-action-share" data-muse-action="share">截图分享</button>
      <button type="button" class="btn btn-primary muse-action-reward" data-muse-action="reward">晒单有礼</button>
    </div>
    <div class="muse-actions-stack">
      <button type="button" class="btn btn-ghost" data-muse-action="retry">重新探索</button>
    </div>` : '';

  return `<article class="muse-result" data-muse-result style="--muse-accent:${accent}">
    <header class="muse-hero">
      <div class="muse-hero-name">${esc(result.title)}</div>
      <div class="muse-hero-sub">${esc(result.description)}</div>
      <div class="muse-hero-score">匹配度 ${esc(score)}%</div>
      <div class="muse-tag-row">${(result.tags || []).map((t) => `<span class="muse-tag">${esc(t)}</span>`).join('')}</div>
    </header>
    <section class="muse-block">
      <h2 class="muse-section-title">六维气质坐标</h2>
      <div class="muse-radar-wrap">${renderScoreBars(result.scores, accent)}</div>
    </section>
    ${sectionsHtml}
    ${actionsHtml}
  </article>`;
}

export function bindMuseResultActions(root, options = {}) {
  if (!root) return;
  const resultData = options.result;

  root.querySelector('[data-muse-action="share"]')?.addEventListener('click', () => {
    if (typeof options.onShare === 'function') {
      options.onShare(resultData);
      return;
    }
    if (resultData) openMuseSharePreview(resultData);
  });

  root.querySelector('[data-muse-action="reward"]')?.addEventListener('click', () => {
    if (typeof options.onReward === 'function') {
      options.onReward();
      return;
    }
    if (typeof window.PsyTestValidator?.addPromotionLink === 'function') {
      window.PsyTestValidator.addPromotionLink();
    }
    openRewardModal(options.rewardConfig);
  });

  root.querySelector('[data-muse-action="retry"]')?.addEventListener('click', () => {
    if (typeof options.onRetry === 'function') options.onRetry();
  });
}

export function renderMuseResult(container, result, options = {}) {
  if (!container || !result) return;
  const accent = result.color || '#2d4a6f';
  document.documentElement.style.setProperty('--accent', accent);
  container.innerHTML = buildMuseResultHtml(result, options);
  bindMuseResultActions(container, { ...options, result });
}
