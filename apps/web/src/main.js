import { initA2hs, wireA2hsGlobal } from "../base/a2hs.js";
import { applyStyleToDocument } from "./style/engine.js";
import { startRouter, onRoute, matchRoute, currentPath } from "./router.js";
import {
  renderHome,
  renderCatalog,
  renderIntro,
  renderPlay,
  renderSoftResult,
  renderFullReport,
  renderDuoCompare,
  renderAccount,
} from "./pages.js";

initA2hs({
  brand: "心象测",
  iconText: "心",
  tagline: "自我探索 · 类 App 体验",
  storagePrefix: "digit_hub",
});
wireA2hsGlobal();
applyStyleToDocument().catch(() => {});

if ("serviceWorker" in navigator) {
  const isLocal =
    location.hostname === "127.0.0.1" ||
    location.hostname === "localhost" ||
    location.hostname === "[::1]";
  window.addEventListener("load", () => {
    if (isLocal) {
      // Local iteration: never keep a SW — stale CSS/JS caused blank/unusable UI
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
      if (window.caches?.keys) {
        caches
          .keys()
          .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          .catch(() => {});
      }
      return;
    }
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

const root = document.getElementById("app");

function splitPath(full) {
  const [path, query = ""] = full.split("?");
  return { path: path || "/", query };
}

async function route() {
  const { path, query } = splitPath(currentPath());
  root.setAttribute("data-path", path);
  try {
    if (path === "/" || path === "") return renderHome(root);
    if (path === "/tests") return renderCatalog(root);
    if (path === "/account") return renderAccount(root);

    let m = matchRoute(path, "/t/:id");
    if (m) return renderIntro(root, m.id);

    m = matchRoute(path, "/t/:id/play");
    if (m) return renderPlay(root, m.id);

    m = matchRoute(path, "/t/:id/result");
    if (m) return renderSoftResult(root, m.id, query);

    m = matchRoute(path, "/t/:id/duo");
    if (m) return renderDuoCompare(root, m.id);

    m = matchRoute(path, "/report/:id");
    if (m) return renderFullReport(root, m.id);

    root.innerHTML = `<main class="shell" style="padding:40px 20px"><h1>页面不存在</h1><a href="#/">回首页</a></main>`;
  } catch (e) {
    console.error(e);
    root.innerHTML = `<main class="shell" style="padding:40px 20px"><h1>加载失败</h1><p class="muted">${e.message}</p><a href="#/">回首页</a></main>`;
  }
}

onRoute(() => {
  route();
});
startRouter();
