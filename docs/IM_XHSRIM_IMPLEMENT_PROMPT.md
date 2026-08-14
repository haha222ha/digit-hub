# IM 客服发消息 · 实施提示词（交给修改 AI）

> **项目根目录**：`D:\eva\xhs-shipping-assistant`  
> **对照参考**：`tools\_agiso_strings\_imsend_core_extract.js`（阿奇锁 IMSend）  
> **调研报告**：`C:\Users\Administrator\CodeBuddy\20260811210750\IM_XHSRIM_SOLUTION.md`  
> **测试店铺**：`shop_mssdfcrc_q8ty`  
> **测试订单**：`80223388178802120`（packageId `P802233881788021201`）  
> **本地 API**：`http://127.0.0.1:19527`  
> **启动方式**：`start-assistant.bat`（禁止用 `npx electron tools/_test_im_ship_e2e.js` 测 IM）

---

## 0. 你的任务

让自研 Electron 发货助手能在 `/cstools/chat` 页完成 **IM 虚拟发货发码**（对标阿奇锁 `XhsRim.sendTextMsg`）。

**验收标准（全部必须满足）**：

```powershell
# 1. IM 健康
curl -s http://127.0.0.1:19527/api/shipping/im-health
# 期望：health.ok=true, health.rim=true, health.imLogin=true, health.csProviderId 非空

# 2. csBridge 诊断
curl -s http://127.0.0.1:19527/api/shipping/csbridge-diag
# 期望：report.getRimProbe.farmerChatApp=true
#       report.xhsRim.type="object"
#       report.imLoginInfo.csProviderId 非空

# 3. 真发（对测试单发一条文本，内容含 TEST-IM- 前缀便于识别）
# 通过 autoship 触发或 tools/_test_im_ship_e2e.js 在已就绪的 chat 页执行 deliverByOrderSn
# 期望：ship_log status=success，买家会话收到消息
```

---

## 1. 当前状态（2026-08-14 实测，勿重复已做工作）

### ✅ 已完成（不要删改逻辑，除非修 bug）

| 模块 | 文件 | 状态 |
|------|------|------|
| IM 发码桥 | `resources/inject-scripts/im-send.js` | ✅ search_customer / getChatInfo / sendTextMsg 链路完整；100ms bootstrap；Vue2/Vue3 树遍历 `tryResolveXhsRim()` |
| csBridge 垫片（部分） | `electron/cs-bridge-shim.ts` | ✅ 已有 getContentBounds、app.getPath、session、page error 捕获 |
| 诊断脚本 | `resources/inject-scripts/csbridge-diag.js` | ✅ `__xhsAssistant.diag.runCsBridgeDiag()` |
| 诊断 API | `GET /api/shipping/csbridge-diag` | ✅ |
| IM 绑定 | `electron/main.ts` → `bindShopImForShip()` | ✅ 隐藏窗 + 主 BrowserView 均 load `/cstools/chat` |
| 健康检查 | `autoship.service.ts` → `ensureXhsRimLoaded()` | ✅ rim 未就绪自动切 chat 等 45s |
| 订单 sync | digit-hub order-claim | ✅ packageId P 前缀已修（无关 IM，勿动） |

### ❌ 仍阻塞（你必须解决）

**最新诊断快照**（`GET /api/shipping/csbridge-diag`）：

```json
{
  "csBridge": { "present": true },
  "accessToken": true,
  "xhsRim": { "type": "undefined" },
  "imLoginInfo": { "csProviderId": "" },
  "imStore": { "present": true, "xUserInfo": { "csProviderId": "", "keys": [] } },
  "getRimProbe": { "farmerChatApp": false, "tryResolveXhsRim": false },
  "pageErrors": []
}
```

**解读**：不是「发消息 API 没写」，而是 **chat 页 IM 组件根本没渲染**：

| 阻塞项 | 现象 | 根因方向 |
|--------|------|----------|
| **A. farmer-chat-app 未挂载** | DOM 无 `.farmer-chat-app` | 离屏隐藏 / CSA 登录未完成 / csBridge 仍缺 API 导致 SPA 静默不渲染 |
| **B. xUserInfo 空** | `imStore.xUserInfo.csProviderId=""` | `get_csa_info` 业务失败或响应未写入 store |
| **C. XhsRim 未挂载** | `window.XhsRim` undefined | 依赖 A+B；IM SDK 未 init |
| **D. WebSocket 1006** | zelda 反复断开 | 可能与 `parkXhsBrowserView` 的 `x:-4096` 隐藏有关 |

