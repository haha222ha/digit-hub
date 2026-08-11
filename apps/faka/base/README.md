# digit-hub 基座 (`packages/base`)

跨模块共用能力。**添加到主屏幕（A2HS）** 只维护这一份，测评 / 云发卡 / 后续模块都挂基座，不要在业务里再写一套。

## 目录

| 文件 | 用途 |
|------|------|
| `a2hs.js` | 平台检测、安装引导抽屉、banner/按钮/顶栏入口 |
| `a2hs.css` | A2HS + 基座顶栏样式 |
| `shell.js` | `baseTopbarHtml`（品牌 +「装到桌面」+ 业务右链） |
| `index.js` | 统一导出 |

## 新模块接入（例：云发卡）

```js
import { initA2hs, wireA2hsGlobal, a2hsBannerHtml, a2hsButtonHtml } from "../../packages/base/a2hs.js";
// 或同步后的 apps/faka/base/a2hs.js
import { baseTopbarHtml } from "./base/shell.js";

initA2hs({ brand: "心象发卡", iconText: "卡", tagline: "云发卡 · 类 App 体验" });
wireA2hsGlobal();

// 顶栏自带「装到桌面」
root.innerHTML = `
  ${baseTopbarHtml({ brand: "心象发卡", brandHref: "#/", rightHtml: `<a class="topbar-link" href="#/orders">订单</a>` })}
  <main class="shell">
    ${a2hsBannerHtml()}
    ${a2hsButtonHtml({ label: "添加到主屏幕" })}
  </main>
`;
```

静态站点请把本目录同步到各 app 的 `base/`（见 `tools/sync_base.py`）。

## 存储键

默认前缀 `digit_hub_`（`installed` / `a2hs_dismiss`），全站模块共用，避免每个业务各 dismiss 一次。
