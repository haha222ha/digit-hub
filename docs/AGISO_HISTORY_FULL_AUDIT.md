# 阿奇锁历史版（123123）完整审计报告 · IM 发消息 1:1 复刻蓝本

> **审计对象**：`C:\Users\Administrator\Desktop\123123\XhsClient`  
> **产品**：小红书自动发货客户端（Agiso XhsClient）  
> **版本**：**1.2.13**（Electron 壳，非 CefSharp Pro）  
> **审计日期**：2026-08-14  
> **目标**：为自研 `xhs-shipping-assistant` 提供 **1:1 可复刻** 的 IM 发消息逻辑规范

---

## 0. 执行摘要

| 项 | 结论 |
|---|---|
| 权威蓝本 | 历史 Electron 版（本目录），**不是** Pro CefSharp 版 |
| IM 容器 | 主窗口内 `<webview id="im">`，非独立 BrowserWindow |
| IM URL | `https://walle.xiaohongshu.com/cstools/seller/dashboard` |
| Preload | `xhsImPreload.js`（336KB，含完整发消息 + csBridge） |
| csBridge | 真实 `@electron/remote` + 真实 NeDB，**非 mock** |
| XhsRim 获取 | **主动** `.farmer-chat-app.__vue__.getRim()` 轮询挂载 |
| 发消息入口 | 主进程 `executeJavaScript('window.sendImTextMsg(base64, orderId)')` |
| 发消息协议 | search_customer → getChatInfo → sendTextMsg（三步） |
| 源码还原 | 已从 `xhsImPreload.js.map` 还原明文 TS（见 `_history_src/`） |

**自研版当前最大阻塞**：walle 页面已从 Vue2 迁移 Vue3，`.farmer-chat-app.__vue__` 为 null，历史版 `getXhsAPI()` 无法直接工作，需 Vue3 等价探测或降级方案。

---

## 1. 审计对象清单

### 1.1 目录结构

```
123123/XhsClient/
├── XhsClient.exe                    # ~128MB，Electron 主程序
├── resources/
│   ├── app.asar                     # 已解包 → app_extracted/
│   └── app-update.yml
└── app_extracted/                   # 解包产物（审计主来源）
    ├── package.json                 # v1.2.13
    └── dist/
        ├── main/
        │   ├── main.js              # 945KB 主进程
        │   ├── mainPreload.js       # 5.8KB
        │   ├── xhsImPreload.js      # 336KB ★ IM preload
        │   ├── xhsAldsPreload.js    # 阿奇索 ALDS webview preload
        │   └── loginPreload.js      # 登录 webview preload
        └── renderer/
            └── renderer.js          # 1.2MB React 主界面
```

### 1.2 关键文件尺寸与依赖

| 文件 | 大小 | 作用 |
|---|---|---|
| main.js | 945KB | 窗口管理、消息队列、IPC、WinManager |
| renderer.js | 1.2MB | React UI + webview 标签 |
| xhsImPreload.js | 336KB | IM 页 preload：csBridge + sendImTextMsg + getXhsAPI |
| mainPreload.js | 5.8KB | 主窗口 preload：ipcRenderer 桥 |

**package.json 依赖**：
- `@electron/remote`: ^2.1.1
- `@journeyapps/sqlcipher`: ^5.3.1（本地 SQLite 加密）
- `node-machine-id`: ^1.1.12（设备 ID）

### 1.3 明文源码还原（sourcemap）

从 `xhsImPreload.js.map` 的 `sourcesContent` 完整还原：

```
C:\Users\Administrator\CodeBuddy\20260811210750\_history_src\
├── src__main__preload__xhsImPreload.ts      # 536 行，发消息完整逻辑
├── src__main__xhsEvaBridge__index.ts        # 76 行，csBridge 结构
├── src__main__preload__basePreload.ts        # ipcRenderer 桥
├── src__main__const.ts                       # URL + 硬编码密钥
├── src__main__types__ipcType.ts              # IPC 类型定义
└── src__main__xhsEvaBridge__getProcessCpuMemo.ts
```

