/**
 * Top-tier result value layers — soft result teaser + full report depth.
 * Pattern: insight → proof → scenes → action → unlock.
 */

import { scenesHtml } from "./scenes.js";

function topDims(skin, r, n = 2) {
  if (!r?.pct || !skin?.dimensions) return [];
  if (r.mode === "mbti") {
    const pairs = [
      { id: "EI", label: r.pct.EI >= 50 ? "外向能量" : "内向能量", v: Math.max(r.pct.EI, 100 - r.pct.EI) },
      { id: "SN", label: r.pct.SN >= 50 ? "直觉滤镜" : "实感滤镜", v: Math.max(r.pct.SN, 100 - r.pct.SN) },
      { id: "TF", label: r.pct.TF >= 50 ? "思考决策" : "情感决策", v: Math.max(r.pct.TF, 100 - r.pct.TF) },
      { id: "JP", label: r.pct.JP >= 50 ? "判断节奏" : "感知节奏", v: Math.max(r.pct.JP, 100 - r.pct.JP) },
    ];
    return pairs.sort((a, b) => b.v - a.v).slice(0, n);
  }
  return [...skin.dimensions]
    .map((d) => ({ id: d.id, label: d.label, v: r.pct[d.id] || 0 }))
    .sort((a, b) => b.v - a.v)
    .slice(0, n);
}

function bottomDims(skin, r, n = 1) {
  if (!r?.pct || !skin?.dimensions || r.mode === "mbti") return [];
  return [...skin.dimensions]
    .map((d) => ({ id: d.id, label: d.label, v: r.pct[d.id] || 0 }))
    .sort((a, b) => a.v - b.v)
    .slice(0, n);
}

function confidenceLine(r) {
  if (r.mode === "mbti" && r.pct) {
    const strengths = [r.pct.EI, r.pct.SN, r.pct.TF, r.pct.JP].map((p) => Math.abs(p - 50));
    const avg = strengths.reduce((a, b) => a + b, 0) / 4;
    if (avg >= 22) return { level: "清晰偏好", tip: "四维分化明显，类型标签参考价值较高。" };
    if (avg >= 12) return { level: "中等偏好", tip: "部分维度接近中间带，完整报告会标出弹性区间。" };
    return { level: "柔和偏好", tip: "你更接近「中间型」，报告会强调情境切换而非标签。" };
  }
  if (r.mode === "mental_age" && r.score != null) {
    return { level: `换算分 ${r.score}`, tip: "分数对应心理年龄阶段；真正有用的是五维结构，不是单次标签。" };
  }
  if (r.mode === "score_bands") {
    return {
      level: r.band?.label || `总分 ${r.score}`,
      tip: r.band?.advice || "段位是社交标签；完整报告用维度告诉你该调哪一根弦。",
    };
  }
  if (r.mode === "holland") {
    return {
      level: r.typeCode || "RIASEC",
      tip: "三联码是兴趣匹配提示。完整报告会落到职业邻近与环境选择。",
    };
  }
  const tops = Object.values(r.pct || {});
  if (!tops.length) return { level: "已完成画像", tip: "建议结合完整报告的场景解读使用。" };
  const max = Math.max(...tops);
  if (max >= 70) return { level: "主导鲜明", tip: "某一欲望原型显著高于其余，调节实验会更聚焦。" };
  return { level: "分布均衡", tip: "七维相对接近，完整报告会帮你找「情境触发点」。" };
}

function rarityLine(skin, r) {
  if (r.mode === "mbti" && r.typeCode) {
    return {
      title: "类型稀缺感",
      text: `${r.typeCode} 在自我探索样本中通常不是「最多」也不是「最少」——价值在于你的四维组合是否与日常决策一致，而不是人数百分比。`,
    };
  }
  if (r.mode === "mental_age") {
    return {
      title: "阶段定位",
      text: `你落在「${r.ageBand || r.type}」。同龄参考对照会告诉你：哪些维高于基线、哪些是训练场。`,
    };
  }
  if (r.mode === "score_bands") {
    return {
      title: "段位说明",
      text: `「${r.band?.label || r.type}」来自总分映射。它适合分享与自我觉察，不构成临床诊断；调节请看维度与本周动作。`,
    };
  }
  if (r.mode === "holland") {
    return {
      title: "兴趣代码",
      text: `「${r.typeCode || r.type}」是霍兰德兴趣三联码。完整报告会给出邻近职业参考——请结合现实约束验证。`,
    };
  }
  return {
    title: "主导原型",
    text: `「${r.type}」是本次相对最高的欲望信号。完整报告会拆开：它如何运作、何时是优势、何时变成摩擦。`,
  };
}

const UNLOCK_VALUE = [
  { t: "结构可视化", d: "雷达图 + 维度条，一眼看见强项与盲区" },
  { t: "同龄参考", d: "对照参考基线，知道你「偏高还是偏低」" },
  { t: "场景解读", d: "关系 / 工作 / 压力下的具体表现 + 行动句" },
  { t: "7 日行动", d: "可执行微实验，而不是空泛鸡汤" },
  { t: "复测曲线", d: "30 天后回来，看见变化轨迹" },
];

