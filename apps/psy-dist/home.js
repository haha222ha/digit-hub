(() => {
  const year = document.getElementById("y");
  if (year) year.textContent = String(new Date().getFullYear());

  const grid = document.getElementById("test-grid");
  if (!grid) return;

  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  async function loadTests() {
    try {
      const res = await fetch("/api/tests/list", {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("http " + res.status);
      const body = await res.json();
      const tests = (body && body.data && body.data.tests) || body.tests || [];
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
        return (
          '<article class="test-item">' +
          "<h3>" +
          hot +
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

  loadTests();
})();