---

## 2. 四层架构

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: Main Process (main.js)                                │
│  - BrowserWindow + partition                                    │
│  - WinManager / WindowsContainer                                │
│  - AldsMsgManager (消息队列 SendMsg → executeJavaScript)         │
│  - IPC handlers (getSystemData, on:xhsImLoaded, ...)            │
└───────────────────────────┬─────────────────────────────────────┘
                            │ IPC
┌───────────────────────────▼─────────────────────────────────────┐
│  Layer 2: Renderer (renderer.js, React)                         │
│  - Tab -2: <webview id="im" src=dashboard preload=xhsImPreload> │
│  - Tab -1: <webview id="xhs-alds-webview" src=ALDS>             │
│  - Tab  0: 本地 React 页面                                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │ webview preload
┌───────────────────────────▼─────────────────────────────────────┐
│  Layer 3: xhsImPreload.js (IM webview 内)                        │
│  - window.csBridge = xhsEvaBridge (@electron/remote + NeDB)     │
│  - window.electron = { ipcRenderer: basePreload }               │
│  - window.sendImTextMsg(base64, orderId)                        │
│  - getXhsAPI() → window.XhsRim / ImLoginInfo / XhsApiService    │
└───────────────────────────┬─────────────────────────────────────┘
                            │ 页面 JS API
┌───────────────────────────▼─────────────────────────────────────┐
│  Layer 4: walle.xiaohongshu.com (dashboard 页)                   │
│  - .farmer-chat-app Vue2 组件                                    │
│  - imAppVue.getRim() → rimSdk / sendTextMsg                     │
│  - localStorage: accessToken, userInfo                           │
│  - window._webmsxyw() 签名                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 窗口与会话管理

### 3.1 BrowserWindow 创建

```javascript
// main.js — 每个店铺一个 BrowserWindow
const partition = existingUser?.partition ?? `persist:${uuid-v4()}`;

new BrowserWindow({
  width: 1460, height: 880,
  show: false, frame: false,
  webPreferences: {
    partition: partition,           // ★ 店铺隔离 session
    webviewTag: true,
    nodeIntegration: true,
    contextIsolation: false,
    webSecurity: false,
    preload: mainPreload.js,
  }
});
```

### 3.2 IM webview 配置（renderer.js 还原）

```jsx
<webview
  id="im"
  ref={imRef}
  src="https://walle.xiaohongshu.com/cstools/seller/dashboard"
  preload={`${preloadBaseUrl}xhsImPreload.js`}
  allowpopups="true"
  webpreferences="contextIsolation=no,webviewTag=yes,nodeIntegration=yes,webSecurity=no,enableRemoteModule=yes"
  disablewebsecurity="true"
  partition={partition}
/>
```

**preloadBaseUrl 来源**：主进程 IPC `getSystemData` 返回打包目录或 dev dll 目录。

### 3.3 WinManager 与 WebContents 绑定

| 属性 | 绑定时机 | 用途 |
|---|---|---|
| `XhsImWebContents` | webview DOMContentLoaded → `ipcRenderer.send('on:xhsImLoaded')` | 发消息 executeJavaScript 目标 |
| `XhsAldsWebContents` | ALDS webview loaded → `on:xhsAldsLoaded` | 自动发货网页 |
| `LoginWebContents` | 登录 webview → `on:loginViewLoaded` | 小红书账号密码登录 |

`XhsImWebContents` setter 还监听 `did-navigate-in-page`，向 IM 页发送 `on:inPageNavigated` 触发路由切换逻辑。

### 3.4 Session 拦截（createSession）

对 `*.xiaohongshu.com` 的 edith API 和 service-ticket 请求，从 referrer 提取 Origin 写入 requestHeaders（避免 CORS/鉴权问题）。

### 3.5 登录成功流程（onLoginSuccess）

