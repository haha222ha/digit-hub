import { clear } from "./ui.js";
import { onRoute, currentPath, navigate } from "./router.js";
import { isAuthed } from "./api.js";
import { renderLogin, renderRegister, renderReset } from "./pages/auth.js";
import {
  renderDashboard,
  renderGenerate,
  renderLinks,
  renderRedeem,
  renderUnlimited,
  renderPurchase,
  renderAccount,
  renderInvite,
  requireAuth,
} from "./pages/admin.js";
import {
  renderSaDashboard,
  renderSaUsers,
  renderSaOrders,
  renderSaInviteStats,
  renderSaTests,
  renderSaQuotaLogs,
} from "./pages/super-admin.js";

const root = document.getElementById("app");

function pathOnly(full) {
  return (full || "/").split("?")[0];
}

const ADMIN_PAGES = {
  "/admin/dashboard": renderDashboard,
  "/admin/generate-link": renderGenerate,
  "/admin/link-management": renderLinks,
  "/admin/redeem-quota": renderRedeem,
  "/admin/unlimited-test": renderUnlimited,
  "/admin/purchase-quota": renderPurchase,
  "/admin/account-settings": renderAccount,
  "/admin/invite-promotion": renderInvite,
};

const SUPER_PAGES = {
  "/super-admin/dashboard": renderSaDashboard,
  "/super-admin/users": renderSaUsers,
  "/super-admin/orders": renderSaOrders,
  "/super-admin/invite-stats": renderSaInviteStats,
  "/super-admin/tests": renderSaTests,
  "/super-admin/quota-logs": renderSaQuotaLogs,
};

async function render(fullPath) {
  const path = pathOnly(fullPath);
  clear(root);
  document.title = "心象测 · 工作台";

  if (path === "/login") return renderLogin(root);
  if (path === "/register") return renderRegister(root);
  if (path === "/reset-password") return renderReset(root);

  if (path.startsWith("/admin") || path.startsWith("/super-admin")) {
    if (!requireAuth()) {
      navigate(`/login?redirect=${encodeURIComponent(path)}`, { replace: true });
      return;
    }
    if (path === "/admin" || path === "/admin/") {
      navigate("/admin/dashboard", { replace: true });
      return;
    }
    if (path === "/super-admin" || path === "/super-admin/") {
      navigate("/super-admin/dashboard", { replace: true });
      return;
    }
    const page = ADMIN_PAGES[path] || SUPER_PAGES[path];
    if (page) {
      await page(root);
      return;
    }
    if (path.startsWith("/super-admin")) {
      navigate("/super-admin/dashboard", { replace: true });
      return;
    }
    navigate("/admin/dashboard", { replace: true });
    return;
  }

  if (isAuthed()) navigate("/admin/dashboard", { replace: true });
  else navigate("/login", { replace: true });
}

onRoute((p) => {
  render(p);
});
render(currentPath());
