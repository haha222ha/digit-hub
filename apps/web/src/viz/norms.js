/**
 * Peer-norm overlays (reference cohort). Values are illustrative baselines for product UX,
 * not clinical norms — labeled as such in UI.
 */

const NORMS = {
  seven_sins: {
    cohort: "同龄自我探索样本 · 参考基线",
    means: { pride: 48, greed: 52, lust: 45, envy: 50, gluttony: 47, wrath: 44, sloth: 55 },
  },
  mbti16: {
    cohort: "同龄自我探索样本 · 参考基线",
    means: { EI: 48, SN: 52, TF: 50, JP: 54 },
  },
  mental_age: {
    cohort: "同龄自我探索样本 · 参考基线",
    means: { mature: 58, emotion: 55, think: 57, social: 54, life: 56 },
  },
};

export function peerCompareHtml(skin, r) {
  const n = NORMS[skin.id];
  if (!n || !r?.pct) return "";
  const rows =
    r.mode === "mbti"
      ? [
          ["外向倾向 E%", r.pct.EI, n.means.EI],
          ["直觉倾向 N%", r.pct.SN, n.means.SN],
          ["思考倾向 T%", r.pct.TF, n.means.TF],
          ["判断倾向 J%", r.pct.JP, n.means.JP],
        ]
      : skin.dimensions.map((d) => [d.label, r.pct[d.id] || 0, n.means[d.id] ?? 50]);

  return `
    <section class="report-block peer-block">
      <h3>与同龄参考对比</h3>
      <p class="muted">${n.cohort}（非临床常模，仅供自我对照）</p>
      <div class="peer-list">
        ${rows
          .map(([label, you, peer]) => {
            const delta = Math.round(you - peer);
            const tip =
              Math.abs(delta) < 6 ? "接近参考均值" : delta > 0 ? `高于参考 ${delta} 点` : `低于参考 ${Math.abs(delta)} 点`;
            return `
              <div class="peer-row">
                <header><span>${label}</span><span class="muted">${tip}</span></header>
                <div class="peer-tracks">
                  <div class="peer-you" style="width:${you}%" title="你"></div>
                  <div class="peer-mean" style="left:${peer}%" title="参考"></div>
                </div>
              </div>`;
          })
          .join("")}
      </div>
    </section>
  `;
}
