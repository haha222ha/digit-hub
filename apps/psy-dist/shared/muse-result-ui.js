import { esc } from './past-result-ui-core.js';
import {
  renderMuseRadarSvg,
  renderMuseDimGrid,
  pickMusePersonaDim,
  spacedTitle,
} from './muse-result-ui-core.js';
import { openMuseSharePreview } from './muse-share-modal.js';
import { openRewardModal } from './psy-result-modals.js';

const BOOK_ACCENTS = ['wx-book__accent--1', 'wx-book__accent--2', 'wx-book__accent--3', 'wx-book__accent--4', 'wx-book__accent--5'];

function sectHead(seal, title, alt = false) {
  return `<div class="wx-sect__head">
    <span class="wx-sect__seal${alt ? ' wx-sect__seal--alt' : ''}">${esc(seal)}</span>
    <h2 class="wx-sect__title">${esc(spacedTitle(title))}</h2>
  </div>`;
}

function tagList(tags, power = true) {
  const cls = power ? 'wx-kw wx-kw--power' : 'wx-kw wx-kw--weak';
  return (tags || []).map((t) => `<span class="${cls}">${esc(t)}</span>`).join('');
}

function profileProse(primary, dim) {
  const paras = primary?.profile?.[dim] || [];
  if (!paras.length) return '';
  return `<div class="wx-prose">${paras.map((p) => `<p>${esc(p)}</p>`).join('')}</div>`;
}

function letterBlock(primary, dim) {
  const tagline = primary?.tagline || '';
  const quote = primary?.quote?.[dim] || '';
  if (!tagline && !quote) return '';
  return `<div class="wx-letter">
    <span class="wx-letter__corner wx-letter__corner--tl" aria-hidden="true"></span>
    <span class="wx-letter__corner wx-letter__corner--tr" aria-hidden="true"></span>
    <span class="wx-letter__corner wx-letter__corner--bl" aria-hidden="true"></span>
    <span class="wx-letter__corner wx-letter__corner--br" aria-hidden="true"></span>
    ${tagline ? `<p class="wx-letter__tagline">${esc(tagline)}</p>` : ''}
    ${quote ? `<p class="wx-letter__text">${esc(quote)}</p>` : ''}
  </div>`;
}

function modernBlock(primary, dim) {
  const text = primary?.modern?.[dim];
  if (!text) return '';
  return `<div class="wx-modern"><p class="wx-modern__text">${esc(text)}</p></div>`;
}

function awakenBlock(primary, dim) {
  const steps = primary?.growth?.[dim] || [];
  if (!steps.length) return '';
  return `<div class="wx-awaken">
    <div class="wx-awaken__rail" aria-hidden="true"></div>
    ${steps.map((text, i) => `<div class="wx-awaken__step">
      <span class="wx-awaken__idx">${String(i + 1).padStart(2, '0')}</span>
      <p class="wx-awaken__text">${esc(text)}</p>
    </div>`).join('')}
  </div>`;
}

function mirrorBlock(primary, echo, primaryScore, echoScore) {
  if (!primary) return '';
  let html = `<div class="wx-mirror">
    <div class="wx-mirror__card wx-mirror__card--light">
      <span class="wx-mirror__label">显 · 主原型</span>
      <div class="wx-mirror__name">${esc(primary.name)}</div>
      <div class="wx-mirror__alias">${esc(primary.alias || '')}</div>
      <div class="wx-mirror__bar"><div class="wx-mirror__bar-fill wx-mirror__bar-fill--gold" style="width:${primaryScore}%"></div></div>
      <div class="wx-mirror__pct">共振度 ${esc(primaryScore)}%</div>
    </div>`;
  if (echo) {
    html += `<div class="wx-mirror__vs" aria-hidden="true">
      <div class="wx-mirror__vs-line"></div>
      <span class="wx-mirror__vs-icon">VS</span>
      <div class="wx-mirror__vs-line"></div>
    </div>
    <div class="wx-mirror__card wx-mirror__card--dark">
      <span class="wx-mirror__label">隐 · 回响</span>
      <div class="wx-mirror__name">${esc(echo.name)}</div>
      <div class="wx-mirror__alias">${esc(echo.alias || '')}</div>
      <div class="wx-mirror__bar"><div class="wx-mirror__bar-fill wx-mirror__bar-fill--green" style="width:${echoScore}%"></div></div>
      <div class="wx-mirror__pct">共振度 ${esc(echoScore)}%</div>
    </div>
    <p class="wx-mirror__note">你灵魂的另一面住着 <strong>${esc(echo.name)}</strong>，两股看似矛盾的力量彼此拉扯、相互成全，铸就了你独一无二的精神底色。</p>`;
  }
  html += '</div>';
  return html;
}

function storyBlock(primary) {
  const paras = primary?.soul || [];
  if (!paras.length) return '';
  return `<div class="wx-story"><div class="wx-story__inner">${paras.map((p, i) => `<p class="wx-story__para${i === 0 ? ' wx-story__para--first' : ''}">${esc(p)}</p>`).join('')}</div></div>`;
}

