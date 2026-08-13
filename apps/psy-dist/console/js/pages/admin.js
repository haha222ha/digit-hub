import { api, getUser, clearSession, getToken } from "../api.js";
import { el, flash, clear, copyText, bindCopyButton } from "../ui.js";
import { navigate, linkClick } from "../router.js";

const NAV = [
  { path: "/admin/dashboard", label: "工作台" },
  { path: "/admin/generate-link", label: "生成链接" },
  { path: "/admin/link-management", label: "链接管理" },
  { path: "/admin/unlimited-test", label: "免费测试" },
  { path: "/admin/purchase-quota", label: "购买额度" },
  { path: "/admin/redeem-quota", label: "兑换额度" },
  { path: "/admin/invite-promotion", label: "邀请推广" },
  { path: "/admin/announcements", label: "公告" },
  { path: "/admin/help", label: "帮助" },
  { path: "/admin/customer-service", label: "客服" },
  { path: "/admin/account-settings", label: "账户" },
];

const SUPER_NAV = [
  { path: "/super-admin/dashboard", label: "超管看板" },
  { path: "/super-admin/users", label: "分销商" },
  { path: "/super-admin/orders", label: "订单" },
  { path: "/super-admin/payment-stats", label: "支付统计" },
  { path: "/super-admin/packages", label: "套餐" },
  { path: "/super-admin/redeem-codes", label: "兑换码" },
  { path: "/super-admin/invite-stats", label: "邀请统计" },
  { path: "/super-admin/tests", label: "测题" },
  { path: "/super-admin/announcements", label: "公告" },
  { path: "/super-admin/tutorials", label: "教程" },
  { path: "/super-admin/help-docs", label: "帮助文档" },
  { path: "/super-admin/config", label: "系统配置" },
  { path: "/super-admin/quota-logs", label: "额度日志" },
  { path: "/super-admin/operation-logs", label: "操作日志" },
];

function isSuper() {
  return (getUser() || {}).role === "super_admin";
}

function merchantNav() {
  return NAV.filter((item) => item.path !== "/admin/unlimited-test" || isSuper());
}

function shell(activePath, bodyChildren) {
  const user = getUser() || {};
  const superUser = isSuper();
  const navItems = merchantNav();
  const topItems = [
    ...navItems,
    ...(superUser ? [{ path: "/super-admin/dashboard", label: "超管" }] : []),
  ];
  const nav = el(
    "nav",
    { className: "topnav" },
    topItems.map((item) =>
      el("a", {
        href: item.path,
        className: activePath.startsWith(item.path) || (item.path.startsWith("/super-admin") && activePath.startsWith("/super-admin")) ? "active" : "",
        text: item.label,
        onClick: (e) => linkClick(e, item.path),
      })
    )
  );

  const sideLinks = activePath.startsWith("/super-admin")
    ? [
        el("p", { className: "side-label", text: "超级管理" }),
        ...SUPER_NAV.map((item) =>
          el("a", {
            href: item.path,
            className: `side-link${activePath.startsWith(item.path) ? " active" : ""}`,
            text: item.label,
            onClick: (e) => linkClick(e, item.path),
          })
        ),
        el("p", { className: "side-label", text: "商家后台" }),
        el("a", {
          className: "side-link",
          href: "/admin/dashboard",
          text: "返回工作台",
          onClick: (e) => linkClick(e, "/admin/dashboard"),
        }),
      ]
    : [
        el("p", { className: "side-label", text: "常用" }),
        ...navItems.map((item) =>
          el("a", {
            href: item.path,
            className: `side-link${activePath.startsWith(item.path) ? " active" : ""}`,
            text: item.label,
            onClick: (e) => linkClick(e, item.path),
          })
        ),
        ...(superUser
          ? [
              el("p", { className: "side-label", text: "超管" }),
              el("a", {
                className: "side-link",
                href: "/super-admin/dashboard",
                text: "进入超管后台",
                onClick: (e) => linkClick(e, "/super-admin/dashboard"),
              }),
            ]
          : []),
        el("p", { className: "side-label", text: "说明" }),
        el("p", {
          className: "side-note",
          text: "C 端测完即出完整报告。额度用于生成分销链接。",
        }),
      ];

  return el("div", { className: "shell" }, [
    el("header", { className: "topbar" }, [
      el("a", { className: "brand", href: "/admin/dashboard", onClick: (e) => linkClick(e, "/admin/dashboard") }, [
        el("img", { src: "/images/logo.svg?v=5", alt: "" }),
        el("span", { text: "心象测" }),
      ]),
      nav,
      el("div", { className: "meta" }, [
        el("span", { text: user.username || "已登录" }),
        el("button", {
          className: "btn btn-ghost",
          type: "button",
          text: "退出",
          style: "color:#e8f5f1;border-color:rgba(255,255,255,.2)",
          onClick: () => {
            clearSession();
            navigate("/login", { replace: true });
          },
        }),
      ]),
    ]),
    el("div", { className: "shell-body" }, [
      el("aside", { className: "sidenav" }, sideLinks),
      el("main", { className: "main" }, bodyChildren),
    ]),
  ]);
}

