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

  /** @type {{ token: string, usedCount: number, maxUses: number, remainingUses: number, linkMode: string, masked?: string, updatedAt: string } | null} */
  let session = null;

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

  function showAuth(opts) {
    showEl(authPanel, true);
    showEl(pickPanel, false);
    const exhausted = !!(opts && opts.exhausted);
    const msg = (opts && opts.message) || "";
    authHint.textContent = exhausted
      ? "当前授权码次数已用尽。请输入新的授权码继续测评。"
      : "请输入商家提供的选题授权码。登录状态会保存在本机，下次可直接选题。";
    setStatus(authStatus, msg, exhausted ? "error" : msg ? "ok" : "");
    authInput.value = "";
    authInput.focus();
  }

  function showPick() {
    showEl(authPanel, false);
    showEl(pickPanel, true);
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
    let tests = [];
    try {
      tests = await loadTests();
    } catch (e) {
      setStatus(statusMsg, e.message || "测题列表加载失败", "error");
      select.innerHTML = '<option value="">加载失败</option>';
      return;
    }

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
    enterBtn.disabled = !select.value;
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
      // 单测题授权码：记住后直达测题页
      if (stored && stored !== "__hub__") {
        sessionFromValid(token, valid);
        location.replace(quizUrl(stored, token));
        return null;
      }
      throw new Error("该授权码不是选题链接，请联系商家生成「选题链接」。");
    }

    const sess = sessionFromValid(token, valid);
    if (fromUrl) {
      // 清掉 URL 里的 token，避免转发泄露；状态已在 localStorage
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
    showAuth({ message: "已退出当前授权码，请输入新的授权码。" });
  });

  select.addEventListener("change", () => {
    enterBtn.disabled = !select.value;
  });

  enterBtn.addEventListener("click", () => {
    if (!session || !session.token) {
      showAuth({ message: "请先输入授权码。" });
      return;
    }
    const code = select.value;
    if (!code) return;
    // 进入测题前再写一次 LS，供测题页 / 返回时同步
    saveSession(session);
    location.href = quizUrl(code, session.token);
  });

  async function boot() {
    // 1) URL token 优先（商家发卡链接）
    if (urlToken) {
      showAuth({});
      await bootWithToken(urlToken, { fromUrl: true });
      return;
    }

    // 2) 本机已记住
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
        // 网络失败时仍展示本地缓存次数，允许选题（开测时服务端再拦）
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

    // 3) 无会话 → 输入授权码
    showAuth({});
  }

  boot();
})();
