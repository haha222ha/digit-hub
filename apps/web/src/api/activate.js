import { api } from "./client.js";
import { deviceId } from "../config.js";
import { refreshEntitlementsFromProfile } from "./access.js";

export async function activateWithAuthCode(code) {
  const authCode = String(code || "").trim();
  if (!authCode) throw new Error("请输入授权码");
  const res = await api("/api/v1/auth/login-code", {
    method: "POST",
    body: JSON.stringify({
      auth_code: authCode,
      device_id: deviceId(),
      device_label: "browser",
    }),
  });
  if (res?.access_token) localStorage.setItem("xinxiang_token", res.access_token);
  await refreshEntitlementsFromProfile().catch(() => null);
  return res;
}