**发消息完整依赖链**（缺任一环节都 fail）：

```
客服登录成功
  → get_csa_info 业务 success=true
  → imStore.xUserInfo.csProviderId 有值
  → farmer-chat-app 组件挂载
  → IM SDK init → window.XhsRim
  → search_customer(seller_id=csProviderId)
  → XhsRim.rimSdk.getChatInfo → chatId
  → XhsRim.sendTextMsg(content, { chatId })
```

**无 REST 替代**：`/api/edith/mcs/*` 是千帆私有接口，开放平台无「客服发消息」能力，必须走 XhsRim。

---

## 2. 必须实施的改动（按优先级）

### P0-1：让 chat 页真正渲染 IM 组件

**文件**：`electron/main.ts`

**问题**：`parkXhsBrowserView()` 使用 `PARKED_BROWSER_BOUNDS = { x: -4096, y: -4096 }`，页面处于隐藏态，chat 模块可能 lazy-load 不触发。

**要求**：
1. 新增 `parkXhsBrowserViewOffscreen()` 替代方案：**不用 hidden、不用 2×2**，改为：
   - `setBounds({ x: -2000, y: -2000, width: 1280, height: 800 })`（屏幕外但非 hidden）
   - 或 IM 专用窗 `setOpacity(0)` + `show: true`（透明但持续渲染）
2. `ensureShopImWindow` 创建的隐藏客服窗：**默认 `show: true` + `opacity: 0` + 屏幕外坐标**，`skipTaskbar: true`
3. `backgroundThrottling: false` 在 BrowserWindow 和 webPreferences 双层保持
4. 新增环境变量或 config：`IM_WINDOW_VISIBLE=1` 时客服窗可见（便于 DevTools 调试）

**验证**：诊断 `farmerChatApp: true`

---

### P0-2：修复 get_csa_info → xUserInfo 写入

**文件**：
- `electron/main.ts`（`xhs-csa-info` handler，约 L1454）
- `electron/services/auto-login.service.ts`
- `resources/inject-scripts/api-interceptor.js`

**问题**：
- 日志常见 `get_csa_info http=401` 或 HTTP 200 但 `success:false`
- `xUserInfo` 始终是空对象 `{}`
- 当前 handler 在 `success:false` 时只 soft-ok，不触发重新登录也不主动补数据

**要求**：
1. 在 `api-interceptor.js` 拦截 **真实 SPA 发出的** `get_csa_info` 响应，当 `success:true` 时：
   - 通过 `postMessage` / `ipc` 通知主进程
   - **同时**在页面内尝试从 `data` 提取 `csProviderId` 写入 `imStore`（若 store action 可调用则调用，否则 patch `xUserInfo`）
2. 当 `success:false` 且无 SSO cookie 时：**仅对 IM 专用 WebContents** 跳转客服登录（不要踢主 BrowserView 已渲染的 dashboard）
3. `checkImHealth` 中 `get_csa_info` 判定：**HTTP 200 且 body.success===true 且 data 含 csProviderId** 才算 csa ok（禁止假成功）
4. 禁止「裸 fetch get_csa」无 `_webmsxyw` 签名导致 401 后误判为已登录

**验证**：诊断 `imLoginInfo.csProviderId` 非空，`imStore.xUserInfo.keys` 含 `csProviderId` 等字段

---

### P0-3：补全 csBridge shim（直到 XhsRim 挂载）

**文件**：`electron/cs-bridge-shim.ts`、`electron/xhs-preload.ts`

**问题**：csBridge 已 present 但无 pageErrors，说明 IM SDK 可能调用了未 shim 的 API 并静默 return。

**要求**：
1. 在 `installCsBridge()` 对所有 stub 方法加 **Proxy 包装**：被调用时 `console.warn('[csBridge-miss]', methodName, args)` 并返回安全默认值（便于 DevTools 抓缺什么）
2. 对照官方千帆 / 阿奇锁，重点补（当前可能仍缺）：
   - `remote.getCurrentWindow().webContents.getURL()` / `getTitle()`
   - `remote.getCurrentWindow().isVisible()` / `isFocused()`
   - `ipcRenderer.invoke` 常见 channel 白名单返回空数组/null（已有 tab:getAllLogin，需扩展 IM 相关 channel）
   - `csBridge.clientDb` / `registDb` 若 IM SDK 读库
   - `process.type === 'browser'` 或 `'renderer'`