1. `onTokenRefresh` 刷新 token
2. `getClientToken()` 获取阿奇索 client token
3. 从 IM webview 读 `localStorage.getItem('userInfo')` 取头像
4. 更新 SQLite `XhsUser` 表（shopName, email, password, partition, avatarUrl, clientToken）
5. 启动 `periodicReLogin`（cron `0 */3 * * *`，6 天未登录提醒）
6. 回调 renderer：`on:afterMainWinHandleLoginInitCallback(token, userInfo, aldsToken)`

---

## 4. csBridge 1:1 规范

**文件**：`xhsEvaBridge/index.ts`（preload 内 `window.csBridge = csBridge`）

| 字段 | 类型/实现 | 说明 |
|---|---|---|
| `getCurrentWindow()` | `@electron/remote.getCurrentWindow()` | 空实现 setMaximumSize/setMinimumSize/setBounds/invokeCurrentWindowFn，防止 IM 页改窗口尺寸 |
| `notify(options)` | async noop + console.log | 系统通知占位 |
| `winFlash()` | remote 窗口 flashFrame | 未聚焦时闪烁 |
| `ipcRenderer` | 真实 electron ipcRenderer | |
| `remote` | 整个 `@electron/remote` 模块 | ★ 非 mock |
| `winMaximize/winMinimize` | noop | |
| `handleClientLogout` | noop | |
| `getProcessMemoryInfo` | 真实实现 | CPU/内存桥 |
| `getProcessCPUUsage` | 真实实现 | |
| `getDeviceId` | `node-machine-id`.machineIdSync | 设备指纹 |
| `appInfo.injectJsPath` | xhsImPreload.js 绝对路径 | walle 页可能引用 |
| `appInfo.appVersion` | `'1.1.57'` | 内嵌版本号 |
| `deprecateIpcQ` | `true` | feature flag |
| `supportNewAcct` | `true` | feature flag |
| `sitEnvDb.updateSitUrl` | ipc send `store:updateEndpoint` | 环境切换 |
| `clientDb.registDb(name)` | 真实 NeDB，路径 `userData/db/{name}.db` | 持久化本地 DB |

**window.electron**（与 csBridge 分离）：
```typescript
window.electron = { ipcRenderer: basePreload };
// basePreload: log, getSystemData, getMainWinContext, sendMessage, invoke, ...
```

---

## 5. IM 页生命周期

### 5.1 启动序列

```
DOMContentLoaded
  → ipcRenderer.send('on:xhsImLoaded')     // 主进程绑定 XhsImWebContents
  → handleRouteChange()
       ├─ URL = /cstools/login → autoInputUserLogin()
       └─ URL = dashboard      → initPage() + startCheckXhsTicketExpired() + getXhsAPI()
```

### 5.2 initPage() — 页面 DOM 改造

1. 隐藏 `.window-opt-comp`
2. 隐藏除「设置」外所有 `.opt-item`
3. 将 `#webview-modal` 的 `<webview>` 替换为 `<iframe>`（Electron webview 标签兼容）

### 5.3 自动登录（autoInputUserLogin）

从 `getMainWinContext()` 取 email/password，轮询：
- 选择器：`.login-submit-btn`、`.email-login-warp`
- 填：`div.email-wrap.login-input > input`、`div.code-wrap.login-input > input`
- 点击登录；若 `.alert-title` 有内容 → `on:loginTimeoutNotice`

### 5.4 登录态检查（checkXhsTicketExpired，每 30s）

1. `localStorage.userInfo` 存在且含 `imToken`
2. GET `wario.xiaohongshu.com/.../seller_queuing_info?im_token=...` → 401 则重登
3. `XhsRim.rimSdk.imSdk.state === 'SDK_NOT_READY'` 且页面含「登录认证已过期」→ 重登
4. 需重登 → `location.href = XHS_IM_LOGIN_URL`

### 5.5 getXhsAPI() — XhsRim 主动挂载 ★核心★

