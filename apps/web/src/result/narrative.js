/**
 * Result narrative engine — hook → portrait → evidence → share line.
 * Goal: first screen feels worth screenshotting; soft result sells the full report.
 */

import { getSelectedStyle } from "../style/engine.js";

function topDims(skin, r, n = 2) {
  if (!r?.pct || !skin?.dimensions) return [];
  if (r.mode === "mbti") {
    const pairs = [
      { id: "EI", label: r.pct.EI >= 50 ? "外向" : "内向", v: Math.max(r.pct.EI, 100 - r.pct.EI) },
      { id: "SN", label: r.pct.SN >= 50 ? "直觉" : "实感", v: Math.max(r.pct.SN, 100 - r.pct.SN) },
      { id: "TF", label: r.pct.TF >= 50 ? "思考" : "情感", v: Math.max(r.pct.TF, 100 - r.pct.TF) },
      { id: "JP", label: r.pct.JP >= 50 ? "判断" : "感知", v: Math.max(r.pct.JP, 100 - r.pct.JP) },
    ];
    return pairs.sort((a, b) => b.v - a.v).slice(0, n);
  }
  return [...skin.dimensions]
    .map((d) => ({ id: d.id, label: d.label, v: r.pct[d.id] || 0 }))
    .sort((a, b) => b.v - a.v)
    .slice(0, n);
}

const SIN_HOOKS = {
  傲慢: {
    rigorous: "你不是自负——你是标准太高，容不下「凑合」。",
    humor: "你的傲，多半长在「这件事能不能拿得出手」上。",
    funny: "鉴定：标准刺客。普通人的及格线，是你的起步价。",
  },
  贪婪: {
    rigorous: "你收集的不只是东西，是「以后用得上」的安全感。",
    humor: "仓鼠灵魂上线：机会一闪，手比脑子快半秒。",
    funny: "鉴定：机会吸尘器。看见缝就想塞满。",
  },
  色欲: {
    rigorous: "吸引力对你不是噪音，是决策里的重要通道。",
    humor: "感觉这事，在你这儿从不排第二。",
    funny: "鉴定：感觉优先处理器。理性要排队。",
  },
  嫉妒: {
    rigorous: "比较不是小气，是你的进度条被别人的高光戳了一下。",
    humor: "别人的捷报一响，你的内心表格就开始自动对齐。",
    funny: "鉴定：对比雷达常开。恭喜也会，记账也会。",
  },
  暴食: {
    rigorous: "「再来一点」对你不是口腹，是填补空档的策略。",
    humor: "空虚一来，你就开启自动填充模式。",
    funny: "鉴定：停不下来选手。大脑说够了，手指说再来。",
  },
  暴怒: {
    rigorous: "怒意来得快，是因为边界被踩到了——不是你「脾气差」。",
    humor: "你的怒气值，其实是边界警报器。",
    funny: "鉴定：怒气槽加载很快。澄清火箭随时待发。",
  },
  懒惰: {
    rigorous: "启动贵，不代表你不行——你是把能量留给真正重要的事。",
    humor: "启动费偏高：不是懒，是开机动画太长。",
    funny: "鉴定：启动困难户。一旦开机，又能跑很远。",
  },
};

function mbtiHook(r, style) {
  const code = r.typeCode || r.type || "";
  const map = {
    rigorous: `${code}：不是标签牢笼，是你做决定时默认打开的操作系统。`,
    humor: `${code} 出门记得带说明书——别人老误会你的「默认设置」。`,
    funny: `鉴定完毕：${code}。请勿用别人的说明书硬重启你。`,
  };
  return map[style] || map.rigorous;
}

function ageHook(r, style) {
  const band = r.ageBand || r.type || "当前阶段";
  const map = {
    rigorous: `心理年龄落在「${band}」——分数是入口，结构才是地图。`,
    humor: `仪表盘显示：${band}。别只盯数字，五维才是路况。`,
    funny: `鉴定：${band}。年龄是参考线，作妖程度另算。`,
  };
  return map[style] || map.rigorous;
}

function bandsHook(r, style) {
  const label = r.band?.label || r.type || "当前段位";
  const map = {
    rigorous: `段位「${label}」——总分是入口，维度结构才是调节地图。`,
    humor: `今日段位：${label}。别只截图称号，看看是哪一维把你推上去的。`,
    funny: `鉴定：${label}。称号可以发朋友圈，调节实验请私下做。`,
  };
  return map[style] || map.rigorous;
}

function hollandHook(r, style) {
  const code = r.typeCode || r.type || "";
  const map = {
    rigorous: `${code}：兴趣代码是环境匹配提示，不是命运判决。`,
    humor: `霍兰德三联码 ${code}——找对房间，比硬改自己轻松。`,
    funny: `鉴定：${code}。别拿代码吓老板，拿它筛岗位更香。`,
  };
  return map[style] || map.rigorous;
}

