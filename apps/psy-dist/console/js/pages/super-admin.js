import { api, getUser } from "../api.js";
import { el, flash, openModal } from "../ui.js";
import { navigate } from "../router.js";
import { shell, isSuper } from "./admin.js";

function guard() {
  if (!isSuper()) {
    navigate("/admin/dashboard", { replace: true });
    return false;
  }
  return true;
}

function table(headers, rows) {
  return el("table", { className: "data-table" }, [
    el("thead", {}, [el("tr", {}, headers.map((h) => el("th", { text: h })))]),
    el("tbody", {}, rows),
  ]);
}

export async function renderSaDashboard(root) {
  if (!guard()) return;
  const errHost = el("div");
  let stats = {};
  let pay = {};
  try {
    [stats, pay] = await Promise.all([api.saDashboard(), api.saPaymentStats().catch(() => ({}))]);
    stats = stats || {};
    pay = pay || {};
  } catch (err) {
    errHost.append(flash("error", err.message || "加载失败"));
  }
  const byTest = stats.links_by_test || [];
  const alerts = pay.fulfillment_alerts || {};
  const unfulfilled = alerts.unfulfilled || [];
  const fulfillErrors = alerts.fulfill_errors || [];
  const alertCount = Number(alerts.unfulfilled_count || 0) + Number(alerts.fulfill_error_count || 0);

  const alertPanel =
    alertCount > 0
      ? el("div", { className: "alert-panel" }, [
          el("h3", { text: `履约告警（${alertCount}）` }),
          el("p", {
            className: "muted",
            text: `已付未入账 ${alerts.unfulfilled_count || 0} · 履约失败需人工处理 ${alerts.fulfill_error_count || 0}`,
          }),
          unfulfilled.length
            ? table(
                ["类型", "订单号", "用户", "套餐", "金额", "时间"],
                unfulfilled.map((r) =>
                  el("tr", {}, [
                    el("td", { text: "未履约" }),
                    el("td", { text: r.order_no || "—" }),
                    el("td", { text: String(r.user_id ?? "—") }),
                    el("td", { text: r.plan_code || "—" }),
                    el("td", { text: String(r.amount ?? "—") }),
                    el("td", { text: r.paid_at || "—" }),
                  ])
                )
              )
            : null,
          fulfillErrors.length
            ? table(
                ["类型", "订单号", "用户", "错误", "时间"],
                fulfillErrors.map((r) =>
                  el("tr", {}, [
                    el("td", { text: "履约失败" }),
                    el("td", { text: r.order_no || "—" }),
                    el("td", { text: String(r.user_id ?? "—") }),
                    el("td", { text: r.fulfill_error || "—" }),
                    el("td", { text: r.paid_at || "—" }),
                  ])
                )
              )
            : null,
        ].filter(Boolean))
      : el("div", { className: "alert-panel ok" }, [
          el("h3", { text: "履约告警" }),
          el("p", { className: "muted", text: "暂无已付未履约或履约失败订单。" }),
        ]);

  root.append(
    shell("/super-admin/dashboard", [
      el("h1", { className: "page-title", text: "超管看板" }),
      el("p", { className: "page-lead", text: `平台概览 · ${(getUser() || {}).username || ""}` }),
      errHost,
      alertPanel,
      el("div", { className: "stat-row" }, [
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "分销商" }),
          el("div", { className: "v", text: String(stats.distributors ?? "—") }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "额度剩余/总量" }),
          el("div", {
            className: "v",
            style: "font-size:1.1rem",
            text: `${stats.quota_remaining ?? "—"} / ${stats.quota_total ?? "—"}`,
          }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "今日营收" }),
          el("div", { className: "v", text: `¥${pay.today_revenue ?? pay.today?.revenue ?? 0}` }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "本月营收" }),
          el("div", { className: "v", text: `¥${pay.month_revenue ?? pay.month?.revenue ?? 0}` }),
        ]),
      ]),
      el("div", { className: "panel" }, [
        el("h3", { text: "测题链接分布" }),
        byTest.length === 0
          ? el("p", { className: "muted", text: "暂无数据" })
          : table(
              ["测题", "链接数"],
              byTest.map((r) =>
                el("tr", {}, [
                  el("td", { text: r.test_code || "—" }),
                  el("td", { text: String(r.links ?? 0) }),
                ])
              )
            ),
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
      table(
        ["ID", "用户名", "角色", "状态", "剩余额度", "教程", "操作"],
        users.map((u) => {
          const uid = u.user_id || u.id;
          const adjustInput = el("input", { type: "number", placeholder: "±额度", style: "width:80px" });
          const tutOn = Boolean(u.detailed_tutorial_access);
          return el("tr", {}, [
            el("td", { text: String(uid) }),
            el("td", { text: u.username || "—" }),
            el("td", { text: u.role || "—" }),
            el("td", { text: u.status || "—" }),
            el("td", { text: String(u.remaining_quota ?? "—") }),
            el("td", { text: tutOn ? "已解锁" : "未解锁" }),
            el("td", {}, [
              el("div", { className: "row-actions", style: "flex-wrap:wrap;gap:6px" }, [
                adjustInput,
                el("button", {
                  className: "btn btn-primary",
                  type: "button",
                  text: "调额",
                  style: "width:auto;padding:6px 10px",
                  onClick: async () => {
                    const amount = Number(adjustInput.value);
                    if (!amount) return errHost.replaceChildren(flash("error", "请输入非零额度"));
                    try {
                      await api.saAdjustQuota(uid, amount);
                      errHost.replaceChildren(flash("ok", "调额成功"));
                      await reload();
                    } catch (err) {
                      errHost.replaceChildren(flash("error", err.message || "失败"));
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
                      errHost.replaceChildren(flash("error", err.message || "失败"));
                    }
                  },
                }),
                el("button", {
                  className: "btn btn-ghost",
                  type: "button",
                  text: tutOn ? "关教程" : "开教程",
                  style: "width:auto;padding:6px 10px",
                  onClick: async () => {
                    try {
                      await api.saToggleTutorial(uid, !tutOn);
                      await reload();
                    } catch (err) {
                      errHost.replaceChildren(flash("error", err.message || "失败"));
                    }
                  },
                }),
                el("button", {
                  className: "btn btn-ghost",
                  type: "button",
                  text: "重置密码",
                  style: "width:auto;padding:6px 10px",
                  onClick: async () => {
                    const pw = window.prompt("新密码（至少 6 位）", "");
                    if (!pw || pw.length < 6) return;
                    try {
                      await api.saResetPassword(uid, pw);
                      errHost.replaceChildren(flash("ok", "已重置"));
                    } catch (err) {
                      errHost.replaceChildren(flash("error", err.message || "失败"));
                    }
                  },
                }),
              ]),
            ]),
          ]);
        })
      )
    );
  }
  root.append(
    shell("/super-admin/users", [
      el("h1", { className: "page-title", text: "分销商管理" }),
      el("p", { className: "page-lead", text: "调额、启停、重置密码。超管也可由 PSY_DIST_SUPER_USERNAMES 指定。" }),
      errHost,
      listHost,
    ])
  );
  await reload();
}

