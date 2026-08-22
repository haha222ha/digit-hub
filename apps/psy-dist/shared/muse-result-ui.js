import { esc } from './past-result-ui-core.js';
import { renderMuseRadarSvg, renderMuseDimGrid } from './muse-result-ui-core.js';
import { openMuseSharePreview } from './muse-share-modal.js';
import { openRewardModal } from './psy-result-modals.js';

function sectHead(seal, title, alt = false) {
  return `<div class="wx-sect__head">
    <span class="wx-sect__seal${alt ? ' wx-sect__seal--alt' : ''}">${esc(seal)}</span>
    <h2 class="wx-sect__title">${esc(title)}</h2>
  </div>`;
}

export function buildMuseResultHtml(result, options = {}) {
  const accent = result.color || '#8B7EC8';
  const showActions = options.showActions !== false;
  const score = result.extra?.primaryScore ?? '--';
  const sug = result.suggestions || [];
  const echo = result.extra?.echo;
  const tags = (result.tags || []).slice(0, 4);

  let sectionsHtml = '';
  if (sug[0]) {
    sectionsHtml += `<section class="wx-sect">
      ${sectHead('铠', '铠甲 · 你的力量')}
      <div class="wx-prose-soft"><p>${esc(sug[0])}</p></div>
    </section>`;
  }
  if (sug[1]) {
    sectionsHtml += `<section class="wx-sect">
      ${sectHead('裂', '裂缝 · 你的张力', true)}
      <div class="wx-prose-soft"><p>${esc(sug[1])}</p></div>
    </section>`;
  }

  sectionsHtml += `<section class="wx-sect">
    ${sectHead('象', '六维气质坐标')}
    ${renderMuseRadarSvg(result.scores, accent)}
    ${renderMuseDimGrid(result.scores, accent)}
  </section>`;

  if (echo) {
    const echoScore = result.extra?.echoScore || 0;
    sectionsHtml += `<section class="wx-sect">
      ${sectHead('鸣', '精神共振 · 第二名', true)}
      <div class="wx-mirror">
        <div class="wx-mirror__card wx-mirror__card--dark">
          <span class="wx-mirror__label">RESONANCE</span>
          <div class="wx-mirror__name">${esc(echo.name)}</div>
          <div class="wx-mirror__alias">${esc(echo.alias || '')}</div>
          <div class="wx-mirror__bar"><div class="wx-mirror__bar-fill wx-mirror__bar-fill--green" style="width:${echoScore}%"></div></div>
          <div class="wx-mirror__pct">共振度 ${esc(echoScore)}%</div>
        </div>
      </div>
    </section>`;
  }

  const actionsHtml = showActions ? `
    <footer class="wx-foot">
      <div class="wx-foot__line">匹配度 <strong>${esc(result.title)}</strong><em>${esc(score)}%</em></div>
      <div class="wx-foot__actions">
        <div class="wx-foot__btns">
          <button type="button" class="wx-foot__btn" data-muse-action="share">截图分享</button>
          <button type="button" class="wx-foot__btn wx-foot__btn--reward" data-muse-action="reward">
            <span class="wx-reward-btn__text">晒单有礼</span>
          </button>
        </div>
        <button type="button" class="wx-retake-btn-secondary" data-muse-action="retry">重新探索</button>
      </div>
      <p class="wx-foot__brand">心象测 · 文学原型·新</p>
    </footer>` : '';

  return `<div class="wx" data-muse-result style="--c-accent:${accent};--c-red:${accent}">
    <div class="wx__bg" aria-hidden="true"></div>
    <div class="wx-brand">
      <div class="wx-brand__logo">心象测</div>
      <div class="wx-brand__no">MUSE / 文学原型</div>
    </div>
    <header class="wx-hero">
      <div class="wx-hero__glow" aria-hidden="true"></div>
      <p class="wx-hero__kicker">Literary Archetype</p>
      <h1 class="wx-hero__name">${esc(result.title)}</h1>
      <p class="wx-hero__sub">${esc(result.description)}</p>
      <div class="wx-hero__tags">${tags.map((t) => `<span class="wx-tag">${esc(t)}</span>`).join('')}</div>
      <p class="wx-hero__diag">匹配度 ${esc(score)}%</p>
    </header>
    ${sectionsHtml}
    ${actionsHtml}
  </div>`;
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
  container.innerHTML = buildMuseResultHtml(result, options);
  bindMuseResultActions(container, { ...options, result });
}
