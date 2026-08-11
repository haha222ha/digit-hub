/**
 * Style engine — resolve 严谨/幽默/搞笑 across UI tokens, questions, results.
 * Local Gen OS + 测评站共用。
 */

const STYLE_KEY = "digit_hub_quiz_style";
const cache = new Map();

export const STYLE_IDS = ["rigorous", "humor", "funny"];

export function getSelectedStyle() {
  const s = localStorage.getItem(STYLE_KEY) || "rigorous";
  return STYLE_IDS.includes(s) ? s : "rigorous";
}

export function setSelectedStyle(id) {
  const sid = STYLE_IDS.includes(id) ? id : "rigorous";
  localStorage.setItem(STYLE_KEY, sid);
  return sid;
}

export async function loadStyleCatalog() {
  if (cache.has("catalog")) return cache.get("catalog");
  const res = await fetch("./styles/catalog.json");
  const data = await res.json();
  cache.set("catalog", data);
  return data;
}

export async function loadStylePack(id) {
  const sid = STYLE_IDS.includes(id) ? id : "rigorous";
  if (cache.has(sid)) return cache.get(sid);
  const res = await fetch(`./styles/${sid}.json`);
  const data = await res.json();
  cache.set(sid, data);
  return data;
}

/** Apply CSS variables + tone class on <html> */
export async function applyStyleToDocument(styleId = getSelectedStyle()) {
  const pack = await loadStylePack(styleId);
  const root = document.documentElement;
  root.setAttribute("data-tone", pack.id);
  Object.entries(pack.tokens || {}).forEach(([k, v]) => {
    if (String(k).startsWith("--")) root.style.setProperty(k, v);
  });
  return pack;
}

/**
 * Resolve multilingual/style field:
 * - string → as-is
 * - { rigorous, humor, funny } → pick
 */
export function resolveStyled(field, styleId = getSelectedStyle()) {
  if (field == null) return "";
  if (typeof field === "string" || typeof field === "number") return String(field);
  if (typeof field === "object") {
    return (
      field[styleId] ||
      field.rigorous ||
      field.default ||
      field.q ||
      Object.values(field).find((v) => typeof v === "string") ||
      ""
    );
  }
  return String(field);
}

/** Clone question with resolved q / options for one style */
export function materializeQuestion(q, styleId = getSelectedStyle()) {
  const style = styleId;
  const variants = q.styles || q.variants || null;
  let text = resolveStyled(q.q, style);
  let opts = (q.o || []).map((o) => ({
    ...o,
    t: resolveStyled(o.t, style),
    s: o.s,
  }));

  if (variants?.[style]) {
    const v = variants[style];
    if (v.q) text = v.q;
    if (v.o?.length === opts.length) {
      opts = opts.map((o, i) => ({ ...o, t: v.o[i].t ?? v.o[i] ?? o.t }));
    }
  } else if (style !== "rigorous") {
    // Fallback only when authored styles missing
    text = toneQuestion(text, style);
    opts = opts.map((o) => ({ ...o, t: toneOption(o.t, style) }));
  }

  return { ...q, q: text, o: opts, _style: style };
}

export function materializeQuestions(list, styleId = getSelectedStyle()) {
  return (list || []).map((q) => materializeQuestion(q, styleId));
}

function toneQuestion(q, style) {
  const s = String(q || "").replace(/^说实话——/, "").replace(/——你会怎么选？$/, "？");
  if (style === "humor") {
    return `说人话版——${s.replace(/[？?]$/, "")}？`;
  }
  if (style === "funny") {
    return `【灵魂拷问】${s.replace(/[？?]$/, "")}？别演，选真的。`;
  }
  return q;
}

function toneOption(t, style) {
  const s = String(t || "").replace(/（就这样）$/, "");
  if (style === "humor") {
    if (s.length <= 12) return `${s}（很真实）`;
    return s;
  }
  if (style === "funny") {
    if (s.length <= 12) return `${s}｜本色出演`;
    return `直说——${s}`;
  }
  return s;
}

export function styleVoice(pack) {
  return pack?.voice || {};
}

/** Result meta lines for soft/full pages */
export function resultChrome(pack, r) {
  const v = pack?.voice || {};
  const typePrefix = v.typePrefix || "";
  const quotePrefix = v.quotePrefix || "";
  return {
    kicker: v.resultKicker || "测评结果",
    lead: v.resultLead || "",
    ctaUnlock: v.ctaUnlock || "解锁完整报告",
    ctaShare: v.ctaShare || "生成分享图",
    type: typePrefix ? `${typePrefix}${r?.type || ""}` : r?.type,
    quote: r?.quote ? `${quotePrefix}${r.quote}` : "",
  };
}
