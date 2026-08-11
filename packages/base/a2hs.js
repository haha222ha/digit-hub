/**
 * digit-hub 基座 · Add to Home Screen (A2HS)
 * 测评 / 云发卡 / 后续模块共用，勿在业务页内复制一份。
 *
 * @example
 * import { initA2hs, a2hsBannerHtml, wireA2hs, a2hsButtonHtml } from '../base/a2hs.js';
 * initA2hs({ brand: '心象测', iconText: '心' });
 */

let deferredPrompt = null;
let cfg = {
  brand: "心象测",
  tagline: "类 App 体验 · 全屏图标打开",
  iconText: "心",
  storagePrefix: "digit_hub",
  eventName: "digit-hub-installable",
};

function key(name) {
  return `${cfg.storagePrefix}_${name}`;
}

export function configureA2hs(options = {}) {
  cfg = { ...cfg, ...options };
}

export function getA2hsConfig() {
  return { ...cfg };
}

export function detectPlatform() {
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  return { isIOS, isAndroid, isStandalone, isMobile: isIOS || isAndroid };
}

/** Call once at app boot (any module). */
export function initA2hs(options = {}) {
  if (options && Object.keys(options).length) configureA2hs(options);
  if (window.__digitHubA2hsInited) return;
  window.__digitHubA2hsInited = true;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.dispatchEvent(new CustomEvent(cfg.eventName));
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    localStorage.setItem(key("installed"), "1");
  });
}

/** @deprecated use initA2hs */
export function captureInstallPrompt() {
  initA2hs();
}

export function canNativeInstall() {
  return !!deferredPrompt;
}

export async function triggerNativeInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === "accepted";
}

export function a2hsBannerHtml() {
  const { isStandalone } = detectPlatform();
  const dismissed =
    localStorage.getItem(key("a2hs_dismiss")) === "1" ||
    localStorage.getItem("xinxiang_a2hs_dismiss") === "1";
  if (isStandalone || dismissed) return "";
  return `
    <section class="dh-a2hs-banner" id="installBanner" data-digit-a2hs="banner">
      <div class="dh-a2hs-banner-text">
        <strong>添加到主屏幕</strong>
        <span class="muted">像 App 一样打开${cfg.brand} · 全屏、图标、可离线打开</span>
      </div>
      <div class="dh-a2hs-banner-actions">
        <button class="btn btn-primary" type="button" data-a2hs-open>添加</button>
        <button class="btn btn-ghost" type="button" data-a2hs-dismiss aria-label="关闭">稍后</button>
      </div>
    </section>
  `;
}

/** Primary CTA button (home / module landing). */
export function a2hsButtonHtml({ variant = "ember", block = true, label } = {}) {
  const { isStandalone } = detectPlatform();
  if (isStandalone) {
    return `<p class="dh-a2hs-badge">已以 App 模式打开</p>`;
  }
  const cls = `btn btn-${variant}${block ? " btn-block" : ""} dh-a2hs-btn`;
  return `<button class="${cls}" type="button" data-a2hs-open>${label || `添加到主屏幕 · 做成手机 App`}</button>`;
}

/** Compact topbar / shell link — every module page. */
export function a2hsTopbarLinkHtml() {
  const { isStandalone } = detectPlatform();
  if (isStandalone) return "";
  return `<button type="button" class="dh-a2hs-toplink" data-a2hs-open title="添加到主屏幕">装到桌面</button>`;
}

