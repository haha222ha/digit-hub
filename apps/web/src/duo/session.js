/** Same-device duo session: seat A → seat B → compare. */

const KEY = "xinxiang_duo_sessions";

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function writeAll(all) {
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function getDuoSession(skinId) {
  return readAll()[skinId] || null;
}

export function startDuoSession(skinId) {
  const all = readAll();
  all[skinId] = {
    skinId,
    seat: "A",
    a: null,
    b: null,
    createdAt: Date.now(),
  };
  writeAll(all);
  return all[skinId];
}

export function setDuoSeat(skinId, seat) {
  const all = readAll();
  const s = all[skinId] || startDuoSession(skinId);
  s.seat = seat === "B" ? "B" : "A";
  all[skinId] = s;
  writeAll(all);
  return s;
}

export function saveDuoResult(skinId, seat, resultId, result) {
  const all = readAll();
  const s = all[skinId] || startDuoSession(skinId);
  const pack = { resultId, result, ts: Date.now() };
  if (seat === "B") s.b = pack;
  else s.a = pack;
  all[skinId] = s;
  writeAll(all);
  return s;
}

export function clearDuoSession(skinId) {
  const all = readAll();
  delete all[skinId];
  writeAll(all);
}

export function duoReady(session) {
  return !!(session?.a?.result && session?.b?.result);
}

/** Simple fit narrative from two score_bands / dims results. */
export function buildDuoCompare(skin, a, b) {
  const at = a?.type || "A";
  const bt = b?.type || "B";
  const tips = [];
  if (a?.mode === "score_bands" && b?.mode === "score_bands") {
    const gap = Math.abs((a.score || 0) - (b.score || 0));
    tips.push(
      gap <= 20
        ? "两人段位接近：共同语言多，也要注意一起「上头」时谁来踩刹车。"
        : "段位落差明显：高分方更易驱动节奏，低分方需要被听见的边界。"
    );
  }
  if (a?.pct && b?.pct && skin.dimensions) {
    let maxGap = 0;
    let gapLabel = "";
    skin.dimensions.forEach((d) => {
      const g = Math.abs((a.pct[d.id] || 0) - (b.pct[d.id] || 0));
      if (g > maxGap) {
        maxGap = g;
        gapLabel = d.label;
      }
    });
    if (gapLabel) {
      tips.push(`反差最大的维是「${gapLabel}」（差约 ${maxGap}%）——讨论时先对齐这一维的期待。`);
    }
  }
  if (!tips.length) {
    tips.push("对照双方标签与维度：找 1 个互补点、1 个易摩擦点，比争论「谁对」更有用。");
  }
  return {
    title: `${at} × ${bt}`,
    tips,
    shareLine: `我们在心象测双人对照：${at} × ${bt}`,
  };
}

export function duoCompareHtml(skin, session, compare) {
  const a = session.a.result;
  const b = session.b.result;
  const dimRows = (skin.dimensions || [])
    .map((d) => {
      const av = a.pct?.[d.id] ?? "—";
      const bv = b.pct?.[d.id] ?? "—";
      return `<tr><td>${d.label}</td><td>${av}${typeof av === "number" ? "%" : ""}</td><td>${bv}${
        typeof bv === "number" ? "%" : ""
      }</td></tr>`;
    })
    .join("");
  return `
    <section class="duo-compare value-block">
      <header class="value-head">
        <p class="group-label">双人对照</p>
        <h2>${compare.title}</h2>
        <p class="muted">同设备先后作答 · 仅供自我探索，不作关系判决。</p>
      </header>
      <div class="duo-cards">
        <article class="duo-card">
          <span class="value-kicker">座位 A</span>
          <strong>${a.type}</strong>
          <p class="muted">${a.quote || ""}</p>
        </article>
        <article class="duo-card">
          <span class="value-kicker">座位 B</span>
          <strong>${b.type}</strong>
          <p class="muted">${b.quote || ""}</p>
        </article>
      </div>
      ${
        dimRows
          ? `<table class="duo-table"><thead><tr><th>维度</th><th>A</th><th>B</th></tr></thead><tbody>${dimRows}</tbody></table>`
          : ""
      }
      <ul class="value-checklist">
        ${compare.tips.map((t) => `<li><span>${t}</span></li>`).join("")}
      </ul>
      <p class="share-line">「${compare.shareLine}」</p>
    </section>
  `;
}
