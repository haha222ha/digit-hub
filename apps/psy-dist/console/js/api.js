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

async function requestBlob(path, { method = "POST", body, auth = false } = {}) {
  const headers = { Accept: "*/*" };
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
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    throw new Error((data && data.message) || "导出失败");
  }
  if (!res.ok) {
    throw new Error(`导出失败 (${res.status})`);
  }
  const cd = res.headers.get("content-disposition") || "";
  let filename = "links_export.txt";
  const m = cd.match(/filename="?([^"]+)"?/i);
  if (m) filename = m[1];
  return { blob: await res.blob(), filename };
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
    if (params.testCode || params.test_code) q.set("testCode", params.testCode || params.test_code);
    if (params.startDate || params.start_date) q.set("startDate", params.startDate || params.start_date);
    if (params.endDate || params.end_date) q.set("endDate", params.endDate || params.end_date);
    if (params.sortBy || params.sort_by) q.set("sortBy", params.sortBy || params.sort_by);
    if (params.sortOrder || params.sort_order) q.set("sortOrder", params.sortOrder || params.sort_order);
    if (params.fakaClaimed != null && params.fakaClaimed !== "")
      q.set("fakaClaimed", String(params.fakaClaimed));
    if (params.page) q.set("page", String(params.page));
    if (params.perPage || params.per_page) q.set("perPage", String(params.perPage || params.per_page));
    const s = q.toString();
    return request(`/api/links/list${s ? `?${s}` : ""}`, { auth: true });
  },
  fakaInventory: (testCode) => {
    const q = testCode ? `?testCode=${encodeURIComponent(testCode)}` : "";
    return request(`/api/faka/inventory${q}`, { auth: true });
  },
  fakaReleaseLinks: (payload = {}) =>
    request("/api/faka/release-links", {
      method: "POST",
      auth: true,
      body: payload,
    }),
  getIntegrationToken: () => request("/api/auth/integration-token", { auth: true }),
  regenIntegrationToken: () =>
    request("/api/auth/integration-token/regenerate", { method: "POST", auth: true }),
  revokeLink: (linkId) =>
    request("/api/links/revoke", {
      method: "POST",
      auth: true,
      body: { linkIds: [linkId] },
    }),
  revokeLinks: (linkIds) =>
    request("/api/links/revoke", {
      method: "POST",
      auth: true,
      body: { linkIds },
    }),
  exportLinks: (payload = {}) =>
    requestBlob("/api/links/export", { method: "POST", auth: true, body: payload }),
  redeem: (code) =>
    request("/api/quota/redeem", {
      method: "POST",
      auth: true,
      body: { code },
    }),
  redeemHistory: (params = {}) => {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.perPage || params.per_page) q.set("perPage", String(params.perPage || params.per_page));
    const s = q.toString();
    return request(`/api/quota/redeem-history${s ? `?${s}` : ""}`, { auth: true });
  },
  quotaLogs: (params = {}) => {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.perPage || params.per_page) q.set("perPage", String(params.perPage || params.per_page));
    if (params.changeType || params.change_type) q.set("changeType", params.changeType || params.change_type);
    const s = q.toString();
    return request(`/api/admin/quota-logs/list${s ? `?${s}` : ""}`, { auth: true });
  },
  testResults: (params = {}) => {
    const q = new URLSearchParams();
    if (params.testCode || params.test_code) q.set("testCode", params.testCode || params.test_code);
    if (params.startDate || params.start_date) q.set("startDate", params.startDate || params.start_date);
    if (params.endDate || params.end_date) q.set("endDate", params.endDate || params.end_date);
    if (params.page) q.set("page", String(params.page));
    if (params.perPage || params.per_page) q.set("perPage", String(params.perPage || params.per_page));
    const s = q.toString();
    return request(`/api/admin/test-results/list${s ? `?${s}` : ""}`, { auth: true });
  },
  testResultsExport: async (params = {}) => {
    const q = new URLSearchParams();
    if (params.testCode || params.test_code) q.set("testCode", params.testCode || params.test_code);
    if (params.startDate || params.start_date) q.set("startDate", params.startDate || params.start_date);
    if (params.endDate || params.end_date) q.set("endDate", params.endDate || params.end_date);
    const s = q.toString();
    const headers = { Accept: "*/*" };
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch(`/api/admin/test-results/export${s ? `?${s}` : ""}`, {
      headers,
      credentials: "same-origin",
    });
    if (!res.ok) throw new Error(`导出失败 (${res.status})`);
    const cd = res.headers.get("content-disposition") || "";
    let filename = "test_results_export.csv";
    const m = cd.match(/filename="?([^"]+)"?/i);
    if (m) filename = m[1];
    return { blob: await res.blob(), filename };
  },
  packagesList: () => request("/api/admin/packages/list"),
  packageDocuments: () => request("/api/admin/package-documents/list", { auth: true }),
  purchaseMethods: () => request("/api/admin/payment/purchase-methods"),
  createOrder: (packageId, paymentMethod = "wxpay") =>
    request("/api/orders/create", {
      method: "POST",
      auth: true,
      body: { packageId, payment_method: paymentMethod },
    }),
  orderDetail: (orderNo) => request(`/api/orders/${encodeURIComponent(orderNo)}`, { auth: true }),
  startPay: (orderNo, paymentMethod = "wxpay", deviceType = "mobile") =>
    request(`/api/orders/${encodeURIComponent(orderNo)}/pay`, {
      method: "POST",
      auth: true,
      body: { payment_method: paymentMethod, device_type: deviceType },
    }),
  unlimitedStart: (testCode) =>
    request("/api/admin/unlimited-test/start", {
      method: "POST",
      auth: true,
      body: { testCode },
    }),
  uploadImage: async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    const headers = { Accept: "application/json" };
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch("/api/upload/image", {
      method: "POST",
      headers,
      body: fd,
      credentials: "same-origin",
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok && (!data || data.code === undefined)) {
      throw new Error((data && data.message) || `上传失败 (${res.status})`);
    }
    if (data && data.code !== undefined && data.code !== 200) {
      throw new Error(data.message || "上传失败");
    }
    return data ? data.data : null;
  },
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
  saDeleteUser: (userId) =>
    request("/api/super-admin/users/delete", {
      method: "POST",
      auth: true,
      body: { userId },
    }),
  saSetRole: (userId, role) =>
    request("/api/super-admin/users/set-role", {
      method: "POST",
      auth: true,
      body: { userId, role },
    }),
  saOrders: (limit = 100) => request(`/api/super-admin/orders?limit=${limit}`, { auth: true }),
  saOrdersExport: async () => {
    const headers = { Accept: "*/*" };
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch("/api/super-admin/orders/export", { headers, credentials: "same-origin" });
    if (!res.ok) throw new Error(`导出失败 (${res.status})`);
    const cd = res.headers.get("content-disposition") || "";
    let filename = "orders_export.csv";
    const m = cd.match(/filename="?([^"]+)"?/i);
    if (m) filename = m[1];
    return { blob: await res.blob(), filename };
  },
  saQuotaLogs: (limit = 100) => request(`/api/super-admin/quota-logs/list?limit=${limit}`, { auth: true }),
  saTestResults: (params = {}) => {
    const q = new URLSearchParams();
    if (params.userId || params.user_id) q.set("userId", String(params.userId || params.user_id));
    if (params.testCode || params.test_code) q.set("testCode", params.testCode || params.test_code);
    if (params.page) q.set("page", String(params.page));
    if (params.perPage || params.per_page) q.set("perPage", String(params.perPage || params.per_page));
    const s = q.toString();
    return request(`/api/super-admin/test-results/list${s ? `?${s}` : ""}`, { auth: true });
  },
  saToggleTutorial: (userId, enabled) =>
    request("/api/super-admin/users/toggle-detailed-tutorial-access", {
      method: "POST",
      auth: true,
      body: { userId, enabled },
    }),
  saPackageDocs: () => request("/api/super-admin/package-documents/list", { auth: true }),
  saPackageDocSave: (payload) =>
    request("/api/super-admin/package-documents/save", { method: "POST", auth: true, body: payload }),
  saPackageDocDelete: (id) =>
    request(`/api/super-admin/package-documents/delete/${id}`, { method: "POST", auth: true }),
  saInviteStats: () => request("/api/super-admin/invite-stats/list", { auth: true }),
  saTests: () => request("/api/super-admin/tests/list", { auth: true }),
  saTestSave: (payload) =>
    request("/api/super-admin/tests/save", { method: "POST", auth: true, body: payload }),
  saTestReorder: (items) =>
    request("/api/super-admin/tests/update-order", { method: "POST", auth: true, body: { items } }),
  saPackages: () => request("/api/super-admin/packages/list", { auth: true }),
  saPackageSave: (payload) =>
    request("/api/super-admin/packages/save", { method: "POST", auth: true, body: payload }),
  saPackageDelete: (key) =>
    request(`/api/super-admin/packages/delete/${encodeURIComponent(key)}`, { method: "POST", auth: true }),
  saConfigGet: () => request("/api/super-admin/config/get", { auth: true }),
  saConfigUpdate: (payload) =>
    request("/api/super-admin/config/update", { method: "POST", auth: true, body: payload }),
  saConfigTestWecom: () =>
    request("/api/super-admin/config/test-wecom-webhook", { method: "POST", auth: true, body: {} }),
  saAnnouncements: () => request("/api/super-admin/announcements/list", { auth: true }),
  saAnnouncementSave: (payload) =>
    request("/api/super-admin/announcements/save", { method: "POST", auth: true, body: payload }),
  saAnnouncementDelete: (id) =>
    request(`/api/super-admin/announcements/delete/${id}`, { method: "POST", auth: true }),
  saTutorials: () => request("/api/super-admin/tutorials/list", { auth: true }),
  saTutorialSave: (payload) =>
    request("/api/super-admin/tutorials/save", { method: "POST", auth: true, body: payload }),
  saTutorialDelete: (id) =>
    request(`/api/super-admin/tutorials/delete/${id}`, { method: "POST", auth: true }),
  saHelpDocs: () => request("/api/super-admin/help-documents/list", { auth: true }),
  saHelpSave: (payload) =>
    request("/api/super-admin/help-documents/save", { method: "POST", auth: true, body: payload }),
  saHelpDelete: (id) =>
    request(`/api/super-admin/help-documents/delete/${id}`, { method: "POST", auth: true }),
  saRedeemList: (limit = 100) => request(`/api/super-admin/redeem-codes/list?limit=${limit}`, { auth: true }),
  saRedeemGenerate: (payload) =>
    request("/api/super-admin/redeem-codes/generate", { method: "POST", auth: true, body: payload }),
  saRedeemRevoke: (code) =>
    request("/api/super-admin/redeem-codes/revoke", { method: "POST", auth: true, body: { code } }),
  saPaymentStats: () => request("/api/super-admin/payment-stats", { auth: true }),
  saPaymentStatsRange: (params = {}) => {
    const q = new URLSearchParams();
    if (params.startDate || params.start_date) q.set("start_date", params.startDate || params.start_date);
    if (params.endDate || params.end_date) q.set("end_date", params.endDate || params.end_date);
    const s = q.toString();
    return request(`/api/super-admin/payment-stats/range${s ? `?${s}` : ""}`, { auth: true });
  },
  saPaymentConfig: () => request("/api/super-admin/payment-config", { auth: true }),
  saPaymentConfigSave: (payload) =>
    request("/api/super-admin/payment-config", { method: "POST", auth: true, body: payload }),
  saPaymentNotifyLogs: (params = {}) => {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.perPage || params.per_page) q.set("perPage", String(params.perPage || params.per_page));
    if (params.orderNo || params.order_no) q.set("orderNo", params.orderNo || params.order_no);
    if (params.status) q.set("status", params.status);
    const s = q.toString();
    return request(`/api/super-admin/payment-notify-logs${s ? `?${s}` : ""}`, { auth: true });
  },
  saPaymentNotifyLogDetail: (id) =>
    request(`/api/super-admin/payment-notify-logs/${id}`, { auth: true }),
  saPaymentNotifyExport: async (params = {}) => {
    const q = new URLSearchParams();
    if (params.orderNo || params.order_no) q.set("orderNo", params.orderNo || params.order_no);
    if (params.status) q.set("status", params.status);
    const s = q.toString();
    const headers = { Accept: "*/*" };
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch(`/api/super-admin/payment-notify-logs/export${s ? `?${s}` : ""}`, {
      headers,
      credentials: "same-origin",
    });
    if (!res.ok) throw new Error(`导出失败 (${res.status})`);
    const cd = res.headers.get("content-disposition") || "";
    let filename = "payment_notify_logs_export.csv";
    const m = cd.match(/filename="?([^"]+)"?/i);
    if (m) filename = m[1];
    return { blob: await res.blob(), filename };
  },
  saOpLogs: (limit = 100) => request(`/api/super-admin/operation-logs/list?limit=${limit}`, { auth: true }),
  saOpLogDetail: (id) => request(`/api/super-admin/operation-logs/detail/${id}`, { auth: true }),
  saOpLogsExport: async () => {
    const headers = { Accept: "*/*" };
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch("/api/super-admin/operation-logs/export", { headers, credentials: "same-origin" });
    if (!res.ok) throw new Error(`导出失败 (${res.status})`);
    const cd = res.headers.get("content-disposition") || "";
    let filename = "operation_logs_export.csv";
    const m = cd.match(/filename="?([^"]+)"?/i);
    if (m) filename = m[1];
    return { blob: await res.blob(), filename };
  },
  announcementsList: () => request("/api/announcements/list", { auth: true }),
  announcementsUnread: () => request("/api/announcements/unread-count", { auth: true }),
  announcementsMarkRead: (id) =>
    request("/api/announcements/mark-read", { method: "POST", auth: true, body: { id } }),
  announcementsMarkAll: () =>
    request("/api/announcements/mark-all-read", { method: "POST", auth: true, body: {} }),
  adminDashboardStats: () => request("/api/admin/dashboard/stats", { auth: true }),
  customerService: () => request("/api/config/customer-service", { auth: true }),
  tutorialsList: () => request("/api/tutorials/list", { auth: true }),
  tutorialsGuide: () => request("/api/tutorials/guide", { auth: true }),
  helpDocsList: () => request("/api/help-documents/list", { auth: true }),
};
