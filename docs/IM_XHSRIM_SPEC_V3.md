# 小红书 IM 发消息 · 修正需求文档 v3（三方对比后，交给 Cursor）

> 依据：官方千帆（`D:\eva\千帆客服工作台.exe` app.asar）+ 阿奇锁（`D:\eva\小红书发货助手Pro` Resources.dll）三方对比
> 自研：`D:\eva\xhs-shipping-assistant`
> 日期：2026-08-14
> **本版纠正了 v2 的两个错误判断**

---

## 0. 一句话结论

**发消息就是 `window.XhsRim`（协议已还原，自研版 im-send.js 写对了）。根因是：自研版 `nodeIntegration:true` 让 walle 页面走了「全局 `require("electron")`」分支，拿到新版 Electron 的真实 electron（`remote` 和 `app` 已被移除），导致 IM SDK 拿不到 `app`/`remote` 而静默失败。**

**修复 = 关闭 `nodeIntegration`（让页面走 `csBridge.require` 分支）+ 补全 `csBridge.require("electron")` 返回对象（补 `app`/`remote`/`session.cookies`）+ 补 feature flag。**

---

## 1. 三方对比（关键证据，纠正 v2 错误）

### 1.1 页面拿 electron 的方式（真正的根因）

| 环境 | 壳 | 页面有全局 require？ | 页面怎么拿 electron | remote/app 可用？ | 结果 |
|---|---|---|---|---|---|
| 官方 | Electron（旧版） | ✅（nodeIntegration:true） | 全局 `require("electron")` | ✅ 旧版有 remote | XhsRim 挂载 ✅ |
| 阿奇锁 | CefSharp（无 Node） | ❌ | `csBridge.require("electron")`（mock） | ✅ mock 有 remote+app | XhsRim 挂载 ✅ |
| **自研版** | **Electron（新版）** | **✅（nodeIntegration:true）** | **全局 `require("electron")`（真实）** | **❌ 新版无 remote/app** | **XhsRim 不挂载 ❌** |

**关键**：walle 页面代码是同一份，它的兼容逻辑大概率是「有全局 require 就用全局 require，否则用 csBridge.require」：

```js
// walle 页面（推测的兼容逻辑）
function getElectron() {
  if (window.require) return require("electron");           // 官方/自研版走这里
  if (window.csBridge?.require) return window.csBridge.require("electron");  // 阿奇锁走这里
  return null;
}
```

- 自研版 `nodeIntegration:true` → `window.require` 存在 → 走全局 `require("electron")` → 拿到**新版 Electron 的真实 electron（无 remote、无 app）** → IM SDK 失败
- 阿奇锁 CefSharp 无 Node → `window.require` 不存在 → 走 `csBridge.require("electron")` → 拿到 **mock electron（含 remote+app）** → IM SDK 成功

### 1.2 阿奇锁 csBridge.require 返回（原样，含 app + remote）

```js
function mockRequire(moduleName) {
  if (moduleName === 'electron') {
    return {
      shell: mockShell,
      nativeImage: mockNativeImage,
      clipboard: mockClipboard,
      remote: window.csBridge.remote,      // mock remote
      ipcRenderer: window.csBridge.ipcRenderer,
      app: window.csBridge.remote.app      // ★ 有 app
    };
  }
  return {};
}
```

### 1.3 自研版 csBridge.require 返回（当前，缺 app）

```js
// electron/cs-bridge-shim.ts 当前的 remote.require
require: (id) => {
  if (id === 'electron') {
    return {
      ipcRenderer,
      shell,
      remote,               // 闭包里的 remote（但这是 mock remote，OK）
      session: sessionShim,
      clipboard: {...},
      nativeImage: {...}
      // ❌ 缺 app 字段！
    }
  }
}
```

---

## 2. 修复需求（三个 P0，缺一不可）

### P0-1（关键）：关闭 nodeIntegration，让页面走 csBridge.require 分支

**文件**：`electron/main.ts` → `getXhsWebPreferences()`

**改为**：
```js
function getXhsWebPreferences(shopId?: string) {
  return {
    preload: join(__dirname, 'xhs-preload.js'),
    nodeIntegration: false,      // ★ 关键：让 window.require 不存在，页面走 csBridge.require
    contextIsolation: false,     // 保持 false（preload 的 window.csBridge 要能被页面访问）
    webSecurity: false,          // 保持（edith 跨域需要）
    partition: partitionForShop(shopId),
    sandbox: false,              // 保持 false（preload 需要 require('electron')）
    backgroundThrottling: false
  }
}
```

**原理**：`nodeIntegration:false` 后，页面没有全局 `require`，walle 页面的 `getElectron()` 会 fallback 到 `csBridge.require("electron")`，拿到自研版补全后的 mock electron。

**注意**：`contextIsolation` 必须保持 `false`（不是 v2 说的 true）。因为 preload 里 `window.csBridge = {...}` 需要 contextIsolation:false 才能被页面访问。

