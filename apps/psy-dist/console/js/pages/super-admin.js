import { api, getUser } from "../api.js";
import { el, flash } from "../ui.js";
import { navigate } from "../router.js";
import { shell, isSuper } from "./admin.js";

function guard() {
  if (!isSuper()) {
    navigate("/admin/dashboard", { replace: true });
    return false;
  }
  return true;
}

export async function renderSaDashboard(root) {
  if (!guard()) return;
  const errHost = el("div");
  let stats = {};
  try {
    stats = (await api.saDashboard()) || {};
  } catch (err) {
    errHost.append(flash("error", err.message || "加载失败"));
  }
  const byTest = stats.links_by_test || [];
  root.append(
    shell("/super-admin/dashboard", [
      el("h1", { className: "page-title", text: "超管看板" }),
      el("p", {
        className: "page-lead",
        text: `平台概览 · 当前账号 ${(getUser() || {}).username || ""}`,
      }),
      errHost,
      el("div", { className: "stat-row" }, [
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "分销商" }),
          el("div", { className: "v", text: String(stats.distributors ?? "—") }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "额度剩余 / 总量" }),
          el("div", {
            className: "v",
            style: "font-size:1.15rem",
            text: `${stats.quota_remaining ?? "—"} / ${stats.quota_total ?? "—"}`,
          }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "链接（未用/已用/撤销）" }),
          el("div", {
            className: "v",
            style: "font-size:1.05rem",
            text: `${stats.links_unused ?? 0} / ${stats.links_used ?? 0} / ${stats.links_revoked ?? 0}`,
          }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "订单（已付/全部）" }),
          el("div", {
            className: "v",
            style: "font-size:1.15rem",
            text: `${stats.orders_paid ?? 0} / ${stats.orders_total ?? 0}`,
          }),
        ]),
      ]),
      el("div", { className: "panel" }, [
        el("h3", { text: "测题链接分布（Top）" }),
        byTest.length === 0
          ? el("p", { className: "muted", text: "暂无数据" })
          : el("table", { className: "data-table" }, [
              el("thead", {}, [
                el("tr", {}, [el("th", { text: "测题代码" }), el("th", { text: "链接数" })]),
              ]),
              el(
                "tbody",
                {},
                byTest.map((r) =>
                  el("tr", {}, [
                    el("td", { text: r.test_code || "—" }),
                    el("td", { text: String(r.links ?? 0) }),
                  ])
                )
              ),
            ]),
      ]),
    ])
  );
}

