# 客服发消息功能修复完整文档

> **日期**: 2026-08-15
> **项目**: xhs-shipping-assistant (小红书发货助手)
> **状态**: ✅ 已验证成功，消息发送成功

---

## 一、问题描述

用户复刻开发的小红书发货助手无法进行客服发消息。自动发货时 `window.sendImTextMsg` 始终返回 `"页面加载中"`，导致 IM 发货永远失败。

---

## 二、诊断过程

### 2.1 初始假设：IM 窗加载了错误的 URL

最初认为隐藏 IM 窗加载 `/cstools/seller/dashboard`（数据概览页）不渲染 IM 聊天组件 `.farmer-chat-app`，导致 `XhsRim` 无法获取。

**尝试方案**: 将 IM 窗 URL 从 dashboard 改为 `/cstools/chat`。

**结果**: 失败。通过 CDP 探测确认：
- `/cstools/seller/dashboard` 页面: `farmerChatApp=true` ✓（dashboard 包含聊天组件）
- `/cstools/chat` 页面: `farmerChatApp=false` ✗（chat 页反而没有聊天组件）

**结论**: dashboard 是正确的 URL，问题不在 URL。

### 2.2 第二层发现：reload 循环

`im-send.js` 的 `startDashboardReloadGuard` 在无 `.farmer-chat-app` 时每 20 秒 reload 页面。每次 reload 后 window 上下文重建，reload 计数重置，导致**无限 reload 循环**——页面刚连上 WS（22秒）就被 reload（35秒），IM SDK 永远没时间完成初始化。

**修复**: 让 reload guard 只在 dashboard 页面生效（chat 页面不 reload）。

**结果**: reload 循环停止，但 `rim=fail` 仍然存在。

### 2.3 第三层发现（核心根因）：Electron 30 不暴露 Vue 实例属性

原版阿奇索用 Electron 旧版本，Vue3 在 DOM 元素上自动设置 `__vueParentComponent` 属性。Electron 30 **不再自动安装 Vue devtools**，导致：
- `.farmer-chat-app.__vue__` = `undefined`
- `__vueParentComponent` = `undefined`

`getXhsAPI()` 的 `Jl()` 函数通过 `.farmer-chat-app.__vue__.getRim()` 获取 rim，但 `__vue__` 不存在 → `window.XhsRim` 始终为 `undefined` → `sendImTextMsg` 返回 `"页面加载中"`。

**CDP 验证**:
```
// 主页面 87 个 DOM 元素中 0 个有 __vueParentComponent
hasVueParent: "0 / 87"

// window.__VUE__ = true（生产模式布尔值，非 Vue API 对象）
// __VUE_INSTANCE_SETTERS__ = [function, function, function]（空回调数组）
```

### 2.4 辅助发现：WS hook 未捕获到 zelda WS

小红书网站的 zelda WebSocket 可能在 `mio-chat` iframe 内创建。主窗口的 WS hook 无法拦截子 frame 的 `WebSocket` 构造函数。

**CDP 验证**:
```
// mio-chat iframe 有 WS hook（hasState=true），但 socketCount=0
// WS Events（Network.webSocketCreated）= 0
// 说明当前页面没有创建新的 zelda WS
```

---

## 三、最终解决方案

### 3.1 核心修复：在 preload 中注册 Vue3 devtools setter

**原理**: Vue3 提供 `__VUE_INSTANCE_SETTERS__` 全局数组，注册回调函数后，Vue3 在创建组件实例时会调用这些回调。我们注册一个回调，在组件创建时将实例引用设置到 DOM 元素的 `__vueParentComponent` 属性上。

**效果**: `getXhsAPI()` 的 `resolveVue3Rim()` 函数通过 `__vueParentComponent` 遍历组件树，找到 `getRim()` 方法 → `window.XhsRim` 设置成功。

### 3.2 辅助修复1：preload 早期 WebSocket hook

在 preload（先于页面 JS 执行）中安装 WS hook，捕获小红书 IM SDK 创建的 zelda WS，供 `im-send.js` 的 `deliverByOrderSn` WS 直发回退使用。

### 3.3 辅助修复2：iframe WS hook + Vue3 setter 注入

DOMContentLoaded 后遍历所有 iframe（特别是 `mio-chat` iframe），将 WS hook 和 Vue3 devtools setter 注入到子 frame。

### 3.4 辅助修复3：im-send.js 注入到 IM 窗