export function softValueHtml(skin, r, { unlocked } = {}) {
  const tops = topDims(skin, r, 2);
  const conf = confidenceLine(r);

  if (!unlocked) {
    return `
    <section class="value-block value-block-teaser">
      <header class="value-head">
        <p class="group-label">轻结果预览</p>
        <h2>你的类型已生成</h2>
        <p class="muted">完整报告含雷达图、维度分布、场景长文与 7 日行动——解锁后立即可读。</p>
      </header>

      <div class="value-grid">
        <article class="value-card accent">
          <span class="value-kicker">主导信号</span>
          <strong>${tops.map((t) => t.label).join(" · ") || r.type}</strong>
          <p>具体百分比与结构图在完整报告中解锁。</p>
        </article>
        <article class="value-card">
          <span class="value-kicker">画像倾向</span>
          <strong>${conf.level}</strong>
          <p>${conf.tip.replace(/完整报告/g, "解锁后")}</p>
        </article>
      </div>

      ${scenesHtml(skin, r, { unlocked: false, full: false })}

      <div class="value-proof">
        <p class="group-label">完整报告你将获得</p>
        <ul class="value-checklist">
          ${UNLOCK_VALUE.map((x) => `<li><strong>${x.t}</strong><span>${x.d}</span></li>`).join("")}
        </ul>
      </div>
    </section>
  `;
  }

  const lows = bottomDims(skin, r, 1);
  const rarity = rarityLine(skin, r);
  const preview = (r.full || []).slice(0, 1)[0];

  return `
    <section class="value-block">
      <header class="value-head">
        <p class="group-label">本次测评价值</p>
        <h2>不止一个标签</h2>
        <p class="muted">先给可感知洞察，再证明完整报告值回票价。</p>
      </header>

      <div class="value-grid">
        <article class="value-card accent">
          <span class="value-kicker">画像置信</span>
          <strong>${conf.level}</strong>
          <p>${conf.tip}</p>
        </article>
        <article class="value-card">
          <span class="value-kicker">主导信号</span>
          <strong>${tops.map((t) => t.label).join(" · ") || r.type}</strong>
          <p>${
            tops.length
              ? tops.map((t) => `${t.label} ${t.v}%`).join("；")
              : "完整报告将展开结构细节"
          }</p>
        </article>
        ${
          lows.length
            ? `<article class="value-card">
                <span class="value-kicker">训练场</span>
                <strong>${lows[0].label}</strong>
                <p>相对偏低（${lows[0].v}%），适合作为本月刻意练习的切口。</p>
              </article>`
            : `<article class="value-card">
                <span class="value-kicker">使用方式</span>
                <strong>地图，不是牢笼</strong>
                <p>用偏好选环境与沟通方式，而不是给自己设限。</p>
              </article>`
        }
      </div>

      <aside class="rarity-card">
        <span class="value-kicker">${rarity.title}</span>
        <p>${rarity.text}</p>
      </aside>

      ${
        preview
          ? `<div class="insight-preview ${unlocked ? "open" : ""}">
              <p class="group-label">洞察预览</p>
              <h3>${preview.h}</h3>
              <p class="insight-clamp">${preview.p}</p>
              ${unlocked ? "" : `<div class="insight-fade" aria-hidden="true"></div>`}
            </div>`
          : ""
      }

      ${scenesHtml(skin, r, { unlocked, full: false })}

      <div class="value-proof">
        <p class="group-label">完整报告你将获得</p>
        <ul class="value-checklist">
          ${UNLOCK_VALUE.map((x) => `<li><strong>${x.t}</strong><span>${x.d}</span></li>`).join("")}
        </ul>
      </div>
    </section>
  `;
}

export function fullValueHtml(skin, r) {
  const tops = topDims(skin, r, 2);
  const lows = bottomDims(skin, r, 1);
  const conf = confidenceLine(r);
  const rarity = rarityLine(skin, r);
  const actions = buildWeekPlan(skin, r, tops, lows);

  return `
    <section class="value-block value-block-full">
      <header class="value-head">
        <p class="group-label">高价值解读框架</p>
        <h2>从标签到行动</h2>
        <p class="muted">置信说明 → 结构证据 → 场景迁移 → 本周实验。</p>
      </header>

      <div class="value-grid">
        <article class="value-card accent">
          <span class="value-kicker">置信度</span>
          <strong>${conf.level}</strong>
          <p>${conf.tip}</p>
        </article>
        <article class="value-card">
          <span class="value-kicker">支点</span>
          <strong>${tops[0]?.label || "—"}</strong>
          <p>优先把优势用在高杠杆场景，而不是平均用力。</p>
        </article>
        <article class="value-card">
          <span class="value-kicker">切口</span>
          <strong>${lows[0]?.label || tops[1]?.label || "情境切换"}</strong>
          <p>选一个最小可验证行为，连续 7 天，再复测对照。</p>
        </article>
      </div>

      <aside class="rarity-card">
        <span class="value-kicker">${rarity.title}</span>
        <p>${rarity.text}</p>
      </aside>

      ${scenesHtml(skin, r, { unlocked: true, full: true })}

      <div class="week-plan">
        <h3>7 日微实验</h3>
        <p class="muted">每天只做一个可勾选动作，比读完所有文案更值钱。</p>
        <ol>
          ${actions.map((a) => `<li><strong>${a.day}</strong> ${a.text}</li>`).join("")}
        </ol>
      </div>

      <aside class="value-note">
        <p><strong>如何读这份报告才值回票价</strong></p>
        <p class="muted">先读与你生活最相关的 1–2 个场景段，立刻做「Day 1」实验；不要一次吞完所有文案。30 天后用同一量表复测，对比曲线比纠结标签更有价值。</p>
      </aside>
    </section>
  `;
}