export async function renderSaOrders(root) {
  if (!guard()) return;
  const errHost = el("div");
  const listHost = el("div");
  async function reload() {
    try {
      const data = await api.saOrders(200);
      const orders = (data && (data.orders || data.list)) || [];
      listHost.replaceChildren(
        orders.length === 0
          ? el("p", { className: "muted", text: "暂无订单" })
          : table(
              ["订单号", "套餐", "金额", "额度", "状态", "支付方式", "时间"],
              orders.map((o) =>
                el("tr", {}, [
                  el("td", { text: o.order_no || o.id || "—" }),
                  el("td", { text: o.package_name || o.plan_code || "—" }),
                  el("td", {
                    text: o.amount != null ? `¥${(Number(o.amount) / 100).toFixed(2)}` : "—",
                  }),
                  el("td", { text: String(o.quota_amount ?? o.quota_value ?? "—") }),
                  el("td", { text: o.status || "—" }),
                  el("td", { text: o.payment_method || "—" }),
                  el("td", { text: String(o.paid_at || o.created_at || "—") }),
                ])
              )
            )
      );
    } catch (err) {
      errHost.replaceChildren(flash("error", err.message || "加载失败"));
    }
  }
  root.append(
    shell("/super-admin/orders", [
      el("h1", { className: "page-title", text: "额度订单" }),
      el("div", { className: "row-actions", style: "margin-bottom:12px" }, [
        el("button", {
          className: "btn btn-ghost",
          type: "button",
          text: "导出 CSV",
          style: "width:auto",
          onClick: async () => {
            try {
              const { blob, filename } = await api.saOrdersExport();
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = filename;
              a.click();
              URL.revokeObjectURL(a.href);
            } catch (e) {
              alert(e.message || "导出失败");
            }
          },
        }),
        el("button", {
          className: "btn btn-primary",
          type: "button",
          text: "刷新",
          style: "width:auto",
          onClick: reload,
        }),
      ]),
      errHost,
      listHost,
    ])
  );
  await reload();
}

export async function renderSaPaymentStats(root) {
  if (!guard()) return;
  const errHost = el("div");
  const rangeHost = el("div");
  let stats = {};
  let cfg = {};
  try {
    [stats, cfg] = await Promise.all([api.saPaymentStats(), api.saPaymentConfig()]);
  } catch (err) {
    errHost.append(flash("error", err.message || "加载失败"));
  }
  const ratio = stats.payment_method_ratio || [];
  const startInput = el("input", { type: "date" });
  const endInput = el("input", { type: "date" });
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  endInput.value = today.toISOString().slice(0, 10);
  startInput.value = monthStart.toISOString().slice(0, 10);

  async function loadRange() {
    clear(rangeHost);
    rangeHost.append(el("p", { className: "muted", text: "加载区间统计…" }));
    try {
      const data = await api.saPaymentStatsRange({
        startDate: startInput.value,
        endDate: endInput.value,
      });
      const summary = (data && data.summary) || {};
      const trend = (data && data.daily_trend) || [];
      const rangeRatio = (data && data.payment_method_ratio) || [];
      clear(rangeHost);
      rangeHost.append(
        el("h3", { text: `区间统计 ${data.start_date || startInput.value} ~ ${data.end_date || endInput.value}` }),
        el("div", { className: "stat-row cols-2", style: "margin-bottom:12px" }, [
          el("div", { className: "stat" }, [
            el("div", { className: "k", text: "区间营收" }),
            el("div", { className: "v", text: `¥${summary.revenue ?? 0}` }),
          ]),
          el("div", { className: "stat" }, [
            el("div", { className: "k", text: "已付订单" }),
            el("div", { className: "v", text: String(summary.paid_order_count ?? 0) }),
          ]),
        ]),
        rangeRatio.length
          ? table(
              ["支付方式", "笔数"],
              rangeRatio.map((r) =>
                el("tr", {}, [
                  el("td", { text: r.method || "—" }),
                  el("td", { text: String(r.count || 0) }),
                ])
              )
            )
          : el("p", { className: "muted", text: "该区间暂无已付订单" }),
        trend.length
          ? el("div", { style: "margin-top:12px" }, [
              el("h4", { text: "日趋势" }),
              table(
                ["日期", "营收", "已付笔数"],
                trend.map((r) =>
                  el("tr", {}, [
                    el("td", { text: r.date || "—" }),
                    el("td", { text: `¥${r.revenue ?? 0}` }),
                    el("td", { text: String(r.paid_order_count ?? 0) }),
                  ])
                )
              ),
            ])
          : null
      );
    } catch (e) {
      clear(rangeHost);
      rangeHost.append(flash("error", e.message || "加载区间统计失败"));
    }
  }

  root.append(
    shell("/super-admin/payment-stats", [
      el("h1", { className: "page-title", text: "支付统计" }),
      el("p", {
        className: "page-lead",
        text: `通道：${cfg.wxpay_configured ? "已配置" : "未配置"} · 回调：${cfg.notify_base || "—"} · 测试价：${cfg.test_enabled ? "开" : "关"}`,
      }),
      errHost,
      el("div", { className: "stat-row cols-3" }, [
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "今日营收" }),
          el("div", { className: "v", text: `¥${stats.today_revenue ?? 0}` }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "本月营收" }),
          el("div", { className: "v", text: `¥${stats.month_revenue ?? 0}` }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "今日已付/未付" }),
          el("div", {
            className: "v",
            style: "font-size:1.1rem",
            text: `${stats.today_paid_order_count ?? 0} / ${stats.today_unpaid_order_count ?? 0}`,
          }),
        ]),
      ]),
      el("div", { className: "panel" }, [
        el("h3", { text: "支付方式占比" }),
        ratio.length === 0
          ? el("p", { className: "muted", text: "暂无已付订单" })
          : table(
              ["方式", "笔数"],
              ratio.map((r) =>
                el("tr", {}, [
                  el("td", { text: r.method || "—" }),
                  el("td", { text: String(r.count || 0) }),
                ])
              )
            ),
      ]),
      el("div", { className: "panel" }, [
        el("h3", { text: "区间统计" }),
        el("div", { className: "filter-bar" }, [
          el("div", { className: "field", style: "margin:0;min-width:150px" }, [
            el("label", { text: "开始日期" }),
            startInput,
          ]),
          el("div", { className: "field", style: "margin:0;min-width:150px" }, [
            el("label", { text: "结束日期" }),
            endInput,
          ]),
          el("button", {
            className: "btn btn-primary",
            type: "button",
            text: "查询",
            style: "width:auto",
            onClick: () => loadRange(),
          }),
        ]),
        rangeHost,
      ]),
      el("p", {
        className: "muted",
        text: "支付密钥（商户 PID/KEY）仅服务器环境变量可改；下方可开关展示通道与闲鱼兜底。",
      }),
      el("div", { className: "panel", id: "sa-pay-config-host" }),
    ])
  );
  const cfgHost = root.querySelector("#sa-pay-config-host");
  if (cfgHost) {
    const wxOn = el("input", { type: "checkbox", checked: cfg.wechat_enabled !== false ? "true" : undefined });
    const aliOn = el("input", { type: "checkbox", checked: cfg.alipay_enabled !== false ? "true" : undefined });
    const xyOn = el("input", {
      type: "checkbox",
      checked: cfg.xianyu_fallback_enabled !== false ? "true" : undefined,
    });
    const saveBtn = el("button", {
      className: "btn btn-primary",
      type: "button",
      text: "保存支付展示配置",
      style: "width:auto",
    });
    saveBtn.addEventListener("click", async () => {
      try {
        await api.saPaymentConfigSave({
          wechat_enabled: wxOn.checked,
          alipay_enabled: aliOn.checked,
          xianyu_fallback_enabled: xyOn.checked,
        });
        alert("已保存");
      } catch (e) {
        alert(e.message || "保存失败");
      }
    });
    cfgHost.append(
      el("h3", { text: "通道展示开关" }),
      el("label", { style: "display:block;margin:8px 0" }, [wxOn, " 展示微信支付"]),
      el("label", { style: "display:block;margin:8px 0" }, [aliOn, " 展示支付宝"]),
      el("label", { style: "display:block;margin:8px 0" }, [xyOn, " 启用闲鱼购码兜底"]),
      saveBtn
    );
  }
  await loadRange();
}