```typescript
function getXhsAPI() {
  const interval = setInterval(() => {
    if (window.XhsRim) { clearInterval(interval); return; }

    const imAppVue = document.querySelector('.farmer-chat-app')?.__vue__;
    const rim = imAppVue?.getRim();
    const imLoginInfo = imAppVue?.userInfo;              // ★ 不是 imStore
    const xhsApiService = imAppVue?.$parent?.services;    // ★ 必须挂载

    if (!rim || !xhsApiService || !imLoginInfo) return;

    clearInterval(interval);
    chatSdkVersion = imAppVue.$parent.version;
    window.VueRouter = imAppVue.$router;
    window.XhsRim = rim;
    window.XhsApiService = xhsApiService;
    window.ImLoginInfo = imLoginInfo;
  }, 500);
}
```

**挂载到 window 的对象**：

| 全局变量 | 来源 | 用途 |
|---|---|---|
| `window.XhsRim` | `imAppVue.getRim()` | rimSdk.getChatInfo / sendTextMsg |
| `window.ImLoginInfo` | `imAppVue.userInfo` | csProviderId 等 |
| `window.XhsApiService` | `imAppVue.$parent.services` | 页面服务层 |
| `window.VueRouter` | `imAppVue.$router` | 路由（辅助） |
| `chatSdkVersion` | `imAppVue.$parent.version` | getChatInfo additionInfo.version |

---

## 6. 发消息完整流水线（1:1 规范）

### 6.1 端到端时序

```
阿奇索 WS/ALDS 网页
  → invoke('on:receivedAldsMsg', payload)
  → AldsMsgManager.ReceivedAldsMsg()
       ├─ 作废同 oid 旧消息
       ├─ 写入 SQLite XhsAldsMsgLog
       └─ WaitSendMsgQueue.enqueue()
  → StartConsumeMsg() [单消费者，breath=1000ms]
       ├─ getWinManagerByPlatformId(platformShopId)
       ├─ SendMsg(record, winManager, logger)
       │    ├─ processMsgBody: split('{$分段符}')
       │    ├─ Buffer.from(segment,'utf-8').toString('base64')
       │    └─ XhsImWebContents.executeJavaScript(`
       │         window.sendImTextMsg('${base64}','${tid}')
       │       `, timeout=15000)
       ├─ 成功 → SendResult=Success → sendWsMsgToAgiso 回传
       └─ 失败 → 重试(maxRetryCount=1) 或 forceReQueue(页面加载中)
```

### 6.2 window.sendImTextMsg — 三步协议

**入口签名**：`async (contentBase64: string, orderId: string) => Promise<string>`  
**返回值**：空字符串 = 成功；非空 = 错误消息

#### 步骤 0：前置检查

```typescript
if (!window.XhsRim) {
  getXhsAPI();
  return '页面加载中';
}
```

#### 步骤 1：search_customer 查 buyerId

```typescript
const token = localStorage.getItem('accessToken');
const sellerId = window.ImLoginInfo?.csProviderId;

const apiPath = `/api/edith/mcs/search_customer`
  + `?seller_id=${sellerId}`
  + `&keyword=${orderId.trim()}`
  + `&page_no=1&page_size=5`
  + `&cancel_token=%7B%22promise%22:%7B%7D%7D`;

const url = 'https://walle.xiaohongshu.com' + apiPath;
const sign = window._webmsxyw(apiPath);

fetch(url, {
  method: 'GET',
  headers: {
    accept: 'application/json, text/plain, */*',
    'x-subsystem': 'eva',
    ...sign,
    authorization: token,
  },
});

// 返回 packages.data.search_results[0].id
```

#### 步骤 2：getChatInfo 建会话

```typescript
const sellerInfo = window.ImLoginInfo;

const arg1 = {
  promoterType: 'OFFICIAL',                    // ★ 固定字符串
  invitedRefId: buyerId,
  presentUserRefId: sellerInfo.csProviderId,   // ★ 正确字段名！
  additionInfo: { version: chatSdkVersion },   // 默认 'v0.0.5'，后从 $parent.version 更新
};

const arg2 = {
  receiverAppUid: `1#2#2#${buyerId}`,          // CUSTOMER
  creatorParentAppUid: `1#3#6#${sellerInfo.csProviderId}`,  // SELLER
  bizType: 'chat',
};

