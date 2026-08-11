/** Local retest reminder — no backend required. */

const KEY = "xinxiang_retest_reminders";

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function scheduleRetest(skinId, days = 30) {
  const all = readAll();
  const due = Date.now() + days * 24 * 60 * 60 * 1000;
  all[skinId] = { due, days, setAt: Date.now() };
  localStorage.setItem(KEY, JSON.stringify(all));
  return all[skinId];
}

export function getRetest(skinId) {
  return readAll()[skinId] || null;
}

export function clearRetest(skinId) {
  const all = readAll();
  delete all[skinId];
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function retestBannerHtml(skinId) {
  const row = getRetest(skinId);
  if (!row) {
    return `
      <aside class="retest-banner">
        <div>
          <p class="group-label">复测基线</p>
          <p class="muted" style="margin:0">30 天后用同一量表回来，曲线比纠结标签更值钱。</p>
        </div>
        <button type="button" class="btn btn-ghost" data-retest-set>提醒我 30 天后复测</button>
      </aside>
    `;
  }
  const left = Math.max(0, Math.ceil((row.due - Date.now()) / (24 * 60 * 60 * 1000)));
  const dueDate = new Date(row.due).toLocaleDateString("zh-CN");
  if (left <= 0) {
    return `
      <aside class="retest-banner ready">
        <div>
          <p class="group-label">复测到期</p>
          <p class="muted" style="margin:0">可以复测了。完成后曲线会多一个点。</p>
        </div>
        <button type="button" class="btn btn-primary" data-retest-go>立即复测</button>
      </aside>
    `;
  }
  return `
    <aside class="retest-banner">
      <div>
        <p class="group-label">已设复测提醒</p>
        <p class="muted" style="margin:0">预计 ${dueDate} · 还剩约 ${left} 天</p>
      </div>
      <button type="button" class="btn btn-ghost" data-retest-clear>取消提醒</button>
    </aside>
  `;
}

export function wireRetestBanner(root, skinId, navigate) {
  root.querySelector("[data-retest-set]")?.addEventListener("click", (e) => {
    e.preventDefault();
    scheduleRetest(skinId, 30);
    const host = root.querySelector(".retest-banner")?.parentElement;
    if (host) {
      const wrap = document.createElement("div");
      wrap.innerHTML = retestBannerHtml(skinId);
      root.querySelector(".retest-banner")?.replaceWith(wrap.firstElementChild);
      wireRetestBanner(root, skinId, navigate);
    }
  });
  root.querySelector("[data-retest-clear]")?.addEventListener("click", (e) => {
    e.preventDefault();
    clearRetest(skinId);
    const wrap = document.createElement("div");
    wrap.innerHTML = retestBannerHtml(skinId);
    root.querySelector(".retest-banner")?.replaceWith(wrap.firstElementChild);
    wireRetestBanner(root, skinId, navigate);
  });
  root.querySelector("[data-retest-go]")?.addEventListener("click", (e) => {
    e.preventDefault();
    clearRetest(skinId);
    navigate(`/t/${skinId}`);
  });
}