function portraitLine(skin, r, tops) {
  if (r.mode === "mbti") {
    const bits = tops.map((t) => t.label).join(" · ");
    return `今天你的偏好支点偏「${bits}」；完整报告会告诉你它在工作与关系里怎么显形。`;
  }
  if (r.mode === "mental_age") {
    return `换算分 ${r.score ?? "—"}。真正有用的是：哪一维托着你，哪一维还在练级。`;
  }
  if (r.mode === "score_bands") {
    const tip = r.band?.advice ? `切口：${r.band.advice}` : "完整报告会把段位拆成可执行调节。";
    return `总分 ${r.score ?? "—"} · ${tip}`;
  }
  if (r.mode === "holland") {
    const bits = tops.map((t) => t.label).join(" · ");
    return `三联码 ${r.typeCode || ""}，支点偏「${bits}」。用代码找匹配环境，再谈转行成本。`;
  }
  const t0 = tops[0];
  const t1 = tops[1];
  if (t0 && t1) {
    return `「${t0.label}」领先（${t0.v}%），「${t1.label}」紧随。调节实验会盯住点燃点，而不是道德评判。`;
  }
  return `主导信号是「${r.type}」。先看见，再决定怎么用。`;
}

function evidenceChips(skin, r, tops) {
  const chips = [];
  if (r.mode === "mbti" && r.typeCode) {
    chips.push({ k: "类型", v: r.typeCode });
    tops.forEach((t) => chips.push({ k: t.label, v: `${t.v}%` }));
  } else if (r.mode === "mental_age") {
    chips.push({ k: "阶段", v: r.ageBand || r.type });
    chips.push({ k: "换算分", v: String(r.score ?? "—") });
    tops.slice(0, 2).forEach((t) => chips.push({ k: t.label, v: `${t.v}%` }));
  } else if (r.mode === "score_bands") {
    chips.push({ k: "段位", v: r.band?.label || r.type });
    chips.push({ k: "总分", v: String(r.score ?? "—") });
    tops.slice(0, 2).forEach((t) => chips.push({ k: t.label, v: `${t.v}%` }));
  } else if (r.mode === "holland") {
    chips.push({ k: "代码", v: r.typeCode || "—" });
    tops.forEach((t) => chips.push({ k: t.label, v: `${t.v}%` }));
  } else {
    chips.push({ k: "主导", v: r.type });
    tops.forEach((t) => chips.push({ k: t.label, v: `${t.v}%` }));
  }
  return chips.slice(0, 4);
}

function shareLine(skin, r, style, hook) {
  if (style === "funny") return hook.replace(/^鉴定[：:]?\s*/, "我的心象测鉴定：");
  if (style === "humor") return `心象测说人话：${r.type}——${(r.quote || "").slice(0, 28)}`;
  return `我在心象测是「${r.type}」· ${(r.quote || "").slice(0, 32)}`;
}

/**
 * @returns {{ hook, portrait, chips, shareLine, ctaHint }}
 */
export function buildNarrative(skin, r, pack) {
  const style = pack?.id || getSelectedStyle();
  const tops = topDims(skin, r, 2);
  let hook = r.quote || "";

  if (skin.id === "seven_sins" && SIN_HOOKS[r.type]) {
    hook = SIN_HOOKS[r.type][style] || SIN_HOOKS[r.type].rigorous;
  } else if (r.mode === "mbti") {
    hook = mbtiHook(r, style);
  } else if (r.mode === "mental_age") {
    hook = ageHook(r, style);
  } else if (r.mode === "score_bands") {
    hook = bandsHook(r, style);
  } else if (r.mode === "holland") {
    hook = hollandHook(r, style);
  }

  let portrait = portraitLine(skin, r, tops);
  if (r.demoLine) portrait = `${r.demoLine} ${portrait}`;

  return {
    hook,
    portrait,
    chips: evidenceChips(skin, r, tops),
    shareLine: shareLine(skin, r, style, hook),
    ctaHint:
      style === "funny"
        ? "解锁后看完整整活报告 + 7 日实验（笑完还能用）"
        : style === "humor"
          ? "解锁后把标签翻译成生活场景与本周可勾选动作"
          : "解锁结构证据、场景段落、7 日微实验与复测基线",
  };
}

export function narrativeHeroHtml(narr, chrome, pack, skin, r) {
  const band = r.band;
  const bandBadge =
    band && (r.mode === "score_bands" || r.mode === "holland" || r.mode === "mental_age")
      ? `<p class="band-badge"${band.color ? ` style="--band:${band.color}"` : ""}>${
          band.emoji ? `${band.emoji} ` : ""
        }${band.label || r.type}</p>`
      : "";
  return `
    <section class="result-hero result-hero-pro">
      <p class="muted">${skin.title} · ${chrome.kicker}</p>
      ${skin.disclaimer ? `<p class="disclaimer-pill">${skin.disclaimer}</p>` : ""}
      <p class="tone-pill">${pack.label}风格</p>
      ${bandBadge}
      <p class="result-hook">${narr.hook}</p>
      <h1 class="result-type">${chrome.type || r.type}</h1>
      <p class="result-portrait">${narr.portrait}</p>
      <p class="result-quote">${chrome.quote || r.quote || ""}</p>
      <div class="evidence-row">
        ${narr.chips.map((c) => `<span class="evidence-chip"><i>${c.k}</i><b>${c.v}</b></span>`).join("")}
      </div>
      <div class="tags">${(r.tags || []).map((t) => `<span class="tag">${t}</span>`).join("")}</div>
      <p class="share-prompt muted">截图这句话也能发朋友圈 ↓ 或一键导出分享卡</p>
      <p class="share-line">「${narr.shareLine}」</p>
    </section>
  `;
}