export async function renderSaPackages(root) {
  if (!guard()) return;
  const errHost = el("div");
  const listHost = el("div");
  const plan = el("input", { placeholder: "plan_code 如 psy_quota_200" });
  const name = el("input", { placeholder: "名称" });
  const price = el("input", { type: "number", step: "0.01", placeholder: "价格(元)" });
  const quota = el("input", { type: "number", placeholder: "额度" });
  const subtitle = el("input", { placeholder: "副标题" });

  async function reload() {
    const data = await api.saPackages();
    const pkgs = (data && (data.packages || data.list)) || [];
    listHost.replaceChildren(
      table(
        ["名称", "plan", "价格", "额度", "启用", "来源", "操作"],
        pkgs.map((p) =>
          el("tr", {}, [
            el("td", { text: p.name || "—" }),
            el("td", { text: p.plan_code || "—" }),
            el("td", { text: String(p.price_yuan ?? "—") }),
            el("td", { text: String(p.quota_amount ?? p.quota ?? "—") }),
            el("td", { text: p.is_enabled ? "是" : "否" }),
            el("td", { text: p.source || "—" }),
            el("td", {}, [
              p.source === "db"
                ? el("button", {
                    className: "btn btn-ghost",
                    type: "button",
                    text: "删除",
                    style: "width:auto;padding:6px 10px",
                    onClick: async () => {
                      if (!confirm("删除该套餐？")) return;
                      try {
                        await api.saPackageDelete(p.plan_code || p.id);
                        await reload();
                      } catch (err) {
                        errHost.replaceChildren(flash("error", err.message || "失败"));
                      }
                    },
                  })
                : el("span", { className: "muted", text: "内置" }),
            ]),
          ])
        )
      )
    );
  }

  const form = el("form", { className: "panel" }, [
    el("h3", { text: "新增 / 覆盖套餐" }),
    el("div", { className: "field" }, [el("label", { text: "plan_code" }), plan]),
    el("div", { className: "field" }, [el("label", { text: "名称" }), name]),
    el("div", { className: "field" }, [el("label", { text: "价格(元)" }), price]),
    el("div", { className: "field" }, [el("label", { text: "额度" }), quota]),
    el("div", { className: "field" }, [el("label", { text: "副标题" }), subtitle]),
    el("button", { className: "btn btn-primary", type: "submit", text: "保存", style: "width:auto" }),
  ]);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api.saPackageSave({
        plan_code: plan.value.trim(),
        name: name.value.trim(),
        price_yuan: Number(price.value),
        quota_amount: Number(quota.value),
        subtitle: subtitle.value.trim(),
        is_enabled: true,
      });
      errHost.replaceChildren(flash("ok", "已保存（支付金额已热更新）"));
      await reload();
    } catch (err) {
      errHost.replaceChildren(flash("error", err.message || "保存失败"));
    }
  });

  root.append(
    shell("/super-admin/packages", [
      el("h1", { className: "page-title", text: "套餐管理" }),
      el("p", { className: "page-lead", text: "DB 套餐可覆盖内置 psy_quota_*；保存后立即可购买。" }),
      errHost,
      form,
      listHost,
    ])
  );
  try {
    await reload();
  } catch (err) {
    errHost.append(flash("error", err.message || "加载失败"));
  }
}

