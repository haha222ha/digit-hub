import { esc } from './past-result-ui-core.js';

export const MUSE_DIM_ORDER = ['旁观感', '洞察力', '热忱度', '反骨度', '飘逸度', '沉思力'];

export const MUSE_DIM_DESC = {
  旁观感: '你与喧嚣保持距离、冷静旁观世事的天然倾向。',
  洞察力: '你穿透表象、直抵事物本质的敏锐直觉。',
  热忱度: '你对爱、美与生命体验投入情感的浓度。',
  反骨度: '你面对不合理之事敢于说「不」的骨气与硬度。',
  飘逸度: '你的精神不愿被拘束，渴望自由漫游的程度。',
  沉思力: '你在安静独处中深度思考、触碰内心的天赋。',
};

const PERSONA_KEYS = ['contemplative', 'ethereal', 'defiant'];

/** 与 vendor archetypes 中 pickDim 同构 */
export function pickMusePersonaDim(userVec) {
  const vec = userVec || [];
  const a = vec[5];
  const o = vec[4];
  const r = vec[3];
  const n = Math.max(a, o, r);
  const tie = (v) => {
    const t = Math.round(13 * vec[0] + 7 * vec[1] + 5 * vec[2]);
    return Math.abs(t);
  };
  if (n - Math.min(a, o, r) >= 0.5) {
    const picks = [];
    if (a === n) picks.push(PERSONA_KEYS[0]);
    if (o === n) picks.push(PERSONA_KEYS[1]);
    if (r === n) picks.push(PERSONA_KEYS[2]);
    if (picks.length === 1) return picks[0];
    return picks[tie(vec) % picks.length];
  }
  return PERSONA_KEYS[tie(vec) % 3];
}

export function spacedTitle(text) {
  return String(text || '').replace(/\s+/g, '').split('').join(' ');
}

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
  const dots = userPoly.map(([x, y]) => `<circle class="wx-radar__dot" cx="${x}" cy="${y}" r="3.5"/>`).join('');
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
    const desc = MUSE_DIM_DESC[item.name] || '';
    return `<div class="wx-dim">
      <div class="wx-dim__top">
        <span class="wx-dim__name">${esc(item.name)}</span>
        <span class="wx-dim__val">${item.value}<small>%</small></span>
      </div>
      <div class="wx-dim__track"><div class="wx-dim__fill" style="width:${pct}%;background:linear-gradient(90deg,${accent}80,${accent}cc)"></div></div>
      ${desc ? `<p class="wx-dim__desc">${esc(desc)}</p>` : ''}
    </div>`;
  }).join('')}</div>`;
}
