import { api, isMockMode } from "./client.js";
import { getEntitlements, hasReportAccess as hasLocalAccess, setEntitlements } from "./mock.js";

/** Server-authoritative when live; mock falls back to localStorage. */
export async function checkReportAccess(skinId) {
  try {
    const res = await api(`/api/v1/assess/access?skin_id=${encodeURIComponent(skinId || "")}`);
    if (res?.entitlements) setEntitlements(normalizeEntitlements(res.entitlements));
    return !!res?.allowed;
  } catch (e) {
    if (isMockMode()) return hasLocalAccess(skinId);
    if (e.status === 401) return false;
    return hasLocalAccess(skinId);
  }
}

export function normalizeEntitlements(ent) {
  if (!ent) return getEntitlements();
  if (ent.products?.assess) return ent;
  // map flat assess_enabled from server
  if (ent.assess_enabled || ent.products?.assess?.enabled) {
    return {
      plan_code: ent.plan_code || "assess",
      products: {
        assess: ent.products?.assess || {
          enabled: true,
          quota_per_month: ent.assess_quota_per_month ?? 30,
          skins: ent.assess_skins || ["*"],
        },
        faka: ent.products?.faka || { enabled: false, download_per_day: 0 },
        push: ent.products?.push || { enabled: false },
      },
    };
  }
  return {
    plan_code: ent.plan_code || "guest",
    products: {
      assess: { enabled: false, quota_per_month: 0, skins: [] },
      faka: { enabled: false, download_per_day: 0 },
      push: { enabled: false },
    },
    ...ent,
  };
}

export async function refreshEntitlementsFromProfile() {
  try {
    const profile = await api("/api/v1/member/profile");
    if (profile?.entitlements) {
      const n = normalizeEntitlements(profile.entitlements);
      setEntitlements(n);
      return n;
    }
  } catch {
    /* guest */
  }
  return getEntitlements();
}
