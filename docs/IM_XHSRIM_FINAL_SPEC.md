# 小红书 IM 发消息 · 修正版需求文档（2026-08-14 v2）

> **取代**旧版 §0/§2/§3 中「改 nodeIntegration:false」的错误结论  
> **项目**：`D:\eva\xhs-shipping-assistant`  
> **对照**：官方千帆 Eva Electron 壳 + 阿奇锁 CefSharp 壳（协议同源）  
> **抓包证据**：`captures/manual-chat-2026-08-14T09-35-08.ndjson`

---

## 0. 一句话结论（v2 修正）

**官方千帆与阿奇锁发消息逻辑同源：加载 walle 远程客服页 → 页面挂载 `window.XhsRim` → `rimSdk.getChatInfo` → `sendTextMsg`。**

自研版失败的主因不是 `nodeIntegration:true`（官方也是 true），而是 **`window.csBridge` 结构与官方不一致**，页面走「Electron 客户端分支」时 IM SDK 初始化失败 → `XhsRim` 不挂载。

**正确修复方向：精确对齐官方 csBridge 结构，保持 `nodeIntegration:true` + `contextIsolation:false`。**

---

## 1. 官方 vs 阿奇锁 vs 自研（协议层）

| 维度 | 官方千帆 | 阿奇锁 | 自研（目标） |
|------|----------|--------|--------------|
| 壳技术 | Electron | CefSharp | Electron |
| 加载页 | walle 远程客服/dashboard | 同左 | 同左 |
| 发消息 SDK | `window.XhsRim` | 同左 | 同左 |
| 建会话 | `rimSdk.getChatInfo(arg1, arg2)` | 同左 | 同左 |
| csProviderId | `imStore.xUserInfo` | 同左 | 同左 |
| 查买家 | `search_customer` + `_webmsxyw` | 同左 | 同左 |
| 底层传输 | impaas WebSocket `/message/send` | 同左（经 XhsRim 封装） | 同左 |

**差异只在壳桥接（csBridge），不在发消息协议。**

---

## 2. webPreferences（决定性证据 — 禁止改错方向）

官方 Eva 与自研应对齐：

```javascript
nodeIntegration: true,       // ✅ 保持 true，不要改成 false
contextIsolation: false,     // ✅ 保持 false，不要改成 true
webSecurity: false,
backgroundThrottling: false,
preload: 'xhs-preload.js',
```

### ❌ 已废弃的错误方向（旧 IM_XHSRIM_FINAL_SPEC §0/§3 P0-1）

- ~~`nodeIntegration: false`~~
- ~~`contextIsolation: true`~~
- ~~移除 csBridge 让页面走「纯浏览器分支」~~

**原因**：官方就是 Node 集成 + 非隔离；页面**故意**检测 Electron 客户端环境并依赖 csBridge，关掉 Node 会走另一条错误分支。

---

## 3. 根因：csBridge 结构不一致

| 字段 | 官方千帆 | 自研当前（`cs-bridge-shim.ts`） | 影响 |
|------|----------|----------------------------------|------|
| **`getRemote`** | **`true`（布尔 feature flag）** | `() => remote`（函数） | `=== true` 永远 false → 走错分支 |
| `remote` | 完整 remote 对象 | 有，但可能未被选中 | IM SDK 拿不到 electron |
| `clientDb.registDb` | 主进程 NeDB + `db:invokeFn` IPC | 渲染进程**内存库** | 会话/配置持久化异常 |
| `getCurrentWindow` | 经 `ipcRenderer.invoke` 包装 | 假对象 stub | 窗口 API 缺失 |
| `supportTab` | `true` | `false` | 功能探测不一致 |
| `supportFloatWin` | `true` | `false` | 同上 |
| `supportFloatPlayVoice` | `true` | `false` | 同上 |

### 3.1 `getRemote: true` 的含义（关键）

官方不是 `getRemote()` 函数，而是 **布尔开关**：

```javascript
// 页面典型逻辑（推断 + 需 bundle 验证）
if (csBridge.getRemote === true) {
  // 走官方 Electron 客户端分支 → 使用 csBridge.remote / require('electron')
} else {
  // 降级或失败
}
```

自研当前：

```typescript
getRemote: () => remote,  // typeof === 'function'，=== true 为 false
```

**修复要求**：`csBridge.getRemote = true`（字面量布尔），完整对象放在 `csBridge.remote`；同时保留 `csBridge.require` 指向 `remote.require('electron')` 路径（部分 bundle 直调）。

若 bundle 同时存在 `getRemote()` 调用，需 DevTools 验证后做**兼容**（例如 `Object.defineProperty` 不可同时是 true 和 function，优先布尔 + 确保所有引用走 `csBridge.remote`）。

---

## 4. 发消息协议（已还原，im-send.js 不用大改）

### 4.1 页面 SDK（与阿奇锁 extract 一致）

```javascript
// 1. 查买家（必须用 packageId，如 P802233881788021201）
GET /api/edith/mcs/search_customer?seller_id={csProviderId}&keyword={packageId}

// 2. 建会话
await window.XhsRim.rimSdk.getChatInfo(arg1, arg2)  // → chatId

// 3. 发文本
await window.XhsRim.sendTextMsg(content, { chatId })
```

### 4.2 抓包补充（2026-08-14 人工聊天）

底层 WebSocket（zelda / impaas）：

```json
{
  "header": { "action": "/message/send", "serviceId": "impaas.oi" },
  "body": {
    "appCid": "$3$MSMy...",
    "receiverAppUids": ["1#2#2#67e169ae00000000060130f3"],
    "contentInfo": { "contentType": 1, "content": "消息正文" }
  }
}
```