export async function renderSaRedeem(root) {
  if (!guard()) return;
  const errHost = el("div");
  const listHost = el("div");
  const count = el("input", { type: "number", value: "5", min: "1", max: "200" });
  const sku = el("select");
  sku.append(el("option", { value: "quota_100", text: "100 额度" }), el("option", { value: "quota_500", text: "500 额度" }));
  const note = el("input", { placeholder: "备注（可选）" });
  const genOut = el("div");

  async function reload() {
    const data = await api.saRedeemList(100);
    const codes = (data && (data.codes || data.list)) || [];
    listHost.replaceChildren(
      table(
        ["码", "套餐", "状态", "激活", "操作"],
        codes.map((c) =>
          el("tr", {}, [
            el("td", { text: c.code || "—" }),
            el("td", { text: c.plan_code || "—" }),
            el("td", { text: c.status || "—" }),
            el("td", { text: `${c.current_activations ?? 0}/${c.max_activations ?? 1}` }),
            el("td", {}, [
              (c.status || "") !== "revoked"
                ? el("button", {
                    className: "btn btn-ghost",
                    type: "button",
                    text: "吊销",
                    style: "width:auto;padding:6px 10px",
                    onClick: async () => {
                      if (!confirm(`吊销 ${c.code}？`)) return;
                      try {
                        await api.saRedeemRevoke(c.code);
                        await reload();
                      } catch (err) {
                        errHost.replaceChildren(flash("error", err.message || "失败"));
                      }
                    },
                  })
                : el("span", { className: "muted", text: "已吊销" }),
            ]),
          ])
        )
      )
    );
  }

  const form = el("form", { className: "panel" }, [
    el("h3", { text: "批量生成兑换码" }),
    el("div", { className: "field" }, [el("label", { text: "数量" }), count]),
    el("div", { className: "field" }, [el("label", { text: "额度规格" }), sku]),
    el("div", { className: "field" }, [el("label", { text: "备注" }), note]),
    el("button", { className: "btn btn-primary", type: "submit", text: "生成", style: "width:auto" }),
    genOut,
  ]);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const res = await api.saRedeemGenerate({
        count: Number(count.value || 1),
        product: "psy_dist",
        sku: sku.value,
        note: note.value.trim(),
      });
      const codes = (res && res.codes) || [];
      genOut.replaceChildren(
        flash("ok", `已生成 ${codes.length} 个`),
        el("pre", {
          style: "white-space:pre-wrap;word-break:break-all;background:#f4f7f6;padding:12px;border-radius:8px",
          text: codes.join("\n"),
        })
      );
      await reload();
    } catch (err) {
      errHost.replaceChildren(flash("error", err.message || "生成失败"));
    }
  });

  root.append(
    shell("/super-admin/redeem-codes", [
      el("h1", { className: "page-title", text: "兑换码" }),
      el("p", { className: "page-lead", text: "批量生成 / 吊销额度授权码（psy_dist）。" }),
      errHost,
      form,
      listHost,
    ])
  );
  try {
    await reload();
  } catch (err) {
    errHost.append(flash("error", err.message || "加载失败"));
  }
}

export async function renderSaInviteStats(root) {
  if (!guard()) return;
  const errHost = el("div");
  let data = {};
  try {
    data = (await api.saInviteStats()) || {};
  } catch (err) {
    errHost.append(flash("error", err.message || "加载失败"));
  }
  const list = data.list || data.top_inviters || [];
  root.append(
    shell("/super-admin/invite-stats", [
      el("h1", { className: "page-title", text: "邀请统计" }),
      errHost,
      el("div", { className: "stat-row cols-3" }, [
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "邀请事件" }),
          el("div", { className: "v", text: String(data.total_invite_events || 0) }),
        ]),
        el("div", { className: "stat" }, [
          el("div", { className: "k", text: "注册奖励额度" }),
          el("div", { className: "v", text: String(data.total_reward_quota || 0) }),
        ]),
      ]),
      el("div", { className: "panel" }, [
        el("h3", { text: "邀请排行" }),
        list.length === 0
          ? el("p", { className: "muted", text: "暂无数据" })
          : table(
              ["用户", "邀请次数", "奖励"],
              list.map((r) =>
                el("tr", {}, [
                  el("td", { text: r.username || String(r.user_id) }),
                  el("td", { text: String(r.invite_count || 0) }),
                  el("td", { text: String(r.reward_sum || 0) }),
                ])
              )
            ),
      ]),
    ])
  );
}

export async function renderSaTests(root) {
  if (!guard()) return;
  const errHost = el("div");
  const listHost = el("div");
  async function reload() {
    const data = await api.saTests();
    const tests = (data && (data.tests || data.list)) || [];
    listHost.replaceChildren(
      table(
        ["代码", "名称", "题量", "启用", "热门", "排序", "操作"],
        tests.map((t) => {
          const orderInput = el("input", {
            type: "number",
            value: String(t.display_order ?? ""),
            style: "width:70px",
          });
          return el("tr", {}, [
            el("td", { text: t.test_code || "—" }),
            el("td", { text: t.test_name || "—" }),
            el("td", { text: String(t.question_count ?? "—") }),
            el("td", { text: t.is_enabled ? "是" : "否" }),
            el("td", { text: t.is_hot ? "是" : "" }),
            el("td", {}, [orderInput]),
            el("td", {}, [
              el("div", { className: "row-actions", style: "gap:6px;flex-wrap:wrap" }, [
                el("button", {
                  className: "btn btn-ghost",
                  type: "button",
                  text: t.is_enabled ? "停用" : "启用",
                  style: "width:auto;padding:6px 10px",
                  onClick: async () => {
                    try {
                      await api.saTestSave({ test_code: t.test_code, is_enabled: !t.is_enabled });
                      await reload();
                    } catch (err) {
                      errHost.replaceChildren(flash("error", err.message || "失败"));
                    }
                  },
                }),
                el("button", {
                  className: "btn btn-ghost",
                  type: "button",
                  text: t.is_hot ? "取消热门" : "设热门",
                  style: "width:auto;padding:6px 10px",
                  onClick: async () => {
                    try {
                      await api.saTestSave({ test_code: t.test_code, is_hot: !t.is_hot });
                      await reload();
                    } catch (err) {
                      errHost.replaceChildren(flash("error", err.message || "失败"));
                    }
                  },
                }),
                el("button", {
                  className: "btn btn-primary",
                  type: "button",
                  text: "保存排序",
                  style: "width:auto;padding:6px 10px",
                  onClick: async () => {
                    try {
                      await api.saTestSave({
                        test_code: t.test_code,
                        display_order: Number(orderInput.value || 0),
                      });
                      errHost.replaceChildren(flash("ok", "已保存"));
                      await reload();
                    } catch (err) {
                      errHost.replaceChildren(flash("error", err.message || "失败"));
                    }
                  },
                }),
              ]),
            ]),
          ]);
        })
      )
    );
  }
  root.append(
    shell("/super-admin/tests", [
      el("h1", { className: "page-title", text: "测题管理" }),
      el("p", { className: "page-lead", text: "启停 / 热门 / 排序写入覆盖表，不改静态文件。" }),
      errHost,
      listHost,
    ])
  );
  try {
    await reload();
  } catch (err) {
    errHost.append(flash("error", err.message || "加载失败"));
  }
}

