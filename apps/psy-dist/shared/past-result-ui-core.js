export const RADAR_ORDER = ['coordination', 'openness', 'resilience', 'empathy', 'action', 'insight'];

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function byKey(stats) {
  const map = new Map();
  (stats || []).forEach((item) => map.set(item.key, item));
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

function sectionTitle(text) {
  return `<div class="section-label"><span class="title-icon" aria-hidden="true">✦</span><span class="title-text">${esc(text)}</span></div>`;
}

function sectionKicker(text) {
  return `<div class="section-kicker"><span class="title-icon" aria-hidden="true">✦</span><span class="title-text">${esc(text)}</span></div>`;
}

/** 镜像同构雷达 + 六维图例（default-HAMcHMCE） */
export function renderMirrorRadarBlock(userStats, refStats) {
  const user = orderedStats(userStats);
  const ref = orderedStats(refStats);
  const hasRef = ref.length > 0;
  const labels = user.map((s) => s.label);
  const userVals = user.map((s) => s.value);
  const refVals = hasRef ? ref.map((s) => s.value) : [];
  const cx = 160;
  const cy = 160;
  const radius = 92;
  const rings = [25, 50, 75, 100];
  const ringPolys = rings.map((pct) => {
    const pts = radarPoints(Array(labels.length).fill(pct), cx, cy, radius);
    return `<polygon class="radar-grid" points="${poly(pts)}"/>`;
  }).join('');
  const axes = labels.map((label, i) => {
    const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / labels.length;
    const x2 = cx + radius * Math.cos(angle);
    const y2 = cy + radius * Math.sin(angle);
    const lx = cx + (radius + 24) * Math.cos(angle);
    const ly = cy + (radius + 24) * Math.sin(angle);
    const anchor = Math.abs(Math.cos(angle)) < 0.2 ? 'middle' : (Math.cos(angle) > 0 ? 'start' : 'end');
    return `<line class="radar-axis" x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}"/>
      <text class="radar-label" x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="middle">${esc(label)}</text>`;
  }).join('');
  const refPoly = hasRef ? radarPoints(refVals, cx, cy, radius) : [];
  const userPoly = radarPoints(userVals, cx, cy, radius);
  const userDots = userPoly.map(([x, y]) => `<circle class="radar-point" cx="${x}" cy="${y}" r="3.2"/>`).join('');
  const refDots = hasRef ? refPoly.map(([x, y]) => `<circle class="radar-reference-point" cx="${x}" cy="${y}" r="2.8"/>`).join('') : '';

  const legendHtml = user.map((u, i) => {
    const r = hasRef ? ref[i] : null;
    const refLine = r ? `<small>参照 ${r.value}%</small>` : '';
    return `<div class="radar-legend-item">
      <div class="radar-legend-head">
        <span class="radar-legend-name">${esc(u.label)}</span>
        <span class="radar-legend-value"><strong>你 ${u.value}%</strong>${refLine}</span>
      </div>
      <div class="radar-legend-desc">${esc(u.desc)}</div>
    </div>`;
  }).join('');

  const keyHtml = hasRef ? `
    <div class="radar-key">
      <span class="radar-key-item"><span class="radar-key-swatch radar-key-swatch--user"></span>实线为你</span>
      <span class="radar-key-item"><span class="radar-key-swatch radar-key-swatch--reference"></span>虚线为人物参照轮廓</span>
    </div>` : '';

  return `<div class="radar-wrap">
    <svg class="radar-chart" viewBox="0 0 320 320" width="100%" aria-label="行为画像雷达图">
      ${ringPolys}
      ${axes}
      ${hasRef ? `<polygon class="radar-reference-area" points="${poly(refPoly)}"/>` : ''}
      <polygon class="radar-area" points="${poly(userPoly)}"/>
      ${refDots}
      ${userDots}
    </svg>
    ${keyHtml}
    <div class="radar-legend">${legendHtml}</div>
  </div>`;
}

/** 分享卡等仍用简化雷达 */
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

export function renderDimGrid(userStats, refStats) {
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

export { sectionTitle, sectionKicker };
