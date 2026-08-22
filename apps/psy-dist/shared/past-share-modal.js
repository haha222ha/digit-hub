import { renderRadarSvg, esc } from './past-result-ui-core.js';

const DEFAULT_REWARD = {
  title: '晒单有礼',
  rules: [
    '完成测试后，将<strong>结果截图</strong>（含人物名与雷达图）保存到相册。',
    '在小红书 / 朋友圈 / 社群分享你的测试结果，并附上<strong>真实短评</strong>（建议 10 字以上）。',
    '截图你的分享页面，通过页面底部<strong>推广链接</strong>联系客服，发送截图即可参与活动。',
    '每位用户每完成一次测试可参与一次；请勿上传无关截图。',
  ],
  footerTitle: '客服会尽快回复',
  footerDesc: '客服在线时间：周一至周五 09:00–18:00（UTC+8）\n看到消息后会第一时间处理，请耐心等待～',
};

let html2canvasPromise;

function loadHtml2Canvas() {
  if (!html2canvasPromise) {
    html2canvasPromise = import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm')
      .then((m) => m.default);
  }
  return html2canvasPromise;
}

function ensureModalRoot() {
  let root = document.getElementById('past-modal-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'past-modal-root';
    document.body.appendChild(root);
  }
  return root;
}

function closeModal() {
  const root = document.getElementById('past-modal-root');
  if (root) root.innerHTML = '';
  document.body.classList.remove('past-modal-open');
}

function openOverlay(innerHtml, className) {
  const root = ensureModalRoot();
  root.innerHTML = `<div class="past-overlay ${className || ''}" data-past-overlay>
    ${innerHtml}
  </div>`;
  document.body.classList.add('past-modal-open');
  root.querySelector('[data-past-overlay]')?.addEventListener('click', (e) => {
    if (e.target.matches('[data-past-overlay], [data-past-close]')) closeModal();
  });
  root.querySelectorAll('[data-past-close]').forEach((el) => {
    el.addEventListener('click', closeModal);
  });
}

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

async function renderShareImage(cardNode) {
  const html2canvas = await loadHtml2Canvas();
  const canvas = await html2canvas(cardNode, {
    backgroundColor: '#faf7f0',
    scale: Math.min(2, window.devicePixelRatio || 1),
    useCORS: true,
    logging: false,
  });
  return canvas.toDataURL('image/png');
}

export async function openSharePreview(result) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;';
  host.innerHTML = buildShareCardHtml(result);
  document.body.appendChild(host);
  const card = host.querySelector('[data-past-share-card]');

  openOverlay(`<button type="button" class="past-overlay-close" data-past-close aria-label="关闭">×</button>
    <div class="past-share-loading">生成分享图中…</div>`, 'past-share-overlay');

  try {
    const dataUrl = await renderShareImage(card);
    host.remove();
    const root = document.getElementById('past-modal-root');
    if (!root) return;
    root.querySelector('.past-overlay').innerHTML = `
      <button type="button" class="past-overlay-close" data-past-close aria-label="关闭">×</button>
      <img class="past-share-preview" src="${dataUrl}" alt="测评结果图">
      <p class="past-share-hint">长按图片保存到相册</p>
      <span class="past-share-brand-note">心象测 · 历史人物匹配</span>
      <button type="button" class="past-share-download btn btn-primary" data-past-download>保存图片</button>`;
    root.querySelector('[data-past-close]')?.addEventListener('click', closeModal);
    root.querySelector('[data-past-overlay]')?.addEventListener('click', (e) => {
      if (e.target.matches('[data-past-overlay], [data-past-close]')) closeModal();
    });
    root.querySelector('[data-past-download]')?.addEventListener('click', async () => {
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], 'past-result.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: '历史人物匹配结果' });
          return;
        }
      } catch (e) { /* fall through to download */ }
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'past-result.png';
      a.click();
    });
  } catch (err) {
    host.remove();
    console.error(err);
    closeModal();
    alert('分享图生成失败，请直接截图结果页。');
  }
}

export function openRewardModal(config = {}) {
  const cfg = { ...DEFAULT_REWARD, ...config };
  const rulesHtml = (cfg.rules || []).map((rule, i) => `
    <div class="past-reward-rule">
      <div class="past-reward-num">${i + 1}</div>
      <div class="past-reward-text">${rule}</div>
    </div>`).join('');

  openOverlay(`<div class="past-reward-box" role="dialog" aria-modal="true">
    <div class="past-reward-header">
      <div class="past-reward-title">
        <span class="past-reward-seal">礼</span>
        <span class="past-reward-title-text">${esc(cfg.title)}</span>
      </div>
      <button type="button" class="past-reward-close" data-past-close aria-label="关闭">×</button>
    </div>
    <div class="past-reward-rules">${rulesHtml}</div>
    <div class="past-reward-footer">
      <div class="past-reward-footer-title">${esc(cfg.footerTitle)}</div>
      <div class="past-reward-footer-desc">${esc(cfg.footerDesc).replace(/\n/g, '<br>')}</div>
    </div>
  </div>`, 'past-reward-overlay');
}
