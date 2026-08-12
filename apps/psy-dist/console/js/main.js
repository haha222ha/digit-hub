import { clear } from "./ui.js";
import { onRoute, currentPath, navigate } from "./router.js";
import { isAuthed } from "./api.js";
import { renderLogin, renderRegister, renderReset } from "./pages/auth.js";
import { renderGenerate, renderLinks, renderRedeem, requireAuth } from "./pages/admin.js";

const root = document.getElementById("app");

function pathOnly(full) {
  return (full || "/").split("?")[0];
}

async function render(fullPath) {
  const path = pathOnly(fullPath);
  clear(root);
  document.title = "心象测 · 工作台";

  if (path === "/login") {
    renderLogin(root);
    return;
  }
  if (path === "/register") {
    renderRegister(root);
    return;
  }
  if (path === "/reset-password") {
    renderReset(root);
    return;
  }

  const adminPaths = ["/admin", "/admin/", "/admin/generate-link", "/admin/link-management", "/admin/redeem-quota"];
  if (path.startsWith("/admin") || path.startsWith("/super-admin")) {
    if (!requireAuth()) {
      navigate(`/login?redirect=${encodeURIComponent(path)}`, { replace: true });
      return;
    }
    if (path === "/admin" || path === "/admin/") {
      navigate("/admin/generate-link", { replace: true });
      return;
    }
    if (path.startsWith("/super-admin")) {
      // 超管后台后续迭代；先进入商家核心台
      navigate("/admin/generate-link", { replace: true });
      return;
    }
    if (path === "/admin/generate-link") {
      await renderGenerate(root);
      return;
    }
    if (path === "/admin/link-management") {
      await renderLinks(root);
      return;
    }
    if (path === "/admin/redeem-quota") {
      await renderRedeem(root);
      return;
    }
    // 未实现的旧菜单：回到生成链接
    navigate("/admin/generate-link", { replace: true });
    return;
  }

  if (adminPaths.includes(path)) return;

  // 未知业务路径 → 登录或首页
  if (isAuthed()) navigate("/admin/generate-link", { replace: true });
  else navigate("/login", { replace: true });
}

onRoute((p) => {
  render(p);
});
render(currentPath());
