(function () {
  "use strict";

  const catalogLead = document.getElementById("catalogLead");
  const catalogGrid = document.getElementById("catalogGrid");
  const catalogEmpty = document.getElementById("catalogEmpty");
  const catalogSearch = document.getElementById("catalogSearch");
  const catalogHotOnly = document.getElementById("catalogHotOnly");

  /** @type {Array<any>} */
  let allTests = [];

  async function api(path) {
    const res = await fetch(path, { headers: { Accept: "application/json" } });
    const json = await res.json().catch(() => ({}));
    if (json && typeof json === "object" && json.code !== undefined) {
      if (Number(json.code) !== 200) throw new Error(json.message || "请求失败");
      return json.data != null ? json.data : json;
    }
    if (!res.ok) throw new Error((json && json.message) || "请求失败");
    return json;
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

  function render() {
    const list = filteredTests();
    catalogGrid.replaceChildren();
    catalogEmpty.hidden = list.length > 0;
    catalogLead.textContent = `共 ${allTests.length} 套测题 · 点卡片前往授权开测`;

    for (const t of list) {
      const code = t.test_code || t.code || "";
      if (!code) continue;
      const name = t.test_name || t.name || code;
      const a = document.createElement("a");
      a.className = "catalog-card";
      a.href = "/pick/";
      a.setAttribute("role", "listitem");
      a.style.textDecoration = "none";

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

      a.appendChild(top);
      a.appendChild(meta);
      catalogGrid.appendChild(a);
    }
  }

  async function boot() {
    try {
      const data = await api("/api/tests/list");
      allTests = (data && data.tests) || [];
      render();
    } catch (e) {
      catalogLead.textContent = e.message || "测题列表加载失败";
    }
  }

  if (catalogSearch) catalogSearch.addEventListener("input", render);
  if (catalogHotOnly) catalogHotOnly.addEventListener("change", render);
  boot();
})();
