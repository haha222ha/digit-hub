import { esc } from './past-result-ui-core.js';

const MUSE_DIM_ORDER = ['旁观感', '洞察力', '热忱度', '反骨度', '飘逸度', '沉思力'];

export function orderedMuseScores(scores) {
  const map = new Map(Object.entries(scores || {}));
  return MUSE_DIM_ORDER.map((name) => {
    const value = map.get(name);
    return value != null ? { name, value: Number(value) } : null;
  }).filter(Boolean);
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

export function renderMuseRadarSvg(scores, accent) {
  const items = orderedMuseScores(scores);
  if (!items.length) return '';
  const labels = items.map((s) => s.name);
  const vals = items.map((s) => s.value);
  const cx = 130;
  const cy = 130;
  const radius = 78;
  const rings = [25, 50, 75, 100];
  const ringPolys = rings.map((pct) => {
    const pts = radarPoints(Array(labels.length).fill(pct), cx, cy, radius);
    return `<polygon class="wx-radar__grid" points="${poly(pts)}"/>`;
  }).join('');
  const axes = labels.map((label, i) => {
    const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / labels.length;
    const x2 = cx + radius * Math.cos(angle);
    const y2 = cy + radius * Math.sin(angle);
    const lx = cx + (radius + 20) * Math.cos(angle);
    const ly = cy + (radius + 20) * Math.sin(angle);
    const anchor = Math.abs(Math.cos(angle)) < 0.2 ? 'middle' : (Math.cos(angle) > 0 ? 'start' : 'end');
    return `<line class="wx-radar__axis" x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}"/>
      <text class="wx-radar__lbl" x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="middle">${esc(label)}</text>`;
  }).join('');
  const userPoly = radarPoints(vals, cx, cy, radius);
  const dots = userPoly.map(([x, y]) => `<circle class="wx-radar__dot" cx="${x}" cy="${y}" r="3"/>`).join('');
  return `<div class="wx-radar" style="--c-accent:${accent};--c-red:${accent}">
    <svg class="wx-radar__svg" viewBox="0 0 260 260" width="100%" aria-label="气质雷达图">
      ${ringPolys}
      ${axes}
      <polygon class="wx-radar__area" points="${poly(userPoly)}"/>
      ${dots}
    </svg>
  </div>`;
}

export function renderMuseDimGrid(scores, accent) {
  const items = orderedMuseScores(scores);
  const maxV = Math.max(...items.map((s) => s.value), 1);
  return `<div class="wx-dims">${items.map((item) => {
    const pct = Math.round((item.value / maxV) * 100);
    return `<div class="wx-dim">
      <div class="wx-dim__top">
        <span class="wx-dim__name">${esc(item.name)}</span>
        <span class="wx-dim__val">${item.value}<small>%</small></span>
      </div>
      <div class="wx-dim__track"><div class="wx-dim__fill" style="width:${pct}%;background:linear-gradient(90deg,${accent}80,${accent}cc)"></div></div>
    </div>`;
  }).join('')}</div>`;
}
