import { api, getUser, clearSession, getToken } from "../api.js";
import { el, flash, clear } from "../ui.js";
import { navigate, linkClick } from "../router.js";

const NAV = [
  { path: "/admin/generate-link", label: "生成链接" },
  { path: "/admin/link-management", label: "链接管理" },
  { path: "/admin/redeem-quota", label: "兑换额度" },
];

function shell(activePath, bodyChildren) {
  const user = getUser() || {};
  const nav = el(
    "nav",
    { className: "topnav" },
    NAV.map((item) =>
      el("a", {
        href: item.path,
        className: activePath.startsWith(item.path) ? "active" : "",
        text: item.label,
        onClick: (e) => linkClick(e, item.path),
      })
    )
  );

  return el("div", { className: "shell" }, [
    el("header", { className: "topbar" }, [
      el("a", { className: "brand", href: "/", }, [
        el("img", { src: "/images/logo.svg", alt: "" }),
        el("span", { text: "心象测" }),
      ]),
      nav,
      el("div", { className: "meta" }, [
        el("span", { text: user.username || user.email || "已登录" }),
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
    el("main", { className: "main" }, bodyChildren),
  ]);
}

async function loadQuota() {
  try {
    return await api.quotaInfo();
  } catch {
    return { remaining_quota: "—", quota: "—", used_quota: "—" };
  }
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
    const tests = (data && data.tests) || [];
    for (const t of tests) {
      select.append(
        el("option", {
          value: t.test_code,
          text: `${t.test_name}${t.question_count ? ` · ${t.question_count}题` : ""}`,
        })
      );
    }
  } catch (e) {
    errHost.append(flash("error", e.message || "测题列表加载失败"));
  }

  const form = el("form", { className: "panel" }, [
    errHost,
    el("div", { className: "field" }, [el("label", { text: "测评项目" }), select]),
    el("div", { className: "field" }, [el("label", { text: "生成数量（1–50）" }), count]),
    el("p", {
      className: "muted",
      text: `当前剩余额度：${quota.remaining_quota ?? "—"}。每条链接消耗额度以系统规则为准。`,
    }),
    el("div", { className: "row-actions" }, [btn]),
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
        const url =
          link.url ||
          link.link_url ||
          `${location.origin}/test/${link.test_code || select.value}/${link.token || link.link_token}`;
        const row = el("div", { className: "link-item" }, [
          url,
          " ",
          el("button", {
            className: "btn btn-ghost",
            type: "button",
            text: "复制",
            style: "margin-left:8px;min-height:32px",
            onClick: async () => {
              await navigator.clipboard.writeText(url);
            },
          }),
        ]);
        list.append(row);
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
      el("div", { className: "stat-row" }, [
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
  const errHost = el("div");
  host.append(errHost, el("p", { className: "muted", text: "加载中…" }));

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
    host.append(errHost);
    if (!links.length) {
      host.append(el("div", { className: "empty", text: "还没有链接。去「生成链接」创建第一条。" }));
      return;
    }
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
      const token = link.token || link.link_token || "";
      const code = link.test_code || link.testCode || "";
      const url = link.url || link.link_url || `${location.origin}/test/${code}/${token}`;
      const status = link.status || (link.revoked ? "revoked" : link.used ? "used" : "unused");
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
      if (status !== "revoked" && (link.id || link.link_id)) {
        actions.append(
          el("button", {
            className: "btn btn-ghost",
            type: "button",
            text: "撤销",
            onClick: async () => {
              if (!confirm("确认撤销该链接？")) return;
              try {
                await api.revokeLink(link.id || link.link_id);
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
          el("td", { text: link.test_name || code }),
          el("td", {}, [el("div", { style: "max-width:280px;word-break:break-all", text: url })]),
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

export async function renderRedeem(root) {
  const errHost = el("div");
  const input = el("input", { required: "true", placeholder: "输入兑换码" });
  const btn = el("button", { className: "btn btn-primary", type: "submit", text: "兑换", style: "width:auto" });
  const form = el("form", { className: "panel" }, [
    errHost,
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
      el("p", { className: "page-lead", text: "使用兑换码为账户充入测试额度。" }),
      form,
    ])
  );
}

export function requireAuth() {
  return Boolean(getToken());
}