async function loadQuota() {
  try {
    return await api.quotaInfo();
  } catch {
    return { remaining_quota: "—", quota: "—", used_quota: "—" };
  }
}

function quickActions() {
  const cards = [
    el("a", {
      className: "quick-card",
      href: "/admin/generate-link",
      onClick: (e) => linkClick(e, "/admin/generate-link"),
    }, [
      el("strong", { text: "生成链接" }),
      el("span", { text: "选测题 → 一键出链" }),
    ]),
    el("a", {
      className: "quick-card",
      href: "/admin/link-management",
      onClick: (e) => linkClick(e, "/admin/link-management"),
    }, [
      el("strong", { text: "链接管理" }),
      el("span", { text: "已用/剩余 · 有效期" }),
    ]),
  ];
  if (isSuper()) {
    cards.push(
      el("a", {
        className: "quick-card",
        href: "/admin/unlimited-test",
        onClick: (e) => linkClick(e, "/admin/unlimited-test"),
      }, [
        el("strong", { text: "免费测试" }),
        el("span", { text: "超管专用，不耗额度" }),
      ])
    );
  }
  cards.push(
    el("a", {
      className: "quick-card",
      href: "/admin/purchase-quota",
      onClick: (e) => linkClick(e, "/admin/purchase-quota"),
    }, [
      el("strong", { text: "购买额度" }),
      el("span", { text: "套餐下单，额度到账" }),
    ]),
    el("a", {
      className: "quick-card",
      href: "/admin/invite-promotion",
      onClick: (e) => linkClick(e, "/admin/invite-promotion"),
    }, [
      el("strong", { text: "邀请推广" }),
      el("span", { text: "好友首购后按比例返利" }),
    ])
  );
  return el("div", { className: "quick-grid" }, cards);
}

export async function renderDashboard(root) {
  const quota = await loadQuota();
  let linkStats = { total: 0, unused: 0, used: 0 };
  try {
    const data = await api.linksList({ perPage: "100" });
    const links = (data && data.links) || [];
    linkStats.total = links.length;
    linkStats.unused = links.filter((l) => (l.status || "unused") === "unused").length;
    linkStats.used = links.filter((l) => l.status === "used").length;
  } catch {
    /* ignore */
  }

  let testCount = 0;
  try {
    const t = await api.testsList();
    testCount = ((t && t.tests) || []).length;
  } catch {
    /* ignore */
  }

  root.append(
    shell("/admin/dashboard", [
      el("h1", { className: "page-title", text: "工作台" }),
      el("p", {
        className: "page-lead",
        text: `你好，${(getUser() || {}).username || "商家"}。从这里管理测题链接与额度。`,
      }),
      el("div", { className: "stat-row" }, [
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "剩余额度" }),
          el("div", { className: "v", text: String(quota.remaining_quota ?? "—") }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "链接总数" }),
          el("div", { className: "v", text: String(linkStats.total) }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "未使用 / 已使用" }),
          el("div", { className: "v", text: `${linkStats.unused} / ${linkStats.used}` }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "可分发测题" }),
          el("div", { className: "v", text: String(testCount) }),
        ]),
      ]),
      el("h2", { className: "section-h", text: "快捷入口" }),
      quickActions(),
      el("div", { className: "panel tip-panel" }, [
        el("h3", { text: "使用提示" }),
        el("ul", { className: "tip-list" }, [
          el("li", {
            text: isSuper()
              ? "生成链接会消耗额度；超管「免费测试」不消耗额度。"
              : "生成链接会消耗额度；免费测试仅超管可用。",
          }),
          el("li", { text: "链接规则：客户首次开测后计时，默认 3 天内可复测 3 次（以系统配置为准）。开测即扣 1 次。" }),
          el("li", { text: "用户打开分销链接测完即可看完整报告，不分墙。" }),
          el("li", { text: "分销额度兑换码只能在「兑换额度」使用，不能登录或找回密码。" }),
          el("li", { text: "邀请好友：注册只绑定关系；好友首次购额成功后按比例返利。" }),
        ]),
      ]),
    ])
  );
}