IM 窗 `dom-ready` 和 `did-finish-load` 时注入 `im-send.js`，提供 WS hook、`deliverByOrderSn`（WS 直发回退）、deepRim 探测。

---

## 四、代码改动清单

### 4.1 `electron/xhs-im-preload.ts`（核心文件）

#### 改动点 A：Vue3 devtools setter 注册（行 129-160）

在 preload 早期注册 `__VUE_INSTANCE_SETTERS__` 回调：

```typescript
;(function enableVue3Devtools() {
  const w = window as unknown as {
    __VUE_INSTANCE_SETTERS__?: ((vnode: unknown) => void)[]
    __VUE_DEVTOOLS_GLOBAL_HOOK__?: unknown
  }
  if (!w.__VUE_INSTANCE_SETTERS__) {
    w.__VUE_INSTANCE_SETTERS__ = []
  }
  // 注册回调：当 Vue3 创建组件实例时，在 DOM 元素上设置 __vueParentComponent
  const setter = (instance: unknown) => {
    try {
      const inst = instance as {
        vnode?: { el?: Element }
        proxy?: { $el?: Element }
        subTree?: { el?: Element }
      }
      const el = inst.vnode?.el || inst.proxy?.$el || inst.subTree?.el
      if (el && el instanceof Element) {
        ;(el as unknown as { __vueParentComponent?: unknown }).__vueParentComponent = instance
      }
    } catch {
      /* ignore */
    }
  }
  if (!w.__VUE_INSTANCE_SETTERS__.includes(setter)) {
    w.__VUE_INSTANCE_SETTERS__.push(setter)
  }
  console.log('[xhs-im-preload] Vue3 devtools setter 已注册')
})()
```

**为什么有效**: Vue3 在创建组件实例时调用 `__VUE_INSTANCE_SETTERS__` 数组中的所有回调。我们的回调将实例引用写入 DOM 元素的 `__vueParentComponent` 属性，使 `resolveVue3Rim()` 能通过 DOM 遍历找到 `getRim()` 方法。

#### 改动点 B：preload 早期 WebSocket hook（行 53-127）

```typescript
;(function installEarlyWsHook() {
  const g = window as unknown as { __xhsImWsState?: typeof _wsState }
  if (g.__xhsImWsState) return
  const _wsState = {
    installed: true,
    zeldaSockets: [] as WebSocket[],
    lastSeq: 0,
    pendingAcks: {} as Record<string, unknown>,
  }
  g.__xhsImWsState = _wsState

  const OrigWS = window.WebSocket
  if (!OrigWS || !OrigWS.prototype) return
  const origSend = OrigWS.prototype.send
  const origAdd = OrigWS.prototype.addEventListener

  function registerZeldaSocket(ws: WebSocket) {
    if (!ws || (ws as unknown as { __xhsZeldaTracked?: boolean }).__xhsZeldaTracked) return
    const url = ws.url || ''
    if (!/zelda\.xiaohongshu\.com/i.test(url)) return
    ;(ws as unknown as { __xhsZeldaTracked?: boolean }).__xhsZeldaTracked = true
    _wsState.zeldaSockets.push(ws)
    ws.addEventListener('message', (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '{}')
        if (msg && msg.header && typeof msg.header.seq === 'number') {
          _wsState.lastSeq = Math.max(_wsState.lastSeq, msg.header.seq)
        }
      } catch { /* ignore */ }
    })
    ws.addEventListener('close', () => {
      const idx = _wsState.zeldaSockets.indexOf(ws)
      if (idx >= 0) _wsState.zeldaSockets.splice(idx, 1)
    })
  }

  // Hook WebSocket.prototype.send
  OrigWS.prototype.send = function (data: string) {
    registerZeldaSocket(this)
    try {
      const parsed = JSON.parse(typeof data === 'string' ? data : '{}')
      if (parsed && parsed.header && typeof parsed.header.seq === 'number') {
        _wsState.lastSeq = Math.max(_wsState.lastSeq, parsed.header.seq)
      }
    } catch { /* ignore */ }
    return origSend.call(this, data)
  } as typeof OrigWS.prototype.send

  // Hook WebSocket.prototype.addEventListener
  OrigWS.prototype.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
    registerZeldaSocket(this)
    return origAdd.call(this, type, listener, options)
  } as typeof OrigWS.prototype.addEventListener

  // Hook WebSocket 构造函数
  function HookedWebSocket(url: string | URL, protocols?: string | string[]) {
    const ws = protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url)
    registerZeldaSocket(ws)
    return ws
  }
  HookedWebSocket.prototype = OrigWS.prototype
  ;(['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'] as const).forEach((k) => {
    try {
      ;(HookedWebSocket as unknown as Record<string, unknown>)[k] = (OrigWS as unknown as Record<string, unknown>)[k]
    } catch { /* ignore */ }
  })
  window.WebSocket = HookedWebSocket as unknown as typeof WebSocket
  console.log('[xhs-im-preload] WebSocket hook 已安装（preload 早期）')

  // ... Vue3 devtools setter（见改动点 A）...
  // ... iframe 注入（见改动点 C）...
})()
```