export async function renderSaUsers(root) {
  if (!guard()) return;
  const errHost = el("div");
  const listHost = el("div");
  let users = [];

  async function reload() {
    try {
      const data = await api.saUsers(200);
      users = (data && (data.users || data.list)) || [];
      paint();
    } catch (err) {
      errHost.replaceChildren(flash("error", err.message || "加载用户失败"));
    }
  }

  function paint() {
    listHost.replaceChildren(
      el("table", { className: "data-table" }, [
        el("thead", {}, [
          el("tr", {}, [
            el("th", { text: "ID" }),
            el("th", { text: "用户名" }),
            el("th", { text: "角色" }),
            el("th", { text: "状态" }),
            el("th", { text: "剩余额度" }),
            el("th", { text: "操作" }),
          ]),
        ]),
        el(
          "tbody",
          {},
          users.map((u) => {
            const uid = u.user_id || u.id;
            const adjustInput = el("input", {
              type: "number",
              placeholder: "±额度",
              style: "width:88px",
            });
            const remarkInput = el("input", { placeholder: "备注", style: "width:100px" });
            return el("tr", {}, [
              el("td", { text: String(uid) }),
              el("td", { text: u.username || "—" }),
              el("td", { text: u.role || "—" }),
              el("td", { text: u.status || "—" }),
              el("td", { text: String(u.remaining_quota ?? "—") }),
              el("td", {}, [
                el("div", { className: "row-actions", style: "flex-wrap:wrap;gap:6px" }, [
                  adjustInput,
                  remarkInput,
                  el("button", {
                    className: "btn btn-primary",
                    type: "button",
                    text: "调额",
                    style: "width:auto;padding:6px 10px",
                    onClick: async () => {
                      const amount = Number(adjustInput.value);
                      if (!amount) {
                        errHost.replaceChildren(flash("error", "请输入非零额度"));
                        return;
                      }
                      try {
                        await api.saAdjustQuota(uid, amount, remarkInput.value.trim());
                        errHost.replaceChildren(flash("ok", "调额成功"));
                        await reload();
                      } catch (err) {
                        errHost.replaceChildren(flash("error", err.message || "调额失败"));
                      }
                    },
                  }),
                  el("button", {
                    className: "btn btn-ghost",
                    type: "button",
                    text: (u.status || "active") === "active" ? "禁用" : "启用",
                    style: "width:auto;padding:6px 10px",
                    onClick: async () => {
                      const next = (u.status || "active") === "active" ? "disabled" : "active";
                      try {
                        await api.saToggleStatus(uid, next);
                        await reload();
                      } catch (err) {
                        errHost.replaceChildren(flash("error", err.message || "状态更新失败"));
                      }
                    },
                  }),
                  el("button", {
                    className: "btn btn-ghost",
                    type: "button",
                    text: "重置密码",
                    style: "width:auto;padding:6px 10px",
                    onClick: async () => {
                      const pw = window.prompt("输入新密码（至少 6 位）", "");
                      if (!pw || pw.length < 6) return;
                      try {
                        await api.saResetPassword(uid, pw);
                        errHost.replaceChildren(flash("ok", "密码已重置"));
                      } catch (err) {
                        errHost.replaceChildren(flash("error", err.message || "重置失败"));
                      }
                    },
                  }),
                  u.role !== "super_admin"
                    ? el("button", {
                        className: "btn btn-ghost",
                        type: "button",
                        text: "设超管",
                        style: "width:auto;padding:6px 10px",
                        onClick: async () => {
                          if (!window.confirm(`将 ${u.username} 设为超级管理员？`)) return;
                          try {
                            await api.saSetRole(uid, "super_admin");
                            await reload();
                          } catch (err) {
                            errHost.replaceChildren(flash("error", err.message || "失败"));
                          }
                        },
                      })
                    : null,
                ]),
              ]),
            ]);
          })
        ),
      ])
    );
  }

  root.append(
    shell("/super-admin/users", [
      el("h1", { className: "page-title", text: "分销商管理" }),
      el("p", { className: "page-lead", text: "调额、启停、重置密码。超管也可由环境变量 PSY_DIST_SUPER_USERNAMES 指定。" }),
      errHost,
      listHost,
    ])
  );
  await reload();
}

export async function renderSaOrders(root) {
  if (!guard()) return;
  const errHost = el("div");
  let orders = [];
  try {
    const data = await api.saOrders(200);
    orders = (data && (data.orders || data.list)) || [];
  } catch (err) {
    errHost.append(flash("error", err.message || "加载订单失败"));
  }
  root.append(
    shell("/super-admin/orders", [
      el("h1", { className: "page-title", text: "额度订单" }),
      el("p", { className: "page-lead", text: "psy_quota 套餐支付订单。" }),
      errHost,
      orders.length === 0
        ? el("p", { className: "muted", text: "暂无订单" })
        : el("table", { className: "data-table" }, [
            el("thead", {}, [
              el("tr", {}, [
                el("th", { text: "订单号" }),
                el("th", { text: "用户" }),
                el("th", { text: "套餐/金额" }),
                el("th", { text: "状态" }),
                el("th", { text: "时间" }),
              ]),
            ]),
            el(
              "tbody",
              {},
              orders.map((o) =>
                el("tr", {}, [
                  el("td", { text: o.order_no || o.id || "—" }),
                  el("td", { text: String(o.user_id || o.username || "—") }),
                  el("td", {
                    text: `${o.plan_code || o.package_name || "—"} · ¥${o.amount ?? o.pay_amount ?? "—"}`,
                  }),
                  el("td", { text: o.status || "—" }),
                  el("td", { text: String(o.created_at || o.paid_at || "—") }),
                ])
              )
            ),
          ]),
    ])
  );
}