export async function renderGenerate(root) {
  const quota = await loadQuota();
  const errHost = el("div");
  const select = el("select", { required: "true" });
  select.append(el("option", { value: "", text: "请选择测评项目" }));
  const count = el("input", { type: "number", min: "1", max: "50", value: "1", required: "true" });
  const resultHost = el("div");
  const btn = el("button", { className: "btn btn-primary", type: "submit", text: "生成链接", style: "width:auto" });
  let ruleText = "首次开测后 3 天内可复测 3 次";
  try {
    const cfg = await api.adminConfigGet();
    if (cfg && cfg.rule_text) ruleText = cfg.rule_text;
  } catch (_) {
    /* ignore */
  }

  try {
    const data = await api.testsList();
    for (const t of (data && data.tests) || []) {
      select.append(
        el("option", {
          value: t.test_code,
          text: `${t.is_hot ? "热门 · " : ""}${t.test_name}${t.question_count ? ` · ${t.question_count}题` : ""}`,
        })
      );
    }
  } catch (e) {
    errHost.append(flash("error", e.message || "测题列表加载失败"));
  }

  const form = el("form", { className: "panel" }, [
    errHost,
    el("div", { className: "grid-2" }, [
      el("div", { className: "field" }, [el("label", { text: "测评项目" }), select]),
      el("div", { className: "field" }, [el("label", { text: "生成数量（1–50）" }), count]),
    ]),
    el("p", {
      className: "muted",
      text: `当前剩余额度：${quota.remaining_quota ?? "—"}。建议先生成 1 条体验。`,
    }),
    el("div", { className: "panel tip-panel", style: "margin:12px 0;padding:12px" }, [
      el("strong", { text: "测试次数和有效期：" }),
      el("span", { text: ` ${ruleText}。生成时不开始计时，客户第一次点「开始测试」后起算。` }),
    ]),
    el("div", { className: "row-actions" }, [
      btn,
      el("a", {
        className: "btn btn-ghost",
        href: "/admin/purchase-quota",
        text: "额度不足？去购买",
        onClick: (e) => linkClick(e, "/admin/purchase-quota"),
      }),
    ]),
    resultHost,
  ]);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errHost.replaceChildren();
    resultHost.replaceChildren();
    btn.disabled = true;
    try {
      const n = Math.min(50, Math.max(1, Number(count.value) || 1));
      const data = await api.generateLinks(select.value, n);
      const links = (data && data.links) || [];
      resultHost.append(flash("ok", `已生成 ${links.length} 条链接`));
      const list = el("div", { className: "link-list" });
      for (const link of links) {
        const url = `${location.origin}/test/${link.test_code || select.value}/${link.token}`;
        const copyBtn = el("button", { className: "btn btn-ghost", type: "button", text: "复制" });
        bindCopyButton(copyBtn, url);
        list.append(el("div", { className: "link-item" }, [el("code", { text: url }), copyBtn]));
      }
      resultHost.append(list);
    } catch (err) {
      errHost.append(flash("error", err.message || "生成失败"));
    } finally {
      btn.disabled = false;
    }
  });

  root.append(
    shell("/admin/generate-link", [
      el("h1", { className: "page-title", text: "生成链接" }),
      el("p", { className: "page-lead", text: "选择测评项目，生成可发给用户的分销链接。" }),
      el("div", { className: "stat-row cols-3" }, [
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "剩余额度" }),
          el("div", { className: "v", text: String(quota.remaining_quota ?? "—") }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "总额度" }),
          el("div", { className: "v", text: String(quota.quota ?? "—") }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "已用" }),
          el("div", { className: "v", text: String(quota.used_quota ?? "—") }),
        ]),
      ]),
      form,
    ])
  );
}

function formatLinkCountdown(link) {
  const first = link.first_used_at || link.firstUsedAt || "";
  const exp = link.expires_at || link.expiresAt || "";
  if (!first) return { text: "尚未开测", hint: "客户首次点开始后计时", tone: "muted" };
  if (!exp) return { text: "已开测", hint: first, tone: "" };
  const raw = String(exp).trim().replace(" ", "T");
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return { text: String(exp), hint: "到期时间", tone: "" };
  const ms = t - Date.now();
  if (ms <= 0) return { text: "已到期", hint: exp, tone: "warn" };
  const totalH = Math.floor(ms / 3600000);
  const d = Math.floor(totalH / 24);
  const h = totalH % 24;
  const text = d >= 1 ? `剩余 ${d} 天 ${h} 小时` : `剩余 ${Math.max(1, totalH)} 小时`;
  return { text, hint: `到期 ${exp}`, tone: d < 1 ? "warn" : "ok" };
}

