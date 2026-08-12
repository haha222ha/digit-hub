/** Local mock aligned with xhs-cloud shapes (orders/qrcode/assess access). */

const ENT_KEY = "xinxiang_entitlements";
const TOKEN_KEY = "xinxiang_token";
const PROFILE_KEY = "xinxiang_profile";
const ORDERS_KEY = "xinxiang_orders";

/** Documented local acceptance code — only this unlocks in mock auth paths. */
export const DEMO_AUTH_CODE = "XXCE-DEMO-8888";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function isValidDemoCode(code) {
  return normalizeCode(code) === DEMO_AUTH_CODE;
}

export function defaultEntitlements() {
  return {
    plan_code: "guest",
    products: {
      assess: { enabled: false, quota_per_month: 0, skins: [] },
      faka: { enabled: false, download_per_day: 0 },
      push: { enabled: false },
    },
  };
}

export function getEntitlements() {
  return readJson(ENT_KEY, defaultEntitlements());
}

export function setEntitlements(ent) {
  writeJson(ENT_KEY, ent);
}

export function unlockAssessMock({ plan_code = "assess_single", skins = ["*"] } = {}) {
  const ent = {
    plan_code,
    assess_enabled: true,
    products: {
      assess: {
        enabled: true,
        quota_per_month: plan_code === "assess_monthly" || plan_code === "assess_code" ? 30 : 1,
        skins,
      },
      faka: { enabled: false, download_per_day: 0 },
      push: { enabled: false },
    },
  };
  setEntitlements(ent);
  if (!localStorage.getItem(TOKEN_KEY)) {
    localStorage.setItem(TOKEN_KEY, "mock-jwt-" + Date.now());
  }
  const profile = readJson(PROFILE_KEY, { id: 1, username: "体验用户" });
  profile.entitlements = ent;
  profile.plan_code = plan_code;
  profile.is_active = true;
  writeJson(PROFILE_KEY, profile);
  return ent;
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(ORDERS_KEY);
  setEntitlements(defaultEntitlements());
}

/** Switching to live API — drop mock entitlements so stale unlocks never apply. */
export function clearMockSessionForLive() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(ORDERS_KEY);
  setEntitlements(defaultEntitlements());
}

export function purgeMockArtifactsIfLive() {
  const token = localStorage.getItem(TOKEN_KEY) || "";
  if (token.startsWith("mock-jwt")) clearMockSessionForLive();
}

export function hasReportAccess(skinId) {
  const ent = getEntitlements();
  const assess = ent?.products?.assess;
  if (!assess?.enabled && !ent?.assess_enabled) return false;
  const skins = assess?.skins || ["*"];
  return skins.includes("*") || skins.includes(skinId);
}

function orders() {
  return readJson(ORDERS_KEY, {});
}

function fulfillOrder(order_no, username) {
  const all = orders();
  const row = all[order_no];
  if (!row) return { error: "not_found", status: 404, detail: "订单不存在" };
  if (row.status !== "paid") return { error: "not_paid", status: 400, detail: "订单未支付" };
  if (row.fulfilled) {
    return {
      access_token: localStorage.getItem(TOKEN_KEY),
      token_type: "bearer",
      membership: { plan_code: row.plan_code, is_active: true, username: username || "体验用户" },
      entitlements: getEntitlements(),
      message: "已履约",
      already_fulfilled: true,
    };
  }
  const ent = unlockAssessMock({ plan_code: row.plan_code });
  row.fulfilled = true;
  all[order_no] = row;
  writeJson(ORDERS_KEY, all);
  return {
    access_token: localStorage.getItem(TOKEN_KEY),
    token_type: "bearer",
    membership: { plan_code: row.plan_code, is_active: true, username: username || "体验用户" },
    entitlements: ent,
    message: "开通成功",
  };
}

