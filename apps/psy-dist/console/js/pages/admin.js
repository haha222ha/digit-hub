import { api, getUser, clearSession, getToken, setSession } from "../api.js";
import {
  el,
  flash,
  clear,
  copyText,
  bindCopyButton,
  showToast,
  isWechatBrowser,
  openModal,
  openDrawer,
  attachBackToTop,
} from "../ui.js";
import { navigate, linkClick } from "../router.js";

const NAV = [
  { path: "/admin/dashboard", label: "工作台" },
  { path: "/admin/generate-link", label: "生成链接" },
  { path: "/admin/link-management", label: "链接管理" },
  { path: "/admin/test-results", label: "测题结果" },
  { path: "/admin/quota-logs", label: "额度日志" },
  { path: "/admin/unlimited-test", label: "免费测试" },
  { path: "/admin/purchase-quota", label: "购买额度" },
  { path: "/admin/redeem-quota", label: "兑换额度" },
  { path: "/admin/invite-promotion", label: "邀请推广" },
  { path: "/admin/announcements", label: "公告", badge: "announcements" },
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
  { path: "/super-admin/test-results", label: "测题结果" },
  { path: "/super-admin/announcements", label: "公告" },
  { path: "/super-admin/tutorials", label: "教程" },
  { path: "/super-admin/help-docs", label: "帮助文档" },
  { path: "/super-admin/package-documents", label: "套餐文档" },
  { path: "/super-admin/config", label: "系统配置" },
  { path: "/super-admin/quota-logs", label: "额度日志" },
  { path: "/super-admin/operation-logs", label: "操作日志" },
  { path: "/super-admin/payment-notify-logs", label: "支付回调" },
];

function isSuper() {
  return (getUser() || {}).role === "super_admin";
}

function remainingQuota() {
  const u = getUser() || {};
  return Number(u.remaining_quota ?? u.remainingQuota ?? 0);
}

/** 超管始终可；商家剩余额度 > 10 可免费测 */
function canUnlimited() {
  return isSuper() || remainingQuota() > 10;
}

function merchantNav() {
  return NAV.filter((item) => item.path !== "/admin/unlimited-test" || canUnlimited());
}

function navLabelNode(item) {
  if (!item.badge) return item.label;
  const badge = el("span", { className: "nav-badge", hidden: "true" });
  badge.dataset.badge = item.badge;
  return el("span", { className: "nav-label-wrap" }, [
    el("span", { text: item.label }),
    badge,
  ]);
}

function applyNavBadges(rootEl, counts) {
  if (!rootEl || !counts) return;
  rootEl.querySelectorAll("[data-badge]").forEach((node) => {
    const key = node.getAttribute("data-badge");
    const n = Number(counts[key] || 0);
    if (n > 0) {
      node.hidden = false;
      node.textContent = n > 99 ? "99+" : String(n);
    } else {
      node.hidden = true;
      node.textContent = "";
    }
  });
}

