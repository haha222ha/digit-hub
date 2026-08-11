/** Runtime API mode. Default mock for local preview; `?api=live` or localStorage xinxiang_api=live for real xhs-cloud. */

import { clearMockSessionForLive, purgeMockArtifactsIfLive } from "./api/mock.js";

const PRODUCTION_HOSTS = new Set(["monitor.xhs365.cn", "assess.xhs365.cn"]);

function isProductionHost() {
  const h = (location.hostname || "").toLowerCase();
  if (PRODUCTION_HOSTS.has(h)) return true;
  return h.endsWith(".xhs365.cn") && h !== "localhost";
}

export function useMock() {
  try {
    const q = new URLSearchParams(location.search).get("api");
    if (q === "live") {
      localStorage.setItem("xinxiang_api", "live");
      clearMockSessionForLive();
      return false;
    }
    if (q === "mock") {
      localStorage.setItem("xinxiang_api", "mock");
      return true;
    }
    if (localStorage.getItem("xinxiang_api") === "live") {
      purgeMockArtifactsIfLive();
      return false;
    }
    if (isProductionHost()) {
      localStorage.setItem("xinxiang_api", "live");
      clearMockSessionForLive();
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

/** Card-delivery landing: ?code=XXX → #/activate?code=XXX (preserve other query params). */
export function bootstrapCardCodeRedirect() {
  try {
    const params = new URLSearchParams(location.search);
    const code = params.get("code")?.trim();
    if (!code) return;
    const hash = location.hash.replace(/^#/, "") || "/";
    if (hash.startsWith("/activate")) return;
    if (isProductionHost() && !params.has("api")) {
      params.set("api", "live");
    }
    params.delete("code");
    const rest = params.toString();
    const prefix = `${location.pathname}${rest ? `?${rest}` : ""}`;
    location.replace(`${prefix}#/activate?code=${encodeURIComponent(code)}`);
  } catch {
    /* ignore */
  }
}

export function apiBase() {
  return localStorage.getItem("xinxiang_api_base") || "";
}

export function deviceId() {
  let id = localStorage.getItem("xinxiang_device_id");
  if (!id) {
    id = "web:" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("xinxiang_device_id", id);
  }
  return id;
}
