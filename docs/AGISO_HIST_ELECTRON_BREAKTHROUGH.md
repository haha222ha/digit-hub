# 阿奇索历史 Electron 版逆向 · 突破口（2026-08-14）

> 来源：`C:\Users\Administrator\Desktop\123123\XhsClient`（app.asar 已解包）
> 对比：Pro 版 CefSharp（`D:\eva\小红书发货助手Pro`）vs 历史 Electron 版 vs 自研助手

---

## 0. 一句话

**历史阿奇索是自研助手的「同族」：Electron + webview 加载 walle dashboard + `xhsImPreload.js` 作 preload + `@electron/remote` 作 csBridge.remote + 从 `.farmer-chat-app.__vue__.getRim()` 偷 XhsRim。**

Pro 版 CefSharp 的 mock csBridge 是另一条路；**自研应优先抄历史 Electron 版，不是 Pro。**

---

## 1. 三版本架构对照

| 维度 | 历史阿奇索 Electron | Pro 阿奇索 CefSharp | 自研助手（当前） |
|------|---------------------|---------------------|------------------|
| 壳 | Electron 30 | CefSharp | Electron 30 |
| IM 容器 | 主窗内 `<webview id="im">` | 内嵌浏览器 | 隐藏 BrowserWindow |
| IM 加载 URL | **`/cstools/seller/dashboard`** | walle | **`/cstools/chat`** |
| webPreferences | `nodeIntegration=yes`, `enableRemoteModule=yes`, `contextIsolation=no` | 无 Node | v3: `nodeIntegration=false` |
| csBridge.remote | **`@electron/remote` 真模块** | 全 mock | mock shim |
| XhsRim 来源 | **`.farmer-chat-app.__vue__.getRim()`** | 同左（XHS_FIX JS） | 等 page 自挂载（失败） |
| 发消息入口 | `window.sendImTextMsg(base64, orderId)` | 同协议 | `im-send.js` inject |

---

## 2. 关键证据（renderer.js webview 配置）

```jsx
<webview
  id="im"
  src="https://walle.xiaohongshu.com/cstools/seller/dashboard"
  preload={`${preloadBaseUrl}xhsImPreload.js`}
  webpreferences="contextIsolation=no,webviewTag=yes,nodeIntegration=yes,webSecurity=no,enableRemoteModule=yes"
  partition={shopPartition}
/>
```

**突破口 #1**：IM 页加载的是 **dashboard**，不是 `/cstools/chat`。  
自研隐藏客服窗目前 `loadURL(XHS_CHAT_URL)` → diag 里 `farmer-chat-app: false` 很可能与此有关。

---

## 3. xhsImPreload.js 核心逻辑（解包可读）

### 3.1 csBridge = 真 @electron/remote（非 mock）

```javascript
const Il = require('@electron/remote')  // 模块 3017

window.csBridge = {
  getCurrentWindow: () => {
    const w = Il.getCurrentWindow()
    w.setMaximumSize = () => {}
    w.setMinimumSize = () => {}
    // ...
    return w
  },
  ipcRenderer: electron.ipcRenderer,
  remote: Il,                    // ★ 整个 @electron/remote
  appInfo: { injectJsPath: '.../xhsImPreload.js', appVersion: '1.1.57' },
  deprecateIpcQ: true,
  supportNewAcct: true,
  clientDb: { registDb: (name) => new Nedb({ filename: Il.app.getPath('userData') + `/db/${name}.db` }) },
  // 无 getRemote 字段
}
window.electron = { ipcRenderer: ... }
```

**突破口 #2**：Electron 壳应装 `@electron/remote`，`csBridge.remote = remote`，而不是 mock。  
v3「nodeIntegration:false + mock require」对齐的是 **CefSharp Pro**，不是这套 Electron 实现。

### 3.2 XhsRim 不靠页面自挂载 —— Jl() 轮询偷 rim

