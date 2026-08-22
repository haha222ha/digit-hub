import { esc } from './past-result-ui-core.js';

const MODAL_ROOT_ID = 'psy-modal-root';
const BODY_LOCK_CLASS = 'past-modal-open';

const DEFAULT_REWARD = {
  title: '晒单有礼',
  rules: [
    '完成测试后，将<strong>结果截图</strong>（含原型名与气质图）保存到相册。',
    '在小红书 / 朋友圈 / 社群分享你的测试结果，并附上<strong>真实短评</strong>（建议 10 字以上）。',
    '截图你的分享页面，通过页面底部<strong>推广链接</strong>联系客服，发送截图即可参与活动。',
    '每位用户每完成一次测试可参与一次；请勿上传无关截图。',
  ],
  footerTitle: '客服会尽快回复',
  footerDesc: '客服在线时间：周一至周五 09:00–18:00（UTC+8）\n看到消息后会第一时间处理，请耐心等待～',
};

let html2canvasPromise;

export function loadHtml2Canvas() {
  if (!html2canvasPromise) {
    html2canvasPromise = import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm')
      .then((m) => m.default);
  }
  return html2canvasPromise;
}

function ensureModalRoot() {
  let root = document.getElementById(MODAL_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = MODAL_ROOT_ID;
    document.body.appendChild(root);
  }
  return root;
}

export function closeResultModal() {
  const root = document.getElementById(MODAL_ROOT_ID);
  if (root) root.innerHTML = '';
  document.body.classList.remove(BODY_LOCK_CLASS);
}

function bindOverlayClose(root) {
  root.querySelector('[data-psy-overlay]')?.addEventListener('click', (e) => {
    if (e.target.matches('[data-psy-overlay], [data-psy-close]')) closeResultModal();
  });
  root.querySelectorAll('[data-psy-close]').forEach((el) => {
    el.addEventListener('click', closeResultModal);
  });
}

export function openOverlay(innerHtml, className) {
  const root = ensureModalRoot();
  root.innerHTML = `<div class="past-overlay ${className || ''}" data-psy-overlay>
    ${innerHtml}
  </div>`;
  document.body.classList.add(BODY_LOCK_CLASS);
  bindOverlayClose(root);
}

export async function renderShareImage(cardNode, backgroundColor = '#faf7f0') {
  const html2canvas = await loadHtml2Canvas();
  const canvas = await html2canvas(cardNode, {
    backgroundColor,
    scale: Math.min(2, window.devicePixelRatio || 1),
    useCORS: true,
    logging: false,
  });
  return canvas.toDataURL('image/png');
}

export async function openShareImagePreview({
  cardHtml,
  cardSelector,
  backgroundColor = '#faf7f0',
  fileName = 'psy-result.png',
  shareTitle = '测评结果',
  brandNote = '心象测',
  failMessage = '分享图生成失败，请直接截图结果页。',
}) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;';
  host.innerHTML = cardHtml;
  document.body.appendChild(host);
  const card = host.querySelector(cardSelector);
  if (!card) {
    host.remove();
    alert(failMessage);
    return;
  }

  openOverlay(
    `<button type="button" class="past-overlay-close" data-psy-close aria-label="关闭">×</button>
    <div class="past-share-loading">生成分享图中…</div>`,
    'past-share-overlay',
  );

  try {
    const dataUrl = await renderShareImage(card, backgroundColor);
    host.remove();
    const root = document.getElementById(MODAL_ROOT_ID);
    if (!root) return;
    root.querySelector('.past-overlay').innerHTML = `
      <button type="button" class="past-overlay-close" data-psy-close aria-label="关闭">×</button>
      <img class="past-share-preview" src="${dataUrl}" alt="测评结果图">
      <p class="past-share-hint">长按图片保存到相册</p>
      <span class="past-share-brand-note">${esc(brandNote)}</span>
      <button type="button" class="past-share-download btn btn-primary" data-psy-download>保存图片</button>`;
    bindOverlayClose(root);
    root.querySelector('[data-psy-download]')?.addEventListener('click', async () => {
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: shareTitle });
          return;
        }
      } catch (e) { /* download fallback */ }
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = fileName;
      a.click();
    });
  } catch (err) {
    host.remove();
    console.error(err);
    closeResultModal();
    alert(failMessage);
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
      <button type="button" class="past-reward-close" data-psy-close aria-label="关闭">×</button>
    </div>
    <div class="past-reward-rules">${rulesHtml}</div>
    <div class="past-reward-footer">
      <div class="past-reward-footer-title">${esc(cfg.footerTitle)}</div>
      <div class="past-reward-footer-desc">${esc(cfg.footerDesc).replace(/\n/g, '<br>')}</div>
    </div>
  </div>`, 'past-reward-overlay');
}