export async function renderLinks(root) {
  const host = el("div", { className: "panel" });
  root.append(
    shell("/admin/link-management", [
      el("h1", { className: "page-title", text: "链接管理" }),
      el("p", {
        className: "page-lead",
        text: "查看已用/剩余次数与开测后倒计时。开测即扣 1 次；默认 3 天内最多 3 次。",
      }),
      host,
    ])
  );

  try {
    const data = await api.linksList({ perPage: "50" });
    const links = (data && data.links) || [];
    clear(host);
    if (!links.length) {
      host.append(el("div", { className: "empty", text: "还没有链接。去「生成链接」创建第一条。" }));
      return;
    }
    const unused = links.filter((l) => (l.status || "unused") === "unused").length;
    const active = links.filter((l) => {
      const used = Number(l.used_count ?? l.usedCount ?? 0);
      const maxUses = Number(l.max_uses ?? l.maxUses ?? 3);
      const st = l.status || "unused";
      return st !== "revoked" && st !== "expired" && used < maxUses;
    }).length;
    host.append(
      el("div", { className: "mini-stats" }, [
        el("span", { text: `共 ${links.length} 条` }),
        el("span", { text: `未开测 ${unused}` }),
        el("span", { text: `仍可用 ${active}` }),
      ])
    );
    const table = el("table", { className: "data" });
    table.append(
      el("thead", {}, [
        el("tr", {}, [
          el("th", { text: "测题" }),
          el("th", { text: "链接" }),
          el("th", { text: "已用 / 剩余" }),
          el("th", { text: "有效期" }),
          el("th", { text: "状态" }),
          el("th", { text: "操作" }),
        ]),
      ])
    );
    const tbody = el("tbody");
    for (const link of links) {
      const token = link.token || "";
      const code = link.test_code || "";
      const url = `${location.origin}/test/${code}/${token}`;
      const status = link.status || "unused";
      const used = Number(link.used_count ?? link.usedCount ?? 0);
      const maxUses = Number(link.max_uses ?? link.maxUses ?? 3);
      const remain = Math.max(0, maxUses - used);
      const statusLabel =
        { unused: "未使用", used: "已使用", expired: "已过期", revoked: "已撤销" }[status] || status;
      const tagClass = status === "unused" ? "tag-ok" : status === "revoked" || status === "expired" ? "tag-warn" : "tag";
      const usesClass = remain <= 0 ? "tag tag-warn" : remain === 1 ? "tag tag-warn" : "tag tag-ok";
      const cd = formatLinkCountdown(link);
      const cdClass =
        cd.tone === "warn" ? "tag tag-warn" : cd.tone === "ok" ? "tag tag-ok" : "tag";
      const copyBtn = el("button", { className: "btn btn-ghost", type: "button", text: "复制" });
      bindCopyButton(copyBtn, url);
      const actions = el("div", { className: "row-actions" }, [copyBtn]);
      if (status !== "revoked" && link.id) {
        actions.append(
          el("button", {
            className: "btn btn-ghost",
            type: "button",
            text: "撤销",
            onClick: async () => {
              if (!confirm("确认撤销该链接？")) return;
              try {
                await api.revokeLink(link.id);
                navigate("/admin/link-management", { replace: true });
              } catch (e) {
                alert(e.message || "撤销失败");
              }
            },
          })
        );
      }
      tbody.append(
        el("tr", {}, [
          el("td", { text: code }),
          el("td", {}, [el("div", { className: "url-cell", text: url })]),
          el("td", {}, [
            el("div", { className: "link-metric" }, [
              el("span", { className: usesClass, text: `${used} / 剩 ${remain}` }),
              el("span", { className: "muted small", text: `上限 ${maxUses}` }),
            ]),
          ]),
          el("td", {}, [
            el("div", { className: "link-metric" }, [
              el("span", { className: cdClass, text: cd.text }),
              el("span", { className: "muted small", text: cd.hint }),
            ]),
          ]),
          el("td", {}, [el("span", { className: `tag ${tagClass}`, text: statusLabel })]),
          el("td", {}, [actions]),
        ])
      );
    }
    table.append(tbody);
    host.append(el("div", { className: "table-wrap" }, [table]));
  } catch (e) {
    clear(host);
    host.append(flash("error", e.message || "加载失败"));
  }
}