**验证**：DevTools 执行 `typeof window.require` → 应为 `'undefined'`（证明走 csBridge.require 分支）。

### P0-2：补全 csBridge.require("electron") 返回对象（补 app）

**文件**：`electron/cs-bridge-shim.ts` → `remote.require` 函数

**改为**（对齐阿奇锁 mockRequire）：
```js
require: (id: string) => {
  if (id === 'electron') {
    return withMissLog('electron', {
      ipcRenderer,
      shell,
      remote,                // mock remote 对象
      app: appShim,          // ★ 补上 app（对齐阿奇锁 window.csBridge.remote.app）
      session: sessionShim,
      clipboard: {...},
      nativeImage: {...}
    })
  }
  ...
}
```

**关键**：补 `app: appShim`（自研版已经有 appShim 变量，只是没放进 require 返回里）。

### P0-3：补 getCurrentWindow().webContents.session.cookies

**文件**：`electron/cs-bridge-shim.ts` → `currentWindow.webContents`

**改为**（对齐阿奇锁）：
```js
webContents: {
  id: 1,
  on: noop, once: noop, send: noop,
  getURL: () => (typeof location !== 'undefined' ? location.href : ''),
  getTitle: () => (typeof document !== 'undefined' ? document.title : ''),
  getId: () => 1,
  isDestroyed: () => false,
  isCrashed: () => false,
  executeJavaScript: () => Promise.resolve(undefined),
  // ★ 补 session.cookies（对齐阿奇锁）
  session: {
    cookies: {
      get: () => Promise.resolve([]),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    }
  }
}
```

### P0-4：补 feature flag

**文件**：`electron/cs-bridge-shim.ts` → `w.csBridge` 对象

**补**：
```js
deprecateIpcQ: true,
supportNewAcct: true,
// appInfo 补 injectJsPath
appInfo: {
  injectJsPath: '',          // ★ 补
  appVersion: EVA_CLIENT_VERSION,
  ...
}
```

---

## 3. 保留之前已做的改动（无害，不用回退）

- `im-send.js`：协议已写对，**不动**
- `inject.service.ts`：executeJavaScript 注入已正确，**不动**
- P0-1~P0-4（离屏策略、get_csa patch、csBridge Proxy withMissLog、getRim 兜底）：**保留**，无害

---

## 4. 验证清单（Cursor 必须跑完）

```powershell
cd D:\eva\xhs-shipping-assistant
npx vite build

# 重启助手，打开客服页 DevTools 执行：
#   typeof window.require        → 'undefined'（走 csBridge.require 分支）
#   typeof window.csBridge       → 'object'
#   typeof window.csBridge.require → 'function'
#   window.csBridge.require("electron").app   → 非 undefined（补 app 成功）
#   typeof window.XhsRim         → 'object'（IM SDK 初始化成功）
#   window.ImLoginInfo.csProviderId → 非空

# IM 健康检查
curl -s http://127.0.0.1:19527/api/shipping/im-health
# 期望 health.rim=true, health.imLogin=true, health.csProviderId 非空

# csBridge 诊断
curl -s http://127.0.0.1:19527/api/shipping/csbridge-diag
# 期望 xhsRim.type="object", imLoginInfo.csProviderId 非空

# 真发消息（测试订单 80223388178802120）
# 期望 ship_log status=success
```

---

## 5. 禁止事项

1. 不要改 `im-send.js` 协议逻辑（已写对）
2. 不要把 `contextIsolation` 改成 `true`（必须 false，preload 的 csBridge 要被页面访问）
3. 不要把 `nodeIntegration` 改回 `true`（这是根因）
4. 不要实现「纯 REST 绕过 XhsRim」
5. 不要多开客服页
6. 最小 diff：只改 nodeIntegration + cs-bridge-shim.ts 的三个点

---

## 6. 如果改完 XhsRim 仍不挂载（备选排查）

1. DevTools 看 `window.csBridge.require("electron")` 返回对象，确认 `app`/`remote`/`ipcRenderer`/`shell`/`clipboard`/`nativeImage` 都在
2. 看页面 console 是否有 `[csBridge-miss]` 日志（withMissLog 会记录未 shim 的 API），把缺的 method 名贴回来
3. 检查 `window.XhsRim` 挂载前，页面是否报错（`window.__xhsCsBridgePageErrors`）
4. 检查 localStorage.accessToken 是否为空（未登录）

---

## 7. 结论

- 发消息协议已还原（`window.XhsRim.sendTextMsg` + `rimSdk.getChatInfo`），im-send.js 写对了
- 根因：`nodeIntegration:true` 让页面走全局 require 拿新版 Electron（无 remote/app）
- 修复：`nodeIntegration:false` + 补 `csBridge.require("electron").app` + 补 `session.cookies` + 补 feature flag
- **contextIsolation 保持 false**（v2 说改成 true 是错的）