function guideDrawerHtml() {
  const { isIOS, isAndroid } = detectPlatform();
  let steps;
  let title;
  if (isIOS) {
    title = "iPhone / iPad · 添加到主屏幕";
    steps = [
      `用 <strong>Safari</strong> 打开本页（微信内请点右上角「在 Safari 打开」）`,
      `点底栏中间的 <strong>分享</strong> 按钮（方框带向上箭头）`,
      `下滑菜单，点 <strong>「添加到主屏幕」</strong>`,
      `右上角点 <strong>添加</strong> — 桌面将出现「${cfg.brand}」图标`,
    ];
  } else if (isAndroid) {
    title = "Android · 添加到主屏幕";
    steps = [
      `建议使用 <strong>Chrome</strong> 打开`,
      `若出现系统安装提示，直接点 <strong>安装 / 添加</strong>`,
      `或点右上角 <strong>⋮ 菜单</strong> → <strong>安装应用</strong> / <strong>添加到主屏幕</strong>`,
      `确认后主屏幕会出现「${cfg.brand}」图标，以独立窗口打开`,
    ];
  } else {
    title = "电脑 · 安装为应用";
    steps = [
      `Chrome / Edge 地址栏右侧若有 <strong>安装图标</strong>，点它即可`,
      `或打开菜单 → <strong>安装${cfg.brand}…</strong> / <strong>应用</strong> → 安装`,
      `安装后可从开始菜单 / Dock 像原生应用一样启动`,
      `手机用户请用手机浏览器打开本站，按系统引导添加`,
    ];
  }

  return `
    <div class="drawer-backdrop open" id="a2hsBd" data-digit-a2hs="backdrop"></div>
    <div class="drawer open dh-a2hs-drawer" id="a2hsDrawer" role="dialog" aria-labelledby="a2hsTitle" data-digit-a2hs="drawer">
      <div class="dh-a2hs-preview" aria-hidden="true">
        <div class="dh-a2hs-icon">${cfg.iconText}</div>
        <div>
          <strong>${cfg.brand}</strong>
          <p class="muted">${cfg.tagline}</p>
        </div>
      </div>
      <h3 id="a2hsTitle" class="dh-a2hs-title">${title}</h3>
      <ol class="dh-a2hs-steps">
        ${steps.map((s) => `<li>${s}</li>`).join("")}
      </ol>
      <div class="stack" style="margin-top:16px">
        ${
          canNativeInstall()
            ? `<button class="btn btn-ember btn-block" type="button" data-a2hs-native>一键安装到桌面</button>`
            : ""
        }
        <button class="btn btn-primary btn-block" type="button" data-a2hs-ok>我知道了</button>
      </div>
    </div>
  `;
}

export function openA2hsGuide() {
  document.getElementById("a2hsBd")?.remove();
  document.getElementById("a2hsDrawer")?.remove();
  const wrap = document.createElement("div");
  wrap.innerHTML = guideDrawerHtml();
  document.body.append(...wrap.children);
  const close = () => {
    document.getElementById("a2hsBd")?.remove();
    document.getElementById("a2hsDrawer")?.remove();
  };
  document.getElementById("a2hsBd")?.addEventListener("click", close);
  document.querySelector("[data-a2hs-ok]")?.addEventListener("click", close);
  document.querySelector("[data-a2hs-native]")?.addEventListener("click", async () => {
    const ok = await triggerNativeInstall();
    if (ok) close();
  });
}

/**
 * Wire all [data-a2hs-open] / dismiss controls inside root (and keep working after re-render).
 * Prefer calling after each page paint, or once via wireA2hsGlobal().
 */
export function wireA2hs(root = document) {
  root.querySelectorAll("[data-a2hs-open]").forEach((el) => {
    if (el.dataset.a2hsBound) return;
    el.dataset.a2hsBound = "1";
    el.addEventListener("click", (e) => {
      e.preventDefault();
      openA2hsGuide();
    });
  });
  root.querySelectorAll("[data-a2hs-dismiss]").forEach((el) => {
    if (el.dataset.a2hsBound) return;
    el.dataset.a2hsBound = "1";
    el.addEventListener("click", () => {
      localStorage.setItem(key("a2hs_dismiss"), "1");
      root.querySelector("#installBanner")?.remove();
      root.querySelector("[data-digit-a2hs=banner]")?.remove();
    });
  });
}

/** One-time document delegation — safe for SPA re-renders. */
export function wireA2hsGlobal() {
  if (window.__digitHubA2hsWired) return;
  window.__digitHubA2hsWired = true;
  document.addEventListener("click", (e) => {
    const open = e.target.closest?.("[data-a2hs-open]");
    if (open) {
      e.preventDefault();
      openA2hsGuide();
      return;
    }
    const dismiss = e.target.closest?.("[data-a2hs-dismiss]");
    if (dismiss) {
      localStorage.setItem(key("a2hs_dismiss"), "1");
      document.querySelector("[data-digit-a2hs=banner]")?.remove();
    }
  });
}

/* —— back-compat aliases used by 心象测 early drafts —— */
export const installBannerHtml = a2hsBannerHtml;
export const wireInstallBanner = wireA2hs;
export const installGuideDrawerHtml = guideDrawerHtml;