export async function renderUnlimited(root) {
  if (!isSuper()) {
    root.append(
      shell("/admin/dashboard", [
        el("h1", { className: "page-title", text: "免费测试" }),
        flash("error", "免费测试仅超级管理员可用。普通商家请购买或兑换额度后生成链接。"),
      ])
    );
    return;
  }
  const errHost = el("div");
  const select = el("select", { required: "true" });
  select.append(el("option", { value: "", text: "请选择测评项目" }));
  const resultHost = el("div");
  try {
    const data = await api.testsList();
    for (const t of (data && data.tests) || []) {
      select.append(el("option", { value: t.test_code, text: t.test_name }));
    }
  } catch (e) {
    errHost.append(flash("error", e.message || "测题加载失败"));
  }
  const btn = el("button", { className: "btn btn-primary", type: "submit", text: "开启免费测试", style: "width:auto" });
  const form = el("form", { className: "panel" }, [
    errHost,
    el("p", { className: "muted", text: "免费测试不消耗额度，适合自己体验或演示给客户看。" }),
    el("div", { className: "field" }, [el("label", { text: "测评项目" }), select]),
    el("div", { className: "row-actions" }, [btn]),
    resultHost,
  ]);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errHost.replaceChildren();
    resultHost.replaceChildren();
    btn.disabled = true;
    try {
      const session = await api.unlimitedStart(select.value);
      const token = session.token || session.session_token || "";
      const code = session.test_code || select.value;
      const url = `${location.origin}/tests/${code}/index.html?unlimited=true&token=${encodeURIComponent(token)}`;
      resultHost.append(flash("ok", "已开启免费测试会话"));
      const copyBtn = el("button", { className: "btn btn-ghost", type: "button", text: "复制" });
      bindCopyButton(copyBtn, url);
      resultHost.append(
        el("div", { className: "link-item" }, [
          el("code", { text: url }),
          copyBtn,
          el("a", { className: "btn btn-primary", href: url, target: "_blank", text: "打开测试", style: "width:auto" }),
        ])
      );
    } catch (err) {
      errHost.append(flash("error", err.message || "开启失败"));
    } finally {
      btn.disabled = false;
    }
  });

  root.append(
    shell("/admin/unlimited-test", [
      el("h1", { className: "page-title", text: "免费测试" }),
      el("p", { className: "page-lead", text: "不耗额度体验完整测评流程。" }),
      form,
    ])
  );
}

