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
  renderAnnouncements,
  renderHelp,
  renderCustomerService,
  renderQuotaLogs,
  renderTestResults,
  requireAuth,
} from "./pages/admin.js";
import {
  renderSaDashboard,
  renderSaUsers,
  renderSaOrders,
  renderSaPaymentStats,
  renderSaPackages,
  renderSaRedeem,
  renderSaInviteStats,
  renderSaTests,
  renderSaTestResults,
  renderSaAnnouncements,
  renderSaTutorials,
  renderSaHelpDocs,
  renderSaPackageDocs,
  renderSaConfig,
  renderSaQuotaLogs,
  renderSaOpLogs,
  renderSaPaymentNotifyLogs,
} from "./pages/super-admin.js";

const root = document.getElementById("app");

function pathOnly(full) {
  return (full || "/").split("?")[0];
}

const ADMIN_PAGES = {
  "/admin/dashboard": renderDashboard,
  "/admin/generate-link": renderGenerate,
  "/admin/link-management": renderLinks,
  "/admin/test-results": renderTestResults,
  "/admin/quota-logs": renderQuotaLogs,
  "/admin/redeem-quota": renderRedeem,
  "/admin/unlimited-test": renderUnlimited,
  "/admin/purchase-quota": renderPurchase,
  "/admin/account-settings": renderAccount,
  "/admin/invite-promotion": renderInvite,
  "/admin/announcements": renderAnnouncements,
  "/admin/help": renderHelp,
  "/admin/customer-service": renderCustomerService,
};

const SUPER_PAGES = {
  "/super-admin/dashboard": renderSaDashboard,
  "/super-admin/users": renderSaUsers,
  "/super-admin/orders": renderSaOrders,
  "/super-admin/payment-stats": renderSaPaymentStats,
  "/super-admin/packages": renderSaPackages,
  "/super-admin/redeem-codes": renderSaRedeem,
  "/super-admin/invite-stats": renderSaInviteStats,
  "/super-admin/tests": renderSaTests,
  "/super-admin/test-results": renderSaTestResults,
  "/super-admin/announcements": renderSaAnnouncements,
  "/super-admin/tutorials": renderSaTutorials,
  "/super-admin/help-docs": renderSaHelpDocs,
  "/super-admin/package-documents": renderSaPackageDocs,
  "/super-admin/config": renderSaConfig,
  "/super-admin/quota-logs": renderSaQuotaLogs,
  "/super-admin/operation-logs": renderSaOpLogs,
  "/super-admin/payment-notify-logs": renderSaPaymentNotifyLogs,
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
