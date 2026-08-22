const RADAR_ORDER = ['coordination', 'openness', 'resilience', 'empathy', 'action', 'insight'];

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function byKey(stats) {
  const map = new Map();
  (stats || []).forEach((s) => map.set(s.key, s));
  return map;
}

function orderedStats(stats) {
  const map = byKey(stats);
  return RADAR_ORDER.map((key) => map.get(key)).filter(Boolean);
}

function radarPoints(values, cx, cy, radius) {
  return values.map((v, i) => {
    const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / values.length;
    const r = (Math.max(0, Math.min(100, v)) / 100) * radius;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  });
}

function poly(points) {
  return points.map((p) => p.join(',')).join(' ');
}

export function renderRadarSvg(userStats, refStats) {
  const user = orderedStats(userStats);
  const ref = orderedStats(refStats);
  const hasRef = ref.length > 0;
  const labels = user.map((s) => s.label);
  const userVals = user.map((s) => s.value);
  const refVals = hasRef ? ref.map((s) => s.value) : [];
  const cx = 150;
  const cy = 150;
  const radius = 88;
  const rings = [25, 50, 75, 100];
  const ringPolys = rings.map((pct) => {
    const pts = radarPoints(Array(labels.length).fill(pct), cx, cy, radius);
    return `<polygon points="${poly(pts)}" fill="none" stroke="#e8dfd0" stroke-width="1"/>`;
  }).join('');
  const axes = labels.map((label, i) => {
    const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / labels.length;
    const x2 = cx + radius * Math.cos(angle);
    const y2 = cy + radius * Math.sin(angle);
    const lx = cx + (radius + 22) * Math.cos(angle);
    const ly = cy + (radius + 22) * Math.sin(angle);
    const anchor = Math.abs(Math.cos(angle)) < 0.2 ? 'middle' : (Math.cos(angle) > 0 ? 'start' : 'end');
    return `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="#e8dfd0" stroke-width="1"/>
      <text x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="middle" font-size="10" fill="#8a7f72">${esc(label)}</text>`;
  }).join('');
  const refPoly = hasRef ? radarPoints(refVals, cx, cy, radius) : [];
  const userPoly = radarPoints(userVals, cx, cy, radius);
  return `<div class="past-radar-box">
    <svg viewBox="0 0 300 300" width="100%" aria-label="行为画像雷达图">
      ${ringPolys}
      ${axes}
      ${hasRef ? `<polygon points="${poly(refPoly)}" fill="rgba(154,123,79,.12)" stroke="#9a7b4f" stroke-width="1.5" stroke-dasharray="5 4"/>` : ''}
      <polygon points="${poly(userPoly)}" fill="rgba(184,92,74,.15)" stroke="#b85c4a" stroke-width="2"/>
    </svg>
    ${hasRef ? `<div class="past-radar-legend">
      <span class="past-legend-item"><span class="past-legend-line"></span>实线为你</span>
      <span class="past-legend-item"><span class="past-legend-line ref"></span>虚线为人物参照轮廓</span>
    </div>` : ''}
  </div>`;
}

function renderDimGrid(userStats, refStats) {
  const userMap = byKey(userStats);
  const refMap = byKey(refStats);
  return `<div class="past-dim-grid">${RADAR_ORDER.map((key) => {
    const u = userMap.get(key);
    const r = refMap.get(key);
    if (!u) return '';
    return `<div class="past-dim-card">
      <div class="past-dim-label">${esc(u.label)}</div>
      <div class="past-dim-scores">你 <strong>${u.value}%</strong>${r ? ` <span class="ref-val">| 参照 ${r.value}%</span>` : ''}</div>
      <div class="past-dim-desc">${esc(u.desc)}</div>
    </div>`;
  }).join('')}</div>`;
}

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
      <button type="button" class="btn btn-ghost" data-past-action="share">截图分享</button>
      <button type="button" class="btn btn-primary" data-past-action="reward">晒单有礼</button>
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

async function captureResult(node) {
  if (!node) return;
  try {
    const { default: html2canvas } = await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm');
    const canvas = await html2canvas(node, {
      backgroundColor: '#f4efe6',
      scale: Math.min(2, window.devicePixelRatio || 1),
      useCORS: true,
    });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('capture failed');
    const file = new File([blob], 'past-result.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: '历史人物匹配结果' });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'past-result.png';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert('截图失败，请使用手机系统截图功能保存结果页。');
  }
}

export function bindPastResultActions(root, options = {}) {
  if (!root) return;
  root.querySelector('[data-past-action="share"]')?.addEventListener('click', () => {
    const node = root.querySelector('[data-past-result]') || root;
    captureResult(node);
  });
  root.querySelector('[data-past-action="reward"]')?.addEventListener('click', () => {
    if (typeof options.onReward === 'function') {
      options.onReward();
      return;
    }
    if (typeof window.PsyTestValidator?.addPromotionLink === 'function') {
      window.PsyTestValidator.addPromotionLink();
      alert('请通过页面推广链接参与晒单活动。');
      return;
    }
    alert('晒单有礼活动请咨询分销客服。');
  });
  root.querySelector('[data-past-action="retry"]')?.addEventListener('click', () => {
    if (typeof options.onRetry === 'function') options.onRetry();
  });
}

export function renderPastResult(container, result, options = {}) {
  if (!container || !result) return;
  container.innerHTML = buildPastResultHtml(result, options);
  bindPastResultActions(container, options);
}
