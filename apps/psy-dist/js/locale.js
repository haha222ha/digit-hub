/**
 * Soft locale negotiation for psy.xhs365.cn
 * Priority: ?lang= → Cookie psy_locale → Accept-Language → CF-IPCountry hint → zh-CN
 * Never hard-locks language; user can always override.
 */
(function (global) {
  "use strict";

  var COOKIE = "psy_locale";
  var SUPPORTED = { "zh-CN": 1, en: 1, id: 1, ms: 1, vi: 1, th: 1 };
  var COUNTRY_LOCALE = {
    CN: "zh-CN",
    US: "en",
    GB: "en",
    AU: "en",
    NZ: "en",
    CA: "en",
    SG: "en",
    MY: "en",
    ID: "en",
    TH: "en",
    VN: "en",
    PH: "en",
  };

  function readCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }

  function writeCookie(name, value) {
    document.cookie =
      name + "=" + encodeURIComponent(value) + ";path=/;max-age=31536000;SameSite=Lax";
  }

  function normalize(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    if (SUPPORTED[s]) return s;
    var lower = s.toLowerCase();
    if (lower === "zh" || lower.indexOf("zh") === 0) return "zh-CN";
    if (lower.indexOf("en") === 0) return "en";
    if (lower.indexOf("id") === 0) return "id";
    if (lower.indexOf("ms") === 0) return "ms";
    if (lower.indexOf("vi") === 0) return "vi";
    if (lower.indexOf("th") === 0) return "th";
    return "";
  }

  function fromAcceptLanguage() {
    var al = navigator.language || (navigator.languages && navigator.languages[0]) || "";
    return normalize(al);
  }

  function fromCountryMeta() {
    var el = document.querySelector('meta[name="cf-ipcountry"]');
    var cc = (el && el.getAttribute("content")) || "";
    if (!cc && typeof global.__PSY_CF_COUNTRY === "string") cc = global.__PSY_CF_COUNTRY;
    if (!cc) {
      try {
        cc = sessionStorage.getItem("psy_cf_cc") || "";
      } catch (e) {}
    }
    cc = String(cc || "").toUpperCase();
    return COUNTRY_LOCALE[cc] || "";
  }

  function fetchGeoHint() {
    return fetch("/api/v1/geo", { credentials: "same-origin", cache: "no-store" })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (!data || !data.country) return null;
        var cc = String(data.country).toUpperCase();
        try {
          sessionStorage.setItem("psy_cf_cc", cc);
        } catch (e) {}
        global.__PSY_CF_COUNTRY = cc;
        var meta = document.querySelector('meta[name="cf-ipcountry"]');
        if (!meta) {
          meta = document.createElement("meta");
          meta.setAttribute("name", "cf-ipcountry");
          document.head.appendChild(meta);
        }
        meta.setAttribute("content", cc);
        return cc;
      })
      .catch(function () {
        return null;
      });
  }

  function queryLang() {
    try {
      var q = new URLSearchParams(location.search).get("lang");
      return normalize(q);
    } catch (e) {
      return "";
    }
  }

  function resolveLocale(opts) {
    opts = opts || {};
    return (
      normalize(opts.force) ||
      queryLang() ||
      normalize(readCookie(COOKIE)) ||
      fromAcceptLanguage() ||
      fromCountryMeta() ||
      "zh-CN"
    );
  }

  function setLocale(locale, opts) {
    var loc = normalize(locale) || "zh-CN";
    writeCookie(COOKIE, loc);
    if (opts && opts.redirect) {
      var path = location.pathname || "/";
      if (loc === "en" && (path === "/" || path === "/index.html")) {
        location.href = "/en/" + location.search + location.hash;
        return loc;
      }
      if (loc === "zh-CN" && path.indexOf("/en") === 0) {
        var rest = path.replace(/^\/en\/?/, "/") || "/";
        location.href = rest + location.search + location.hash;
        return loc;
      }
    }
    return loc;
  }

  function softSuggestBanner() {
    var path = location.pathname || "/";
    var onEn = path === "/en" || path.indexOf("/en/") === 0;
    var preferred = resolveLocale();
    if (onEn && preferred === "zh-CN" && !readCookie(COOKIE)) {
      /* already on EN from Accept-Language / CF — no nag */
      return;
    }
    if (!onEn && preferred === "en" && !sessionStorage.getItem("psy_lang_hint")) {
      sessionStorage.setItem("psy_lang_hint", "1");
      var bar = document.createElement("div");
      bar.setAttribute("role", "status");
      bar.style.cssText =
        "position:fixed;left:0;right:0;bottom:0;z-index:9999;padding:10px 16px;background:#0f766e;color:#fff;font:14px/1.4 IBM Plex Sans,sans-serif;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap";
      bar.innerHTML =
        '<span>Prefer English?</span><a href="/en/" style="color:#fff;font-weight:600">Continue in English</a><button type="button" style="background:transparent;border:1px solid rgba(255,255,255,.5);color:#fff;padding:4px 10px;cursor:pointer">Stay in Chinese</button>';
      bar.querySelector("a").addEventListener("click", function () {
        setLocale("en");
      });
      bar.querySelector("button").addEventListener("click", function () {
        setLocale("zh-CN");
        bar.remove();
      });
      document.body.appendChild(bar);
    }
  }

  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest && e.target.closest("[data-locale-set]");
    if (!t) return;
    var loc = t.getAttribute("data-locale-set");
    setLocale(loc);
  });

  var api = {
    resolve: resolveLocale,
    set: setLocale,
    cookieName: COOKIE,
    countryLocale: COUNTRY_LOCALE,
    fetchGeo: fetchGeoHint,
  };
  global.PsyLocale = api;

  function boot() {
    fetchGeoHint().finally(softSuggestBanner);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : this);
