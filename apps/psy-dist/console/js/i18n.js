/**
 * Lightweight console i18n — lazy-loads one locale JSON at a time.
 */
let dict = {};
let current = "zh-CN";

function resolvePreferred() {
  if (typeof window !== "undefined" && window.PsyLocale) {
    return window.PsyLocale.resolve();
  }
  try {
    const m = document.cookie.match(/(?:^|; )psy_locale=([^;]*)/);
    if (m) return decodeURIComponent(m[1]);
  } catch (e) {}
  const al = (navigator.language || "").toLowerCase();
  if (al.startsWith("zh")) return "zh-CN";
  if (al.startsWith("en")) return "en";
  return "zh-CN";
}

export function t(key, vars) {
  let s = dict[key] || key;
  if (vars) {
    Object.keys(vars).forEach((k) => {
      s = s.replace(new RegExp("\\{" + k + "\\}", "g"), String(vars[k]));
    });
  }
  return s;
}

export function locale() {
  return current;
}

export async function loadConsoleI18n(preferred) {
  const loc = preferred || resolvePreferred();
  const use = loc === "zh-CN" || String(loc).toLowerCase().startsWith("zh") ? "zh-CN" : "en";
  current = use;
  try {
    const res = await fetch(`/locales/${use}/console.json?v=20260815i18n`, { cache: "force-cache" });
    if (res.ok) dict = await res.json();
  } catch (e) {
    dict = {};
  }
  document.documentElement.lang = use === "zh-CN" ? "zh-CN" : "en";
  return use;
}

export function switchLocale(loc) {
  const use = loc === "zh-CN" || String(loc).toLowerCase().startsWith("zh") ? "zh-CN" : "en";
  document.cookie = `psy_locale=${encodeURIComponent(use)};path=/;max-age=31536000;SameSite=Lax`;
  if (typeof window !== "undefined" && window.PsyLocale) window.PsyLocale.set(use);
  return loadConsoleI18n(use);
}