export async function renderPurchase(root) {
  const host = el("div");
  const payMethod = el("select");
  payMethod.append(
    el("option", { value: "wxpay", text: "微信支付" }),
    el("option", { value: "alipay", text: "支付宝" })
  );
  root.append(
    shell("/admin/purchase-quota", [
      el("h1", { className: "page-title", text: "购买额度" }),
      el("p", {
        className: "page-lead",
        text: "在线支付后额度自动到账。若你是被邀请注册，首购将给邀请人返利（默认购额 20%）。",
      }),
      el("div", { className: "panel", style: "margin-bottom:16px" }, [
        el("div", { className: "field" }, [el("label", { text: "支付方式" }), payMethod]),
      ]),
      host,
    ])
  );

  async function pollPaid(orderNo) {
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      try {
        const o = await api.orderDetail(orderNo);
        const st = (o && (o.status || (o.order && o.order.status))) || "";
        if (st === "paid" || st === "fulfilled") return true;
      } catch {
        /* ignore */
      }
    }
    return false;
  }

  try {
    const [pkgData, methods, cfg] = await Promise.all([
      api.packagesList().catch(() => ({ packages: [] })),
      api.purchaseMethods().catch(() => ({})),
      api.customerService().catch(() => ({})),
    ]);
    const packages = (pkgData && pkgData.packages) || [];
    if (!packages.length) {
      host.append(
        el("div", { className: "panel" }, [
          flash("ok", "当前未配置在线套餐，或暂不可购买。"),
          el("p", { className: "muted", text: "请使用「兑换额度」，或联系客服获取额度码。" }),
          el("a", {
            className: "btn btn-primary",
            href: "/admin/redeem-quota",
            text: "去兑换额度",
            style: "width:auto;display:inline-flex;margin-top:12px",
            onClick: (e) => linkClick(e, "/admin/redeem-quota"),
          }),
        ])
      );
      return;
    }
    const rebate = cfg.invite_rebate_percent || "20";
    host.append(
      el("p", {
        className: "muted",
        text: `邀请返利比例：${rebate}%（仅被邀请用户的首次购额）。支付完成后可刷新工作台查看额度。`,
      })
    );
    const grid = el("div", { className: "pkg-grid" });
    for (const p of packages) {
      const id = p.id || p.package_id || p.list_id;
      const name = p.name || p.title || `套餐 ${id}`;
      const quota = p.quota_amount || p.quota || p.credits || "—";
      const price = p.price_yuan != null ? p.price_yuan : p.price || p.amount || "—";
      const btn = el("button", {
        className: "btn btn-primary",
        type: "button",
        text: "立即支付",
        style: "width:auto",
      });
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const method = payMethod.value || "wxpay";
        try {
          const created = await api.createOrder(id, method);
          const order = (created && created.order) || created || {};
          const orderNo = order.order_no || order.orderNo;
          if (!orderNo) throw new Error("未返回订单号");
          const pay = await api.startPay(orderNo, method);
          if (pay && pay.paid) {
            alert("支付成功，额度已到账");
            navigate("/admin/dashboard");
            return;
          }
          const payUrl = pay.pay_data || pay.pay_url || pay.code_url || "";
          if (payUrl) {
            window.open(payUrl, "_blank");
            host.prepend(flash("ok", `订单 ${orderNo} 已打开支付页，正在检测支付结果…`));
            const ok = await pollPaid(orderNo);
            if (ok) {
              alert("支付成功，额度已到账");
              navigate("/admin/dashboard");
            } else {
              alert("尚未检测到支付完成。若已付款，请稍后刷新工作台；也可在兑换页用码充值。");
            }
          } else {
            alert("订单已创建：" + orderNo + "。未获取到支付链接，请联系客服或改用兑换码。");
          }
        } catch (e) {
          alert(e.message || "下单失败，请改用兑换码");
        } finally {
          btn.disabled = false;
        }
      });
      grid.append(
        el("div", { className: "pkg-card" }, [
          el("h3", { text: name }),
          el("p", { className: "pkg-quota", text: `${quota} 额度` }),
          el("p", {
            className: "pkg-price",
            text: typeof price === "number" ? `¥ ${price}` : String(price),
          }),
          p.subtitle ? el("p", { className: "muted", text: p.subtitle }) : null,
          btn,
        ])
      );
    }
    host.append(grid);
    if (methods && (methods.xianyu || methods.offline)) {
      host.append(
        el("p", { className: "muted", text: "也可通过闲鱼/线下方式购码后，在「兑换额度」使用。" })
      );
    }
  } catch (e) {
    host.append(flash("error", e.message || "加载套餐失败"));
  }
}

export async function renderRedeem(root) {
  const errHost = el("div");
  const input = el("input", { required: "true", placeholder: "输入额度授权码" });
  const btn = el("button", { className: "btn btn-primary", type: "submit", text: "兑换", style: "width:auto" });
  const form = el("form", { className: "panel" }, [
    errHost,
    el("p", {
      className: "muted",
      text: "兑换成功后，该授权码会绑定到你的账号，也可用于「授权码登录 / 找回密码」。",
    }),
    el("div", { className: "field" }, [el("label", { text: "兑换码" }), input]),
    el("div", { className: "row-actions" }, [btn]),
  ]);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errHost.replaceChildren();
    btn.disabled = true;
    try {
      const data = await api.redeem(input.value.trim());
      errHost.append(
        flash("ok", `兑换成功，增加 ${data.added ?? ""} 额度。剩余 ${data.remaining_quota ?? "—"}`)
      );
      input.value = "";
    } catch (err) {
      errHost.append(flash("error", err.message || "兑换失败"));
    } finally {
      btn.disabled = false;
    }
  });

  root.append(
    shell("/admin/redeem-quota", [
      el("h1", { className: "page-title", text: "兑换额度" }),
      el("p", { className: "page-lead", text: "使用授权码为账户充入测试额度。" }),
      form,
    ])
  );
}

