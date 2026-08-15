(() => {
  const year = document.getElementById("y");
  if (year) year.textContent = String(new Date().getFullYear());

  const grid = document.getElementById("test-grid");
  const statsHost = document.getElementById("hero-stats");
  if (!grid) return;

  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  function fmtStat(n) {
    const v = Number(n || 0);
    if (v >= 10000) return `${Math.floor(v / 1000) / 10}万+`;
    if (v >= 1000) return `${Math.floor(v / 100) / 10}k+`;
    return String(v);
  }

  function renderStats(stats, siteName) {
    if (!statsHost || !stats) return;
    const items = [
      { k: "测评项目", v: stats.tests_catalog || stats.tests_homepage || 0 },
      { k: "链接已生成", v: stats.links_total || 0 },
      { k: "测评完成", v: stats.completions_total || 0 },
    ].filter((x) => Number(x.v) > 0);
    if (!items.length) return;
    statsHost.hidden = false;
    statsHost.replaceChildren(
      ...items.map((item) => {
        const node = document.createElement("div");
        node.className = "hero-stat";
        node.innerHTML = `<strong>${esc(fmtStat(item.v))}</strong><span>${esc(item.k)}</span>`;
        return node;
      })
    );
    if (siteName && document.querySelector(".hero-brand")) {
      document.querySelector(".hero-brand").textContent = siteName;
    }
  }

  async function loadHomepage() {
    try {
      const res = await fetch("/api/stats/homepage", {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("http " + res.status);
      const body = await res.json();
      const data = (body && body.data) || body || {};
      const tests = data.tests || [];
      const stats = data.stats || {};
      renderStats(stats, data.site_name);

      if (!Array.isArray(tests) || tests.length === 0) {
        grid.dataset.state = "empty";
        grid.innerHTML = '<p class="test-status">测题目录暂未加载，注册后可在后台查看全部项目。</p>';
        return;
      }
      const items = tests.slice(0, 36).map((t) => {
        const name = esc(t.test_name || t.name || t.test_code || "未命名测评");
        const q = t.question_count || t.questions || "";
        const d = t.duration_minutes || t.duration_min || "";
        const metaBits = [];
        if (q) metaBits.push(q + " 题");
        if (d) metaBits.push("约 " + d + " 分钟");
        const hot = t.is_hot ? '<span class="hot">热门</span>' : "";
        const dual = t.is_dual_perspective ? '<span class="tag-dual">双视角</span>' : "";
        return (
          '<article class="test-item">' +
          "<h3>" +
          hot +
          dual +
          name +
          "</h3>" +
          (metaBits.length ? '<p class="test-meta">' + esc(metaBits.join(" · ")) + "</p>" : "") +
          "</article>"
        );
      });
      grid.dataset.state = "ready";
      grid.innerHTML = items.join("");
    } catch (err) {
      grid.dataset.state = "error";
      grid.innerHTML =
        '<p class="test-status">测题列表暂时不可用，不影响注册与登录。稍后刷新即可。</p>';
    }
  }

  function showWorkbenchBar() {
    if (!localStorage.getItem("xx_psy_token")) return;
    const bar = document.createElement("div");
    bar.className = "home-session-bar";
    bar.innerHTML =
      '<span>已登录商家账号</span><a href="/admin/dashboard">进入工作台 →</a>';
    document.body.appendChild(bar);
  }

  loadHomepage();
  showWorkbenchBar();
})();
