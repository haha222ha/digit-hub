# 云发卡模块（预留）

基座已同步：`./base/`（来自 `packages/base`）。

启动本模块时：

```js
import { initA2hs, wireA2hsGlobal, a2hsBannerHtml, a2hsButtonHtml } from "./base/a2hs.js";
import { baseTopbarHtml } from "./base/shell.js";

initA2hs({ brand: "心象发卡", iconText: "卡", tagline: "云发卡 · 类 App 体验" });
wireA2hsGlobal();
```

顶栏用 `baseTopbarHtml` 即可自带「装到桌面」，与测评共用同一套 A2HS，勿再复制引导逻辑。

同步命令：`python tools/sync_base.py`
