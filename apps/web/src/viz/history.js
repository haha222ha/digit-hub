/** Retest history + sparkline curve (local). */

const key = (skinId) => `xinxiang_history_${skinId}`;

export function pushHistory(skinId, result) {
  const row = {
    ts: Date.now(),
    type: result.type,
    pct: result.pct || null,
    score: result.score ?? null,
    typeCode: result.typeCode || null,
    topId: result.topId || null,
  };
  const list = loadHistory(skinId);
  list.push(row);
  while (list.length > 12) list.shift();
  localStorage.setItem(key(skinId), JSON.stringify(list));
  return list;
}

export function loadHistory(skinId) {
  try {
    return JSON.parse(localStorage.getItem(key(skinId)) || "[]");
  } catch {
    return [];
  }
}

function seriesFromHistory(skin, list) {
  if (skin.scoring === "mental_age") {
    return list.map((h) => h.score ?? 0);
  }
  if (skin.scoring === "mbti") {
    return list.map((h) => h.pct?.EI ?? 50);
  }
  // seven sins: top dimension pct
  return list.map((h) => {
    if (!h.pct) return 0;
    return Math.max(...Object.values(h.pct));
  });
}

export function historyCurveHtml(skin, skinId) {
  const list = loadHistory(skinId);
  if (list.length < 1) {
    return `
      <section class="report-block">
        <h3>复测曲线</h3>
        <p class="muted">完成第二次测评后，这里会显示你的变化轨迹。</p>
      </section>`;
  }
  const series = seriesFromHistory(skin, list);
  const w = 300;
  const h = 100;
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const span = Math.max(max - min, 10);
  const pts = series
    .map((v, i) => {
      const x = series.length === 1 ? w / 2 : (i / (series.length - 1)) * (w - 16) + 8;
      const y = h - 12 - ((v - min) / span) * (h - 24);
      return `${x},${y}`;
    })
    .join(" ");
  const labels = list
    .map((h) => {
      const d = new Date(h.ts);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    })
    .join(" · ");

  return `
    <section class="report-block">
      <h3>复测曲线 · ${list.length} 次</h3>
      <p class="muted">${
        skin.scoring === "mental_age"
          ? "纵轴：心理年龄换算分"
          : skin.scoring === "mbti"
            ? "纵轴：外向倾向 E%（示意轨迹）"
            : "纵轴：主导维强度 %"
      }</p>
      <svg viewBox="0 0 ${w} ${h}" class="history-svg" role="img" aria-label="复测曲线">
        <polyline points="${pts}" fill="none" stroke="var(--seal)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${series
          .map((v, i) => {
            const x = series.length === 1 ? w / 2 : (i / (series.length - 1)) * (w - 16) + 8;
            const y = h - 12 - ((v - min) / span) * (h - 24);
            return `<circle cx="${x}" cy="${y}" r="4" fill="var(--ember)"/>`;
          })
          .join("")}
      </svg>
      <p class="muted" style="font-size:0.85rem">${labels}</p>
      <ul class="history-list">
        ${[...list]
          .reverse()
          .slice(0, 5)
          .map((h) => {
            const d = new Date(h.ts).toLocaleString();
            return `<li><span>${d}</span><strong>${h.type}</strong></li>`;
          })
          .join("")}
      </ul>
    </section>
  `;
}
