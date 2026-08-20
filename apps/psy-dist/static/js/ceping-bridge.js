/**
 * Bridge: 测评系统完整版独立皮肤 → 心象测 PsyTestValidator
 * 用法：在页面中设置 window.__PSY_TEST_CODE__ 后引入本文件与 link-validator.js
 */
(function () {
  "use strict";

  var CODE = window.__PSY_TEST_CODE__ || "";
  var started = false;
  var completed = false;
  var validator = null;

  function getValidator() {
    if (validator) return validator;
    if (window.linkValidator) {
      validator = window.linkValidator;
      return validator;
    }
    if (window.PsyTestValidator && typeof window.PsyTestValidator.getInstance === "function") {
      validator = window.PsyTestValidator.getInstance();
      window.linkValidator = validator;
      return validator;
    }
    return null;
  }

  window.__psyEnsureStart = async function () {
    if (started) return true;
    var v = getValidator();
    if (v && typeof v.startTest === "function") {
      await v.startTest();
    }
    started = true;
    return true;
  };

  window.__psyComplete = async function (result) {
    if (completed) return;
    completed = true;
    var v = getValidator();
    if (v && typeof v.completeTest === "function") {
      try {
        await v.completeTest(undefined, result || {});
      } catch (e) {
        console.warn("[ceping-bridge] completeTest", e);
      }
    }
  };

  function collectResultHint() {
    var scoreEl =
      document.getElementById("result-score") ||
      document.getElementById("sc") ||
      document.getElementById("score") ||
      document.querySelector(".result-score");
    var levelEl =
      document.getElementById("result-level") ||
      document.getElementById("lv") ||
      document.getElementById("level") ||
      document.querySelector(".result-level");
    var score = null;
    if (typeof window.totalScore === "number") score = window.totalScore;
    else if (typeof window.score === "number") score = window.score;
    else if (scoreEl) {
      var m = String(scoreEl.textContent || "").match(/-?\d+/);
      if (m) score = parseInt(m[0], 10);
    }
    return {
      test_code: CODE,
      score: score,
      level: levelEl ? String(levelEl.textContent || "").trim() : "",
      source: "ceping-bridge",
    };
  }

  function isStartControl(el) {
    if (!el || el.nodeType !== 1) return false;
    var id = (el.id || "").toLowerCase();
    var cls = (el.className || "").toString().toLowerCase();
    var text = (el.textContent || "").replace(/\s+/g, "");
    if (el.dataset && el.dataset.psySkip === "1") return false;
    if (id === "start-btn" || id === "start-test-btn" || id === "sys-auth-btn" || id === "auth-btn") return true;
    if (id.indexOf("start") >= 0 && text.indexOf("开始") >= 0) return true;
    if ((cls.indexOf("start") >= 0 || el.getAttribute("onclick") || "").indexOf("login") >= 0) {
      if (text.indexOf("开始") >= 0) return true;
    }
    if (text === "开始测试" || text.indexOf("开始测试") === 0 || text.indexOf("开始测评") === 0) return true;
    return false;
  }

  document.addEventListener(
    "click",
    function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("button, a, .btn") : null;
      if (!btn || !isStartControl(btn)) return;
      if (btn.dataset.psyAllow === "1") {
        delete btn.dataset.psyAllow;
        return;
      }
      if (btn.dataset.psyIntercepting === "1") return;
      if (started) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      btn.dataset.psyIntercepting = "1";
      btn.disabled = true;

      // Avoid "click does nothing" when start-test API hangs (common on weak mobile nets).
      var startTimeoutMs = 15000;
      var timedOut = false;
      var timeoutId = setTimeout(function () {
        timedOut = true;
        btn.disabled = false;
        delete btn.dataset.psyIntercepting;
        alert("开始超时，请检查网络后重试");
      }, startTimeoutMs);

      Promise.resolve(window.__psyEnsureStart())
        .then(function () {
          if (timedOut) return;
          clearTimeout(timeoutId);
          btn.disabled = false;
          delete btn.dataset.psyIntercepting;
          btn.dataset.psyAllow = "1";
          btn.click();
        })
        .catch(function (err) {
          if (timedOut) return;
          clearTimeout(timeoutId);
          btn.disabled = false;
          delete btn.dataset.psyIntercepting;
          // link-validator already shows a modal on startTest failure; avoid double prompts.
          if (!(window.linkValidator && window.linkValidator.validationError)) {
            alert((err && err.message) || "无法开始测试，请检查链接是否有效");
          }
        });
    },
    true
  );

  function pageLooksLikeResult(el) {
    if (!el || el.nodeType !== 1) return false;
    var id = (el.id || "").toLowerCase();
    var cls = (el.className || "").toString().toLowerCase();
    if (id === "page-result" || id === "res" || id === "result" || id === "resultscreen" || id === "result-page")
      return true;
    if (cls.indexOf("result") >= 0 && (cls.indexOf("page") >= 0 || cls.indexOf("card") >= 0 || cls.indexOf("screen") >= 0))
      return true;
    return false;
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.classList && el.classList.contains("hidden")) return false;
    var st = window.getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    return true;
  }

  function maybeCompleteFromDom() {
    if (completed) return;
    var candidates = document.querySelectorAll(
      "#page-result, #res, #result, #resultScreen, #result-page, .result-card, .result-screen, .page.result"
    );
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (pageLooksLikeResult(el) && isVisible(el)) {
        window.__psyComplete(collectResultHint());
        return;
      }
    }
  }

  var mo = new MutationObserver(function () {
    maybeCompleteFromDom();
  });
  if (document.body) {
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      mo.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style"],
      });
    });
  }

  // Let legacy gates that check sessionStorage pass (auth is handled by token link).
  try {
    sessionStorage.setItem("sys_authed", "true");
  } catch (e) {}

  function initSdk() {
    if (!CODE || typeof PsyTestValidator === "undefined") {
      console.warn("[ceping-bridge] missing code or PsyTestValidator");
      return;
    }
    PsyTestValidator.init(CODE, {
      onSuccess: function (_result, v) {
        validator = v;
        window.linkValidator = v;
      },
      onError: function () {
        validator = getValidator();
      },
      onLoad: function () {
        validator = getValidator();
        setTimeout(function () {
          if (typeof PsyTestValidator.addPromotionLink === "function") {
            PsyTestValidator.addPromotionLink();
          }
        }, 100);
      },
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSdk);
  } else {
    initSdk();
  }
})();
