(() => {
  const year = document.getElementById("y");
  if (year) year.textContent = String(new Date().getFullYear());

  const SHELF = [
    { code: "ofpr", title: "秋招 offer 概率" },
    { code: "jlpf", title: "简历竞争力评分" },
    { code: "slpz", title: "四路径适配" },
    { code: "xzcp", title: "校招测评练习" },
    { code: "irms", title: "i人面试守护灵" },
    { code: "nly", title: "牛来也 · 成长原型测" },
    { code: "7v7", title: "七宗罪 VS 七美德" },
    { code: "phd", title: "你适合读博吗" },
    { code: "wxcs", title: "五行城市匹配" },
    { code: "apt", title: "天赋潜能评估" },
    { code: "rvt", title: "恋爱观测试" },
    { code: "znt", title: "渣女测试" },
    { code: "ast", title: "动物塑测试" },
    { code: "hit", title: "霍兰德职业兴趣" },
    { code: "vbt", title: "容易被人欺负" },
    { code: "wjt", title: "这b班值不值" },
  ];

  const wall = document.getElementById("shelf-wall");
  const grid = document.getElementById("test-grid");
  const statsHost = document.getElementById("hero-stats");
  const moreTitle = document.getElementById("catalog-more-title");

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

  function renderShelf() {
    if (!wall) return;
    wall.innerHTML = SHELF.map((item, i) => {
      const delay = i < 4 ? ` delay-${(i % 3) + 1}` : "";
      return (
        `<a class="shelf-tile reveal${delay}" href="/tests/${esc(item.code)}/">` +
        `<img src="/images/shelf/${esc(item.code)}.jpg?v=20260817" alt="${esc(item.title)}" loading="${i < 4 ? "eager" : "lazy"}" width="800" height="800" />` +
        `<span class="shelf-tile-caption"><strong>${esc(item.title)}</strong><em>进入测评</em></span>` +
        `</a>`
      );
    }).join("");
  }

  function renderStats(stats) {
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
  }

  async function loadHomepage() {
    if (!grid) return;
    try {
      const res = await fetch("/api/stats/homepage", {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("http " + res.status);
      const body = await res.json();
      const data = (body && body.data) || body || {};
      const tests = data.tests || [];
      renderStats(data.stats || {});

      const featured = new Set(SHELF.map((s) => s.code));
      const rest = (Array.isArray(tests) ? tests : []).filter((t) => {
        const code = String(t.test_code || t.code || "");
        return code && !featured.has(code);
      });

      if (!rest.length) {
        grid.dataset.state = "empty";
        grid.innerHTML = "";
        if (moreTitle) moreTitle.hidden = true;
        return;
      }

      if (moreTitle) moreTitle.hidden = false;
      const items = rest.slice(0, 24).map((t) => {
        const name = esc(t.test_name || t.name || t.test_code || "未命名测评");
        const code = esc(t.test_code || t.code || "");
        const q = t.question_count || t.questions || "";
        const d = t.duration_minutes || t.duration_min || "";
        const metaBits = [];
        if (q) metaBits.push(q + " 题");
        if (d) metaBits.push("约 " + d + " 分钟");
        const hot = t.is_hot ? '<span class="hot">热门</span>' : "";
        const dual = t.is_dual_perspective ? '<span class="tag-dual">双视角</span>' : "";
        const href = code ? `/tests/${code}/` : "#tests";
        return (
          `<a class="test-item" href="${href}">` +
          "<h3>" +
          hot +
          dual +
          name +
          "</h3>" +
          (metaBits.length ? '<p class="test-meta">' + esc(metaBits.join(" · ")) + "</p>" : "") +
          "</a>"
        );
      });
      grid.dataset.state = "ready";
      grid.innerHTML = items.join("");
    } catch (err) {
      grid.dataset.state = "error";
      grid.innerHTML =
        '<p class="test-status">更多测题列表暂时不可用；上方精选主图仍可进入测评。</p>';
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

  renderShelf();
  loadHomepage();
  showWorkbenchBar();
})();