export async function renderSaAnnouncements(root) {
  if (!guard()) return;
  const errHost = el("div");
  const listHost = el("div");
  const title = el("input", { placeholder: "标题" });
  const content = el("textarea", { placeholder: "内容", rows: "4", style: "width:100%;min-height:100px" });

  async function reload() {
    const data = await api.saAnnouncements();
    const items = (data && (data.announcements || data.list)) || [];
    listHost.replaceChildren(
      table(
        ["标题", "发布", "时间", "操作"],
        items.map((a) =>
          el("tr", {}, [
            el("td", { text: a.title || "—" }),
            el("td", { text: a.is_published ? "是" : "否" }),
            el("td", { text: String(a.updated_at || a.created_at || "—") }),
            el("td", {}, [
              el("button", {
                className: "btn btn-ghost",
                type: "button",
                text: "删除",
                style: "width:auto;padding:6px 10px",
                onClick: async () => {
                  await api.saAnnouncementDelete(a.id);
                  await reload();
                },
              }),
            ]),
          ])
        )
      )
    );
  }

  const form = el("form", { className: "panel" }, [
    el("h3", { text: "发布公告" }),
    el("div", { className: "field" }, [el("label", { text: "标题" }), title]),
    el("div", { className: "field" }, [el("label", { text: "内容" }), content]),
    el("button", { className: "btn btn-primary", type: "submit", text: "保存", style: "width:auto" }),
  ]);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api.saAnnouncementSave({
        title: title.value.trim(),
        content: content.value.trim(),
        is_published: true,
      });
      title.value = "";
      content.value = "";
      await reload();
    } catch (err) {
      errHost.replaceChildren(flash("error", err.message || "失败"));
    }
  });

  root.append(
    shell("/super-admin/announcements", [
      el("h1", { className: "page-title", text: "公告管理" }),
      errHost,
      form,
      listHost,
    ])
  );
  try {
    await reload();
  } catch (err) {
    errHost.append(flash("error", err.message || "加载失败"));
  }
}

export async function renderSaTutorials(root) {
  if (!guard()) return;
  const errHost = el("div");
  const listHost = el("div");
  const title = el("input", { placeholder: "平台/教程名" });
  const desc = el("input", { placeholder: "描述" });
  const link = el("input", { placeholder: "教程链接" });
  const pwd = el("input", { placeholder: "访问密码（可选）" });

  async function reload() {
    const data = await api.saTutorials();
    const items = (data && (data.tutorials || data.list)) || [];
    listHost.replaceChildren(
      table(
        ["标题", "链接", "操作"],
        items.map((t) =>
          el("tr", {}, [
            el("td", { text: t.title || "—" }),
            el("td", { text: t.tutorial_link || "—" }),
            el("td", {}, [
              el("button", {
                className: "btn btn-ghost",
                type: "button",
                text: "删除",
                style: "width:auto;padding:6px 10px",
                onClick: async () => {
                  await api.saTutorialDelete(t.id);
                  await reload();
                },
              }),
            ]),
          ])
        )
      )
    );
  }

  const form = el("form", { className: "panel" }, [
    el("h3", { text: "添加教程" }),
    el("div", { className: "field" }, [el("label", { text: "标题" }), title]),
    el("div", { className: "field" }, [el("label", { text: "描述" }), desc]),
    el("div", { className: "field" }, [el("label", { text: "链接" }), link]),
    el("div", { className: "field" }, [el("label", { text: "密码" }), pwd]),
    el("button", { className: "btn btn-primary", type: "submit", text: "保存", style: "width:auto" }),
  ]);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api.saTutorialSave({
        title: title.value.trim(),
        description: desc.value.trim(),
        tutorial_link: link.value.trim(),
        access_password: pwd.value.trim(),
        is_published: true,
      });
      await reload();
    } catch (err) {
      errHost.replaceChildren(flash("error", err.message || "失败"));
    }
  });

  root.append(
    shell("/super-admin/tutorials", [
      el("h1", { className: "page-title", text: "教程管理" }),
      errHost,
      form,
      listHost,
    ])
  );
  try {
    await reload();
  } catch (err) {
    errHost.append(flash("error", err.message || "加载失败"));
  }
}

export async function renderSaHelpDocs(root) {
  if (!guard()) return;
  const errHost = el("div");
  const listHost = el("div");
  const title = el("input", { placeholder: "标题" });
  const content = el("textarea", { placeholder: "内容", style: "width:100%;min-height:100px" });

  async function reload() {
    const data = await api.saHelpDocs();
    const items = (data && (data.documents || data.list)) || [];
    listHost.replaceChildren(
      table(
        ["标题", "分类", "操作"],
        items.map((d) =>
          el("tr", {}, [
            el("td", { text: d.title || "—" }),
            el("td", { text: d.category || "—" }),
            el("td", {}, [
              el("button", {
                className: "btn btn-ghost",
                type: "button",
                text: "删除",
                style: "width:auto;padding:6px 10px",
                onClick: async () => {
                  await api.saHelpDelete(d.id);
                  await reload();
                },
              }),
            ]),
          ])
        )
      )
    );
  }

  const form = el("form", { className: "panel" }, [
    el("h3", { text: "新增帮助文档" }),
    el("div", { className: "field" }, [el("label", { text: "标题" }), title]),
    el("div", { className: "field" }, [el("label", { text: "内容" }), content]),
    el("button", { className: "btn btn-primary", type: "submit", text: "保存", style: "width:auto" }),
  ]);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api.saHelpSave({
        title: title.value.trim(),
        content: content.value.trim(),
        is_published: true,
      });
      await reload();
    } catch (err) {
      errHost.replaceChildren(flash("error", err.message || "失败"));
    }
  });

  root.append(
    shell("/super-admin/help-docs", [
      el("h1", { className: "page-title", text: "帮助文档" }),
      errHost,
      form,
      listHost,
    ])
  );
  try {
    await reload();
  } catch (err) {
    errHost.append(flash("error", err.message || "加载失败"));
  }
}

