(() => {
  const host = document.getElementById("get-root");
  if (!host) return;

  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  function renderOnline(plans, urls) {
    const list = (plans || [])
      .map(
        (p) =>
          `<li>${esc(p.label)} · ¥${esc(p.amount || p.price_yuan)} · ${esc(p.quota_amount || "")} 次</li>`
      )
      .join("");
    return `
      <article class="get-card featured">
        <span class="tag">官网</span>
        <h2>在线支付</h2>
        <ul>
          <li>注册即买 · 微信 / 支付宝</li>
          <li>额度即时到账</li>
        </ul>
        ${list ? `<ul>${list}</ul>` : ""}
        <a class="btn primary" href="${esc(urls.register || "/register?next=/admin/purchase-quota")}">免费注册并购买</a>
        <p class="muted" style="font-size:0.88rem;margin:0">已有账号？<a href="${esc(urls.login || "/login?next=/admin/purchase-quota")}">登录</a> 后去「购买额度」</p>
      </article>`;
  }

  function renderXianyu(data) {
    const skus = data.xianyu_skus || [];
    const rows = skus
      .map(
        (s) =>
          `<div class="get-xianyu-row">
            <span><strong>${esc(s.label)}</strong>${s.price_hint ? ` · ${esc(s.price_hint)}` : ""}</span>
            <a href="${esc(s.link)}" target="_blank" rel="noopener noreferrer">去闲鱼下单 →</a>
          </div>`
      )
      .join("");
    const qr = data.xianyu_qrcode
      ? `<img src="${esc(data.xianyu_qrcode)}" alt="闲鱼店铺" style="max-width:160px;display:block;margin:0.5rem auto 0;border-radius:8px" />`
      : "";
    return `
      <article class="get-card">
        <span class="tag">闲鱼</span>
        <h2>闲鱼购买</h2>
        <ul>
          <li>渠道专享价 · 激活码自动发货</li>
          <li>付款后复制兑换码</li>
          <li>登录后台 →「兑换额度」到账</li>
        </ul>
        <div class="get-xianyu-skus">${rows || `<p class="muted">闲鱼链接待配置，请联系客服</p>`}</div>
        ${qr}
        <a class="btn secondary" href="${esc((data.urls && data.urls.redeem) || "/admin/redeem-quota")}">已有码？去兑换额度</a>
      </article>`;
  }

  function renderPage(data) {
    const urls = data.urls || {};
    const channels = [];
    if (data.xianyu_enabled !== false) channels.push(renderXianyu(data));
    if (data.online_enabled !== false) channels.push(renderOnline(data.online_plans, urls));

    host.innerHTML = `
      <section class="get-hero">
        <h1>${esc(data.hero_title)}</h1>
        <p>${esc(data.hero_subtitle)}</p>
      </section>
      <div class="get-channels">${channels.join("") || "<p class=\"get-loading\">暂无可用的购买通道</p>"}</div>
      <section class="get-steps">
        <h3>三步上手</h3>
        <ol>
          <li>选择上方通道：闲鱼购码 或 官网在线支付</li>
          <li>注册 / 登录 <a href="https://psy.xhs365.cn/login">psy.xhs365.cn</a> 商家后台</li>
          <li>「兑换额度」或购买到账后 →「生成链接」→ 在小红书 / 闲鱼卖给 C 端</li>
        </ol>
      </section>
      <p class="get-note">娱乐向趣味测评，非医疗诊断 · 客服 ${esc(data.support_email || "support@xhs365.cn")} · <a href="/">返回首页</a></p>`;
  }

  host.innerHTML = '<p class="get-loading">加载购买选项…</p>';
  fetch("/api/public/purchase-options", { headers: { Accept: "application/json" } })
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => {
      const data = (body && (body.data || body)) || {};
      if (!data.hero_title && !data.online_plans) throw new Error("empty");
      renderPage(data);
    })
    .catch(() => {
      renderPage({
        hero_title: "心象测 · 测评链接分销 SaaS",
        hero_subtitle: "100+ 趣味测题 · 云端生成链接 · 适合小红书/闲鱼二次分发 · 非源码",
        online_enabled: true,
        xianyu_enabled: false,
        online_plans: [
          { label: "分销额度·100次", amount: "59.00", quota_amount: 100 },
          { label: "分销额度·500次", amount: "199.00", quota_amount: 500 },
        ],
        urls: {
          register: "/register?next=/admin/purchase-quota",
          login: "/login",
          redeem: "/admin/redeem-quota",
        },
        support_email: "support@xhs365.cn",
      });
    });
})();
