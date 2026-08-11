/** Session helpers: shuffle options, reverse-aware answer map, exit recovery. */

export function shuffleIndices(n, rng = Math.random) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Build per-question option order; persist in progress. */
export function buildOptionOrders(questions, existing) {
  if (existing?.length === questions.length) return existing;
  return questions.map((q) => shuffleIndices(q.o.length));
}

export function displayOptions(q, order) {
  const ord = order || q.o.map((_, i) => i);
  return ord.map((origIdx) => ({ ...q.o[origIdx], origIdx }));
}

export function effectiveScore(q, origIdx) {
  const opt = q.o[origIdx];
  if (!opt) return 0;
  let s = opt.s ?? 0;
  if (q.reverse) {
    const maxS = Math.max(...q.o.map((o) => o.s));
    const minS = Math.min(...q.o.map((o) => o.s));
    s = maxS + minS - s;
  }
  return s;
}

export function exitModalHtml() {
  return `
    <div class="drawer-backdrop open" id="exitBd"></div>
    <div class="drawer open" id="exitDrawer" role="dialog" aria-labelledby="exitTitle">
      <h3 id="exitTitle" style="font-family:var(--font-display);margin:0 0 8px">先保存进度？</h3>
      <p class="muted">中途离开不会丢答卷。回来可从本题继续，或清空重来。</p>
      <div class="stack" style="margin-top:16px">
        <button class="btn btn-primary btn-block" id="exitStay">继续作答</button>
        <button class="btn btn-ember btn-block" id="exitLeave">保存并离开</button>
        <button class="btn btn-ghost btn-block" id="exitReset">清空进度重测</button>
      </div>
    </div>
  `;
}