function booksBlock(books) {
  const items = books || [];
  if (!items.length) return '';
  return `<div class="wx-books">${items.map((book, i) => `<article class="wx-book">
    <div class="wx-book__accent ${BOOK_ACCENTS[i % BOOK_ACCENTS.length]}" aria-hidden="true"></div>
    <div class="wx-book__body">
      <div class="wx-book__head">
        <span class="wx-book__num">${String(i + 1).padStart(2, '0')}</span>
        <h3 class="wx-book__name">${esc(book.title)}</h3>
      </div>
      <p class="wx-book__author">${esc(book.author || '')}</p>
      <blockquote class="wx-book__quote">${esc(book.reason || '')}</blockquote>
    </div>
  </article>`).join('')}</div>`;
}

export function buildMuseResultHtml(result, options = {}) {
  if (!result) {
    return `<div class="wx wx--empty" data-muse-result>
      <div class="wx-empty">
        <p class="wx-empty__title">报告暂不可用</p>
        <p class="wx-empty__hint">请重新完成测试，或稍后再试。</p>
      </div>
    </div>`;
  }

  const accent = result.color || '#8B7EC8';
  const showActions = options.showActions !== false;
  const extra = result.extra || {};
  const primary = extra.primary || {};
  const echo = extra.echo;
  const primaryScore = extra.primaryScore ?? '--';
  const echoScore = extra.echoScore || 0;
  const dim = pickMusePersonaDim(extra.userVec);
  const tags = (result.tags || primary.tags || []).slice(0, 4);
  const weakTags = primary.weakTags || [];
  const crack = result.suggestions?.[1] || primary.crack?.[dim] || '';
  const heroQuote = primary.quote?.[dim] || '';

  const sectionsHtml = `
    <section class="wx-sect">
      ${sectHead('人', '人格底色')}
      ${profileProse(primary, dim)}
      ${tags.length ? `<div class="wx-gift"><div class="wx-gift__tags">${tagList(tags, true)}</div></div>` : ''}
    </section>
    <section class="wx-sect">
      ${sectHead('隐', '隐秘裂缝', true)}
      <div class="wx-shadow">
        ${crack ? `<p class="wx-shadow__text">${esc(crack)}</p>` : ''}
        ${weakTags.length ? `<div class="wx-shadow__tags">${tagList(weakTags, false)}</div>` : ''}
        <div class="wx-shadow__sep" aria-hidden="true"></div>
      </div>
    </section>
    <section class="wx-sect">
      ${sectHead('棱', '心灵棱镜')}
      ${renderMuseRadarSvg(result.scores, accent)}
      ${renderMuseDimGrid(result.scores, accent)}
    </section>
    <section class="wx-sect">
      ${sectHead('纸', '一纸独白', true)}
      ${letterBlock(primary, dim)}
    </section>
    <section class="wx-sect">
      ${sectHead('今', '今世映照')}
      ${modernBlock(primary, dim)}
    </section>
    <section class="wx-sect">
      ${sectHead('引', '心灵指引', true)}
      ${awakenBlock(primary, dim)}
    </section>
    <section class="wx-sect">
      ${sectHead('镜', '灵魂镜像')}
      ${mirrorBlock(primary, echo, primaryScore, echoScore)}
    </section>
    <section class="wx-sect">
      ${sectHead('生', '前世今生', true)}
      ${storyBlock(primary)}
    </section>
    <section class="wx-sect wx-sect--plain">
      ${sectHead('书', '配套剧本')}
      ${booksBlock(primary.books)}
    </section>`;

  const actionsHtml = showActions ? `
    <footer class="wx-foot">
      <p class="wx-foot__text">这不是标签，是一面镜子。</p>
      <div class="wx-foot__line">你与 <strong>${esc(result.title)}</strong> 的灵魂共振度 <em>${esc(primaryScore)}%</em></div>
      <div class="wx-foot__actions">
        <div class="wx-foot__btns">
          <button type="button" class="wx-foot__btn" data-muse-action="share">截图分享</button>
          <button type="button" class="wx-foot__btn wx-foot__btn--reward" data-muse-action="reward">
            <span class="wx-reward-btn__text">晒单有礼</span>
          </button>
        </div>
        <button type="button" class="wx-retake-btn-secondary" data-muse-action="retry">重新探索</button>
      </div>
      <p class="wx-foot__brand">MUSE · Literary Archetype</p>
    </footer>` : '';

  return `<div class="wx" data-muse-result style="--c-accent:${accent};--c-red:${accent}">
    <div class="wx__bg" aria-hidden="true"></div>
    <div class="wx-brand">
      <div class="wx-brand__logo">文学原型</div>
      <div class="wx-brand__no">MUSE / Literary Archetype</div>
    </div>
    <header class="wx-hero">
      <div class="wx-hero__glow" aria-hidden="true"></div>
      <p class="wx-hero__kicker">你 的 文 学 原 型 是</p>
      <h1 class="wx-hero__name">${esc(result.title)}</h1>
      <p class="wx-hero__sub">— ${esc(result.description)} —</p>
      ${heroQuote ? `<blockquote class="wx-hero__quote">${esc(heroQuote)}</blockquote>` : ''}
      <div class="wx-hero__tags">${tags.map((t) => `<span class="wx-tag">${esc(t)}</span>`).join('')}</div>
      <p class="wx-hero__diag">以下报告基于你的六维精神坐标生成，仅此一份。</p>
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
  if (!container) return;
  container.innerHTML = buildMuseResultHtml(result, options);
  bindMuseResultActions(container, { ...options, result });
}