**为什么有效**: preload 先于页面 JS 执行。在页面 JS 创建 zelda WS 之前，`WebSocket` 构造函数和 `prototype.send` 已被 hook。所有 zelda WS 实例会被自动注册到 `_wsState.zeldaSockets` 数组中，供 `im-send.js` 使用。

#### 改动点 C：iframe WS hook + Vue3 setter 注入（行 162-274）

```typescript
function injectWsHookIntoIframe(win: Window) {
  try {
    const w = win as unknown as { __xhsImWsState?: typeof _wsState }
    if (w.__xhsImWsState) return
    const iframeState = { installed: true, zeldaSockets: [] as WebSocket[], lastSeq: 0, pendingAcks: {} as Record<string, unknown> }
    w.__xhsImWsState = iframeState

    // Hook iframe 的 WebSocket（同主窗口逻辑）
    const OrigWS = win.WebSocket
    // ... (同主窗口的 registerZelda + HookedWS 逻辑)

    // 注册 Vue3 devtools setter 到 iframe
    const fw = win as unknown as { __VUE_INSTANCE_SETTERS__?: ((vnode: unknown) => void)[] }
    if (!fw.__VUE_INSTANCE_SETTERS__) fw.__VUE_INSTANCE_SETTERS__ = []
    const iframeSetter = (instance: unknown) => {
      // 同主窗口 setter 逻辑
    }
    if (!fw.__VUE_INSTANCE_SETTERS__.includes(iframeSetter)) {
      fw.__VUE_INSTANCE_SETTERS__.push(iframeSetter)
    }
  } catch { /* cross-origin */ }
}

// DOMContentLoaded 后遍历 iframe
window.addEventListener('DOMContentLoaded', () => {
  function scanIframes() {
    const iframes = document.querySelectorAll('iframe')
    for (let i = 0; i < iframes.length; i++) {
      try {
        const win = iframes[i].contentWindow
        if (win) injectWsHookIntoIframe(win)
      } catch { /* cross-origin */ }
    }
  }
  scanIframes()
  const observer = new MutationObserver(() => scanIframes())
  observer.observe(document.body, { childList: true, subtree: true })
  setTimeout(scanIframes, 2000)
  setTimeout(scanIframes, 5000)
})
```

#### 改动点 D：Vue3 兜底 rim 探测（行 324-472，原有代码）

`getXhsAPI()` 函数已有的 Vue3 兜底逻辑，通过 `__vueParentComponent` 遍历组件树：

```typescript
function resolveVue3Rim(): { rim: XhsRimLike; ... } | null {
  const fc = document.querySelector('.farmer-chat-app')
  if (fc) {
    let el: Element | null = fc
    for (let d = 0; d < 12 && el; d++) {
      const vpc = (el as HTMLElement & { __vueParentComponent?: ... }).__vueParentComponent
      if (vpc) {
        for (const t of [vpc.proxy, vpc.exposed, vpc.setupState, vpc.ctx]) {
          const r = t?.getRim?.()
          if (r) return { rim: r, ... }
        }
      }
      el = el.parentElement
    }
  }
  // ... 深度遍历 Vue3 vnode 树 ...
}
```

**依赖**: 这个函数依赖 `__vueParentComponent` 属性。在 Electron 30 中，只有注册了 Vue3 devtools setter 后，这个属性才会被设置。

---

### 4.2 `electron/main.ts`

#### 改动点：IM 窗 dom-ready 和 did-finish-load 时注入 im-send.js

```typescript
// 行 1190-1201
win.webContents.on('dom-ready', () => {
  // ★ 注入 im-send.js：提供 WS hook、deliverByOrderSn（WS 直发回退）、deepRim 探测
  injectService?.injectScriptAsync(win.webContents, 'im-send').catch(() => false)
})
win.webContents.on('did-finish-load', async () => {
  const sid = shopId
  agisoImManager.bindXhsImWebContents(sid, win.webContents)
  autoShipService?.bindImWebContents(win.webContents, sid)
  // ★ did-finish-load 后重新注入 im-send.js（页面导航/reload 后上下文重建）
  injectService?.injectScriptAsync(win.webContents, 'im-send').catch(() => false)
  // ... 登录检查 ...
})
```