const chatInfo = await window.XhsRim.rimSdk.getChatInfo(arg1, arg2);
const chatId = chatInfo.data.id;

// 401 → goReLogin() → return '页面加载中'
```

**UID 编码规则**（源码注释）：
- SELLER: `1#3#6#` + id
- CSA: `1#1#4#` + id
- CUSTOMER: `1#2#2#` + id

#### 步骤 3：sendTextMsg 发消息

```typescript
const content = Buffer.from(contentBase64, 'base64').toString();
const result = await window.XhsRim.sendTextMsg(content, { chatId });

if (result?.status !== 'success') {
  return `发送IM文本消息返回失败${result?.message}`;
}
return '';  // 成功
```

### 6.3 主进程 SendMsg 细节

| 参数 | 值 |
|---|---|
| JS 超时 | 15000ms |
| 分段符 | `{$分段符}` |
| 页面加载中 | forceReQueue + 等 2000ms |
| sendImTextMsg 不存在 | 同上 |
| maxRetryCount | 1 |
| breath（队列间隔） | 1000ms |

### 6.4 错误码与重试策略

| 返回/错误 | 行为 |
|---|---|
| `'页面加载中'` | forceReQueue，2s 后重新入队 |
| `'window.sendImTextMsg is not a function'` | 同上 |
| 超时 `'发送Im消息超时'` | 记录 errorMsg，execCount++，最多重试 1 次 |
| getChatInfo 401 | preload 内 goReLogin()，返回「页面加载中」 |
| 其它错误 | 记录日志，SendResult=Fail，推送 WS |

---

## 7. IPC 通道映射

### 7.1 Preload → Main（send/on）

| Channel | 方向 | 作用 |
|---|---|---|
| `on:xhsImLoaded` | IM webview → main | 绑定 XhsImWebContents |
| `on:xhsAldsLoaded` | ALDS webview → main | 绑定 XhsAldsWebContents |
| `on:loginViewLoaded` | 登录 webview → main | 绑定 LoginWebContents |
| `on:inPageNavigated` | main → IM webview | SPA 路由变化 |
| `on:loginTimeoutNotice` | IM → main → WS | 登录失败通知 |
| `on:log` / `on:wsLog` | 各 preload → main | 日志 |
| `on:receivedAldsMsg` | renderer invoke | 接收发货消息 |
| `on:syncDisableMsg` | 批量作废消息 | |
| `on:tokenExpired` | token 过期处理 | |
| `on:logout` | 登出关闭窗口 | |

### 7.2 Main handle（invoke）

| Channel | 返回 |
|---|---|
| `getSystemData` | `{ preloadBaseUrl, partition }` |
| `getMainWinContext` | `{ aldsToken, userEmail, userPassword, isRefreshLogin }` |
| `getGlobalStore` | 全局 store |
| `on:receivedAldsMsg` | AldsMsgManager 处理结果 |
| `on:getAldsLogList` | 发货日志分页 |

### 7.3 Main → Renderer 回调

| Channel | 作用 |
|---|---|
| `on:afterMainWinHandleLoginInitCallback` | 登录完成，设置 TOKEN、加载 webview |
| `on:showErrorMsg` | 错误 toast |
| `on:periodicReLoginNotification` | 6 天未登录提醒 |
| `on:maximize` | 窗口最大化状态 |

---

## 8. 常量与环境变量

```typescript
// const.ts
XHS_IM_LOGIN_URL  = 'https://walle.xiaohongshu.com/cstools/login'
XHS_IM_URL        = 'https://walle.xiaohongshu.com/cstools/seller/dashboard'
XHS_AUTH_URL      = 'https://ark.xiaohongshu.com/ark/authorization'
XHS_LOGIN_URL     = 'https://customer.xiaohongshu.com'
CLIENT_KEY        = '99695022009523117035131268642105'
SQLITE_ENCRYPT_KEY = '&!15%@5*@1678#'

// 环境变量（构建注入）
WS_HOST           = process.env.WS_HOST
XHS_ALDS_WEB      = process.env.XHS_ALDS_WEB
API_HOST_BASE     = process.env.XHS_API_HOST
```

