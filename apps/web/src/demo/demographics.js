/** Optional 2–3 demographic questions before play — stored on result, not used for scoring. */

export const DEFAULT_DEMOGRAPHICS = [
  {
    id: "status",
    label: "当前状态",
    options: ["单身", "暧昧中", "恋爱中", "已婚/伴侣", "不想说"],
  },
  {
    id: "context",
    label: "最想用这份报告解决",
    options: ["自我觉察", "关系摩擦", "工作/方向", "随便看看"],
  },
];

export function skinDemographics(skin) {
  if (skin.demographics === false) return null;
  if (Array.isArray(skin.demographics) && skin.demographics.length) return skin.demographics;
  if (skin.duo || skin.askDemo) return DEFAULT_DEMOGRAPHICS;
  const emotionIds = new Set([
    "love_brain",
    "ambiguity_rank",
    "scam_magnet",
    "attachment",
    "couple_fit",
    "friend_contrast",
  ]);
  if (emotionIds.has(skin.id)) return DEFAULT_DEMOGRAPHICS;
  return null;
}

export function demographicsFormHtml(fields) {
  return `
    <div class="demo-form">
      ${fields
        .map(
          (f) => `
        <label class="demo-field">
          <span class="group-label">${f.label}</span>
          <select class="field" data-demo="${f.id}">
            <option value="">请选择</option>
            ${(f.options || []).map((o) => `<option value="${o}">${o}</option>`).join("")}
          </select>
        </label>`
        )
        .join("")}
      <p class="muted" style="margin:8px 0 0;font-size:0.85rem">仅用于报告措辞个性化，不参与计分，可跳过。</p>
    </div>
  `;
}

export function readDemographics(root, fields) {
  const out = {};
  let filled = 0;
  fields.forEach((f) => {
    const el = root.querySelector(`[data-demo="${f.id}"]`);
    const v = el?.value?.trim() || "";
    if (v) {
      out[f.id] = v;
      filled += 1;
    }
  });
  return { values: out, filled };
}

export function demoLineFromValues(values) {
  if (!values || !Object.keys(values).length) return "";
  const bits = Object.entries(values).map(([, v]) => v);
  return `你提到：${bits.join(" · ")}。报告会尽量贴近这个情境说话。`;
}

export function injectDemoIntoResult(result, demo) {
  if (!demo || !Object.keys(demo).length) return result;
  return {
    ...result,
    demographics: demo,
    demoLine: demoLineFromValues(demo),
  };
}