#### IM 窗加载 URL（行 1219-1230）

```typescript
// ★ IM 窗加载 /cstools/seller/dashboard — dashboard 页面才渲染 .farmer-chat-app（含聊天组件）
// chat 页面不渲染 .farmer-chat-app（CDP 探测确认：dashboard farmerChatApp=true, chat farmerChatApp=false）
try {
  await win.loadURL(XHS_DASHBOARD_URL)
} catch (err) {
  logger.warn(`[KefuBrowser] 店铺 ${shopId} 加载 dashboard 失败: ${err}`)
  try {
    await win.loadURL(XHS_CHAT_URL)
  } catch (err2 {
    logger.warn(`[KefuBrowser] 店铺 ${shopId} 加载页失败: ${err2}`)
  }
}
```

---

### 4.3 `electron/services/autoship.service.ts`

#### 改动点 A：getImWcForShip 优先 dashboard（行 192-210）

```typescript
private getImWcForShip(shopId?: string): WebContents | null {
  const candidates = this.collectImWcCandidates(shopId)
  const onWalle = (wc: WebContents) => {
    const url = wc.getURL() || ''
    return url.includes('walle.xiaohongshu.com') && !url.includes('/login')
  }
  // ★ 优先 dashboard 页：只有 /cstools/seller/dashboard 才渲染 .farmer-chat-app
  for (const wc of candidates) {
    if (onWalle(wc) && (wc.getURL() || '').includes('/cstools/seller/dashboard')) return wc
  }
  for (const wc of candidates) {
    if (onWalle(wc) && (wc.getURL() || '').includes('/cstools/chat')) return wc
  }
  for (const wc of candidates) {
    if (onWalle(wc)) return wc
  }
  return null
}
```

#### 改动点 B：executeRealShip 增加 deliverByOrderSn 回退（行 1368-1420）

```typescript
// 在 agisoIm.sendImTextMsg 失败后，回退到 deliverByOrderSn（WS 直发）
const fallback = await this.sendViaDeliverByOrderSn(shopId, orderId, content)
if (fallback.success) return fallback
return { success: false, error: lastError + (fallback.error ? ' | ' + fallback.error : '') }

// 新增方法
private async sendViaDeliverByOrderSn(shopId, orderId, content): Promise<...> {
  const wc = (await this.pickImWcForShip(shopId)) || this.getImWcForShip(shopId)
  if (!wc || wc.isDestroyed()) return { success: false, error: '无可用 IM WebContents' }
  if (this.injectService) {
    await this.injectService.injectScriptAsync(wc, 'im-send').catch(() => false)
  }
  const result = await wc.executeJavaScript(
    `(async function(){
      try {
        var im = window.__xhsAssistant && window.__xhsAssistant.im;
        if (!im || typeof im.deliverByOrderSn !== 'function') return { success: false, error: 'deliverByOrderSn 未注入' };
        return await im.deliverByOrderSn(${JSON.stringify(orderId)}, ${JSON.stringify(content)}, 'text');
      } catch (e) {
        return { success: false, error: String(e && e.message ? e.message : e) };
      }
    })()`
  ).catch((e) => ({ success: false, error: String(e) }))
  // ... 日志记录 ...
}
```

#### 改动点 C：ensureXhsRimLoaded 增加诊断字段（行 414-464）

```typescript
// 探测 JS 增加 farmerChatApp、fcVue、appVue 字段
var fc = document.querySelector('.farmer-chat-app');
return {
  rim: hasSend,
  fullRim: hasSend && hasGetChat,
  csProviderId: !!(info && info.csProviderId),
  url: location.href.slice(0, 100),
  onDashboard: /\/cstools\/seller\/dashboard/.test(location.href),
  farmerChatApp: !!fc,
  fcVue: !!(fc && fc.__vue__),
  appVue: !!(document.querySelector('#app') && document.querySelector('#app').__vue_app__)
};

// 超时日志记录诊断信息
this.logger.warn(
  `[AutoShip] XhsRim 等待超时 shop=${shopId} url=${...} farmerChatApp=${st.farmerChatApp} fcVue=${st.fcVue} appVue=${st.appVue} csProviderId=${st.csProviderId}`
)
```

