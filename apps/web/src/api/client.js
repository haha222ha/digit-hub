import { mockFetch } from "./mock.js";
import { useMock, apiBase } from "../config.js";

export async function api(path, options = {}) {
  if (useMock()) {
    const data = await mockFetch(path, options);
    if (data && data.status >= 400) {
      const err = new Error(data.error || data.detail || "api_error");
      err.status = data.status;
      err.data = data;
      throw err;
    }
    return data;
  }
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = localStorage.getItem("xinxiang_token");
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(apiBase() + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const msg =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg || d).join("; ")
          : data.error || res.statusText;
    const err = new Error(msg || "请求失败");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function isMockMode() {
  return useMock();
}