function buildWeekPlan(skin, r, tops, lows) {
  const focus = lows[0]?.label || tops[0]?.label || "自我观察";
  if (r.mode === "mbti") {
    return [
      { day: "D1", text: "记录今天 3 次「能量涨跌」发生在什么场合（人多/独处/截止）。" },
      { day: "D2-3", text: "故意做一次反偏好小练习（针对较弱维），每次仅 15 分钟并写体感。" },
      { day: "D4-5", text: "选一件重要事：用你的决策偏好走完，事后标注摩擦点。" },
      { day: "D6", text: "把完整报告里的「关系提示」发给一位信任的人，请对方给一个例子。" },
      { day: "D7", text: "复盘：哪一条洞察被验证？哪一条要修正？写入下次复测备注。" },
    ];
  }
  if (r.mode === "score_bands") {
    return [
      { day: "D1", text: `观察「${r.band?.label || r.type}」今天被什么情境加重，只记录不评判。` },
      { day: "D2-3", text: r.band?.advice || "选一个维度切口，做一次可勾选的小调节。" },
      { day: "D4-5", text: `把最低维「${focus}」练两次：每次 15 分钟，写体感一行。` },
      { day: "D6", text: "把报告里一句边界建议说给信任的人听，请对方给反馈。" },
      { day: "D7", text: "截图今日状态，与首次段位对照，标出是否下降冲动分。" },
    ];
  }
  if (r.mode === "holland") {
    return [
      { day: "D1", text: `列出 3 个符合代码 ${r.typeCode || ""} 的真实任务/场景。` },
      { day: "D2-3", text: "访谈一位相关岗位的人 15 分钟：日常最耗能的是什么？" },
      { day: "D4-5", text: "故意做一件「非主导型」小任务，感受摩擦点。" },
      { day: "D6", text: "把邻近职业清单缩到 2 个可验证选项，写下现实约束。" },
      { day: "D7", text: "复盘：代码哪一字母最准？哪一字母被情境夸大？" },
    ];
  }
  if (skin.id === "seven_sins") {
    return [
      { day: "D1", text: `观察「${r.type}」今天被什么情境点燃，只记录不评判。` },
      { day: "D2-3", text: "执行报告中的调节实验一次，完成后立刻离开触发场景。" },
      { day: "D4-5", text: "把优势用在工作或创作：主动设计一次「高标准输出」。" },
      { day: "D6", text: "对亲密关系复述一次摩擦点，用「条件」代替反击/回避。" },
      { day: "D7", text: "截图今日状态，与首次结果对照，标出是否下降主导维冲动。" },
    ];
  }
  return [
    { day: "D1", text: `聚焦「${focus}」：写下今天最低分的一次决策与原因。` },
    { day: "D2-3", text: "用报告里的低维建议做两次可验证小承诺（能打勾的那种）。" },
    { day: "D4-5", text: "高维当支点：把优势用到一件真正重要的事上。" },
    { day: "D6", text: "复盘情绪与社交边界：哪一次讨好/回避可以改成完整的一句话。" },
    { day: "D7", text: "安排 30 天后复测提醒，保存本次分享图作为基线。" },
  ];
}

export function accessBadgeHtml(unlocked) {
  return unlocked
    ? `<p class="access-badge on"><span class="dot"></span>权益已生效 · 完整报告可读</p>`
    : `<p class="access-badge"><span class="dot"></span>预览模式 · 雷达与场景长文待解锁</p>`;
}

export function unlockValueStripHtml(unlocked = false) {
  if (unlocked) {
    return `
      <div class="unlock-value-strip unlocked">
        <p class="group-label">你已拥有</p>
        <div class="unlock-chips">
          ${UNLOCK_VALUE.map((x) => `<span class="unlock-chip on">${x.t}</span>`).join("")}
        </div>
      </div>
    `;
  }
  return `
    <div class="unlock-value-strip">
      <p class="group-label">解锁后立即可见</p>
      <div class="unlock-chips">
        ${UNLOCK_VALUE.map((x) => `<span class="unlock-chip">${x.t}</span>`).join("")}
      </div>
    </div>
  `;
}
