/** SVG radar chart for dimension percentages. */

export function renderRadar(labels, values, { size = 280, max = 100 } = {}) {
  const n = labels.length;
  if (!n) return "";
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36;
  const pts = (scale) =>
    labels
      .map((_, i) => {
        const ang = (-Math.PI / 2) + (i * 2 * Math.PI) / n;
        const rr = r * scale;
        return `${cx + rr * Math.cos(ang)},${cy + rr * Math.sin(ang)}`;
      })
      .join(" ");

  const grid = [0.25, 0.5, 0.75, 1]
    .map(
      (s) =>
        `<polygon points="${pts(s)}" fill="none" stroke="rgba(42,36,32,0.12)" stroke-width="1"/>`
    )
    .join("");

  const axes = labels
    .map((_, i) => {
      const ang = (-Math.PI / 2) + (i * 2 * Math.PI) / n;
      const x = cx + r * Math.cos(ang);
      const y = cy + r * Math.sin(ang);
      return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(42,36,32,0.14)" stroke-width="1"/>`;
    })
    .join("");

  const dataPts = labels
    .map((_, i) => {
      const v = Math.max(0, Math.min(max, values[i] ?? 0)) / max;
      const ang = (-Math.PI / 2) + (i * 2 * Math.PI) / n;
      return `${cx + r * v * Math.cos(ang)},${cy + r * v * Math.sin(ang)}`;
    })
    .join(" ");

  const labelEls = labels
    .map((lab, i) => {
      const ang = (-Math.PI / 2) + (i * 2 * Math.PI) / n;
      const x = cx + (r + 22) * Math.cos(ang);
      const y = cy + (r + 22) * Math.sin(ang);
      return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" class="radar-label">${lab}</text>`;
    })
    .join("");

  return `
    <div class="radar-wrap">
      <svg viewBox="0 0 ${size} ${size}" class="radar-svg" role="img" aria-label="维度雷达图">
        ${grid}${axes}
        <polygon points="${dataPts}" class="radar-poly"/>
        ${labelEls}
      </svg>
    </div>
  `;
}

export function radarFromResult(skin, r) {
  if (!r?.pct) return "";
  if (r.mode === "mbti") {
    return renderRadar(
      ["E", "N", "T", "J"],
      [r.pct.EI, r.pct.SN, r.pct.TF, r.pct.JP]
    );
  }
  const labels = skin.dimensions.map((d) => d.label.replace(/度|稳定|认知|心态|态度/g, "").slice(0, 4));
  const values = skin.dimensions.map((d) => r.pct[d.id] || 0);
  return renderRadar(labels, values);
}