export async function mockFetch(path, options = {}) {
  await delay(100);
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  const url = new URL(path, "http://local.invalid");
  const bare = url.pathname;

  if (bare === "/api/v1/health") {
    return { ok: true, service: "digit-hub-mock", ts: Date.now() };
  }

  if (bare === "/api/v1/payment/plans" && method === "GET") {
    return {
      plans: [],
      assess_plans: [
        {
          plan_code: "assess_single",
          label: "单次完整报告",
          duration_days: 7,
          amount: "1.99",
          price_yuan: 1.99,
          summary: "7 天内解锁 1 份完整报告",
          product: "assess",
        },
      ],
      addons: [],
    };
  }

  if (bare === "/api/v1/payment/channels" && method === "GET") {
    return {
      channels: [
        { channel: "wxpay", label: "微信扫码" },
        { channel: "alipay", label: "支付宝扫码" },
      ],
    };
  }

  if (bare === "/api/v1/payment/orders" && method === "POST") {
    const order_no = "MOCK" + Date.now();
    const channel = body.channel || "wxpay";
    const row = {
      order_no,
      plan_code: body.plan_code || "assess_single",
      plan_label: "单次完整报告",
      amount: "1.99",
      duration_days: 7,
      qrcode: "",
      payurl: `#/account?mock_pay=${order_no}`,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      status: "pending",
      channel,
      fulfilled: false,
      pay_mode: "jump",
      reused: false,
    };
    const all = orders();
    all[order_no] = row;
    writeJson(ORDERS_KEY, all);
    return row;
  }

  const orderMatch = bare.match(/^\/api\/v1\/payment\/orders\/([^/]+)$/);
  if (orderMatch && method === "GET") {
    const row = orders()[orderMatch[1]];
    if (!row) return { error: "not_found", status: 404, detail: "订单不存在" };
    const plan = String(row.plan_code || "");
    const isAssess = plan.startsWith("assess");
    const next =
      row.status === "paid" && !row.fulfilled
        ? isAssess
          ? "guest_unlock"
          : "complete_account"
        : "none";
    return {
      ...row,
      next_action: next,
      message: row.status === "paid" ? "已支付" : "待支付",
    };
  }

  const guestUnlockMatch = bare.match(/^\/api\/v1\/payment\/orders\/([^/]+)\/guest-unlock$/);
  if (guestUnlockMatch && method === "POST") {
    const orderNo = guestUnlockMatch[1];
    const mockCode = "MOCK-" + orderNo.slice(-8).toUpperCase();
    const res = fulfillOrder(orderNo, mockCode);
    res.auth_code = mockCode;
    res.login_hint = "授权码可作为账号与密码登录会员中心";
    localStorage.setItem("xinxiang_auth_code", mockCode);
    return res;
  }

  const completeMatch = bare.match(/^\/api\/v1\/payment\/orders\/([^/]+)\/complete$/);
  if (completeMatch && method === "POST") {
    return fulfillOrder(completeMatch[1], body.username);
  }

  const claimMatch = bare.match(/^\/api\/v1\/payment\/orders\/([^/]+)\/claim$/);
  if (claimMatch && method === "POST") {
    if (!localStorage.getItem(TOKEN_KEY)) {
      return { error: "unauthorized", status: 401, detail: "需要登录" };
    }
    return fulfillOrder(claimMatch[1], "已登录用户");
  }

  if (bare === "/api/v1/payment/notify/hwxun") {
    const order_no = body.out_trade_no || body.order_no || url.searchParams.get("out_trade_no");
    const all = orders();
    const row = all[order_no];
    if (row) {
      row.status = "paid";
      row.paid_at = new Date().toISOString();
      all[order_no] = row;
      writeJson(ORDERS_KEY, all);
    }
    return { ok: "success" };
  }

  if (bare === "/api/v1/payment/mock-pay" && method === "POST") {
    const all = orders();
    const row = all[body.order_no];
    if (!row) return { error: "not_found", status: 404 };
    row.status = "paid";
    row.paid_at = new Date().toISOString();
    all[body.order_no] = row;
    writeJson(ORDERS_KEY, all);
    return { status: "paid", order_no: body.order_no };
  }

  if (bare === "/api/v1/auth/activate" && method === "POST") {
    const code = body.auth_code || body.code;
    if (!isValidDemoCode(code)) {
      return {
        error: "invalid_code",
        status: 400,
        detail: `授权码无效（本地演示码：${DEMO_AUTH_CODE}）`,
      };
    }
    const ent = unlockAssessMock({ plan_code: "assess_code", skins: ["*"] });
    return {
      membership: { plan_code: "assess_code", is_active: true },
      entitlements: ent,
      message: "激活成功",
    };
  }

  if (bare === "/api/v1/auth/login-code" && method === "POST") {
    const code = body.auth_code || body.code;
    if (!isValidDemoCode(code)) {
      return {
        error: "invalid_code",
        status: 400,
        detail: `授权码无效（本地演示码：${DEMO_AUTH_CODE}）`,
      };
    }
    const ent = unlockAssessMock({ plan_code: "assess_code", skins: ["*"] });
    const token = "mock-jwt-code-" + Date.now();
    localStorage.setItem(TOKEN_KEY, token);
    writeJson(PROFILE_KEY, {
      id: 1,
      username: "演示码用户",
      is_active: true,
      plan_code: "assess_code",
      entitlements: ent,
    });
    return {
      access_token: token,
      token_type: "bearer",
      membership: { username: "演示码用户", is_active: true, plan_code: "assess_code" },
      entitlements: ent,
    };
  }

  if (bare === "/api/v1/member/profile" && method === "GET") {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return { error: "unauthorized", status: 401, detail: "需要登录" };
    const profile = readJson(PROFILE_KEY, { id: 1, username: "体验用户", is_active: true });
    profile.entitlements = getEntitlements();
    return profile;
  }

  if (bare === "/api/v1/assess/access" && method === "GET") {
    const skinId = url.searchParams.get("skin_id") || "";
    const allowed = hasReportAccess(skinId);
    return {
      allowed,
      reason: allowed ? "ok" : "need_entitlement",
      entitlements: getEntitlements(),
      skin_id: skinId,
    };
  }

  if (bare === "/api/v1/shop/products" && method === "GET") {
    return { items: [], status: 501, message: "cloud_faka_reserved" };
  }

  return { error: "not_found", path: bare, status: 404 };
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