async function refreshSessionQuota() {
  try {
    const q = await api.quotaInfo();
    if (!q) return;
    const u = getUser() || {};
    setSession(getToken(), {
      ...u,
      remaining_quota: q.remaining_quota,
      quota: q.quota,
      used_quota: q.used_quota,
    });
  } catch {
    /* ignore */
  }
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
      el(
        "a",
        {
          href: item.path,
          className:
            activePath.startsWith(item.path) ||
            (item.path.startsWith("/super-admin") && activePath.startsWith("/super-admin"))
              ? "active"
              : "",
          onClick: (e) => linkClick(e, item.path),
        },
        [navLabelNode(item)]
      )
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
          el(
            "a",
            {
              href: item.path,
              className: `side-link${activePath.startsWith(item.path) ? " active" : ""}`,
              onClick: (e) => linkClick(e, item.path),
            },
            [navLabelNode(item)]
          )
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

  const layout = el("div", { className: "shell" }, [
    el("header", { className: "topbar" }, [
      el("a", { className: "brand", href: "/admin/dashboard", onClick: (e) => linkClick(e, "/admin/dashboard") }, [
        el("img", { src: "/images/logo.svg?v=5", alt: "" }),
        el("span", { text: "心象测" }),
      ]),
      el("button", {
        className: "nav-toggle btn btn-ghost",
        type: "button",
        text: "菜单",
        style: "width:auto;padding:6px 12px",
        onClick: () => layout.classList.toggle("nav-open"),
      }),
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
    el("div", {
      className: "nav-scrim",
      onClick: () => layout.classList.remove("nav-open"),
    }),
    el("div", { className: "shell-body" }, [
      el("aside", { className: "sidenav" }, sideLinks),
      el("main", { className: "main" }, bodyChildren),
    ]),
  ]);

  api.announcementsUnread()
    .then((data) => {
      const n = Number((data && (data.unread ?? data.count ?? data.unread_count)) || 0);
      applyNavBadges(layout, { announcements: n });
    })
    .catch(() => {});

  return layout;
}

export { shell, isSuper, canUnlimited };

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
  if (canUnlimited()) {
    cards.push(
      el("a", {
        className: "quick-card",
        href: "/admin/unlimited-test",
        onClick: (e) => linkClick(e, "/admin/unlimited-test"),
      }, [
        el("strong", { text: "免费测试" }),
        el("span", { text: isSuper() ? "超管专用，不耗额度" : "额度>10 可用，不耗额度" }),
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
  try {
    const u = getUser() || {};
    setSession(getToken(), {
      ...u,
      remaining_quota: quota.remaining_quota,
      quota: quota.quota,
      used_quota: quota.used_quota,
    });
  } catch {
    /* ignore */
  }
  let linkStats = { total: 0, unused: 0, used: 0 };
  let trends = null;
  try {
    const dash = await api.adminDashboardStats();
    linkStats.total = Number(dash?.links_total || 0);
    linkStats.unused = Number(dash?.links_unused || 0);
    linkStats.used = Number(dash?.links_used || 0);
    trends = dash?.trends || null;
  } catch {
    try {
      const data = await api.linksList({ perPage: "1" });
      linkStats.total = Number((data && data.pagination && data.pagination.total) || 0);
      const usedData = await api.linksList({ status: "used", perPage: "1" });
      const unusedData = await api.linksList({ status: "unused", perPage: "1" });
      linkStats.used = Number((usedData && usedData.pagination && usedData.pagination.total) || 0);
      linkStats.unused = Number((unusedData && unusedData.pagination && unusedData.pagination.total) || 0);
    } catch {
      /* ignore */
    }
  }

  let testCount = 0;
  try {
    const t = await api.testsList();
    testCount = ((t && t.tests) || []).length;
  } catch {
    /* ignore */
  }

  const trendPanel = trends && trends.days && trends.days.length
    ? el("div", { className: "panel trend-panel" }, [
        el("h3", { text: "近 7 日趋势" }),
        el("div", { className: "trend-legend" }, [
          el("span", { className: "trend-legend-item trend-legend-links", text: "新建链接" }),
          el("span", { className: "trend-legend-item trend-legend-tests", text: "测题完成" }),
        ]),
        el(
          "div",
          { className: "trend-chart" },
          trends.days.map((day, idx) => {
            const linksN = Number((trends.links_daily || [])[idx] || 0);
            const testsN = Number((trends.tests_daily || [])[idx] || 0);
            const max = Math.max(1, ...((trends.links_daily || []).concat(trends.tests_daily || [])).map(Number));
            return el("div", { className: "trend-col" }, [
              el("div", { className: "trend-bars" }, [
                el("div", {
                  className: "trend-bar trend-bar-links",
                  style: `height:${Math.round((linksN / max) * 100)}%`,
                  title: `链接 ${linksN}`,
                }),
                el("div", {
                  className: "trend-bar trend-bar-tests",
                  style: `height:${Math.round((testsN / max) * 100)}%`,
                  title: `测题 ${testsN}`,
                }),
              ]),
              el("div", { className: "trend-label", text: day.slice(5) }),
            ]);
          })
        ),
      ])
    : null;

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
      trendPanel,
      el("h2", { className: "section-h", text: "快捷入口" }),
      quickActions(),
      el("div", { className: "panel tip-panel" }, [
        el("h3", { text: "使用提示" }),
        el("ul", { className: "tip-list" }, [
          el("li", {
            text: isSuper()
              ? "生成链接会消耗额度；超管「免费测试」不消耗额度。"
              : "生成链接会消耗额度；剩余额度 > 10 时可使用「免费测试」（不耗额度）。",
          }),
          el("li", { text: "未开测链接撤销会退还额度；已开测仅作废不退额。" }),
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
      const urls = links.map((link) => linkFullUrl(link, select.value));
      resultHost.append(flash("ok", `已生成 ${links.length} 条链接（可一键复制到自动发卡）`));

      const bulkBar = el("div", { className: "row-actions", style: "margin:12px 0;flex-wrap:wrap;gap:8px" });
      const copyAllBtn = el("button", {
        className: "btn btn-primary",
        type: "button",
        text: `复制全部（${urls.length}）`,
      });
      const exportBtn = el("button", {
        className: "btn btn-ghost",
        type: "button",
        text: "导出发卡 TXT",
      });
      const goManage = el("a", {
        className: "btn btn-ghost",
        href: "/admin/link-management",
        text: "去链接管理",
        onClick: (e) => linkClick(e, "/admin/link-management"),
      });
      const hint = el("span", {
        className: "muted",
        text: "每行一条完整链接，无表头，可直接粘贴到发卡网",
      });
      bindCopyButton(copyAllBtn, () => urls.join("\n"), {
        okText: `已复制 ${urls.length} 条`,
        onOk: () => showToast(`已复制 ${urls.length} 条链接`),
      });
      exportBtn.addEventListener("click", () => {
        downloadPlainTxt(fakaTxtFromUrls(urls), `psy_links_${select.value || "batch"}_${Date.now()}.txt`);
        exportBtn.textContent = "已下载";
        showToast(`已导出 ${urls.length} 条（发卡格式）`);
        setTimeout(() => {
          exportBtn.textContent = "导出发卡 TXT";
        }, 1500);
      });
      bulkBar.append(copyAllBtn, exportBtn, goManage, hint);
      resultHost.append(bulkBar);

      const list = el("div", { className: "link-list" });
      for (const url of urls) {
        const copyBtn = el("button", { className: "btn btn-ghost", type: "button", text: "复制" });
        bindCopyButton(copyBtn, url);
        list.append(el("div", { className: "link-item" }, [el("code", { text: url }), copyBtn]));
      }
      resultHost.append(list);
      resultHost.scrollIntoView({ behavior: "smooth", block: "start" });
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

function linkFullUrl(link, fallbackCode = "") {
  const token = link.token || "";
  const code = link.test_code || link.testCode || fallbackCode || "";
  return `${location.origin}/test/${code}/${token}`;
}

function downloadPlainTxt(text, filename) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function fakaTxtFromUrls(urls) {
  return urls.filter(Boolean).join("\n") + (urls.length ? "\n" : "");
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
  const filterBar = el("div", { className: "filter-bar" });
  const tabBar = el("div", { className: "link-tabs" });
  /** @type {'all'|'unbound'|'inactive'|'active'} */
  let tab = "all";

  const testSel = el("select");
  testSel.append(el("option", { value: "", text: "全部测题" }));
  try {
    const td = await api.testsList();
    for (const t of (td && td.tests) || []) {
      testSel.append(el("option", { value: t.test_code, text: `${t.test_name || t.test_code}` }));
    }
  } catch {
    /* ignore */
  }
  const perPageSel = el("select");
  for (const n of [20, 50, 100]) {
    perPageSel.append(el("option", { value: String(n), text: `${n}/页` }));
  }
  const startDate = el("input", { type: "date" });
  const endDate = el("input", { type: "date" });
  const sortSel = el("select");
  sortSel.append(
    el("option", { value: "createdAt:DESC", text: "创建时间 ↓" }),
    el("option", { value: "createdAt:ASC", text: "创建时间 ↑" }),
    el("option", { value: "testCode:ASC", text: "测题 A-Z" }),
    el("option", { value: "status:ASC", text: "状态" }),
    el("option", { value: "usedCount:DESC", text: "使用次数 ↓" })
  );
  const applyBtn = el("button", { className: "btn btn-primary", type: "button", text: "筛选", style: "width:auto" });
  const exportAuditBtn = el("button", {
    className: "btn btn-ghost",
    type: "button",
    text: "导出对账表",
    style: "width:auto",
    title: "含测题码、相对路径、状态（TSV），不对发卡网导入",
  });
  filterBar.append(
    el("div", { className: "field", style: "margin:0;min-width:180px" }, [el("label", { text: "测题" }), testSel]),
    el("div", { className: "field", style: "margin:0;min-width:130px" }, [el("label", { text: "开始日期" }), startDate]),
    el("div", { className: "field", style: "margin:0;min-width:130px" }, [el("label", { text: "结束日期" }), endDate]),
    el("div", { className: "field", style: "margin:0;min-width:140px" }, [el("label", { text: "排序" }), sortSel]),
    el("div", { className: "field", style: "margin:0;min-width:100px" }, [el("label", { text: "每页" }), perPageSel]),
    el("div", { className: "row-actions", style: "align-items:flex-end" }, [applyBtn, exportAuditBtn])
  );

  function paintTabs() {
    const tabs = [
      { id: "all", label: "全部" },
      { id: "unbound", label: "未绑定" },
      { id: "inactive", label: "未激活使用" },
      { id: "active", label: "已激活使用" },
    ];
    tabBar.replaceChildren(
      ...tabs.map((t) =>
        el("button", {
          type: "button",
          className: `link-tab${tab === t.id ? " active" : ""}`,
          text: t.label,
          onClick: () => {
            tab = t.id;
            page = 1;
            paintTabs();
            reload();
          },
        })
      )
    );
  }

  root.append(
    shell("/admin/link-management", [
      el("h1", { className: "page-title", text: "链接管理" }),
      el("p", {
        className: "page-lead",
        text: "未绑定=尚未进发卡池；未激活=买家未开测；已激活=买家已开测。发货助手领取后标记为已绑定。",
      }),
      tabBar,
      filterBar,
      host,
    ])
  );
  attachBackToTop(root);
  paintTabs();

  let page = 1;
  let selected = new Set();

  function filters() {
    const [sortBy, sortOrder] = (sortSel.value || "createdAt:DESC").split(":");
    const base = {
      testCode: testSel.value || undefined,
      startDate: startDate.value || undefined,
      endDate: endDate.value || undefined,
      sortBy,
      sortOrder,
      perPage: perPageSel.value || "20",
      page: String(page),
    };
    if (tab === "unbound") return { ...base, status: "unused", fakaClaimed: "0" };
    if (tab === "inactive") return { ...base, status: "unused" };
    if (tab === "active") return { ...base, status: "used" };
    return base;
  }

  async function doExport(payload) {
    try {
      const { blob, filename } = await api.exportLinks(payload);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename || "links_export.txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert(e.message || "导出失败");
    }
  }

  async function reload() {
    clear(host);
    host.append(el("p", { className: "muted", text: "加载中…" }));
    selected = new Set();
    try {
      const data = await api.linksList(filters());
      const links = (data && data.links) || [];
      const pag = (data && data.pagination) || {};
      const total = Number(pag.total || 0);
      const perPage = Number(pag.perPage || perPageSel.value || 20);
      const totalPages = Number(pag.totalPages || Math.max(1, Math.ceil(total / perPage) || 1));
      page = Number(pag.page || page);
      clear(host);

      host.append(
        el("div", { className: "mini-stats" }, [
          el("span", { text: `共 ${total} 条` }),
          el("span", { text: `第 ${page}/${Math.max(1, totalPages)} 页` }),
        ])
      );

      if (!links.length) {
        host.append(el("div", { className: "empty", text: total ? "本页无数据" : "还没有链接。去「生成链接」创建第一条。" }));
        return;
      }

      const pageUrls = links.map((link) => linkFullUrl(link));
      const selectedUrls = () =>
        links.filter((l) => l.id && selected.has(l.id)).map((link) => linkFullUrl(link));

      const bulk = el("div", { className: "row-actions", style: "margin:0 0 12px;flex-wrap:wrap;gap:8px" });
      const copySelBtn = el("button", {
        className: "btn btn-primary",
        type: "button",
        text: "复制所选",
      });
      const exportFakaBtn = el("button", {
        className: "btn btn-primary",
        type: "button",
        text: "导出发卡 TXT",
      });
      const copyPageBtn = el("button", {
        className: "btn btn-ghost",
        type: "button",
        text: `复制本页（${pageUrls.length}）`,
      });
      const batchRevokeBtn = el("button", {
        className: "btn btn-ghost",
        type: "button",
        text: "批量撤销所选",
      });
      const fakaHint = el("span", {
        className: "muted",
        text: "发卡格式：每行一条完整 URL，无表头",
      });

      copySelBtn.addEventListener("click", async () => {
        const urls = selectedUrls();
        if (!urls.length) {
          showToast("请先勾选要复制的链接", "error");
          return;
        }
        try {
          await copyText(urls.join("\n"));
          showToast(`已复制 ${urls.length} 条（发卡格式）`);
          copySelBtn.textContent = `已复制 ${urls.length}`;
          setTimeout(() => {
            copySelBtn.textContent = "复制所选";
          }, 1500);
        } catch (e) {
          alert((e && e.message) || "复制失败，请改用导出发卡 TXT");
        }
      });
      exportFakaBtn.addEventListener("click", () => {
        const urls = selectedUrls();
        if (!urls.length) {
          showToast("请先勾选要导出的链接", "error");
          return;
        }
        downloadPlainTxt(fakaTxtFromUrls(urls), `links_faka_${Date.now()}.txt`);
        showToast(`已导出 ${urls.length} 条（发卡格式）`);
      });
      bindCopyButton(copyPageBtn, () => pageUrls.join("\n"), {
        okText: `已复制 ${pageUrls.length} 条`,
        onOk: () => showToast(`已复制本页 ${pageUrls.length} 条`),
      });
      batchRevokeBtn.addEventListener("click", async () => {
        const ids = [...selected];
        if (!ids.length) {
          showToast("请先勾选要撤销的链接", "error");
          return;
        }
        const unusedN = links.filter((l) => ids.includes(l.id) && Number(l.used_count ?? l.usedCount ?? 0) === 0).length;
        const tip =
          unusedN > 0
            ? `确定撤销选中的 ${ids.length} 条？其中 ${unusedN} 条未开测将退还额度。`
            : `确定撤销选中的 ${ids.length} 条？`;
        if (!confirm(tip)) return;
        try {
          const out = await api.revokeLinks(ids);
          const rf = Number((out && out.refundedQuota) || 0);
          alert(rf > 0 ? `已撤销 ${out.revokedCount} 条，退还 ${rf} 额度` : `已撤销 ${out.revokedCount || ids.length} 条`);
          await refreshSessionQuota();
          await reload();
        } catch (e) {
          alert(e.message || "批量撤销失败");
        }
      });
      const releaseSelBtn = el("button", {
        className: "btn btn-ghost",
        type: "button",
        text: "释放回池（误领）",
        title: "仅释放已进发卡且未开测的链接，可再次被发货助手领取",
      });
      releaseSelBtn.addEventListener("click", async () => {
        const ids = [...selected];
        if (!ids.length) {
          showToast("请先勾选要释放的链接", "error");
          return;
        }
        if (!confirm(`确定将选中的 ${ids.length} 条从发卡池释放？仅未开测的会生效。`)) return;
        try {
          const out = await api.fakaReleaseLinks({ linkIds: ids });
          showToast(`已释放 ${out.released || 0} 条`);
          await reload();
        } catch (e) {
          alert(e.message || "释放失败");
        }
      });
      bulk.append(copySelBtn, exportFakaBtn, copyPageBtn, batchRevokeBtn, releaseSelBtn, fakaHint);
      host.append(bulk);

      const checkAll = el("input", { type: "checkbox" });
      checkAll.addEventListener("change", () => {
        selected = new Set();
        tbody.querySelectorAll('input[data-link-id]').forEach((cb) => {
          cb.checked = checkAll.checked;
          if (checkAll.checked) selected.add(Number(cb.getAttribute("data-link-id")));
        });
      });

      const table = el("table", { className: "data" });
      table.append(
        el("thead", {}, [
          el("tr", {}, [
            el("th", {}, [checkAll]),
            el("th", { text: "测题" }),
            el("th", { text: "链接" }),
            el("th", { text: "已用 / 剩余" }),
            el("th", { text: "有效期" }),
            el("th", { text: "状态" }),
            el("th", { text: "发卡" }),
            el("th", { text: "操作" }),
          ]),
        ])
      );
      const tbody = el("tbody");
      for (const link of links) {
        const token = link.token || "";
        const code = link.test_code || "";
        const url = linkFullUrl(link);
        const status = link.status || "unused";
        const used = Number(link.used_count ?? link.usedCount ?? 0);
        const maxUses = Number(link.max_uses ?? link.maxUses ?? 3);
        const remain = Math.max(0, maxUses - used);
        const statusLabel =
          { unused: "未使用", used: "已使用", expired: "已过期", revoked: "已撤销" }[status] || status;
        const tagClass =
          status === "unused" ? "tag-ok" : status === "revoked" || status === "expired" ? "tag-warn" : "tag";
        const usesClass = remain <= 0 ? "tag tag-warn" : remain === 1 ? "tag tag-warn" : "tag tag-ok";
        const cd = formatLinkCountdown(link);
        const cdClass = cd.tone === "warn" ? "tag tag-warn" : cd.tone === "ok" ? "tag tag-ok" : "tag";
        const fakaClaimed = !!(link.faka_claimed || link.fakaClaimed || link.faka_claimed_at || link.fakaClaimedAt);
        const fakaTag = fakaClaimed
          ? el("span", { className: "tag tag-warn", text: "已进发卡" })
          : el("span", { className: "tag tag-ok", text: "未进发卡" });
        const cb = el("input", { type: "checkbox" });
        if (link.id) cb.setAttribute("data-link-id", String(link.id));
        if (status === "revoked") cb.disabled = true;
        cb.addEventListener("change", () => {
          if (!link.id) return;
          if (cb.checked) selected.add(link.id);
          else selected.delete(link.id);
        });
        const copyBtn = el("button", { className: "btn btn-ghost", type: "button", text: "复制" });
        bindCopyButton(copyBtn, url);
        const detailBtn = el("button", {
          className: "btn btn-ghost",
          type: "button",
          text: "详情",
          onClick: () => {
            openDrawer("链接详情", [
              el("dl", { className: "link-detail-grid" }, [
                el("dt", { text: "测题" }),
                el("dd", { text: code }),
                el("dt", { text: "链接" }),
                el("dd", { text: url }),
                el("dt", { text: "状态" }),
                el("dd", { text: statusLabel }),
                el("dt", { text: "发卡领取" }),
                el("dd", {
                  text: fakaClaimed
                    ? `已进发卡 · ${link.faka_claimed_at || link.fakaClaimedAt || ""} · batch ${link.faka_claim_batch || link.fakaClaimBatch || "—"}`
                    : "未进发卡池",
                }),
                el("dt", { text: "已用 / 剩余" }),
                el("dd", { text: `${used} / 剩 ${remain}（上限 ${maxUses}）` }),
                el("dt", { text: "有效期" }),
                el("dd", { text: `${cd.text} · ${cd.hint}` }),
                el("dt", { text: "创建时间" }),
                el("dd", { text: String(link.created_at || link.createdAt || "—") }),
                el("dt", { text: "链接 ID" }),
                el("dd", { text: String(link.id || "—") }),
              ]),
            ]);
          },
        });
        const actions = el("div", { className: "row-actions" }, [copyBtn, detailBtn]);
        if (status !== "revoked" && link.id) {
          actions.append(
            el("button", {
              className: "btn btn-ghost",
              type: "button",
              text: "撤销",
              onClick: async () => {
                const tip =
                  used === 0
                    ? `确定撤销？未开测将退还 1 个额度。`
                    : `确定撤销该链接？（已开测不退额度）`;
                if (!confirm(tip)) return;
                try {
                  const out = await api.revokeLink(link.id);
                  const rf = Number((out && out.refundedQuota) || 0);
                  if (rf > 0) alert(`撤销成功，退还 ${rf} 额度`);
                  await refreshSessionQuota();
                  await reload();
                } catch (e) {
                  alert(e.message || "撤销失败");
                }
              },
            })
          );
        }
        tbody.append(
          el("tr", {}, [
            el("td", {}, [cb]),
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
            el("td", {}, [fakaTag]),
            el("td", {}, [actions]),
          ])
        );
      }
      table.append(tbody);
      host.append(el("div", { className: "table-wrap" }, [table]));

      const pager = el("div", { className: "row-actions", style: "margin-top:12px;flex-wrap:wrap;gap:8px" });
      const prev = el("button", {
        className: "btn btn-ghost",
        type: "button",
        text: "上一页",
        disabled: page <= 1 ? "true" : undefined,
      });
      const next = el("button", {
        className: "btn btn-ghost",
        type: "button",
        text: "下一页",
        disabled: page >= totalPages ? "true" : undefined,
      });
      prev.addEventListener("click", () => {
        if (page > 1) {
          page -= 1;
          reload();
        }
      });
      next.addEventListener("click", () => {
        if (page < totalPages) {
          page += 1;
          reload();
        }
      });
      pager.append(prev, el("span", { className: "muted", text: `${page} / ${Math.max(1, totalPages)}` }), next);
      host.append(pager);
    } catch (e) {
      clear(host);
      host.append(flash("error", e.message || "加载失败"));
    }
  }

  applyBtn.addEventListener("click", () => {
    page = 1;
    reload();
  });
  exportAuditBtn.addEventListener("click", async () => {
    const f = filters();
    try {
      await doExport({
        status: f.status,
        testCode: f.testCode,
        startDate: f.startDate,
        endDate: f.endDate,
        sortBy: f.sortBy,
        sortOrder: f.sortOrder,
      });
      showToast("已导出对账表（含状态，勿直接导入发卡）");
    } catch {
      /* doExport already alerts */
    }
  });
  await reload();
}

export async function renderUnlimited(root) {
  await refreshSessionQuota();
  if (!canUnlimited()) {
    root.append(
      shell("/admin/dashboard", [
        el("h1", { className: "page-title", text: "免费测试" }),
        flash(
          "error",
          `剩余额度需大于 10 才能使用免费测试（当前 ${remainingQuota()}）。请先购买或兑换额度；超管不受此限。`
        ),
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
    el("p", {
      className: "muted",
      text: isSuper()
        ? "超管免费测试不消耗额度，适合自己体验或演示。"
        : "剩余额度 > 10 时可开启免费测试（不耗额度），适合自己体验或演示给客户看。",
    }),
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

function packageDocIds(pkg) {
  const ids = [];
  const id = pkg.id ?? pkg.package_id ?? pkg.list_id;
  if (id != null) ids.push(Number(id));
  if (pkg.db_id != null) ids.push(Number(pkg.db_id));
  return ids;
}

function packageDocMatches(doc, pkgIds) {
  const pid = Number(doc.package_id ?? doc.packageId ?? 0);
  if (pid === 0) return false;
  return pkgIds.includes(pid);
}

function renderPackageDocLink(doc) {
  const title = doc.title || "文档";
  const url = (doc.document_url || doc.documentUrl || "").trim();
  if (!url) return el("span", { className: "pkg-doc-title", text: title });
  return el("a", {
    className: "pkg-doc-link",
    href: url,
    target: "_blank",
    rel: "noopener noreferrer",
    text: title,
  });
}

function renderPackageDocList(docs, packages) {
  if (!docs.length) return null;
  const pkgMap = new Map();
  for (const p of packages) {
    const label = p.name || p.title || "套餐";
    for (const id of packageDocIds(p)) pkgMap.set(id, label);
  }
  const list = el("ul", { className: "pkg-doc-list" });
  for (const d of docs) {
    const pid = Number(d.package_id ?? d.packageId ?? 0);
    const tag =
      pid > 0
        ? el("span", { className: "pkg-doc-tag muted", text: pkgMap.get(pid) || `套餐 #${pid}` })
        : null;
    list.append(el("li", { className: "pkg-doc-item" }, [renderPackageDocLink(d), tag]));
  }
  return el("div", { className: "panel pkg-doc-panel" }, [
    el("h3", { text: "套餐说明文档" }),
    list,
  ]);
}

export async function renderPurchase(root) {
  const host = el("div", { className: "purchase-page" });
  let selectedMethod = "wxpay";
  const payWx = el("button", { className: "pay-method-btn active", type: "button", text: "微信支付" });
  const payAli = el("button", { className: "pay-method-btn", type: "button", text: "支付宝" });
  payWx.addEventListener("click", () => {
    selectedMethod = "wxpay";
    payWx.classList.add("active");
    payAli.classList.remove("active");
  });
  payAli.addEventListener("click", () => {
    selectedMethod = "alipay";
    payAli.classList.add("active");
    payWx.classList.remove("active");
  });
  const payMethods = el("div", { className: "pay-methods" }, [payWx, payAli]);
  const wechatTip = isWechatBrowser()
    ? el("p", {
        className: "wechat-tip",
        text: "当前在微信内打开，将跳转易支付收银台完成支付（与发卡网相同）。",
      })
    : null;

  root.append(
    shell("/admin/purchase-quota", [
      el("h1", { className: "page-title", text: "购买额度" }),
      el("p", {
        className: "page-lead",
        text: "在线支付后额度自动到账。若你是被邀请注册，首购将给邀请人返利（默认购额 20%）。",
      }),
      payMethods,
      wechatTip,
      host,
    ])
  );

  async function pollPaid(orderNo) {
    for (let i = 0; i < 16; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      try {
        const o = await api.orderDetail(orderNo);
        const st = (o && (o.status || (o.order && o.order.status))) || "";
        if (o && o.paid) return true;
        if (st === "paid" || st === "fulfilled") return true;
      } catch {
        /* ignore */
      }
    }
    return false;
  }

  async function afterPaySuccess() {
    showToast("支付成功，额度已到账");
    await refreshSessionQuota();
    navigate("/admin/dashboard");
  }

  async function runPay(orderNo, method) {
    const isPc = !isWechatBrowser();
    const pay = await api.startPay(orderNo, method, isPc ? "pc" : "mobile");
    if (pay && pay.paid) {
      await afterPaySuccess();
      return;
    }
    const payType = (pay && (pay.pay_type || pay.payType)) || "";
    const codeUrl =
      payType === "code_url"
        ? (pay && (pay.pay_data || pay.code_url || "")) || ""
        : (pay && pay.code_url) || "";
    const payUrl =
      payType === "redirect"
        ? (pay && (pay.pay_data || pay.pay_url || "")) || ""
        : (pay && (pay.pay_data || pay.pay_url)) || "";
    if (codeUrl && isPc && method === "wxpay" && payType === "code_url") {
      openPayQrModal(orderNo, codeUrl);
      const ok = await pollPaid(orderNo);
      if (ok) await afterPaySuccess();
      else showToast("尚未检测到支付完成。若已付款，请稍后刷新工作台", "error");
      return;
    }
    if (payUrl) {
      if (method === "wxpay" && isWechatBrowser()) window.location.href = payUrl;
      else window.open(payUrl, "_blank");
      host.prepend(flash("ok", `订单 ${orderNo} 已打开支付页，正在检测支付结果…`));
      const ok = await pollPaid(orderNo);
      if (ok) await afterPaySuccess();
      else showToast("尚未检测到支付完成。若已付款，请稍后刷新工作台", "error");
    } else {
      showToast("未获取到支付链接，请联系客服或改用兑换码", "error");
    }
  }

  function openPayQrModal(orderNo, codeUrl) {
    const qrSrc = `/api/v1/payment/qrcode?data=${encodeURIComponent(codeUrl)}`;
    const qrImg = el("img", {
      src: qrSrc,
      alt: "微信支付二维码",
      style: "display:block;width:240px;height:240px;margin:0 auto 12px;border-radius:8px",
    });
    openModal("微信扫码支付", [
      qrImg,
      el("p", { className: "muted", text: "请使用微信扫一扫完成支付（易支付通道），支付成功后额度自动到账。" }),
      el("p", { className: "muted", text: `订单号：${orderNo}` }),
      el("a", {
        className: "btn btn-ghost",
        href: qrSrc,
        download: `pay_${orderNo}.png`,
        text: "保存二维码",
        style: "width:auto;display:inline-flex;margin-top:8px",
      }),
    ]);
  }

  function openXianyuModal(cfg) {
    const body = [];
    if (cfg.xianyu_shop_qrcode) {
      body.push(
        el("img", {
          src: cfg.xianyu_shop_qrcode,
          alt: "闲鱼店铺二维码",
          style: "max-width:220px;display:block;margin:0 auto 12px",
        })
      );
    }
    if (cfg.xianyu_shop_link) {
      body.push(
        el("p", {}, [
          el("a", { href: cfg.xianyu_shop_link, target: "_blank", text: cfg.xianyu_shop_link }),
        ])
      );
    }
    body.push(
      el("p", { className: "muted", text: "在闲鱼购码后，请到「兑换额度」输入授权码充值。" }),
      el("a", {
        className: "btn btn-primary",
        href: "/admin/redeem-quota",
        text: "去兑换额度",
        style: "width:auto;display:inline-flex;margin-top:8px",
        onClick: (e) => linkClick(e, "/admin/redeem-quota"),
      })
    );
    openModal("闲鱼购码", body);
  }

  const PLAN_THEMES = ["blue", "orange", "purple"];

  try {
    const [pkgData, methods, cfg, docData] = await Promise.all([
      api.packagesList().catch(() => ({ packages: [] })),
      api.purchaseMethods().catch(() => ({})),
      api.customerService().catch(() => ({})),
      api.packageDocuments().catch(() => ({ documents: [] })),
    ]);
    if (!methods.wechat && !methods.alipay) payMethods.style.display = "none";
    if (methods.wechat === false) payWx.disabled = true;
    if (methods.alipay === false) payAli.disabled = true;
    if (methods.alipay && !methods.wechat) {
      selectedMethod = "alipay";
      payAli.classList.add("active");
      payWx.classList.remove("active");
    }
    const packages = (pkgData && pkgData.packages) || [];
    const allDocs = (docData && (docData.documents || docData.list)) || [];
    const globalDocs = allDocs.filter((d) => Number(d.package_id ?? d.packageId ?? 0) === 0);
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
        text: `邀请返利比例：${rebate}%（仅被邀请用户的首次购额）。`,
      })
    );
    const grid = el("div", { className: "plans-grid" });
    packages.forEach((p, idx) => {
      const id = p.id || p.package_id || p.list_id;
      const pkgIds = packageDocIds(p);
      const cardDocs = allDocs.filter((d) => packageDocMatches(d, pkgIds));
      const name = p.name || p.title || `套餐 ${id}`;
      const quota = Number(p.quota_amount || p.quota || p.credits || 0);
      const priceNum = Number(p.price_yuan != null ? p.price_yuan : p.price || p.amount || 0);
      const theme = PLAN_THEMES[idx % PLAN_THEMES.length];
      const features = (p.features && p.features.length ? p.features : [p.subtitle].filter(Boolean)) || [
        "额度即时到账",
        "支持生成测题链接",
      ];
      const unitPrice = quota > 0 && priceNum > 0 ? (priceNum / quota).toFixed(2) : null;
      const btn = el("button", {
        className: `plan-buy-btn theme-${theme}`,
        type: "button",
        text: "立即支付",
      });
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const method = selectedMethod || "wxpay";
        try {
          const created = await api.createOrder(id, method);
          const order = (created && created.order) || created || {};
          const orderNo = order.order_no || order.orderNo;
          if (!orderNo) throw new Error("未返回订单号");
          await runPay(orderNo, method);
        } catch (e) {
          showToast(e.message || "下单失败，请改用兑换码", "error");
        } finally {
          btn.disabled = false;
        }
      });
      const cardChildren = [
        p.recommended ? el("span", { className: `plan-tag theme-${theme}`, text: "推荐" }) : null,
        el("div", { className: "plan-head" }, [
          el("h3", { className: "plan-name", text: name }),
          p.subtitle ? el("p", { className: "plan-desc", text: p.subtitle }) : null,
        ]),
        el("div", { className: "plan-price-desktop" }, [
          el("div", { className: "plan-price-row" }, [
            el("span", { className: "plan-price", text: `¥${priceNum}` }),
            el("span", { className: `plan-quota theme-${theme}`, text: `${quota} 额度` }),
          ]),
          unitPrice ? el("p", { className: `plan-unit theme-${theme}`, text: `约 ¥${unitPrice}/额度` }) : null,
        ]),
        el("div", { className: "plan-price-mobile" }, [
          el("div", { className: "plan-mobile-row" }, [
            el("div", { className: "plan-mobile-col" }, [
              el("p", { className: "plan-mobile-label", text: "套餐价格" }),
              el("p", { className: "plan-price", text: `¥${priceNum}` }),
            ]),
            unitPrice
              ? el("span", { className: "plan-discount-pill", text: `¥${unitPrice}/额度` })
              : el("span", { className: "plan-arrow", text: "→" }),
            el("div", { className: "plan-mobile-col plan-mobile-col--right" }, [
              el("p", { className: "plan-mobile-label", text: "获得额度" }),
              el("p", { className: `plan-quota-lg theme-${theme}`, text: `${quota}` }),
              el("p", { className: "plan-mobile-suffix", text: "额度" }),
            ]),
          ]),
        ]),
        el("ul", { className: "plan-features plan-features--desktop" }, features.map((f) => el("li", { text: f }))),
        cardDocs.length
          ? el(
              "ul",
              { className: "pkg-doc-list pkg-doc-list--inline" },
              cardDocs.map((d) => el("li", { className: "pkg-doc-item" }, [renderPackageDocLink(d)]))
            )
          : null,
        btn,
      ];
      grid.append(el("div", { className: `plan-card theme-${theme}` }, cardChildren));
    });
    host.append(grid);
    const globalPanel = renderPackageDocList(globalDocs, packages);
    if (globalPanel) host.append(globalPanel);
    if (methods && (methods.xianyu || methods.offline || cfg.xianyu_shop_link || cfg.xianyu_shop_qrcode)) {
      host.append(
        el("button", {
          className: "xianyu-link-btn",
          type: "button",
          text: "无法在线支付？去闲鱼购码",
          onClick: () => openXianyuModal(cfg),
        })
      );
    }
  } catch (e) {
    host.append(flash("error", e.message || "加载套餐失败"));
  }
}

export async function renderRedeem(root) {
  const errHost = el("div");
  const historyHost = el("div", { className: "panel" });
  const input = el("input", { required: "true", placeholder: "输入额度授权码" });
  const btn = el("button", { className: "btn btn-primary", type: "submit", text: "兑换", style: "width:auto" });
  const form = el("form", { className: "panel" }, [
    errHost,
    el("p", {
      className: "muted",
      text: "兑换成功后额度立即到账。额度码仅用于兑换，不能登录。",
    }),
    el("div", { className: "field" }, [el("label", { text: "兑换码" }), input]),
    el("div", { className: "row-actions" }, [btn]),
  ]);

  async function loadHistory() {
    clear(historyHost);
    historyHost.append(el("h3", { text: "兑换记录" }));
    try {
      const data = await api.redeemHistory({ page: 1, perPage: 20 });
      const logs = (data && data.logs) || [];
      if (!logs.length) {
        historyHost.append(el("p", { className: "muted", text: "暂无兑换记录" }));
        return;
      }
      const table = el("table", { className: "data" });
      table.append(
        el("thead", {}, [
          el("tr", {}, [
            el("th", { text: "时间" }),
            el("th", { text: "增加额度" }),
            el("th", { text: "兑换后剩余" }),
            el("th", { text: "备注" }),
          ]),
        ])
      );
      const tbody = el("tbody");
      for (const row of logs) {
        tbody.append(
          el("tr", {}, [
            el("td", { text: String(row.created_at || "—") }),
            el("td", { text: `+${row.amount ?? 0}` }),
            el("td", { text: String(row.after_remaining ?? "—") }),
            el("td", { text: row.remark || "—" }),
          ])
        );
      }
      table.append(tbody);
      historyHost.append(el("div", { className: "table-wrap" }, [table]));
    } catch (e) {
      historyHost.append(flash("error", e.message || "加载兑换记录失败"));
    }
  }

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
      await refreshSessionQuota();
      await loadHistory();
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
      historyHost,
    ])
  );
  await loadHistory();
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
  const tokenHost = el("div", { className: "panel" });
  const tokenVal = el("code", { className: "integration-token", text: "加载中…" });
  const tokenMeta = el("p", { className: "muted", text: "" });
  const copyTok = el("button", { className: "btn btn-primary", type: "button", text: "复制对接 Token", style: "width:auto" });
  const regenTok = el("button", { className: "btn btn-ghost", type: "button", text: "重新生成", style: "width:auto" });
  async function loadToken() {
    try {
      const data = await api.getIntegrationToken();
      const tok = (data && (data.integration_token || data.token)) || "";
      tokenVal.textContent = tok || "（无）";
      tokenMeta.textContent = data && data.created_at ? `生成时间：${data.created_at}` : "";
      bindCopyButton(copyTok, () => tok, { okText: "已复制", onOk: () => showToast("对接 Token 已复制") });
    } catch (e) {
      tokenVal.textContent = "加载失败";
      tokenMeta.textContent = e.message || "";
    }
  }
  regenTok.addEventListener("click", async () => {
    if (!confirm("重新生成后，旧 Token 立即失效，发货助手需重新配置。继续？")) return;
    try {
      const data = await api.regenIntegrationToken();
      const tok = (data && (data.integration_token || data.token)) || "";
      tokenVal.textContent = tok;
      tokenMeta.textContent = data && data.created_at ? `生成时间：${data.created_at}` : "";
      showToast("已重新生成对接 Token");
      await loadToken();
    } catch (e) {
      alert(e.message || "重新生成失败");
    }
  });
  tokenHost.append(
    el("h3", { text: "发货助手对接 Token" }),
    el("p", {
      className: "muted",
      text: "长久有效。可复制到发货助手，或在助手内用账号密码登录自动获取并本地保存。不要分享给他人。",
    }),
    el("div", { className: "token-box" }, [tokenVal]),
    tokenMeta,
    el("div", { className: "row-actions", style: "margin-top:8px" }, [copyTok, regenTok])
  );
  void loadToken();

  root.append(
    shell("/admin/account-settings", [
      el("h1", { className: "page-title", text: "账户设置" }),
      el("p", { className: "page-lead", text: "管理登录密码与发货助手对接 Token。无需绑定邮箱。" }),
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
      tokenHost,
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

export async function renderQuotaLogs(root) {
  const host = el("div", { className: "panel" });
  const typeSel = el("select");
  typeSel.append(el("option", { value: "", text: "全部类型" }));
  for (const [val, label] of [
    ["consume", "消耗"],
    ["redeem", "兑换"],
    ["purchase", "购买"],
    ["refund", "退还"],
    ["admin_adjust", "超管调额"],
    ["invite_rebate", "邀请返利"],
  ]) {
    typeSel.append(el("option", { value: val, text: label }));
  }
  let page = 1;
  let totalPages = 1;
  const perPage = 20;
  async function reload() {
    clear(host);
    host.append(el("p", { className: "muted", text: "加载中…" }));
    try {
      const data = await api.quotaLogs({
        page,
        perPage,
        changeType: typeSel.value || undefined,
      });
      const logs = (data && data.logs) || [];
      const pag = (data && data.pagination) || {};
      const total = Number(pag.total || 0);
      totalPages = Number(pag.totalPages || Math.max(1, Math.ceil(total / perPage) || 1));
      page = Number(pag.page || page);
      clear(host);
      if (!logs.length) {
        host.append(el("p", { className: "muted", text: total ? "本页无数据" : "暂无额度日志" }));
        if (totalPages > 1) appendPager();
        return;
      }
      const typeLabel = {
        consume: "消耗",
        redeem: "兑换",
        purchase: "购买",
        refund: "退还",
        admin_adjust: "超管调额",
        invite_rebate: "邀请返利",
      };
      host.append(
        el("div", { className: "mini-stats" }, [
          el("span", { text: `共 ${total} 条` }),
          el("span", { text: `第 ${page}/${Math.max(1, totalPages)} 页` }),
        ])
      );
      const table = el("table", { className: "data" });
      table.append(
        el("thead", {}, [
          el("tr", {}, [
            el("th", { text: "时间" }),
            el("th", { text: "类型" }),
            el("th", { text: "变动" }),
            el("th", { text: "剩余" }),
            el("th", { text: "备注" }),
          ]),
        ])
      );
      const tbody = el("tbody");
      for (const row of logs) {
        const amt = Number(row.amount || 0);
        tbody.append(
          el("tr", {}, [
            el("td", { text: String(row.created_at || "—") }),
            el("td", { text: typeLabel[row.change_type] || row.change_type || "—" }),
            el("td", { text: `${amt >= 0 ? "+" : ""}${amt}` }),
            el("td", { text: String(row.after_remaining ?? "—") }),
            el("td", { text: row.remark || "—" }),
          ])
        );
      }
      table.append(tbody);
      host.append(el("div", { className: "table-wrap" }, [table]));
      appendPager();
    } catch (e) {
      clear(host);
      host.append(flash("error", e.message || "加载失败"));
    }
  }
  function appendPager() {
    if (totalPages <= 1) return;
    const pager = el("div", { className: "row-actions", style: "margin-top:12px;flex-wrap:wrap;gap:8px" });
    pager.append(
      el("button", {
        className: "btn btn-ghost",
        type: "button",
        text: "上一页",
        disabled: page <= 1 ? "true" : undefined,
        onClick: () => {
          if (page > 1) {
            page -= 1;
            reload();
          }
        },
      }),
      el("span", { className: "muted", text: `${page} / ${totalPages}` }),
      el("button", {
        className: "btn btn-ghost",
        type: "button",
        text: "下一页",
        disabled: page >= totalPages ? "true" : undefined,
        onClick: () => {
          if (page < totalPages) {
            page += 1;
            reload();
          }
        },
      })
    );
    host.append(pager);
  }
  root.append(
    shell("/admin/quota-logs", [
      el("h1", { className: "page-title", text: "额度日志" }),
      el("p", { className: "page-lead", text: "生成、兑换、撤销退还、购买等额度变动记录。" }),
      el("div", { className: "filter-bar" }, [
        el("div", { className: "field", style: "margin:0;min-width:180px" }, [
          el("label", { text: "类型" }),
          typeSel,
        ]),
        el("button", {
          className: "btn btn-primary",
          type: "button",
          text: "筛选",
          style: "width:auto",
          onClick: () => {
            page = 1;
            reload();
          },
        }),
      ]),
      host,
    ])
  );
  await reload();
}

export async function renderTestResults(root) {
  const host = el("div", { className: "panel" });
  const testSel = el("select");
  testSel.append(el("option", { value: "", text: "全部测题" }));
  try {
    const td = await api.testsList();
    for (const t of (td && td.tests) || []) {
      testSel.append(el("option", { value: t.test_code, text: t.test_name || t.test_code }));
    }
  } catch {
    /* ignore */
  }
  const filterBar = el("div", { className: "filter-bar" }, [
    el("div", { className: "field", style: "margin:0;min-width:180px" }, [el("label", { text: "测题" }), testSel]),
    el("div", { className: "field", style: "margin:0;min-width:150px" }, [
      el("label", { text: "开始日期" }),
      el("input", { type: "date", id: "tr-start" }),
    ]),
    el("div", { className: "field", style: "margin:0;min-width:150px" }, [
      el("label", { text: "结束日期" }),
      el("input", { type: "date", id: "tr-end" }),
    ]),
    el("button", {
      className: "btn btn-primary",
      type: "button",
      text: "筛选",
      style: "width:auto",
      id: "tr-filter-btn",
    }),
    el("button", {
      className: "btn btn-ghost",
      type: "button",
      text: "导出 CSV",
      style: "width:auto",
      onClick: async () => {
        try {
          const startEl = document.getElementById("tr-start");
          const endEl = document.getElementById("tr-end");
          const { blob, filename } = await api.testResultsExport({
            testCode: testSel.value || undefined,
            startDate: startEl && startEl.value,
            endDate: endEl && endEl.value,
          });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = filename;
          a.click();
          URL.revokeObjectURL(a.href);
          showToast("导出成功");
        } catch (e) {
          showToast(e.message || "导出失败", "error");
        }
      },
    }),
  ]);
  root.append(
    shell("/admin/test-results", [
      el("h1", { className: "page-title", text: "测题结果" }),
      el("p", { className: "page-lead", text: "客户完成测评的记录（按你的分销链接归属）。" }),
      filterBar,
      host,
    ])
  );
  let page = 1;
  let totalPages = 1;
  const perPage = 20;
  async function reload() {
    clear(host);
    host.append(el("p", { className: "muted", text: "加载中…" }));
    try {
      const startEl = document.getElementById("tr-start");
      const endEl = document.getElementById("tr-end");
      const data = await api.testResults({
        testCode: testSel.value || undefined,
        startDate: startEl && startEl.value,
        endDate: endEl && endEl.value,
        page,
        perPage,
      });
      const results = (data && data.results) || [];
      const pag = (data && data.pagination) || {};
      const total = Number(pag.total || 0);
      totalPages = Number(pag.totalPages || Math.max(1, Math.ceil(total / perPage) || 1));
      page = Number(pag.page || page);
      clear(host);
      if (!results.length) {
        host.append(el("p", { className: "muted", text: total ? "本页无数据" : "暂无测题结果" }));
        if (totalPages > 1) {
          host.append(
            el("div", { className: "row-actions", style: "margin-top:12px" }, [
              el("button", {
                className: "btn btn-ghost",
                type: "button",
                text: "上一页",
                disabled: page <= 1 ? "true" : undefined,
                onClick: () => {
                  if (page > 1) {
                    page -= 1;
                    reload();
                  }
                },
              }),
              el("span", { className: "muted", text: `${page} / ${totalPages}` }),
              el("button", {
                className: "btn btn-ghost",
                type: "button",
                text: "下一页",
                disabled: page >= totalPages ? "true" : undefined,
                onClick: () => {
                  if (page < totalPages) {
                    page += 1;
                    reload();
                  }
                },
              }),
            ])
          );
        }
        return;
      }
      host.append(
        el("div", { className: "mini-stats" }, [
          el("span", { text: `共 ${total} 条` }),
          el("span", { text: `第 ${page}/${Math.max(1, totalPages)} 页` }),
        ])
      );
      const table = el("table", { className: "data" });
      table.append(
        el("thead", {}, [
          el("tr", {}, [
            el("th", { text: "完成时间" }),
            el("th", { text: "测题" }),
            el("th", { text: "Token" }),
            el("th", { text: "视角" }),
            el("th", { text: "类型" }),
          ]),
        ])
      );
      const tbody = el("tbody");
      for (const r of results) {
        tbody.append(
          el("tr", {}, [
            el("td", { text: String(r.completed_at || r.completedAt || "—") }),
            el("td", { text: r.test_code || r.testCode || "—" }),
            el("td", {}, [el("div", { className: "url-cell", text: r.token || "—" })]),
            el("td", { text: r.perspective || "—" }),
            el("td", { text: r.unlimited ? "免费测" : "分销链接" }),
          ])
        );
      }
      table.append(tbody);
      host.append(el("div", { className: "table-wrap" }, [table]));
      if (totalPages > 1) {
        host.append(
          el("div", { className: "row-actions", style: "margin-top:12px" }, [
            el("button", {
              className: "btn btn-ghost",
              type: "button",
              text: "上一页",
              disabled: page <= 1 ? "true" : undefined,
              onClick: () => {
                if (page > 1) {
                  page -= 1;
                  reload();
                }
              },
            }),
            el("span", { className: "muted", text: `${page} / ${totalPages}` }),
            el("button", {
              className: "btn btn-ghost",
              type: "button",
              text: "下一页",
              disabled: page >= totalPages ? "true" : undefined,
              onClick: () => {
                if (page < totalPages) {
                  page += 1;
                  reload();
                }
              },
            }),
          ])
        );
      }
    } catch (e) {
      clear(host);
      host.append(flash("error", e.message || "加载失败"));
    }
  }
  const filterBtn = filterBar.querySelector("#tr-filter-btn");
  if (filterBtn) {
    filterBtn.addEventListener("click", () => {
      page = 1;
      reload();
    });
  }
  await reload();
}

export async function renderAnnouncements(root) {
  const errHost = el("div");
  const listHost = el("div");

  async function refreshNavBadge() {
    try {
      const data = await api.announcementsUnread();
      const n = Number((data && (data.count ?? data.unread)) || 0);
      document.querySelectorAll(".nav-badge").forEach((node) => {
        if (n > 0) {
          node.textContent = String(n);
          node.removeAttribute("hidden");
        } else {
          node.setAttribute("hidden", "true");
        }
      });
    } catch {
      /* ignore */
    }
  }

  async function load() {
    clear(listHost);
    try {
      const data = await api.announcementsList();
      const items = (data && (data.announcements || data.list)) || [];
      if (!items.length) {
        listHost.append(el("p", { className: "muted", text: "暂无公告" }));
        return;
      }
      listHost.append(
        el(
          "div",
          { className: "stack" },
          items.map((a) => {
            const read = Boolean(a.is_read || a.isRead);
            const panel = el("div", { className: `panel${read ? " is-read" : ""}` }, [
              el("div", { className: "row-actions", style: "justify-content:space-between;align-items:flex-start;margin-bottom:8px" }, [
                el("h3", { text: a.title || "公告", style: "margin:0" }),
                read
                  ? el("span", { className: "muted", text: "已读" })
                  : el("button", {
                      className: "btn btn-ghost",
                      type: "button",
                      text: "标为已读",
                      style: "width:auto;padding:4px 10px",
                      onClick: async () => {
                        try {
                          await api.announcementsMarkRead(a.id);
                          showToast("已标为已读");
                          await load();
                          await refreshNavBadge();
                        } catch (e) {
                          showToast(e.message || "操作失败", "error");
                        }
                      },
                    }),
              ]),
              el("p", { className: "muted", text: String(a.created_at || a.updated_at || "") }),
              el("div", { html: String(a.content || "").replace(/\n/g, "<br/>") }),
            ]);
            return panel;
          })
        )
      );
    } catch (err) {
      errHost.replaceChildren(flash("error", err.message || "加载失败"));
    }
  }
  root.append(
    shell("/admin/announcements", [
      el("h1", { className: "page-title", text: "公告" }),
      el("p", { className: "page-lead", text: "平台通知与运营说明。" }),
      el("div", { className: "row-actions", style: "margin-bottom:12px" }, [
        el("button", {
          className: "btn btn-ghost",
          type: "button",
          text: "全部标为已读",
          style: "width:auto",
          onClick: async () => {
            try {
              await api.announcementsMarkAll();
              showToast("已全部标为已读");
              await load();
              await refreshNavBadge();
            } catch (e) {
              showToast(e.message || "操作失败", "error");
            }
          },
        }),
      ]),
      errHost,
      listHost,
    ])
  );
  await load();
}

export async function renderHelp(root) {
  const errHost = el("div");
  let docs = [];
  let guide = { unlocked: false, platforms: [], threshold_hint: "" };
  try {
    const [d, g] = await Promise.all([api.helpDocsList(), api.tutorialsGuide()]);
    docs = (d && (d.documents || d.list)) || [];
    guide = g || guide;
  } catch (err) {
    errHost.append(flash("error", err.message || "加载失败"));
  }
  const platforms = guide.platforms || [];
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
      el("h2", { className: "section-h", text: "平台教程" }),
      !guide.unlocked
        ? el("div", { className: "panel" }, [
            el("p", { className: "muted", text: guide.threshold_hint || "完成指定购额或兑换额度后可解锁详细教程链接。" }),
            platforms.length
              ? el("p", { className: "muted", text: `已展示 ${platforms.length} 个平台标题，链接与密码解锁后可见。` })
              : el("p", { className: "muted", text: "暂无教程" }),
          ])
        : platforms.length === 0
          ? el("p", { className: "muted", text: "暂无教程" })
          : el(
              "div",
              { className: "stack" },
              platforms.map((t) =>
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