---

## 9. 与 Pro CefSharp 版差异（勿混淆）

| 维度 | 历史 Electron 1.2.13 | Pro CefSharp |
|---|---|---|
| 壳 | Electron + webview | CefSharp 内嵌浏览器 |
| nodeIntegration | **true** | 无 Node |
| csBridge.remote | 真实 @electron/remote | 全 mock |
| getRim | **主动调用** getRim() | getRim 被注释，被动等 |
| IM 容器 | renderer 内 webview | 内嵌 Browser |
| 发消息协议 | 相同三步 | 相同三步 |

**结论**：自研 Electron 助手应抄 **历史版**，不是 Pro 版的 mock 方案。

---

## 10. 自研版 Gap 分析（xhs-shipping-assistant）

| # | 历史版要求 | 自研现状 | 状态 |
|---|---|---|---|
| 1 | IM URL = dashboard | 已改 dashboard | ✅ |
| 2 | webview + xhsImPreload 作 preload | 隐藏 BrowserWindow + inject | ⚠️ 架构不同 |
| 3 | nodeIntegration=true + enableRemoteModule | v4 已改 true + @electron/remote | ✅ |
| 4 | csBridge 真实 remote + NeDB | 部分 shim + IPC NeDB | ⚠️ |
| 5 | getXhsAPI 主动 getRim() | im-send.js + rim-bootstrap 已移植 | ✅ 逻辑 |
| 6 | ImLoginInfo = imAppVue.userInfo | 已改优先 userInfo | ✅ |
| 7 | presentUserRefId（非 promoterType 覆盖） | 已修复 | ✅ |
| 8 | window.sendImTextMsg 入口 | inject 脚本，非 window 级 | ⚠️ |
| 9 | 主进程 executeJavaScript 调用 | 自研 API 路径不同 | ⚠️ |
| 10 | `.farmer-chat-app.__vue__` 可用 | **Vue3 下为 null** | ❌ 阻塞 |

### 10.1 当前运行时诊断（2026-08-14）

```
farmer-chat-app DOM:     ✅ present
.farmer-chat-app.__vue__: ❌ null（Vue3）
window.XhsRim:           ❌ 未挂载
im-health:               token/imLogin/csProviderId OK, rim:false
auto-ship API:           success:true（触发发货，IM 是否真发待验）
```

---

## 11. 1:1 复刻清单（按优先级）

### P0 — 必须完全一致

- [ ] IM 页加载 `https://walle.xiaohongshu.com/cstools/seller/dashboard`
- [ ] Preload 注入 `window.csBridge`（@electron/remote 真模块）
- [ ] Preload 注入 `window.sendImTextMsg(base64, orderId)` 完整三步
- [ ] `getXhsAPI()` 500ms 轮询 → `getRim()` → 挂 `XhsRim/ImLoginInfo/XhsApiService`
- [ ] getChatInfo arg1: `presentUserRefId: csProviderId`，`promoterType: 'OFFICIAL'`
- [ ] getChatInfo arg2: `1#2#2#buyerId` / `1#3#6#csProviderId` / `bizType:'chat'`
- [ ] search_customer 用 `window._webmsxyw` 签名 + `accessToken` + `x-subsystem: eva`
- [ ] 主进程对 IM webContents 执行 `executeJavaScript('window.sendImTextMsg(...)')`

### P1 — 架构对齐

- [ ] 考虑 renderer 内 `<webview>` 模型（与历史版同构）
- [ ] `on:xhsImLoaded` 绑定 XhsImWebContents
- [ ] partition 按店铺 persist UUID 隔离
- [ ] initPage DOM 改造（隐藏 opt、webview→iframe）
- [ ] 登录态 checkXhsTicketExpired 30s 轮询

### P2 — 消息队列（若对接阿奇索 WS）

