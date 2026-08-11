/**
 * digit-hub 基座壳：顶栏 + A2HS 入口。
 * 各业务模块（assess / faka / …）共用，保证「装到桌面」永远在基座里。
 */

import { a2hsTopbarLinkHtml } from "./a2hs.js";

/**
 * @param {{ brand?: string, brandHref?: string, rightHtml?: string, active?: string }} opts
 */
export function baseTopbarHtml(opts = {}) {
  const brand = opts.brand || "心象测";
  const brandHref = opts.brandHref || "#/";
  const right = opts.rightHtml || "";
  return `
    <header class="topbar shell dh-base-topbar">
      <a class="topbar-brand" href="${brandHref}">${brand}</a>
      <div class="dh-base-topbar-right">
        ${a2hsTopbarLinkHtml()}
        ${right}
      </div>
    </header>
  `;
}
