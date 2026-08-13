const TOKEN_KEY = "xx_psy_token";
const USER_KEY = "xx_psy_user";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token || "");
  localStorage.setItem(USER_KEY, JSON.stringify(user || null));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthed() {
  return Boolean(getToken());
}

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok && (!data || data.code === undefined)) {
    throw new Error((data && data.message) || `请求失败 (${res.status})`);
  }
  if (data && data.code !== undefined && data.code !== 200) {
    throw new Error(data.message || "请求失败");
  }
  return data ? data.data : null;
}

export const api = {
  login: (usernameOrEmail, password) =>
    request("/api/auth/login", {
      method: "POST",
      body: { usernameOrEmail, password },
    }),
  loginCode: (auth_code) =>
    request("/api/auth/login-code", {
      method: "POST",
      body: { auth_code },
    }),
  register: (payload) =>
    request("/api/auth/register", {
      method: "POST",
      body: payload,
    }),
  recoverWithCode: (auth_code, new_password) =>
    request("/api/auth/recover-with-code", {
      method: "POST",
      body: { auth_code, new_password },
    }),
  changePassword: (new_password, current_password = "") =>
    request("/api/auth/change-password", {
      method: "POST",
      auth: true,
      body: { new_password, current_password },
    }),
  testsList: () => request("/api/tests/list"),
  quotaInfo: () => request("/api/quota/info", { auth: true }),
  generateLinks: (testCode, count) =>
    request("/api/links/generate", {
      method: "POST",
      auth: true,
      body: { testCode, count },
    }),
  linksList: (params = {}) => {
    const q = new URLSearchParams();
    if (params.status) q.set("status", params.status);
    if (params.page) q.set("page", String(params.page));
    if (params.perPage) q.set("perPage", String(params.perPage));
    const s = q.toString();
    return request(`/api/links/list${s ? `?${s}` : ""}`, { auth: true });
  },
  revokeLink: (linkId) =>
    request("/api/links/revoke", {
      method: "POST",
      auth: true,
      body: { linkId },
    }),
  redeem: (code) =>
    request("/api/quota/redeem", {
      method: "POST",
      auth: true,
      body: { code },
    }),
  packagesList: () => request("/api/admin/packages/list"),
  purchaseMethods: () => request("/api/admin/payment/purchase-methods"),
  createOrder: (packageId, paymentMethod = "wxpay") =>
    request("/api/orders/create", {
      method: "POST",
      auth: true,
      body: { packageId, payment_method: paymentMethod },
    }),
  orderDetail: (orderNo) => request(`/api/orders/${encodeURIComponent(orderNo)}`, { auth: true }),
  startPay: (orderNo, paymentMethod = "wxpay") =>
    request(`/api/orders/${encodeURIComponent(orderNo)}/pay`, {
      method: "POST",
      auth: true,
      body: { payment_method: paymentMethod, device_type: "pc" },
    }),
  unlimitedStart: (testCode) =>
    request("/api/admin/unlimited-test/start", {
      method: "POST",
      auth: true,
      body: { testCode },
    }),
  inviteInfo: () => request("/api/invite/info", { auth: true }),
  inviteRecords: (params = {}) => {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.perPage || params.per_page) q.set("per_page", String(params.perPage || params.per_page));
    const s = q.toString();
    return request(`/api/invite/records${s ? `?${s}` : ""}`, { auth: true });
  },
  saDashboard: () => request("/api/super-admin/dashboard/stats", { auth: true }),
  saUsers: (limit = 100) => request(`/api/super-admin/users/list?limit=${limit}`, { auth: true }),
  saAdjustQuota: (userId, amount, remark = "") =>
    request("/api/super-admin/users/adjust-quota", {
      method: "POST",
      auth: true,
      body: { userId, amount, remark },
    }),
  saToggleStatus: (userId, status) =>
    request("/api/super-admin/users/toggle-status", {
      method: "POST",
      auth: true,
      body: { userId, status },
    }),
  saResetPassword: (userId, newPassword) =>
    request("/api/super-admin/users/reset-password", {
      method: "POST",
      auth: true,
      body: { userId, newPassword },
    }),
  saSetRole: (userId, role) =>
    request("/api/super-admin/users/set-role", {
      method: "POST",
      auth: true,
      body: { userId, role },
    }),
  saOrders: (limit = 100) => request(`/api/super-admin/orders?limit=${limit}`, { auth: true }),
  saQuotaLogs: (limit = 100) => request(`/api/super-admin/quota-logs/list?limit=${limit}`, { auth: true }),
  saInviteStats: () => request("/api/super-admin/invite-stats/list", { auth: true }),
  saTests: () => request("/api/super-admin/tests/list", { auth: true }),
  saPackages: () => request("/api/super-admin/packages/list", { auth: true }),
};
