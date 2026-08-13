export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "className") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function flash(type, message) {
  return el("div", { className: `flash flash-${type}`, text: message });
}

export function showToast(message, type = "ok") {
  const node = el("div", { className: `toast toast-${type}`, text: message });
  document.body.appendChild(node);
  requestAnimationFrame(() => node.classList.add("show"));
  setTimeout(() => {
    node.classList.remove("show");
    setTimeout(() => node.remove(), 320);
  }, 3200);
}

export function isWechatBrowser() {
  return /MicroMessenger/i.test(navigator.userAgent || "");
}

export function openModal(title, bodyChildren, { onClose } = {}) {
  const backdrop = el("div", { className: "modal-backdrop" });
  const closeBtn = el("button", {
    className: "modal-close",
    type: "button",
    text: "×",
    "aria-label": "关闭",
  });
  const panel = el("div", { className: "modal-panel" }, [
    el("div", { className: "modal-header" }, [el("h3", { text: title }), closeBtn]),
    el("div", { className: "modal-body" }, bodyChildren),
  ]);
  backdrop.append(panel);
  function close() {
    backdrop.remove();
    if (onClose) onClose();
  }
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  document.body.appendChild(backdrop);
  return { close, backdrop };
}

/** 右侧抽屉（移动端自底部滑出） */
export function openDrawer(title, bodyChildren, { onClose } = {}) {
  const backdrop = el("div", { className: "drawer-backdrop" });
  const closeBtn = el("button", {
    className: "drawer-close",
    type: "button",
    text: "×",
    "aria-label": "关闭",
  });
  const panel = el("div", { className: "drawer-panel" }, [
    el("div", { className: "drawer-header" }, [el("h3", { text: title }), closeBtn]),
    el("div", { className: "drawer-body" }, bodyChildren),
  ]);
  backdrop.append(panel);
  function close() {
    backdrop.classList.remove("show");
    setTimeout(() => {
      backdrop.remove();
      if (onClose) onClose();
    }, 280);
  }
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add("show"));
  return { close, backdrop };
}

/** 复制到剪贴板：优先 Clipboard API，失败则 textarea + execCommand。 */
export async function copyText(text) {
  const value = String(text || "");
  if (!value) throw new Error("内容为空");
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      /* fall through */
    }
  }
  const ta = document.createElement("textarea");
  ta.value = value;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, value.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } finally {
    document.body.removeChild(ta);
  }
  if (!ok) throw new Error("复制失败，请手动长按链接复制");
  return true;
}

/** 按钮点击复制：成功时短暂改文案，失败 alert。 */
export function bindCopyButton(btn, getText, { okText = "已复制", failPrefix = "复制失败" } = {}) {
  if (!btn) return;
  const original = btn.textContent || "复制";
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = typeof getText === "function" ? getText() : getText;
    try {
      await copyText(text);
      btn.textContent = okText;
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = original;
        btn.disabled = false;
      }, 1500);
    } catch (err) {
      alert((err && err.message) || `${failPrefix}：请手动复制`);
    }
  });
}