- [ ] WaitSendMsgQueue 单消费者
- [ ] processMsgBody 分段符 `{$分段符}`
- [ ] maxRetryCount=1, breath=1000ms
- [ ] forceReQueue on「页面加载中」

### P3 — Vue3 阻塞解除

- [ ] 探测 Vue3 `__vueParentComponent` / `setupState` / expose 上的 getRim
- [ ] 或 hook walle 全局 `window.__XHS_RIM__`（若存在）
- [ ] 或 impaas WebSocket 直连 fallback（非 1:1，仅降级）

---

## 12. 推荐复刻实现路径

### 方案 A：结构 1:1（推荐）

1. 主窗口 renderer 内嵌 `<webview id="im">`，preload 指向打包版 `xhsImPreload.js`（从历史 TS 编译）
2. 主进程复制 `SendMsg` + `WinManager.XhsImWebContents` 绑定逻辑
3. 解决 Vue3 getRim：在 getXhsAPI 增加 Vue3 探测分支，Vue2 路径保持不变

### 方案 B：最小改动（当前架构）

1. 保持隐藏 BrowserWindow，但 webPreferences 与 preload 内容 1:1 复制历史版
2. 将 `xhsImPreload.ts` 编译产物作为 BrowserWindow preload（非 inject）
3. 发消息时 `imWindow.webContents.executeJavaScript('window.sendImTextMsg(...)')`
4. 同样需解决 Vue3 getRim

---

## 13. 验证用例

**测试订单**：`P802233881788021201`（orderId=`80223388178802120`，shop=`shop_mssdfcrc_q8ty`）

| 步骤 | 验证点 | 期望 |
|---|---|---|
| 1 | IM 页 URL | dashboard |
| 2 | csbridge-diag | csBridge.remote 非 mock |
| 3 | farmer-vue probe | getRim 可调用 |
| 4 | window.XhsRim | 非 null |
| 5 | ImLoginInfo.csProviderId | 有值 |
| 6 | 手动 executeJavaScript sendImTextMsg | 返回 '' |
| 7 | 买家端收到消息 | 文本一致 |
| 8 | ship_log / 发货日志 | 记录成功 |

---

## 14. 附录：源码关键片段索引

| 逻辑 | 文件 | 行号（还原 TS） |
|---|---|---|
| sendImTextMsg | xhsImPreload.ts | 124-232 |
| getBuyerIdByOrderId | xhsImPreload.ts | 40-100 |
| getXhsAPI | xhsImPreload.ts | 435-465 |
| csBridge | xhsEvaBridge/index.ts | 17-73 |
| initPage | xhsImPreload.ts | 244-276 |
| autoInputUserLogin | xhsImPreload.ts | 304-338 |
| checkXhsTicketExpired | xhsImPreload.ts | 340-404 |
| DOMContentLoaded | xhsImPreload.ts | 510-522 |

---

## 15. 结论

1. **历史版 123123 是 Electron 自研助手的唯一正确蓝本**，发消息逻辑已在 sourcemap 中完整还原。
2. **协议层（search_customer → getChatInfo → sendTextMsg）与字段名已 100% 明确**，自研版 arg1/ImLoginInfo 等逻辑错误已识别并部分修复。
3. **架构层差异**（webview vs 隐藏窗、inject vs preload）仍影响 1:1，建议向 webview+preload 收敛。
4. **当前硬阻塞**是 walle Vue2→Vue3 导致 `__vue__` 不可用；不解决 getRim 挂载，executeJavaScript 只会返回「页面加载中」。
5. 下一步：实现 Vue3 getRim 探测 + 将 `sendImTextMsg` 挂到 window + 主进程 executeJavaScript 直调，并用测试订单做端到端验收到买家消息。

---

*审计 raw 数据*：`D:\eva\xhs-shipping-assistant\docs\_agiso_audit_raw.json`  
*还原源码*：`C:\Users\Administrator\CodeBuddy\20260811210750\_history_src\`  
*简要突破说明*：`D:\eva\xhs-shipping-assistant\docs\AGISO_HIST_ELECTRON_BREAKTHROUGH.md`