export async function renderSaConfig(root) {
  if (!guard()) return;
  const errHost = el("div");
  let cfg = {};
  try {
    cfg = (await api.saConfigGet()) || {};
  } catch (err) {
    errHost.append(flash("error", err.message || "加载失败"));
  }
  const fields = {
    site_name: el("input", { value: cfg.site_name || "" }),
    invite_rebate_percent: el("input", { type: "number", value: cfg.invite_rebate_percent || "20" }),
    customer_service_wechat: el("input", { value: cfg.customer_service_wechat || "" }),
    customer_service_hours: el("input", { value: cfg.customer_service_hours || "" }),
    customer_service_response_time: el("input", { value: cfg.customer_service_response_time || "" }),
    customer_service_qrcode: el("input", { value: cfg.customer_service_qrcode || "", placeholder: "二维码图片 URL，或下方上传" }),
    xianyu_shop_link: el("input", { value: cfg.xianyu_shop_link || "" }),
    xianyu_shop_qrcode: el("input", { value: cfg.xianyu_shop_qrcode || "", placeholder: "闲鱼二维码 URL，或下方上传" }),
    tutorial_unlock_min_price_yuan: el("input", { type: "number", value: cfg.tutorial_unlock_min_price_yuan || "59" }),
    tutorial_unlock_min_redeem_quota: el("input", { type: "number", value: cfg.tutorial_unlock_min_redeem_quota || "300" }),
    tutorial_unlocked: el("select", {}, [
      el("option", { value: "false", text: "否（按门槛解锁）" }),
      el("option", { value: "true", text: "是（全员解锁）" }),
    ]),
    link_max_uses: el("input", { type: "number", value: cfg.link_max_uses || "3" }),
    link_expire_hours: el("input", { type: "number", value: cfg.link_expire_hours || "24" }),
    wecom_webhook: el("input", { value: cfg.wecom_webhook || "" }),
  };
  const labels = {
    site_name: "站点名",
    invite_rebate_percent: "首购邀请返利%",
    customer_service_wechat: "客服微信",
    customer_service_hours: "客服时间",
    customer_service_response_time: "响应说明",
    customer_service_qrcode: "客服二维码 URL",
    xianyu_shop_link: "闲鱼链接",
    xianyu_shop_qrcode: "闲鱼二维码 URL",
    tutorial_unlock_min_price_yuan: "教程解锁最低购额(元)",
    tutorial_unlock_min_redeem_quota: "教程解锁最低兑换额度",
    tutorial_unlocked: "教程全员解锁",
    link_max_uses: "链接默认可用次数",
    link_expire_hours: "链接有效小时",
    wecom_webhook: "企微 Webhook",
  };
  fields.tutorial_unlocked.value = ["1", "true", "yes"].includes(
    String(cfg.tutorial_unlocked || "false").toLowerCase()
  )
    ? "true"
    : "false";
  const preview = el("img", {
    src: cfg.customer_service_qrcode || "",
    alt: "客服二维码预览",
    style: `max-width:180px;margin-top:8px;${cfg.customer_service_qrcode ? "" : "display:none"}`,
  });
  const fileInput = el("input", { type: "file", accept: "image/png,image/jpeg,image/gif,image/webp" });
  const uploadBtn = el("button", {
    className: "btn btn-ghost",
    type: "button",
    text: "上传客服二维码",
    style: "width:auto",
  });
  uploadBtn.addEventListener("click", async () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) {
      fileInput.click();
      return;
    }
    try {
      uploadBtn.disabled = true;
      const data = await api.uploadImage(f);
      const url = (data && data.url) || "";
      if (!url) throw new Error("未返回图片地址");
      fields.customer_service_qrcode.value = url;
      preview.src = url;
      preview.style.display = "";
      errHost.replaceChildren(flash("ok", "上传成功，请再点「保存配置」"));
    } catch (err) {
      errHost.replaceChildren(flash("error", err.message || "上传失败"));
    } finally {
      uploadBtn.disabled = false;
      fileInput.value = "";
    }
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) uploadBtn.click();
  });
  const xyPreview = el("img", {
    src: cfg.xianyu_shop_qrcode || "",
    alt: "闲鱼二维码预览",
    style: `max-width:180px;margin-top:8px;${cfg.xianyu_shop_qrcode ? "" : "display:none"}`,
  });
  const xyFileInput = el("input", { type: "file", accept: "image/png,image/jpeg,image/gif,image/webp" });
  const xyUploadBtn = el("button", {
    className: "btn btn-ghost",
    type: "button",
    text: "上传闲鱼二维码",
    style: "width:auto",
  });
  xyUploadBtn.addEventListener("click", async () => {
    const f = xyFileInput.files && xyFileInput.files[0];
    if (!f) {
      xyFileInput.click();
      return;
    }
    try {
      xyUploadBtn.disabled = true;
      const data = await api.uploadImage(f);
      const url = (data && data.url) || "";
      if (!url) throw new Error("未返回图片地址");
      fields.xianyu_shop_qrcode.value = url;
      xyPreview.src = url;
      xyPreview.style.display = "";
      errHost.replaceChildren(flash("ok", "闲鱼二维码上传成功，请再点「保存配置」"));
    } catch (err) {
      errHost.replaceChildren(flash("error", err.message || "上传失败"));
    } finally {
      xyUploadBtn.disabled = false;
      xyFileInput.value = "";
    }
  });
  xyFileInput.addEventListener("change", () => {
    if (xyFileInput.files && xyFileInput.files[0]) xyUploadBtn.click();
  });
  const form = el("form", { className: "panel" }, [
    ...Object.keys(fields).map((k) => el("div", { className: "field" }, [el("label", { text: labels[k] }), fields[k]])),
    el("div", { className: "field" }, [
      el("label", { text: "客服微信二维码上传" }),
      el("p", { className: "muted", text: "上传后自动填入上方 URL（保存到 /uploads/），再点保存配置生效。" }),
      el("div", { className: "row-actions" }, [fileInput, uploadBtn]),
      preview,
    ]),
    el("div", { className: "field" }, [
      el("label", { text: "闲鱼店铺二维码上传" }),
      el("div", { className: "row-actions" }, [xyFileInput, xyUploadBtn]),
      xyPreview,
    ]),
    el("div", { className: "row-actions" }, [
      el("button", { className: "btn btn-primary", type: "submit", text: "保存配置", style: "width:auto" }),
      el("button", {
        className: "btn btn-ghost",
        type: "button",
        text: "测试企微",
        style: "width:auto",
        onClick: async () => {
          try {
            await api.saConfigTestWecom();
            errHost.replaceChildren(flash("ok", "测试消息已发送"));
          } catch (err) {
            errHost.replaceChildren(flash("error", err.message || "失败"));
          }
        },
      }),
    ]),
    el("p", {
      className: "muted",
      text: `支付：${cfg.payment_wxpay_configured ? "已配置" : "未配置"} · notify ${cfg.payment_notify_base || "—"}`,
    }),
  ]);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {};
    for (const k of Object.keys(fields)) payload[k] = fields[k].value;
    try {
      await api.saConfigUpdate(payload);
      errHost.replaceChildren(flash("ok", "已保存"));
    } catch (err) {
      errHost.replaceChildren(flash("error", err.message || "失败"));
    }
  });
  root.append(
    shell("/super-admin/config", [
      el("h1", { className: "page-title", text: "系统配置" }),
      el("p", { className: "page-lead", text: "客服、邀请返利比例、链接默认参数。支付密钥走环境变量。" }),
      errHost,
      form,
    ])
  );
}

