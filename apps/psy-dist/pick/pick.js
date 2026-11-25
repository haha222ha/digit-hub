(function () {
  "use strict";

  const LS_KEY = "xx_hub_session_v1";
  const params = new URLSearchParams(location.search);
  const urlToken = (params.get("token") || "").trim();

  const authPanel = document.getElementById("authPanel");
  const pickPanel = document.getElementById("pickPanel");
  const authInput = document.getElementById("authInput");
  const authBtn = document.getElementById("authBtn");
  const authHint = document.getElementById("authHint");
  const authStatus = document.getElementById("authStatus");
  const select = document.getElementById("testSelect");
  const enterBtn = document.getElementById("enterBtn");
  const remainHint = document.getElementById("remainHint");
  const sessionMeta = document.getElementById("sessionMeta");
  const statusMsg = document.getElementById("statusMsg");
  const switchCodeBtn = document.getElementById("switchCodeBtn");
  const catalogLead = document.getElementById("catalogLead");
  const catalogGrid = document.getElementById("catalogGrid");
  const catalogEmpty = document.getElementById("catalogEmpty");
  const catalogSearch = document.getElementById("catalogSearch");
  const catalogHotOnly = document.getElementById("catalogHotOnly");

  /** @type {{ token: string, usedCount: number, maxUses: number, remainingUses: number, linkMode: string, masked?: string, updatedAt: string } | null} */
  let session = null;
  /** @type {Array<any>} */
  let allTests = [];
  let selectedCode = "";

  function showEl(el, on) {
    if (!el) return;
    el.hidden = !on;
  }

  function setStatus(el, text, kind) {
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.className = "status" + (kind ? " " + kind : "");
  }

  function maskToken(token) {
    const t = String(token || "");
    if (t.length <= 8) return t.slice(0, 2) + "***";
    return t.slice(0, 4) + "…" + t.slice(-4);
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.token || String(obj.token).length < 8) return null;
      return obj;
    } catch {
      return null;
    }
  }

  function saveSession(data) {
    const next = {
      token: data.token,
      usedCount: Number(data.usedCount || 0),
      maxUses: Number(data.maxUses || 3),
      remainingUses: Number(
        data.remainingUses != null
          ? data.remainingUses
          : Math.max(0, Number(data.maxUses || 3) - Number(data.usedCount || 0))
      ),
      linkMode: data.linkMode || "hub",
      masked: maskToken(data.token),
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    session = next;
    return next;
  }

  function clearSession() {
    localStorage.removeItem(LS_KEY);
    session = null;
  }

  async function api(path, opts) {
    const res = await fetch(path, {
      method: (opts && opts.method) || "GET",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok && (!json || json.code === undefined)) {
      throw new Error((json && (json.message || json.detail)) || "请求失败");
    }
    if (json && typeof json === "object" && json.code !== undefined) {
      if (Number(json.code) !== 200) {
        throw new Error(json.message || "请求失败");
      }
      return json.data != null ? json.data : json;
    }
    return json;
  }

  function quizUrl(testCode, token) {
    const code = encodeURIComponent(testCode);
    const tok = encodeURIComponent(token);
    if (testCode === "past_new" || testCode === "past_xlx") {
      return `/tests/past_new/index.html?token=${tok}`;
    }
    if (testCode === "muse_new") {
      return `/tests/muse_new/index.html?token=${tok}`;
    }
    return `/tests/${code}/index.html?token=${tok}`;
  }

  function isLoggedIn() {
    return !!(session && session.token && Number(session.remainingUses) > 0);
  }

  function showAuth(opts) {
    showEl(authPanel, true);
    showEl(pickPanel, false);
    const exhausted = !!(opts && opts.exhausted);
    const msg = (opts && opts.message) || "";
    authHint.textContent = exhausted
      ? "当前授权码次数已用尽。请输入新的授权码继续测评。"
      : "请输入商家提供的选题授权码。下方可先浏览全部测题。";
    setStatus(authStatus, msg, exhausted ? "error" : msg ? "ok" : "");
    authInput.value = "";
    updateCatalogLead();
    renderCatalog();
    authInput.focus();
  }

  function showPick() {
    showEl(authPanel, false);
    showEl(pickPanel, true);
    updateCatalogLead();
  }

  function updateCatalogLead() {
    if (!catalogLead) return;
    if (isLoggedIn()) {
      catalogLead.textContent = `共 ${allTests.length} 套测题 · 点卡片即可开测（剩余 ${session.remainingUses} 次）`;
    } else if (session && Number(session.remainingUses) <= 0) {
      catalogLead.textContent = `共 ${allTests.length} 套测题 · 授权码已用尽，可先浏览后换新码`;
    } else {
      catalogLead.textContent = `共 ${allTests.length} 套测题 · 先逛逛了解产品，输入授权码后可开测`;
    }
  }

  async function validateToken(token) {
    return api("/api/links/validate", { method: "POST", body: { token } });
  }

  function sessionFromValid(token, valid) {
    const used = Number(
      valid.usedCount != null ? valid.usedCount : (valid.link && valid.link.used_count) || 0
    );
    const maxUses = Number(
      valid.maxUses != null ? valid.maxUses : (valid.link && valid.link.max_uses) || 3
    );
    const remaining = Number(
      valid.remainingUses != null ? valid.remainingUses : Math.max(0, maxUses - used)
    );
    const mode = String(
      valid.linkMode ||
        (valid.link && (valid.link.linkMode || valid.link.link_mode)) ||
        ""
    ).toLowerCase();
    const stored = String(valid.testCode || (valid.link && valid.link.test_code) || "");
    const linkMode = mode === "hub" || stored === "__hub__" ? "hub" : mode || "single";
    return saveSession({
      token,
      usedCount: used,
      maxUses,
      remainingUses: remaining,
      linkMode,
    });
  }

  async function loadTests() {
    const list = await api("/api/tests/list");
    return (list && list.tests) || [];
  }

  function fillSelect(tests) {
    select.innerHTML = "";
    select.appendChild(new Option("请选择测题", ""));
    for (const t of tests) {
      const code = t.test_code || t.code || "";
      if (!code) continue;
      const name = t.test_name || t.name || code;
      const hot = t.is_hot ? "热门 · " : "";
      const q = t.question_count ? ` · ${t.question_count}题` : "";
      select.appendChild(new Option(`${hot}${name}${q}`, code));
    }
    select.disabled = false;
    if (selectedCode) select.value = selectedCode;
    enterBtn.disabled = !select.value;
  }

  function filteredTests() {
    const q = (catalogSearch && catalogSearch.value ? catalogSearch.value : "").trim().toLowerCase();
    const hotOnly = !!(catalogHotOnly && catalogHotOnly.checked);
    return allTests.filter((t) => {
      const code = t.test_code || t.code || "";
      const name = String(t.test_name || t.name || code).toLowerCase();
      if (hotOnly && !t.is_hot) return false;
      if (q && !name.includes(q) && !String(code).toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function renderCatalog() {
    if (!catalogGrid) return;
    const list = filteredTests();
    catalogGrid.replaceChildren();
    showEl(catalogEmpty, list.length === 0);
    const locked = !isLoggedIn();

    for (const t of list) {
      const code = t.test_code || t.code || "";
      if (!code) continue;
      const name = t.test_name || t.name || code;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "catalog-card" + (selectedCode === code ? " is-selected" : "") + (locked ? " is-locked" : "");
      btn.setAttribute("role", "listitem");
      btn.dataset.code = code;

      const top = document.createElement("div");
      top.className = "catalog-card-top";
      const title = document.createElement("p");
      title.className = "catalog-card-name";
      title.textContent = name;
      top.appendChild(title);
      if (t.is_hot) {
        const badge = document.createElement("span");
        badge.className = "catalog-badge";
        badge.textContent = "热门";
        top.appendChild(badge);
      }

      const meta = document.createElement("p");
      meta.className = "catalog-meta";
      const parts = [];
      if (t.question_count) parts.push(`${t.question_count} 题`);
      if (t.duration_minutes) parts.push(`约 ${t.duration_minutes} 分钟`);
      if (t.is_dual_perspective) parts.push("双视角");
      meta.textContent = parts.join(" · ") || code;

      btn.appendChild(top);
      btn.appendChild(meta);
      btn.addEventListener("click", () => onCatalogPick(code, locked));
      catalogGrid.appendChild(btn);
    }
  }

  function onCatalogPick(code, locked) {
    selectedCode = code;
    if (select) {
      select.value = code;
      enterBtn.disabled = !select.value;
    }
    renderCatalog();
    if (locked) {
      showAuth({ message: "先输入授权码，再开测这套题。" });
      authInput.focus();
      return;
    }
    // 已登录：直接进入
    enterSelectedTest();
  }

  function enterSelectedTest() {
    if (!session || !session.token) {
      showAuth({ message: "请先输入授权码。" });
      return;
    }
    const code = select.value || selectedCode;
    if (!code) return;
    saveSession(session);
    location.href = quizUrl(code, session.token);
  }

  async function enterPickUI(sess) {
    showPick();
    remainHint.textContent = `剩余可开测 ${sess.remainingUses} / ${sess.maxUses} 次（可同题复测）`;
    sessionMeta.hidden = false;
    sessionMeta.textContent = `已登录授权码 ${sess.masked || maskToken(sess.token)} · 本机已记住`;

    if (sess.remainingUses <= 0) {
      setStatus(statusMsg, "本授权码使用次数已达上限。", "error");
      select.innerHTML = '<option value="">次数已用尽</option>';
      select.disabled = true;
      enterBtn.disabled = true;
      showAuth({ exhausted: true, message: "次数已用尽，请输入新授权码。" });
      return;
    }

    setStatus(statusMsg, "", "");
    if (!allTests.length) {
      try {
        allTests = await loadTests();
      } catch (e) {
        setStatus(statusMsg, e.message || "测题列表加载失败", "error");
        select.innerHTML = '<option value="">加载失败</option>';
        return;
      }
    }
    fillSelect(allTests);
    updateCatalogLead();
    renderCatalog();
  }

  async function activateToken(rawToken, { fromUrl } = {}) {
    const token = String(rawToken || "").trim();
    if (!token || token.length < 8) {
      throw new Error("请输入有效的授权码");
    }
    const valid = await validateToken(token);
    if (!valid || valid.valid !== true) {
      throw new Error((valid && valid.message) || "授权码无效或次数已用尽");
    }

    const mode = String(
      valid.linkMode ||
        (valid.link && (valid.link.linkMode || valid.link.link_mode)) ||
        ""
    ).toLowerCase();
    const stored = String(valid.testCode || (valid.link && valid.link.test_code) || "");
    const isHub = mode === "hub" || stored === "__hub__";

    if (!isHub) {
      if (stored && stored !== "__hub__") {
        sessionFromValid(token, valid);
        location.replace(quizUrl(stored, token));
        return null;
      }
      throw new Error("该授权码不是选题链接，请联系商家生成「选题链接」。");
    }

    const sess = sessionFromValid(token, valid);
    if (fromUrl) {
      try {
        history.replaceState({}, "", "/pick/");
      } catch (_) {
        /* ignore */
      }
    }
    return sess;
  }

  async function bootWithToken(token, meta) {
    try {
      setStatus(authStatus, "正在验证…", "ok");
      authBtn.disabled = true;
      const sess = await activateToken(token, meta);
      if (!sess) return;
      await enterPickUI(sess);
    } catch (e) {
      clearSession();
      showAuth({ message: e.message || "验证失败" });
      setStatus(authStatus, e.message || "验证失败", "error");
    } finally {
      authBtn.disabled = false;
    }
  }

  async function ensureCatalogLoaded() {
    if (allTests.length) {
      updateCatalogLead();
      renderCatalog();
      return;
    }
    try {
      allTests = await loadTests();
      updateCatalogLead();
      renderCatalog();
    } catch (e) {
      catalogLead.textContent = e.message || "测题列表加载失败";
    }
  }

  authBtn.addEventListener("click", () => {
    bootWithToken(authInput.value, { fromUrl: false });
  });
  authInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      bootWithToken(authInput.value, { fromUrl: false });
    }
  });

  switchCodeBtn.addEventListener("click", () => {
    clearSession();
    selectedCode = "";
    showAuth({ message: "已退出当前授权码，请输入新的授权码。" });
  });

  select.addEventListener("change", () => {
    selectedCode = select.value || "";
    enterBtn.disabled = !select.value;
    renderCatalog();
  });

  enterBtn.addEventListener("click", enterSelectedTest);

  if (catalogSearch) {
    catalogSearch.addEventListener("input", () => renderCatalog());
  }
  if (catalogHotOnly) {
    catalogHotOnly.addEventListener("change", () => renderCatalog());
  }

  async function boot() {
    // 先加载测题列表，登录前后都可浏览
    await ensureCatalogLoaded();

    if (urlToken) {
      showAuth({});
      await bootWithToken(urlToken, { fromUrl: true });
      return;
    }

    const cached = loadSession();
    if (cached && cached.token) {
      showPick();
      remainHint.textContent = "正在同步使用次数…";
      try {
        const valid = await validateToken(cached.token);
        if (!valid || valid.valid !== true) {
          const msg = (valid && valid.message) || "授权码已失效";
          clearSession();
          showAuth({
            exhausted: /上限|用尽|过期|无效/.test(msg),
            message: msg + "。请输入新授权码。",
          });
          return;
        }
        const sess = sessionFromValid(cached.token, valid);
        await enterPickUI(sess);
        return;
      } catch (e) {
        session = cached;
        remainHint.textContent = `离线缓存：剩余约 ${cached.remainingUses} / ${cached.maxUses} 次（联网后会校正）`;
        sessionMeta.hidden = false;
        sessionMeta.textContent = `已登录授权码 ${cached.masked || maskToken(cached.token)} · 本机缓存`;
        setStatus(statusMsg, e.message || "同步失败，已用本机记录", "error");
        try {
          await enterPickUI(cached);
        } catch (_) {
          showAuth({ message: "请重新输入授权码。" });
        }
        return;
      }
    }

    showAuth({});
  }

  boot();
})();