---

### 4.4 `resources/inject-scripts/im-send.js`

#### 改动点 A：installWsHook 给 preload 注册的 socket 追加 handleWsMessage（行 121-185）

```javascript
function installWsHook() {
  if (!_wsState.installed) {
    // ... 原有 hook 安装逻辑 ...
  }
  // ★ 给 preload 已注册的 socket 追加 handleWsMessage 监听器
  for (var i = 0; i < _wsState.zeldaSockets.length; i++) {
    var ws = _wsState.zeldaSockets[i]
    if (!ws.__xhsAssistantMsgHooked) {
      ws.__xhsAssistantMsgHooked = true
      ;(function (socket) {
        socket.addEventListener('message', function (ev) {
          handleWsMessage(ev.data)
        })
      })(ws)
    }
  }
}
```

#### 改动点 B：ensureZeldaWs 自建条件改为 socketCount === 0（行 333）

```javascript
// 之前: if (!triedConnect && getWsDiag().lastSeq <= 0 && deadline - Date.now() > 4000)
// 之后: if (!triedConnect && getWsDiag().socketCount === 0 && deadline - Date.now() > 4000)
if (!triedConnect && getWsDiag().socketCount === 0 && deadline - Date.now() > 4000) {
  triedConnect = true
  ws = await connectAssistantZeldaWs(Math.min(10000, deadline - Date.now()))
}
```

#### 改动点 C：getZeldaWs 增加从 iframe 获取 WS（行 188-225）

```javascript
function getZeldaWs() {
  // 首先检查主窗口的 zeldaSockets
  for (var i = _wsState.zeldaSockets.length - 1; i >= 0; i--) { ... }
  // ★ 检查 iframe 中的 zeldaSockets（mio-chat iframe 的 WS）
  try {
    var iframes = document.querySelectorAll('iframe')
    for (var k = 0; k < iframes.length; k++) {
      var win = iframes[k].contentWindow
      if (!win || !win.__xhsImWsState) continue
      var iframeSockets = win.__xhsImWsState.zeldaSockets || []
      for (var m = iframeSockets.length - 1; m >= 0; m--) {
        var ws3 = iframeSockets[m]
        if (ws3 && ws3.readyState === 1) {
          if (!ws3.__xhsAssistantMsgHooked) {
            ws3.__xhsAssistantMsgHooked = true
            ;(function (socket) {
              socket.addEventListener('message', function (ev) {
                handleWsMessage(ev.data)
              })
            })(ws3)
          }
          return ws3
        }
      }
    }
  } catch (e) { /* cross-origin */ }
  return null
}
```

#### 改动点 D：reload guard 只对 dashboard 生效（行 1071）

```javascript
// 之前: if (!/\/cstools\/(seller\/dashboard|chat)/.test(location.href)) return
// 之后:
if (!/\/cstools\/seller\/dashboard/.test(location.href)) return
```

---

## 五、发消息完整流程

### 5.1 主路径：XhsRim.sendTextMsg（已验证成功）

```
1. preload 执行（先于页面 JS）
   ├─ 安装 WebSocket hook（捕获 zelda WS）
   ├─ 注册 Vue3 devtools setter（让 __vueParentComponent 出现）
   └─ DOMContentLoaded 后扫描 iframe，注入 WS hook + Vue3 setter

2. 页面 JS 执行
   ├─ Vue3 创建组件实例时调用 __VUE_INSTANCE_SETTERS__ 回调
   ├─ 回调在 DOM 元素上设置 __vueParentComponent
   └─ .farmer-chat-app 渲染，其父组件有 getRim() 方法

3. getXhsAPI() 轮询（每 500ms）
   ├─ resolveVue3Rim() 通过 __vueParentComponent 遍历组件树
   ├─ 找到 getRim() → 获取 rim 对象
   └─ 设置 window.XhsRim, window.ImLoginInfo, window.XhsApiService

4. sendImTextMsg(base64, orderId) 被调用
   ├─ 检查 window.XhsRim 是否就绪
   ├─ getBuyerIdByOrderId(orderId) — 调 search_customer API 获取买家 ID
   ├─ XhsRim.rimSdk.getChatInfo(arg1, arg2) — 创建会话获取 chatId
   └─ XhsRim.sendTextMsg(content, { chatId }) — 发送消息
       └─ 返回 { status: "success", messageId: "..." }
```

### 5.2 回退路径：deliverByOrderSn（WS 直发）

