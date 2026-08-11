/** Runtime API mode. Default mock for local preview; `?api=live` or localStorage xinxiang_api=live for real xhs-cloud. */

export function useMock() {
  try {
    const q = new URLSearchParams(location.search).get("api");
    if (q === "live") {
      localStorage.setItem("xinxiang_api", "live");
      return false;
    }
    if (q === "mock") {
      localStorage.setItem("xinxiang_api", "mock");
      return true;
    }
    return localStorage.getItem("xinxiang_api") !== "live";
  } catch {
    return true;
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