3. **禁止**改 `contextIsolation:false` + `nodeIntegration:true`（页面依赖 Electron 壳分支）
4. shim 补完后 rebuild：`npx vite build`

**验证**：`typeof window.XhsRim === 'object'`，`pageErrors` 无 csBridge 相关报错

---

### P0-4：主动触发 getRim（兜底，不能替代 P0-1~3）

**文件**：`resources/inject-scripts/im-send.js`

**要求**（在已有 Vue 树遍历基础上增强）：
1. 若 15s 内 `farmerChatApp` 仍 false，尝试 `location.reload()` **仅 IM 专用 WebContents**（加 cooldown 防死循环）
2. 扫描 `window` 上所有含 `rimSdk` / `sendTextMsg` 的全局对象
3. `ensureXhsRimLoaded` 等待条件改为：**同时**等 `csProviderId` + `XhsRim` + `farmerChatApp`

---

### P1：端到端发码联调

**文件**：`electron/services/autoship.service.ts`

**要求**：
1. `shipByIm` 失败时日志写入具体阶段：`csProviderId` / `search_customer` / `getChatInfo` / `sendTextMsg`
2. 对订单 `80223388178802120` 真发一条测试消息
3. `ship_log` 表 status=success

---

## 3. 禁止事项

1. **不要**实现「纯 REST 绕过 XhsRim 发消息」（不可行）
2. **不要**多开客服页（会互踢 CSA 登录，见 `electron/utils/singleton.ts`）
3. **不要**在 `get_csa` 失败时 force reload 主 dashboard（会冲掉会话列表，见里程碑 doc）
4. **不要**提交 `.env`、Cookie、token 到 git
5. **不要**改 digit-hub 仓库（IM 工作在 xhs-shipping-assistant）
6. **最小 diff**：只改 IM 相关文件，不顺手重构

---

## 4. 关键文件清单

```
electron/cs-bridge-shim.ts      # csBridge 垫片（P0-3）
electron/xhs-preload.ts         # 调用 installCsBridge
electron/main.ts                # parkXhsBrowserView / bindShopImForShip / xhs-csa-info
electron/services/autoship.service.ts   # ensureXhsRimLoaded / shipByIm
electron/services/auto-login.service.ts # get_csa 验证 / Cookie
electron/services/inject.service.ts     # 脚本注入
resources/inject-scripts/im-send.js     # IM 桥
resources/inject-scripts/api-interceptor.js  # get_csa 拦截
resources/inject-scripts/csbridge-diag.js    # 诊断（只读参考）
tools/_agiso_strings/_imsend_core_extract.js # 阿奇锁对照
docs/VIRTUAL_SHIP.md            # 架构说明
```

---

## 5. 自测步骤（修改 AI 必须跑完）

```powershell
cd D:\eva\xhs-shipping-assistant
npx vite build

# 重启助手
# 结束旧 electron 进程后运行 start-assistant.bat

# 等待 15s 登录稳定
curl -s -X POST http://127.0.0.1:19527/api/shipping/prepare-im
Start-Sleep -Seconds 10

curl -s http://127.0.0.1:19527/api/shipping/csbridge-diag
curl -s http://127.0.0.1:19527/api/shipping/im-health

# 日志
Get-Content "$env:APPDATA\xhs-shipping-assistant\logs\20260814.log" -Tail 30
```

---

## 6. 交付物

1. 代码改动（上述文件）
2. 一段 **CHANGELOG**：改了什么、为什么、验收命令输出截图/粘贴
3. 若 csBridge 仍缺 API：列出 `[csBridge-miss]` 日志里出现的 method 名清单

---

## 7. 给审计 AI 的检查清单（Cursor 审计用）

审计 AI 收到修改后，按此逐项 pass/fail：

- [ ] `GET /api/shipping/csbridge-diag` → `farmerChatApp=true`
- [ ] `GET /api/shipping/csbridge-diag` → `xhsRim.type=object`
- [ ] `GET /api/shipping/csbridge-diag` → `imLoginInfo.csProviderId` 非空
- [ ] `GET /api/shipping/im-health` → `ok=true`
- [ ] 订单 `80223388178802120` ship_log 有 success 或 deliverByOrderSn 返回 success
- [ ] 未引入多开客服窗 / 未在 get_csa 失败时踢主 dashboard
- [ ] diff 范围仅 xhs-shipping-assistant IM 相关文件
- [ ] `npx vite build` 无报错

**fail 时**：指出具体阻塞环节（A/B/C/D）+ 建议下一刀改哪里。
