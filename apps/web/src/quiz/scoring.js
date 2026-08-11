import { effectiveScore } from "./session.js";

export function scoreSkin(skin, answers, questionList) {
  if (skin.scoring === "mbti") return scoreMbti(skin, answers, questionList);
  if (skin.scoring === "mental_age") return scoreMentalAge(skin, answers, questionList);
  if (skin.scoring === "score_bands") return scoreBands(skin, answers, questionList);
  if (skin.scoring === "holland") return scoreHolland(skin, answers, questionList);
  return scoreWeightedDims(skin, answers, questionList);
}

/** Accumulate dimension totals + maxes + raw sum from answers. */
function accumulateDims(skin, answers, questionList) {
  const qs = questionList || skin.questions;
  const totals = {};
  const maxes = {};
  for (const d of skin.dimensions) {
    totals[d.id] = 0;
    maxes[d.id] = 0;
  }
  let sum = 0;
  qs.forEach((q, i) => {
    const ans = answers[i];
    if (ans == null) return;
    const s = effectiveScore(q, ans);
    const maxS = Math.max(...q.o.map((o) => o.s));
    if (totals[q.d] == null) {
      totals[q.d] = 0;
      maxes[q.d] = 0;
    }
    totals[q.d] += s;
    maxes[q.d] += maxS;
    sum += s;
  });
  const pct = {};
  for (const id of Object.keys(totals)) {
    pct[id] = maxes[id] ? Math.round((totals[id] / maxes[id]) * 100) : 0;
  }
  let topId = skin.dimensions[0]?.id;
  for (const id of Object.keys(pct)) {
    if (topId == null || pct[id] > (pct[topId] || 0)) topId = id;
  }
  return { totals, maxes, pct, topId, sum, qs };
}

function pickBand(bands, score) {
  if (!bands?.length) return null;
  return [...bands].sort((a, b) => a.max - b.max).find((b) => score <= b.max) || bands.at(-1);
}

function normalizeBand(raw, score) {
  if (!raw) return null;
  const label = raw.label || raw.l || raw.age || raw.type || "";
  return {
    max: raw.max,
    label,
    emoji: raw.emoji || "",
    color: raw.color || raw.c || "",
    quote: raw.quote || raw.d || "",
    advice: raw.advice || "",
    tags: raw.tags || [label].filter(Boolean),
    age: raw.age,
    type: raw.type,
    score,
  };
}

function scoreWeightedDims(skin, answers, questionList) {
  const { pct, topId } = accumulateDims(skin, answers, questionList);
  const result = skin.results?.[topId] || {
    type: topId,
    quote: "完整报告将展开结构细节。",
    tags: [topId],
    full: [],
  };
  return {
    mode: "dims",
    topId,
    pct,
    type: result.type,
    quote: result.quote,
    tags: result.tags,
    full: result.full,
  };
}

/**
 * Dim scores + total mapped onto viral level bands (legacy 90+ pattern).
 * Band fields: max, label|l|age, quote|d, advice?, emoji?, color|c?, tags?
 */
function scoreBands(skin, answers, questionList) {
  const { pct, topId, sum, totals } = accumulateDims(skin, answers, questionList);
  const divisor = skin.scoreDivisor || 1;
  let score = Math.round(sum / divisor);
  const cap = skin.scoreCap;
  if (cap != null && score > cap) score = cap;
  const rawBand = pickBand(skin.bands, score);
  const band = normalizeBand(rawBand, score);
  const topLabel = skin.dimensions.find((d) => d.id === topId)?.label || topId;
  const dimSections = Object.entries(pct)
    .sort((a, b) => b[1] - a[1])
    .map(([id, p]) => {
      const meta = skin.dim_full?.[id];
      if (!meta) return null;
      return { h: `${meta.h} · ${p}%`, p: p >= 55 ? meta.high : meta.low };
    })
    .filter(Boolean);
  const bandFull = band?.advice
    ? [{ h: "调节建议", p: band.advice }]
    : [];
  return {
    mode: "score_bands",
    topId,
    pct,
    totals,
    score,
    band,
    type: band?.label || topLabel,
    quote: band?.quote || "",
    tags: band?.tags || [],
    full: [...dimSections, ...bandFull, ...(skin.fullTemplate || [])],
  };
}

/** RIASEC: top-3 letter code + primary type narrative. */
function scoreHolland(skin, answers, questionList) {
  const { pct, topId, totals } = accumulateDims(skin, answers, questionList);
  const ranked = [...skin.dimensions]
    .map((d) => ({ id: d.id, v: totals[d.id] || 0, pct: pct[d.id] || 0 }))
    .sort((a, b) => b.v - a.v);
  const top3 = ranked.slice(0, 3).map((x) => x.id);
  const code = top3.join("");
  const combo = skin.combos?.[code] || skin.combos?.[top3.slice().sort().join("")];
  const primary = skin.results?.[topId] || {
    type: `${topId} 主导`,
    quote: "兴趣是环境匹配的指南针，不是铁律。",
    tags: [topId],
    full: [],
  };
  const typeName = combo?.name || `${top3.map((c) => skin.results?.[c]?.short || c).join("·")}组合`;
  const quote = combo?.desc || primary.quote;
  const careers = (skin.careers?.[topId] || []).slice(0, 4).map((c) => (typeof c === "string" ? c : c.name));
  const careerSection = careers.length
    ? [{ h: "兴趣邻近职业（参考）", p: careers.join("、") + "。请结合现实约束验证，不作求职承诺。" }]
    : [];
  return {
    mode: "holland",
    topId,
    pct,
    totals,
    typeCode: code,
    top3,
    type: `${code} · ${typeName}`,
    quote,
    tags: [code, typeName, ...(primary.tags || [])].slice(0, 5),
    band: {
      label: code,
      quote,
      advice: primary.advice || "先用代码找环境匹配，再谈「我该不该转行」。",
      tags: [code],
    },
    full: [...(primary.full || []), ...careerSection, ...(skin.fullTemplate || [])],
  };
}


