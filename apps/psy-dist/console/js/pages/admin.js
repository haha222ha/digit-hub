import { api, getUser, clearSession, getToken } from "../api.js";
import { el, flash, clear } from "../ui.js";
import { navigate, linkClick } from "../router.js";

const NAV = [
  { path: "/admin/dashboard", label: "工作台" },
  { path: "/admin/generate-link", label: "生成链接" },
  { path: "/admin/link-management", label: "链接管理" },
  { path: "/admin/unlimited-test", label: "免费测试" },
  { path: "/admin/purchase-quota", label: "购买额度" },
  { path: "/admin/redeem-quota", label: "兑换额度" },
  { path: "/admin/invite-promotion", label: "邀请推广" },
  { path: "/admin/account-settings", label: "账户" },
];

const SUPER_NAV = [
  { path: "/super-admin/dashboard", label: "超管看板" },
  { path: "/super-admin/users", label: "分销商" },
  { path: "/super-admin/orders", label: "订单" },
  { path: "/super-admin/invite-stats", label: "邀请统计" },
  { path: "/super-admin/tests", label: "测题" },
  { path: "/super-admin/quota-logs", label: "额度日志" },
];

function isSuper() {
  return (getUser() || {}).role === "super_admin";
}

function shell(activePath, bodyChildren) {
  const user = getUser() || {};
  const superUser = isSuper();
  const topItems = [
    ...NAV,
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
        ...NAV.map((item) =>
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
        el("img", { src: "/images/logo.svg", alt: "" }),
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
  return el("div", { className: "quick-grid" }, [
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
      el("span", { text: "复制 / 撤销 / 查看状态" }),
    ]),
    el("a", {
      className: "quick-card",
      href: "/admin/unlimited-test",
      onClick: (e) => linkClick(e, "/admin/unlimited-test"),
    }, [
      el("strong", { text: "免费测试" }),
      el("span", { text: "不耗额度，体验全流程" }),
    ]),
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
      el("span", { text: "邀请码链接，双方得额度" }),
    ]),
  ]);
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
          el("li", { text: "生成链接会消耗额度；免费测试不消耗额度。" }),
          el("li", { text: "用户打开分销链接测完即可看完整报告，不分墙。" }),
          el("li", { text: "忘记密码：登录页「忘记密码」→ 授权码验证后改密（无需邮箱）。" }),
          el("li", { text: "兑换额度码后，该码也可用于授权码登录找回。" }),
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
        list.append(
          el("div", { className: "link-item" }, [
            el("code", { text: url }),
            el("button", {
              className: "btn btn-ghost",
              type: "button",
              text: "复制",
              onClick: async () => navigator.clipboard.writeText(url),
            }),
          ])
        );
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

export async function renderLinks(root) {
  const host = el("div", { className: "panel" });
  root.append(
    shell("/admin/link-management", [
      el("h1", { className: "page-title", text: "链接管理" }),
      el("p", { className: "page-lead", text: "查看、复制或撤销已生成的测试链接。" }),
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
    host.append(
      el("div", { className: "mini-stats" }, [
        el("span", { text: `共 ${links.length} 条` }),
        el("span", { text: `未使用 ${unused}` }),
      ])
    );
    const table = el("table", { className: "data" });
    table.append(
      el("thead", {}, [
        el("tr", {}, [
          el("th", { text: "测题" }),
          el("th", { text: "链接" }),
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
      const statusLabel =
        { unused: "未使用", used: "已使用", expired: "已过期", revoked: "已撤销" }[status] || status;
      const tagClass = status === "unused" ? "tag-ok" : status === "revoked" ? "tag-warn" : "tag";
      const actions = el("div", { className: "row-actions" }, [
        el("button", {
          className: "btn btn-ghost",
          type: "button",
          text: "复制",
          onClick: async () => navigator.clipboard.writeText(url),
        }),
      ]);
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
      resultHost.append(
        el("div", { className: "link-item" }, [
          el("code", { text: url }),
          el("button", {
            className: "btn btn-ghost",
            type: "button",
            text: "复制",
            onClick: async () => navigator.clipboard.writeText(url),
          }),
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
  root.append(
    shell("/admin/purchase-quota", [
      el("h1", { className: "page-title", text: "购买额度" }),
      el("p", { className: "page-lead", text: "选择套餐下单。若暂不可在线支付，可用兑换码充值。" }),
      host,
    ])
  );

  try {
    const [pkgData, methods] = await Promise.all([
      api.packagesList().catch(() => ({ packages: [] })),
      api.purchaseMethods().catch(() => ({})),
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
    const grid = el("div", { className: "pkg-grid" });
    for (const p of packages) {
      const id = p.id || p.package_id;
      const name = p.name || p.title || `套餐 ${id}`;
      const quota = p.quota_amount || p.quota || p.credits || "—";
      const price = p.price_yuan || p.price || p.amount || "—";
      const btn = el("button", {
        className: "btn btn-primary",
        type: "button",
        text: "购买",
        style: "width:auto",
      });
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          const created = await api.createOrder(id, "wxpay");
          const order = (created && created.order) || created || {};
          const orderNo = order.order_no || order.orderNo;
          if (!orderNo) throw new Error("未返回订单号");
          const pay = await api.startPay(orderNo, "wxpay");
          if (pay && pay.paid) {
            alert("支付成功，额度已到账");
            navigate("/admin/dashboard");
            return;
          }
          const payUrl = pay.pay_data || pay.pay_url || pay.code_url || "";
          if (payUrl) {
            window.open(payUrl, "_blank");
            alert("已打开支付页，完成后请刷新工作台查看额度。");
          } else {
            alert("订单已创建：" + orderNo + "。请按提示完成支付，或联系客服。");
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
          el("p", { className: "pkg-price", text: typeof price === "number" ? `¥ ${price}` : String(price) }),
          btn,
        ])
      );
    }
    host.append(grid);
    if (methods && (methods.xianyu || methods.offline)) {
      host.append(el("p", { className: "muted", text: "也可通过闲鱼/线下方式购码后，在「兑换额度」使用。" }));
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
        await navigator.clipboard.writeText(url);
        errHost.replaceChildren(flash("ok", "已复制到剪贴板"));
      } catch {
        urlInput.select();
        errHost.replaceChildren(flash("ok", "请手动复制上方链接"));
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
        text: "分享专属链接；好友注册后，双方各得 5 点起始奖励额度。",
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
          text: "也可让好友在注册页填写邀请码。注册奖励即时到账。",
        }),
      ]),
      el("div", { className: "panel" }, [el("h3", { text: "邀请记录" }), ...rows]),
    ])
  );
}

export { shell, isSuper };

export function requireAuth() {
  return Boolean(getToken());
}