export async function renderSaInviteStats(root) {
  if (!guard()) return;
  const errHost = el("div");
  let data = { total_invite_events: 0, total_reward_quota: 0, list: [] };
  try {
    data = (await api.saInviteStats()) || data;
  } catch (err) {
    errHost.append(flash("error", err.message || "加载失败"));
  }
  const list = data.list || data.top_inviters || [];
  root.append(
    shell("/super-admin/invite-stats", [
      el("h1", { className: "page-title", text: "邀请统计" }),
      el("p", { className: "page-lead", text: "全站邀请注册奖励汇总。" }),
      errHost,
      el("div", { className: "stat-row cols-3" }, [
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "邀请事件" }),
          el("div", { className: "v", text: String(data.total_invite_events || 0) }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "发放奖励额度" }),
          el("div", { className: "v", text: String(data.total_reward_quota || 0) }),
        ]),
      ]),
      el("div", { className: "panel" }, [
        el("h3", { text: "邀请排行" }),
        list.length === 0
          ? el("p", { className: "muted", text: "暂无数据" })
          : el("table", { className: "data-table" }, [
              el("thead", {}, [
                el("tr", {}, [
                  el("th", { text: "用户" }),
                  el("th", { text: "邀请次数" }),
                  el("th", { text: "获得奖励" }),
                ]),
              ]),
              el(
                "tbody",
                {},
                list.map((r) =>
                  el("tr", {}, [
                    el("td", { text: r.username || String(r.user_id) }),
                    el("td", { text: String(r.invite_count || 0) }),
                    el("td", { text: String(r.reward_sum || 0) }),
                  ])
                )
              ),
            ]),
      ]),
    ])
  );
}

export async function renderSaTests(root) {
  if (!guard()) return;
  const errHost = el("div");
  let tests = [];
  try {
    const data = await api.saTests();
    tests = (data && (data.tests || data.list)) || [];
  } catch (err) {
    errHost.append(flash("error", err.message || "加载失败"));
  }
  root.append(
    shell("/super-admin/tests", [
      el("h1", { className: "page-title", text: "测题目录" }),
      el("p", {
        className: "page-lead",
        text: "只读展示当前 catalog。增删改请改 packages/psy-dist/tests-catalog.json 后部署。",
      }),
      errHost,
      el("table", { className: "data-table" }, [
        el("thead", {}, [
          el("tr", {}, [
            el("th", { text: "代码" }),
            el("th", { text: "名称" }),
            el("th", { text: "题量" }),
            el("th", { text: "热门" }),
          ]),
        ]),
        el(
          "tbody",
          {},
          tests.map((t) =>
            el("tr", {}, [
              el("td", { text: t.test_code || "—" }),
              el("td", { text: t.test_name || "—" }),
              el("td", { text: String(t.question_count ?? "—") }),
              el("td", { text: t.is_hot ? "是" : "" }),
            ])
          )
        ),
      ]),
    ])
  );
}

export async function renderSaQuotaLogs(root) {
  if (!guard()) return;
  const errHost = el("div");
  let logs = [];
  try {
    const data = await api.saQuotaLogs(200);
    logs = (data && (data.logs || data.list)) || [];
  } catch (err) {
    errHost.append(flash("error", err.message || "加载失败"));
  }
  root.append(
    shell("/super-admin/quota-logs", [
      el("h1", { className: "page-title", text: "额度流水" }),
      el("p", { className: "page-lead", text: "全站额度变动日志。" }),
      errHost,
      logs.length === 0
        ? el("p", { className: "muted", text: "暂无记录" })
        : el("table", { className: "data-table" }, [
            el("thead", {}, [
              el("tr", {}, [
                el("th", { text: "时间" }),
                el("th", { text: "用户" }),
                el("th", { text: "类型" }),
                el("th", { text: "变动" }),
                el("th", { text: "余额后" }),
                el("th", { text: "备注" }),
              ]),
            ]),
            el(
              "tbody",
              {},
              logs.map((r) =>
                el("tr", {}, [
                  el("td", { text: String(r.created_at || "—") }),
                  el("td", { text: r.username || String(r.user_id || "—") }),
                  el("td", { text: r.change_type || "—" }),
                  el("td", { text: String(r.amount ?? "—") }),
                  el("td", { text: String(r.after_remaining ?? "—") }),
                  el("td", { text: r.remark || "" }),
                ])
              )
            ),
          ]),
    ])
  );
}