export async function renderAccount(root) {
  const params = new URLSearchParams(location.search);
  const fromCode = params.get("from") === "code";
  const errHost = el("div");
  if (fromCode) errHost.append(flash("ok", "授权码登录成功。请设置新密码，便于下次用账号密码登录。"));

  const cur = el("input", { type: "password", autocomplete: "current-password" });
  const nw = el("input", { type: "password", required: "true", minlength: "6", autocomplete: "new-password" });
  const nw2 = el("input", { type: "password", required: "true", minlength: "6", autocomplete: "new-password" });
  const btn = el("button", { className: "btn btn-primary", type: "submit", text: "保存新密码", style: "width:auto" });
  const form = el("form", { className: "panel" }, [
    errHost,
    el("div", { className: "field" }, [
      el("label", { text: fromCode ? "当前密码（授权码登录可留空）" : "当前密码" }),
      cur,
    ]),
    el("div", { className: "field" }, [el("label", { text: "新密码" }), nw]),
    el("div", { className: "field" }, [el("label", { text: "确认新密码" }), nw2]),
    el("div", { className: "row-actions" }, [btn]),
  ]);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (nw.value !== nw2.value) {
      errHost.replaceChildren(flash("error", "两次密码不一致"));
      return;
    }
    btn.disabled = true;
    try {
      await api.changePassword(nw.value, fromCode ? "" : cur.value);
      errHost.replaceChildren(flash("ok", "密码已更新"));
      cur.value = "";
      nw.value = "";
      nw2.value = "";
    } catch (err) {
      errHost.replaceChildren(flash("error", err.message || "修改失败"));
    } finally {
      btn.disabled = false;
    }
  });

  const user = getUser() || {};
  const quota = await loadQuota();
  root.append(
    shell("/admin/account-settings", [
      el("h1", { className: "page-title", text: "账户设置" }),
      el("p", { className: "page-lead", text: "管理登录密码。无需绑定邮箱。" }),
      el("div", { className: "stat-row cols-3" }, [
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "用户名" }),
          el("div", { className: "v", style: "font-size:1.2rem", text: user.username || "—" }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "角色" }),
          el("div", { className: "v", style: "font-size:1.2rem", text: user.role || "admin" }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "剩余额度" }),
          el("div", { className: "v", text: String(quota.remaining_quota ?? "—") }),
        ]),
      ]),
      form,
    ])
  );
}

export async function renderInvite(root) {
  const errHost = el("div");
  let info = { invite_code: "", invite_url: "", total_invites: 0, total_rewards: 0 };
  let records = [];
  try {
    info = (await api.inviteInfo()) || info;
    const rec = await api.inviteRecords({ page: 1, perPage: 50 });
    records = (rec && rec.records) || [];
  } catch (err) {
    errHost.append(flash("error", err.message || "加载邀请信息失败"));
  }

  const urlInput = el("input", { readonly: "true", value: info.invite_url || "" });
  const copyBtn = el("button", {
    className: "btn btn-primary",
    type: "button",
    text: "复制邀请链接",
    style: "width:auto",
    onClick: async () => {
      const url = info.invite_url || "";
      if (!url) {
        errHost.replaceChildren(flash("error", "邀请链接为空"));
        return;
      }
      try {
        await copyText(url);
        errHost.replaceChildren(flash("ok", "已复制到剪贴板"));
      } catch {
        urlInput.focus();
        urlInput.select();
        errHost.replaceChildren(flash("error", "自动复制失败，请手动全选上方链接复制"));
      }
    },
  });

  const rows =
    records.length === 0
      ? [el("p", { className: "muted", text: "暂无邀请记录。分享链接后，好友注册即可获得返利额度。" })]
      : [
          el("table", { className: "data-table" }, [
            el("thead", {}, [
              el("tr", {}, [
                el("th", { text: "时间" }),
                el("th", { text: "被邀请人" }),
                el("th", { text: "返利额度" }),
              ]),
            ]),
            el(
              "tbody",
              {},
              records.map((r) =>
                el("tr", {}, [
                  el("td", { text: String(r.rewarded_at || "—") }),
                  el("td", { text: r.invitee_username || "—" }),
                  el("td", { text: r.reward_quota != null ? `+${r.reward_quota}` : "—" }),
                ])
              )
            ),
          ]),
        ];

  root.append(
    shell("/admin/invite-promotion", [
      el("h1", { className: "page-title", text: "邀请推广" }),
      el("p", {
        className: "page-lead",
        text: "分享专属链接：好友注册双方各得 5 点额度；好友首次购买额度时，你再获购额 20% 返利。",
      }),
      errHost,
      el("div", { className: "stat-row cols-3" }, [
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "邀请人数" }),
          el("div", { className: "v", text: String(info.total_invites || 0) }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "累计返利额度" }),
          el("div", { className: "v", text: String(info.total_rewards || 0) }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "我的邀请码" }),
          el("div", { className: "v", style: "font-size:1.2rem", text: info.invite_code || "—" }),
        ]),
      ]),
      el("div", { className: "panel" }, [
        el("h3", { text: "专属邀请链接" }),
        el("div", { className: "field" }, [urlInput]),
        el("div", { className: "row-actions" }, [copyBtn]),
        el("p", {
          className: "muted",
          text: "也可让好友在注册页填写邀请码。注册仅绑定邀请关系；好友首次购额成功后，按配置比例自动发放首购返利。",
        }),
      ]),
      el("div", { className: "panel" }, [el("h3", { text: "邀请记录" }), ...rows]),
    ])
  );
}