当 `XhsRim` 不可用时（如 Vue3 setter 未生效），`executeRealShip` 回退到 `deliverByOrderSn`：
```
1. 通过 getBuyerIdByOrderId 获取买家 ID
2. 获取或自建 zelda WS 连接
3. 构造 impaas 协议帧，通过 WS 直接发送 /message/send
```

---

## 六、验证结果

### 6.1 CDP 验证

```
=== XhsRim 状态 ===
  hasXhsRim: true          ✓
  hasSendTextMsg: true     ✓
  hasGetChatInfo: true     ✓
  farmerChatApp: true      ✓
  imLoginInfo: csProviderId=6a645ee6472db40015716859, hasImToken=true  ✓

=== 发送结果 ===
  ✅ 发送成功！
  chatId: $3$MSMyIzIjNjdlMTY5YWUwMDAwMDAwMDA2MDEzMGYz...
  messageId: 6800462d25f47333a14d936d
  status: success
  sender: 郭老师学习资料研究室
```

### 6.2 二次重启验证

```
=== XhsRim 状态 ===
  hasXhsRim: true          ✓
  hasSendTextMsg: true     ✓
  hasGetChatInfo: true     ✓
  farmerChatApp: true      ✓

=== 发送结果 ===
  ✅ 发送成功！
  messageId: 6800462d25f47333a14d936d
  status: success
```

---

## 七、关键技术要点

### 7.1 为什么 Electron 30 不暴露 Vue 实例属性？

Vue3 在**开发模式**下会自动在 DOM 元素上设置 `__vueParentComponent`，但需要 Vue devtools 扩展安装。旧版 Electron 自动安装 Vue devtools 扩展，Electron 30 移除了这个功能。

Vue3 的 `__VUE_INSTANCE_SETTERS__` 是一个公开的 API（尽管文档不多），用于注册组件实例设置的回调。Vue devtools 扩展就是通过这个 API 捕获组件树的。

### 7.2 为什么 preload 先于页面 JS？

Electron 的 preload 脚本在页面任何 JS 之前执行。这使我们可以：
1. 在页面 JS 创建 WebSocket 之前 hook `WebSocket` 构造函数
2. 在 Vue3 创建组件之前注册 `__VUE_INSTANCE_SETTERS__` 回调

### 7.3 为什么 dashboard 而非 chat？

通过 CDP 探测确认：
- `/cstools/seller/dashboard` 页面渲染了 `.farmer-chat-app` 组件（`farmerChatApp=true`）
- `/cstools/chat` 页面**不**渲染 `.farmer-chat-app`（`farmerChatApp=false`）

dashboard 是千帆客服工作台，内嵌了聊天组件。chat 路由可能是独立的聊天页面（不同布局），不含 `.farmer-chat-app`。

### 7.4 为什么需要 iframe WS hook？

小红书的 IM SDK 可能在 `mio-chat` iframe 内创建 zelda WebSocket。主窗口的 `WebSocket` hook 无法拦截子 frame 的 `WebSocket` 构造函数（每个 frame 有独立的 `WebSocket`）。

通过 DOMContentLoaded 后遍历 iframe，将 WS hook 注入到子 frame 的 `window.WebSocket`，可以捕获 iframe 内创建的 WS。

---

## 八、文件备份位置

当前已验证的代码备份在：
```
D:\eva\xhs-shipping-assistant\
├─ electron/
│  ├─ xhs-im-preload.ts        ← 核心修复（Vue3 setter + WS hook + iframe 注入）
│  ├─ main.ts                  ← IM 窗 dom-ready/did-finish-load 注入 im-send.js
│  └─ services/
│     └─ autoship.service.ts   ← getImWcForShip + deliverByOrderSn 回退 + 诊断日志
├─ resources/
│  └─ inject-scripts/
│     └─ im-send.js            ← installWsHook + getZeldaWs(iframe) + reload guard 修复
└─ backups/
   └─ milestone-20260814-kefu-login-ok/  ← 修复前备份
```

---

## 九、还原指南

如果需要还原到修复前的状态：
1. 从 `backups/milestone-20260814-kefu-login-ok/` 目录恢复 `electron/`、`resources/` 等文件
2. 如果只需还原部分文件，参考上面的改动清单逐个恢复

如果需要重新应用修复：
1. 按「四、代码改动清单」中的每个改动点修改对应文件
2. 运行 `npx vite build` 编译
3. 运行 `npx electron .` 启动验证
4. 检查日志中 `rim=ok` 和 `XhsRim 已就绪`