export async function renderSaTestResults(root) {
  if (!guard()) return;
  const errHost = el("div");
  const host = el("div");
  const userFilter = el("input", { type: "number", placeholder: "用户ID（可选）", style: "width:120px" });
  const testFilter = el("input", { placeholder: "测题 code（可选）" });
  async function reload() {
    try {
      const data = await api.saTestResults({
        userId: userFilter.value || undefined,
        testCode: testFilter.value.trim() || undefined,
        page: 1,
        perPage: 50,
      });
      const results = (data && data.results) || [];
      clear(host);
      if (!results.length) {
        host.append(el("p", { className: "muted", text: "暂无测题结果" }));
        return;
      }
      host.append(
        table(
          ["时间", "用户", "测题", "Token", "视角", "类型"],
          results.map((r) =>
            el("tr", {}, [
              el("td", { text: String(r.completed_at || r.completedAt || "—") }),
              el("td", { text: r.username || String(r.user_id || "—") }),
              el("td", { text: r.test_code || r.testCode || "—" }),
              el("td", {}, [el("div", { className: "url-cell", text: r.token || "—" })]),
              el("td", { text: r.perspective || "—" }),
              el("td", { text: r.unlimited ? "免费测" : "分销" }),
            ])
          )
        )
      );
    } catch (err) {
      clear(host);
      host.append(flash("error", err.message || "加载失败"));
    }
  }
  root.append(
    shell("/super-admin/test-results", [
      el("h1", { className: "page-title", text: "全站测题结果" }),
      el("p", { className: "page-lead", text: "所有分销商链接/免费测的完成记录。" }),
      errHost,
      el("div", { className: "filter-bar" }, [
        el("div", { className: "field", style: "margin:0" }, [el("label", { text: "用户ID" }), userFilter]),
        el("div", { className: "field", style: "margin:0" }, [el("label", { text: "测题" }), testFilter]),
        el("button", {
          className: "btn btn-primary",
          type: "button",
          text: "筛选",
          style: "width:auto",
          onClick: reload,
        }),
      ]),
      host,
    ])
  );
  await reload();
}

export async function renderSaPackageDocs(root) {
  if (!guard()) return;
  const errHost = el("div");
  const listHost = el("div");
  const title = el("input", { required: "true", placeholder: "文档标题" });
  const url = el("input", { placeholder: "文档链接 URL" });
  const pkgId = el("select");
  pkgId.append(el("option", { value: "0", text: "0 · 通用（全部套餐）" }));
  const order = el("input", { type: "number", value: "0" });
  let editId = null;

  async function loadPackageOptions() {
    try {
      const data = await api.saPackages();
      const packages = (data && (data.packages || data.list)) || [];
      for (const p of packages) {
        const id = p.id ?? p.package_id ?? p.list_id;
        if (id == null) continue;
        const label = `${id} · ${p.name || p.title || p.plan_code || "套餐"}`;
        pkgId.append(el("option", { value: String(id), text: label }));
      }
    } catch {
      /* 保留通用选项即可 */
    }
  }

  function setPkgId(val) {
    const v = String(val ?? 0);
    if ([...pkgId.options].some((o) => o.value === v)) pkgId.value = v;
    else {
      pkgId.append(el("option", { value: v, text: `${v} · 自定义 ID` }));
      pkgId.value = v;
    }
  }
  async function reload() {
    try {
      const data = await api.saPackageDocs();
      const docs = (data && (data.documents || data.list)) || [];
      listHost.replaceChildren(
        docs.length === 0
          ? el("p", { className: "muted", text: "暂无套餐文档" })
          : table(
              ["ID", "标题", "链接", "套餐ID", "排序", "操作"],
              docs.map((d) =>
                el("tr", {}, [
                  el("td", { text: String(d.id) }),
                  el("td", { text: d.title || "—" }),
                  el("td", {}, [
                    d.document_url
                      ? el("a", { href: d.document_url, target: "_blank", text: "打开" })
                      : el("span", { text: "—" }),
                  ]),
                  el("td", { text: String(d.package_id ?? d.packageId ?? 0) }),
                  el("td", { text: String(d.display_order ?? 0) }),
                  el("td", {}, [
                    el("button", {
                      className: "btn btn-ghost",
                      type: "button",
                      text: "编辑",
                      style: "width:auto;padding:4px 8px",
                      onClick: () => {
                        editId = d.id;
                        title.value = d.title || "";
                        url.value = d.document_url || "";
                        setPkgId(d.package_id ?? d.packageId ?? 0);
                        order.value = String(d.display_order ?? 0);
                      },
                    }),
                    el("button", {
                      className: "btn btn-ghost",
                      type: "button",
                      text: "删除",
                      style: "width:auto;padding:4px 8px",
                      onClick: async () => {
                        if (!confirm("确认删除？")) return;
                        try {
                          await api.saPackageDocDelete(d.id);
                          await reload();
                        } catch (err) {
                          errHost.replaceChildren(flash("error", err.message || "失败"));
                        }
                      },
                    }),
                  ]),
                ])
              )
            )
      );
    } catch (err) {
      errHost.replaceChildren(flash("error", err.message || "加载失败"));
    }
  }
  const form = el("form", { className: "panel" }, [
    el("h3", { text: editId ? `编辑文档 #${editId}` : "新增套餐文档" }),
    el("div", { className: "field" }, [el("label", { text: "标题" }), title]),
    el("div", { className: "field" }, [el("label", { text: "链接" }), url]),
    el("div", { className: "field" }, [el("label", { text: "关联套餐" }), pkgId]),
    el("div", { className: "field" }, [el("label", { text: "排序" }), order]),
    el("div", { className: "row-actions" }, [
      el("button", { className: "btn btn-primary", type: "submit", text: "保存", style: "width:auto" }),
      el("button", {
        className: "btn btn-ghost",
        type: "button",
        text: "清空",
        style: "width:auto",
        onClick: () => {
          editId = null;
          title.value = "";
          url.value = "";
          pkgId.value = "0";
          setPkgId(0);
          order.value = "0";
        },
      }),
    ]),
  ]);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api.saPackageDocSave({
        id: editId || undefined,
        title: title.value.trim(),
        document_url: url.value.trim(),
        package_id: Number(pkgId.value || 0),
        display_order: Number(order.value || 0),
      });
      errHost.replaceChildren(flash("ok", "已保存"));
      editId = null;
      title.value = "";
      url.value = "";
      setPkgId(0);
      order.value = "0";
      await reload();
    } catch (err) {
      errHost.replaceChildren(flash("error", err.message || "失败"));
    }
  });
  root.append(
    shell("/super-admin/package-documents", [
      el("h1", { className: "page-title", text: "套餐文档" }),
      el("p", { className: "page-lead", text: "购买页/帮助页可引用的套餐说明文档链接。" }),
      errHost,
      form,
      listHost,
    ])
  );
  await loadPackageOptions();
  await reload();
}