export { shell, isSuper };

export async function renderAnnouncements(root) {
  const errHost = el("div");
  let items = [];
  try {
    const data = await api.announcementsList();
    items = (data && (data.announcements || data.list)) || [];
    await api.announcementsMarkAll().catch(() => {});
  } catch (err) {
    errHost.append(flash("error", err.message || "加载失败"));
  }
  root.append(
    shell("/admin/announcements", [
      el("h1", { className: "page-title", text: "公告" }),
      el("p", { className: "page-lead", text: "平台通知与运营说明。" }),
      errHost,
      items.length === 0
        ? el("p", { className: "muted", text: "暂无公告" })
        : el(
            "div",
            { className: "stack" },
            items.map((a) =>
              el("div", { className: "panel" }, [
                el("h3", { text: a.title || "公告" }),
                el("p", { className: "muted", text: String(a.created_at || a.updated_at || "") }),
                el("div", { html: String(a.content || "").replace(/\n/g, "<br/>") }),
              ])
            )
          ),
    ])
  );
}

export async function renderHelp(root) {
  const errHost = el("div");
  let docs = [];
  let tuts = [];
  try {
    const [d, t] = await Promise.all([api.helpDocsList(), api.tutorialsList()]);
    docs = (d && (d.documents || d.list)) || [];
    tuts = (t && (t.tutorials || t.list)) || [];
  } catch (err) {
    errHost.append(flash("error", err.message || "加载失败"));
  }
  root.append(
    shell("/admin/help", [
      el("h1", { className: "page-title", text: "帮助中心" }),
      el("p", { className: "page-lead", text: "使用说明与平台教程。" }),
      errHost,
      el("h2", { className: "section-h", text: "文档" }),
      docs.length === 0
        ? el("p", { className: "muted", text: "暂无帮助文档" })
        : el(
            "div",
            { className: "stack" },
            docs.map((d) =>
              el("div", { className: "panel" }, [
                el("h3", { text: d.title || "文档" }),
                el("div", { html: String(d.content || "").replace(/\n/g, "<br/>") }),
              ])
            )
          ),
      el("h2", { className: "section-h", text: "教程" }),
      tuts.length === 0
        ? el("p", { className: "muted", text: "暂无教程" })
        : el(
            "div",
            { className: "stack" },
            tuts.map((t) =>
              el("div", { className: "panel" }, [
                el("h3", { text: t.title || "教程" }),
                el("p", { className: "muted", text: t.description || "" }),
                t.tutorial_link
                  ? el("a", {
                      href: t.tutorial_link,
                      target: "_blank",
                      text: "打开教程链接",
                      className: "btn btn-primary",
                      style: "width:auto",
                    })
                  : null,
                t.access_password
                  ? el("p", { className: "muted", text: `访问密码：${t.access_password}` })
                  : null,
              ])
            )
          ),
    ])
  );
}

export async function renderCustomerService(root) {
  const errHost = el("div");
  let cfg = {};
  try {
    cfg = (await api.customerService()) || {};
  } catch (err) {
    errHost.append(flash("error", err.message || "加载失败"));
  }
  root.append(
    shell("/admin/customer-service", [
      el("h1", { className: "page-title", text: "客服" }),
      el("p", { className: "page-lead", text: "遇到问题可联系平台客服。" }),
      errHost,
      el("div", { className: "stat-row cols-3" }, [
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "微信" }),
          el("div", { className: "v", style: "font-size:1.1rem", text: cfg.customer_service_wechat || "—" }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "服务时间" }),
          el("div", { className: "v", style: "font-size:1rem", text: cfg.customer_service_hours || "—" }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "响应" }),
          el("div", {
            className: "v",
            style: "font-size:1rem",
            text: cfg.customer_service_response_time || "—",
          }),
        ]),
      ]),
      cfg.customer_service_qrcode
        ? el("div", { className: "panel" }, [
            el("h3", { text: "客服二维码" }),
            el("img", { src: cfg.customer_service_qrcode, alt: "客服二维码", style: "max-width:220px" }),
          ])
        : null,
      cfg.xianyu_shop_link
        ? el("div", { className: "panel" }, [
            el("h3", { text: "闲鱼店铺" }),
            el("a", { href: cfg.xianyu_shop_link, target: "_blank", text: cfg.xianyu_shop_link }),
          ])
        : null,
    ])
  );
}

export function requireAuth() {
  return Boolean(getToken());
}