```javascript
function Jl() {
  const timer = setInterval(() => {
    if (window.XhsRim) return clearInterval(timer)
    const vue = document.querySelector('.farmer-chat-app')?.__vue__
    const rim = vue?.getRim()
    const userInfo = vue?.userInfo
    const services = vue?.$parent?.services
    if (rim && services && userInfo) {
      clearInterval(timer)
      window.XhsRim = rim
      window.XhsApiService = services
      window.ImLoginInfo = userInfo   // ★ 来自 Vue 实例，不是 imStore
    }
  }, 500)
}

// DOMContentLoaded 且非登录页时调用 Jl()
// sendImTextMsg 发现 !window.XhsRim 时也会 Jl()
```

**突破口 #3**：`window.XhsRim` 未定义不等于 IM 不可用；应从 **dashboard 上的 `.farmer-chat-app`** 偷 `getRim()`。  
自研 `im-send.js` 已有类似逻辑，但 IM 窗在 chat 页且 `farmer-chat-app` 未出现。

### 3.3 发消息协议（与自研 im-send.js 一致）

```javascript
window.sendImTextMsg = async (base64Content, orderId) => {
  if (!window.XhsRim) { Jl(); return '页面加载中' }
  // 1. search_customer(keyword=orderId)
  // 2. XhsRim.rimSdk.getChatInfo(arg1, arg2)
  // 3. Buffer.from(base64).toString() → XhsRim.sendTextMsg(content, { chatId })
}
```

主进程调用：

```javascript
await XhsImWebContents.executeJavaScript(
  `window.sendImTextMsg('${base64}', '${orderId}')`, 15000
)
```

---

## 4. 对 v3 spec 的修正建议（v4 方向）

| v3 判断 | 历史 Electron 阿奇索证据 | 建议 |
|---------|--------------------------|------|
| nodeIntegration:false | webview 用 **true** + enableRemoteModule | IM 容器改回 **true**，主进程初始化 `@electron/remote` |
| mock csBridge.require | 用 **@electron/remote** 真 remote/app | 替换 mock remote |
| 隐藏窗 load /cstools/chat | webview load **dashboard** | IM 窗改 load `XHS_DASHBOARD_URL` |
| 等 window.XhsRim 自挂载 | **Jl() 偷 getRim()** | preload/DOMContentLoaded 启动 Jl 轮询 |

---

## 5. 自研最小改动清单（按优先级）

1. **P0-A** IM 隐藏窗 / 发货 WebContents：`loadURL(XHS_DASHBOARD_URL)` 替代 `XHS_CHAT_URL`
2. **P0-B** 安装并初始化 `@electron/remote`；`csBridge.remote = remote`，`getCurrentWindow` 走真 API
3. **P0-C** IM webPreferences：`nodeIntegration: true`, `contextIsolation: false`（与阿奇索 webview 一致）
4. **P0-D** 在 `xhs-preload.ts` 或 inject 里移植 **Jl()**（DOMContentLoaded + 500ms 轮询），赋值 `window.XhsRim` / `window.ImLoginInfo`
5. **P1** 确保 IM webview 持续渲染（阿奇索主窗可见 tab；自研若必须隐藏，验证 dashboard 离屏是否仍挂载 farmer-chat-app）

---

## 6. 验收

DevTools（IM webview / 客服窗）：

```javascript
location.href                              // 含 seller/dashboard
document.querySelector('.farmer-chat-app') // 非 null
typeof window.XhsRim                       // 'object'（Jl 赋值后）
window.ImLoginInfo?.csProviderId           // 非空
typeof window.sendImTextMsg                // 'function'（可选，对齐阿奇索）
```

API：

```powershell
curl -s http://127.0.0.1:19527/api/shipping/csbridge-diag
# farmerChatApp: true, xhsRim.type: "object"
```

---

## 7. 文件索引（历史版解包路径）

| 文件 | 内容 |
|------|------|
| `dist/renderer/renderer.js` | webview 配置、dashboard URL、preload 路径 |
| `dist/main/xhsImPreload.js` | csBridge、Jl()、sendImTextMsg、csBridge 赋值 |
| `dist/main/main.js` | XhsImWebContents、executeJavaScript 发消息 |
| `dist/main/mainPreload.js` | 主窗 preload（非 IM） |
