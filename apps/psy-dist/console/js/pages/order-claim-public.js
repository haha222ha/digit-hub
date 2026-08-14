import { el } from "../ui.js";

function setStatus(node, text, kind) {
  if (!text) {
    node.hidden = true;
    node.textContent = "";
    node.className = "status";
    return;
  }
  node.hidden = false;
  node.textContent = text;
  node.className = "status" + (kind ? " is-" + kind : "");
}

/**
 * 买家公开领链接。无登录、无商家工作台。
 */
export function renderPublicOrderClaim(root) {
  document.title = "订单领取测评链接 · 心象测";
  if (!document.querySelector('link[data-order-claim-css]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/order-claim.css?v=20260814oc3";
    link.setAttribute("data-order-claim-css", "1");
    document.head.appendChild(link);
  }

  const orderInput = el("input", {
    id: "orderId",
    name: "orderId",
    type: "text",
    inputmode: "numeric",
    autocomplete: "off",
    placeholder: "粘贴或输入订单号",
    maxlength: "64",
  });
  const claimBtn = el("button", { type: "button", id: "claimBtn", className: "btn-primary", text: "领取链接" });
  const statusMsg = el("p", { id: "statusMsg", className: "status", role: "status" });
  statusMsg.hidden = true;
  const resultUrl = el("input", { id: "resultUrl", type: "text", readOnly: "readonly" });
  const copyBtn = el("button", { type: "button", id: "copyBtn", className: "btn-secondary", text: "复制" });
  const openLink = el("a", {
    id: "openLink",
    className: "open-link",
    href: "#",
    target: "_blank",
    rel: "noopener noreferrer",
    text: "打开测评",
  });
  const resultBox = el("div", { id: "resultBox", className: "result" }, [
    el("label", { className: "field-label", for: "resultUrl", text: "测评链接" }),
    el("div", { className: "field-row" }, [resultUrl, copyBtn]),
    openLink,
  ]);
  resultBox.hidden = true;

  async function claim() {
    const orderId = String(orderInput.value || "").trim();
    if (!orderId) {
      setStatus(statusMsg, "请输入订单号", "error");
      orderInput.focus();
      return;
    }
    claimBtn.disabled = true;
    setStatus(statusMsg, "正在领取…");
    resultBox.hidden = true;
    try {
      const res = await fetch("/api/order-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const body = await res.json().catch(() => ({}));
      const ok = body && Number(body.code) === 200;
      const data = body && body.data != null ? body.data : body;
      if (!ok) {
        setStatus(statusMsg, (body && (body.message || body.msg)) || "领取失败，请稍后重试", "error");
        return;
      }
      const url = String((data && data.url) || "").trim();
      if (!url) {
        setStatus(statusMsg, "未返回链接，请联系客服", "error");
        return;
      }
      resultUrl.value = url;
      openLink.href = url;
      resultBox.hidden = false;
      setStatus(statusMsg, (body && body.message) || "领取成功", "ok");
    } catch {
      setStatus(statusMsg, "网络异常，请稍后重试", "error");
    } finally {
      claimBtn.disabled = false;
    }
  }

  claimBtn.addEventListener("click", claim);
  copyBtn.addEventListener("click", async () => {
    const url = String(resultUrl.value || "").trim();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setStatus(statusMsg, "已复制到剪贴板", "ok");
    } catch {
      resultUrl.select();
      document.execCommand("copy");
      setStatus(statusMsg, "已复制到剪贴板", "ok");
    }
  });
  orderInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      claim();
    }
  });

  const preset = new URLSearchParams(location.search).get("orderId") || new URLSearchParams(location.search).get("order_id") || "";
  if (preset) orderInput.value = preset;

  root.append(
    el("div", { className: "atmosphere", "aria-hidden": "true" }),
    el("main", { className: "claim-shell" }, [
      el("header", { className: "claim-brand" }, [
        el("span", {
          className: "brand-mark-wrap",
          html: '<svg class="brand-mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="40" height="40" aria-hidden="true" focusable="false"><circle cx="73" cy="100" r="54" fill="#0F766E"/><circle cx="127" cy="100" r="54" fill="#0F766E"/><path fill="#FFFFFF" d="M100 46.14 A54 54 0 0 0 100 153.86 A54 54 0 0 0 100 46.14 Z"/><path fill="#B8952E" d="M100 90.5 C104.8 96.8 104.8 105.2 100 111.5 C95.2 105.2 95.2 96.8 100 90.5 Z"/></svg>',
        }),
        el("div", {}, [
          el("p", { className: "brand-name", text: "心象测" }),
          el("p", { className: "brand-sub", text: "订单领取测评链接" }),
        ]),
      ]),
      el("section", { className: "claim-panel", "aria-labelledby": "claim-title" }, [
        el("h1", { id: "claim-title", text: "输入订单号领取" }),
        el("p", { className: "hint", text: "请填写购买时的订单号。同一订单始终对应同一条测评链接。" }),
        el("label", { className: "field-label", for: "orderId", text: "订单号" }),
        el("div", { className: "field-row" }, [orderInput, claimBtn]),
        statusMsg,
        resultBox,
      ]),
      el("p", { className: "foot-note", text: "如提示订单未同步，请稍候再试，或联系商家客服。" }),
    ])
  );
}