export async function renderSaPaymentNotifyLogs(root) {
  if (!guard()) return;
  const errHost = el("div");
  const listHost = el("div", { className: "panel" });
  const orderInput = el("input", { placeholder: "订单号" });
  const statusSel = el("select");
  statusSel.append(
    el("option", { value: "", text: "全部状态" }),
    el("option", { value: "success", text: "成功" }),
    el("option", { value: "fail", text: "失败" })
  );
  let page = 1;

  async function showDetail(id) {
    try {
      const row = await api.saPaymentNotifyLogDetail(id);
      openModal(`回调 #${id}`, [
        el("p", { className: "muted", text: `订单：${row.order_no || "—"} · ${row.created_at || ""}` }),
        el("p", { text: `状态：${row.status || (row.verify_ok ? "success" : "fail")}` }),
        el("p", { text: `交易状态：${row.trade_status || "—"}` }),
        el("p", { text: `客户端 IP：${row.client_ip || "—"}` }),
        el("p", { text: `响应：${row.response_text || "—"}` }),
        el("pre", {
          style: "white-space:pre-wrap;word-break:break-all;font-size:12px;background:#f5f7fa;padding:12px;border-radius:8px;max-height:360px;overflow:auto",
          text: row.raw_body || row.raw_params || "（无原始参数）",
        }),
      ]);
    } catch (e) {
      errHost.replaceChildren(flash("error", e.message || "加载详情失败"));
    }
  }

  async function reload() {
    clear(listHost);
    listHost.append(el("p", { className: "muted", text: "加载中…" }));
    try {
      const data = await api.saPaymentNotifyLogs({
        page,
        perPage: 30,
        orderNo: orderInput.value.trim() || undefined,
        status: statusSel.value || undefined,
      });
      const logs = (data && data.logs) || [];
      const pag = (data && data.pagination) || {};
      clear(listHost);
      if (!logs.length) {
        listHost.append(el("p", { className: "muted", text: "暂无支付回调记录" }));
        return;
      }
      const tableEl = table(
        ["ID", "订单号", "状态", "交易状态", "IP", "时间", "操作"],
        logs.map((r) =>
          el("tr", {}, [
            el("td", { text: String(r.id) }),
            el("td", { text: r.order_no || "—" }),
            el("td", { text: r.status || (r.verify_ok ? "success" : "fail") }),
            el("td", { text: r.trade_status || "—" }),
            el("td", { text: r.client_ip || "—" }),
            el("td", { text: String(r.created_at || "—") }),
            el("td", {}, [
              el("button", {
                className: "btn btn-ghost",
                type: "button",
                text: "详情",
                style: "width:auto;padding:4px 8px",
                onClick: () => showDetail(r.id),
              }),
            ]),
          ])
        )
      );
      listHost.append(el("div", { className: "table-wrap" }, [tableEl]));
      const totalPages = Number(pag.totalPages || 1);
      if (totalPages > 1) {
        listHost.append(
          el("div", { className: "row-actions", style: "margin-top:12px" }, [
            el("button", {
              className: "btn btn-ghost",
              type: "button",
              text: "上一页",
              style: "width:auto",
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
              style: "width:auto",
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
      clear(listHost);
      listHost.append(flash("error", e.message || "加载失败"));
    }
  }

  root.append(
    shell("/super-admin/payment-notify-logs", [
      el("h1", { className: "page-title", text: "支付回调日志" }),
      el("p", { className: "page-lead", text: "hwxun 异步通知记录，用于排查支付到账问题。" }),
      errHost,
      el("div", { className: "filter-bar" }, [
        el("div", { className: "field", style: "margin:0;min-width:200px" }, [
          el("label", { text: "订单号" }),
          orderInput,
        ]),
        el("div", { className: "field", style: "margin:0;min-width:140px" }, [
          el("label", { text: "状态" }),
          statusSel,
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
      listHost,
    ])
  );
  await reload();
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
      errHost,
      logs.length === 0
        ? el("p", { className: "muted", text: "暂无记录" })
        : table(
            ["时间", "用户", "类型", "变动", "余额后", "备注"],
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
    ])
  );
}

export async function renderSaOpLogs(root) {
  if (!guard()) return;
  const errHost = el("div");
  let logs = [];
  try {
    const data = await api.saOpLogs(200);
    logs = (data && (data.logs || data.list)) || [];
  } catch (err) {
    errHost.append(flash("error", err.message || "加载失败"));
  }
  root.append(
    shell("/super-admin/operation-logs", [
      el("h1", { className: "page-title", text: "操作日志" }),
      el("div", { className: "row-actions", style: "margin-bottom:12px" }, [
        el("button", {
          className: "btn btn-ghost",
          type: "button",
          text: "导出 CSV",
          style: "width:auto",
          onClick: async () => {
            try {
              const { blob, filename } = await api.saOpLogsExport();
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = filename;
              a.click();
              URL.revokeObjectURL(a.href);
            } catch (e) {
              alert(e.message || "导出失败");
            }
          },
        }),
      ]),
      errHost,
      logs.length === 0
        ? el("p", { className: "muted", text: "暂无记录" })
        : table(
            ["时间", "操作者", "动作", "目标", "详情"],
            logs.map((r) =>
              el("tr", {}, [
                el("td", { text: String(r.created_at || "—") }),
                el("td", { text: r.actor_username || String(r.actor_user_id || "—") }),
                el("td", { text: r.action || "—" }),
                el("td", { text: `${r.target_type || ""} ${r.target_id || ""}`.trim() || "—" }),
                el("td", { text: String(r.detail || "").slice(0, 80) }),
              ])
            )
          ),
    ])
  );
}