**结论**：自动化应优先走 **XhsRim**（与官方一致）；WS 直发是备选方案（需复用页面已有 zelda 连接）。

### 4.3 订单号

| 用途 | 值 |
|------|-----|
| 买家领取 / 搜索 | **`P802233881788021201`**（packageId） |
| 内部 orderId | `80223388178802120` |

`search_customer` 抓包 `match_type: "package_id"` 已证实。

---

## 5. 修复需求（按优先级）

### P0-1：对齐 `csBridge.getRemote === true`

**文件**：`electron/cs-bridge-shim.ts`

```typescript
w.csBridge = {
  getRemote: true as unknown as never,  // 必须是布尔 true；勿用 () => remote
  remote,                               // 完整 remote 对象
  require: requireShim,
  // ...
}
```

**验证**（DevTools）：

```javascript
window.csBridge.getRemote === true   // 必须 true
window.csBridge.remote?.require      // function
typeof window.XhsRim                 // 'object'
```

### P0-2：`clientDb` 走主进程 NeDB（勿用内存库）

**文件**：`electron/client-db-shim.ts`、`electron/eva-nedb.ts`、`electron/main.ts`（已有 `db:registDb` / `db:invokeFn`）

- `registDb(name)` → `ipcRenderer.send('db:registDb', name)`
- DB 操作 → `ipcRenderer.invoke('db:invokeFn', dbName, fnName, ...args)`
- 删除或降级渲染进程 `MemoryDb` 作为默认路径

### P0-3：`getCurrentWindow` 对齐官方 invoke 路径

**文件**：`electron/cs-bridge-shim.ts`、`electron/main.ts`（扩展 `invoke-current-win-function`）

- 关键方法：`getBounds`、`getContentBounds`、`isVisible`、`webContents.getURL` 等
- 优先：`ipcRenderer.invoke('invoke-current-win-function', 'getBounds')` 返回真实 BrowserView bounds

### P0-4：feature flags 对齐官方

```typescript
supportTab: true,
supportFloatWin: true,
supportFloatPlayVoice: true,
supportNewUI: true,
supportArkLogin: true,
```

多账号仍由本助手 partition 管理；`tab:getAllLogin` 可返回 `[]` 或当前店 `bUserId`，但 **flag 应为 true**。

### P0-5：主 BrowserView 与 IM 分离（已完成，保持）

- 工作台 dashboard：**用户可见**，不强制 `loadURL(/cstools/chat)`
- IM 发码：专用 WebContents 或 dashboard 内 XhsRim（二选一，优先 dashboard 若 XhsRim 在此挂载）
- `bindShopImForShip` 不得劫持主 BrowserView

### P1：packageId 搜索（已完成，保持）

`im-send.js` → `orderLookupKeys()` 优先 `P802233881788021201`

### P2：WS 直发备选（仅当 P0 后 XhsRim 仍不可用）

Hook dashboard 页 zelda WebSocket，按抓包格式发 `/message/send`（见 captures ndjson）。

---

## 6. 禁止事项

1. ❌ 改 `nodeIntegration:false` / `contextIsolation:true`
2. ❌ 移除 csBridge（官方依赖它）
3. ❌ 主 BrowserView 强制跳 chat（工作台空白）
4. ❌ 多开客服页（CSA 互踢）
5. ❌ 用裸 orderId 搜买家（须 packageId）
6. ❌ 改 `im-send.js` 协议逻辑（除非 P0 完成后仍 fail）

---

## 7. 验证清单

```powershell
cd D:\eva\xhs-shipping-assistant
npx vite build
# 重启 start-assistant.bat

# DevTools（工作台 BrowserView）
# window.csBridge.getRemote === true
# typeof window.XhsRim === 'object'
# window.ImLoginInfo?.csProviderId 非空

curl -s http://127.0.0.1:19527/api/shipping/im-health
# ok=true, rim=true, imLogin=true

curl -s -X POST http://127.0.0.1:19527/api/shipping/auto-ship \
  -H "Content-Type: application/json" \
  -d "{\"orderId\":\"P802233881788021201\",\"productId\":\"6a7d264a95cfc00001f40426\"}"
# ship_log status=success
```

---

## 8. 关键文件

```
electron/cs-bridge-shim.ts      # P0-1/3/4 getRemote:true + flags + getCurrentWindow
electron/client-db-shim.ts      # P0-2 IPC NeDB
electron/eva-nedb.ts            # P0-2 主进程 DB
electron/main.ts                # getXhsWebPreferences 保持不变；Eva IPC
electron/xhs-preload.ts         # installCsBridge() 入口，保持 node 集成
resources/inject-scripts/im-send.js  # 协议已对，packageId 已支持
docs/captures/manual-chat-*.ndjson   # WS 抓包证据
```

---

## 9. Cursor 实施顺序

1. 改 `getRemote: true` + 跑 DevTools 验证 `=== true`
2. clientDb 改 IPC NeDB
3. supportTab 等 flags 改 true
4. getCurrentWindow invoke 补全
5. im-health + 真发 `P802233881788021201`
6. 仍 fail → 读 `[csBridge-miss]` 日志 + 抓包 WS 备选

---

## 10. 文档版本说明

| 版本 | 结论 |
|------|------|
| v1（旧） | nodeIntegration:false 是关键 → **错误** |
| **v2（本文件）** | csBridge 结构对齐官方，尤其 `getRemote: true` → **正确** |