function scoreMbti(skin, answers, questionList) {
  const qs = questionList || skin.questions;
  const scores = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
  qs.forEach((q, i) => {
    const ans = answers[i];
    if (ans == null) return;
    const s = effectiveScore(q, ans);
    const map = { EI: ["E", "I"], SN: ["S", "N"], TF: ["T", "F"], JP: ["J", "P"] };
    const [a, b] = map[q.d];
    const pole = q.pole;
    const maxS = Math.max(...q.o.map((o) => o.s));
    if (pole === a) {
      scores[a] += s;
      scores[b] += maxS - s;
    } else {
      scores[b] += s;
      scores[a] += maxS - s;
    }
  });
  const type =
    (scores.E >= scores.I ? "E" : "I") +
    (scores.S >= scores.N ? "S" : "N") +
    (scores.T >= scores.F ? "T" : "F") +
    (scores.J >= scores.P ? "J" : "P");
  const meta = skin.types[type] || {
    type,
    quote: "你的偏好组合独特，完整报告将展开四维光谱。",
    tags: [type],
    full: [],
  };
  const pct = {
    EI: Math.round((scores.E / (scores.E + scores.I || 1)) * 100),
    SN: Math.round((scores.N / (scores.S + scores.N || 1)) * 100),
    TF: Math.round((scores.T / (scores.T + scores.F || 1)) * 100),
    JP: Math.round((scores.J / (scores.J + scores.P || 1)) * 100),
  };
  return {
    mode: "mbti",
    typeCode: type,
    type: meta.type,
    quote: meta.quote,
    tags: meta.tags,
    pct,
    scores,
    full: [...(meta.full || []), ...(skin.fullTemplate || [])],
  };
}

function scoreMentalAge(skin, answers, questionList) {
  const qs = questionList || skin.questions;
  const totals = {};
  const maxes = {};
  for (const d of skin.dimensions) {
    totals[d.id] = 0;
    maxes[d.id] = 0;
  }
  let sum = 0;
  qs.forEach((q, i) => {
    const ans = answers[i];
    if (ans == null) return;
    const s = effectiveScore(q, ans);
    const maxS = Math.max(...q.o.map((o) => o.s));
    totals[q.d] += s;
    maxes[q.d] += maxS;
    sum += s;
  });
  let finalScore = Math.round(sum / 2.5);
  if (finalScore > 120) finalScore = 120;
  const band =
    [...skin.bands].sort((a, b) => a.max - b.max).find((b) => finalScore <= b.max) ||
    skin.bands.at(-1);
  const pct = {};
  for (const id of Object.keys(totals)) {
    pct[id] = maxes[id] ? Math.round((totals[id] / maxes[id]) * 100) : 0;
  }
  const dimSections = Object.entries(pct)
    .sort((a, b) => b[1] - a[1])
    .map(([id, p]) => {
      const meta = skin.dim_full?.[id];
      if (!meta) return null;
      return { h: `${meta.h} · ${p}%`, p: p >= 55 ? meta.high : meta.low };
    })
    .filter(Boolean);
  return {
    mode: "mental_age",
    ageBand: band.age,
    type: `${band.type} · ${band.age}`,
    quote: band.quote,
    tags: band.tags,
    pct,
    score: finalScore,
    band: normalizeBand(
      {
        max: band.max,
        label: band.age,
        age: band.age,
        type: band.type,
        quote: band.quote,
        tags: band.tags,
        color: band.color,
      },
      finalScore
    ),
    full: [...dimSections, ...(skin.fullTemplate || [])],
  };
}

export function persistProgress(skinId, payload) {
  localStorage.setItem(`xinxiang_progress_${skinId}`, JSON.stringify({ ...payload, ts: Date.now() }));
}

export function loadProgress(skinId) {
  try {
    return JSON.parse(localStorage.getItem(`xinxiang_progress_${skinId}`) || "null");
  } catch {
    return null;
  }
}

export function clearProgress(skinId) {
  localStorage.removeItem(`xinxiang_progress_${skinId}`);
}

export function saveResult(skinId, result, extra = {}) {
  const id = `${skinId}_${Date.now()}`;
  const payload = { id, skinId, result, ts: Date.now(), ...extra };
  localStorage.setItem(`xinxiang_result_${id}`, JSON.stringify(payload));
  localStorage.setItem(`xinxiang_last_result_${skinId}`, id);
  return id;
}

export function loadResult(resultId) {
  try {
    return JSON.parse(localStorage.getItem(`xinxiang_result_${resultId}`) || "null");
  } catch {
    return null;
  }
}
