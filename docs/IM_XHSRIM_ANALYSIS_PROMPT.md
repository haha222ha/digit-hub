# 小红书 IM 发消息问题 · 路径清单 & GLM/DeepSeek 分析提示词

> 生成时间：2026-08-14  
> 用途：发给 GLM / DeepSeek 等模型，分析自研发货助手 IM 发码为何失败、如何对标阿奇锁突破。

---

## 一、绝对路径清单

### 1. 自研「千帆发货助手」（Electron）

| 用途 | 绝对路径 |
|------|----------|
| 项目根目录 | `D:\eva\xhs-shipping-assistant` |
| 启动脚本 | `D:\eva\xhs-shipping-assistant\start-assistant.bat` |
| IM 注入脚本（对标阿奇锁 IMSend.js） | `D:\eva\xhs-shipping-assistant\resources\inject-scripts\im-send.js` |
| 自动发货核心 | `D:\eva\xhs-shipping-assistant\electron\services\autoship.service.ts` |
| Electron 主进程 | `D:\eva\xhs-shipping-assistant\electron\main.ts` |
| 本地 API 服务 | `D:\eva\xhs-shipping-assistant\electron\services\api.service.ts` |
| 虚拟发货设计文档 | `D:\eva\xhs-shipping-assistant\docs\VIRTUAL_SHIP.md` |
| 阿奇锁审计需求文档 | `D:\eva\xhs-shipping-assistant\docs\需求文档-订单识别与自动发消息.md` |
| 本地化虚拟发货设计 | `D:\eva\xhs-shipping-assistant\docs\需求文档-本地化虚拟资源发货设计.md` |
| 编译产物（主进程） | `D:\eva\xhs-shipping-assistant\dist-electron\main.js` |
| E2E 测试脚本（勿当正式客户端启动） | `D:\eva\xhs-shipping-assistant\tools\_test_im_ship_e2e.js` |
| 本地 SQLite DB | `C:\Users\Administrator\AppData\Roaming\xhs-shipping-assistant\data.db` |
| 运行日志 | `C:\Users\Administrator\AppData\Roaming\xhs-shipping-assistant\logs\20260814.log` |

**本地 HTTP API（助手运行时）**

- 健康检查：`http://127.0.0.1:19527/api/health`
- 打开可见 chat：`POST http://127.0.0.1:19527/api/shipping/prepare-im`
- IM 健康：`GET http://127.0.0.1:19527/api/shipping/im-health`
- 触发发货：`POST http://127.0.0.1:19527/api/shipping/auto-ship`

---

### 2. 阿奇锁原版（小红书发货助手 Pro · .NET + CefSharp）

| 用途 | 绝对路径 |
|------|----------|
| 安装目录 | `D:\eva\小红书发货助手Pro` |
| 主程序 | `D:\eva\小红书发货助手Pro\AgisoXhsClient.exe` |
| 启动器 | `D:\eva\小红书发货助手Pro\AgisoXhsClientStartUp.exe` |
| 核心 DLL | `D:\eva\小红书发货助手Pro\AgisoXhsClient.dll` |
| IM 资源 DLL | `D:\eva\小红书发货助手Pro\Agiso.XhsClient.Resources.dll` |
| CEF 壳 | `D:\eva\小红书发货助手Pro\Agiso.CefEx.dll` |
| 客户端核心 | `D:\eva\小红书发货助手Pro\Agiso.XhsClient.Core.dll` |
| WebSocket 模型 | `D:\eva\小红书发货助手Pro\Agiso.XhsMsgWebSocket.Model.dll` |
| CefSharp 子进程 | `D:\eva\小红书发货助手Pro\CefSharp.BrowserSubprocess.exe` |
| 阿奇锁日志目录 | `D:\eva\小红书发货助手Pro\Logs\` |

---

### 3. 阿奇锁反编译 / 审计字符串（已提取，供对标）

| 用途 | 绝对路径 |
|------|----------|
| 审计目录 | `D:\eva\xhs-shipping-assistant\tools\_agiso_strings\` |
| IMSend 核心提取 | `D:\eva\xhs-shipping-assistant\tools\_agiso_strings\_imsend_core_extract.js` |
| IMSend 尾部 | `D:\eva\xhs-shipping-assistant\tools\_agiso_strings\_imsend_tail.js` |
| IMSend 完整 | `D:\eva\xhs-shipping-assistant\tools\_agiso_strings\IMSend.js.full.txt` |
| IMSend 提取版 | `D:\eva\xhs-shipping-assistant\tools\_agiso_strings\IMSend.js.extracted.txt` |
| 发消息流程（DLL 字符串） | `D:\eva\xhs-shipping-assistant\tools\_agiso_strings\AgisoXhsClient.dll.txt` |
| XhsClient 核心 | `D:\eva\xhs-shipping-assistant\tools\_agiso_strings\Agiso.XhsClient.Core.dll.txt` |
| XhsClient 资源 | `D:\eva\xhs-shipping-assistant\tools\_agiso_strings\Agiso.XhsClient.Resources.dll.txt` |
| CefEx | `D:\eva\xhs-shipping-assistant\tools\_agiso_strings\Agiso.CefEx.dll.txt` |
| WebSocket 模型 | `D:\eva\xhs-shipping-assistant\tools\_agiso_strings\Agiso.XhsMsgWebSocket.Model.dll.txt` |

---

### 4. 心象测云端（订单 sync / 自助领取）

| 用途 | 绝对路径 |
|------|----------|
| digit-hub 根目录 | `D:\选品报告\资料生产工厂\digit-hub` |
| 云端 API 部署目录 | `D:\选品报告\资料生产工厂\digit-hub\services\xhs-cloud\cloud_deploy\` |
| 分销 DB 逻辑 | `D:\选品报告\资料生产工厂\digit-hub\services\xhs-cloud\cloud_deploy\cloud_api\dist_db.py` |
| 分销路由 | `D:\选品报告\资料生产工厂\digit-hub\services\xhs-cloud\cloud_deploy\cloud_api\dist_routes.py` |
| 订单领取单测 | `D:\选品报告\资料生产工厂\digit-hub\services\xhs-cloud\cloud_deploy\tests\test_order_claim.py` |
| 买家领取页 | `D:\选品报告\资料生产工厂\digit-hub\apps\psy-dist\order-claim.html` |
| 生产域名 | `https://psy.xhs365.cn/order-claim` |

---

### 5. 千帆 / 小红书相关 URL（非本地路径）

| 用途 | URL |
|------|-----|
| 客服聊天页（XhsRim 所在） | `https://walle.xiaohongshu.com/cstools/chat` |
| 卖家 dashboard | `https://walle.xiaohongshu.com/cstools/seller/dashboard` |
| 订单 API（ark） | `https://ark.xiaohongshu.com` |
| 客服 WebSocket | `wss://zelda.xiaohongshu.com/websocketV2` |
| 阿奇锁云 WS（可选） | `wss://xhsmsgwebsocket.agiso.com` |
| search_customer | `GET /api/edith/mcs/search_customer` |
| 订单列表 | `POST /api/edith/fulfillment/order/page` |

---

## 二、背景与目标

我们在用 Electron 自研「小红书发货助手」对标阿奇锁（Agiso）Pro 的虚拟发货能力：

```
订单识别 → 心象测云端分配测评链接 → 通过小红书客服 IM 把链接发给买家
```

- **阿奇锁**：已验证 IM 发消息可用  
- **自研版**：订单轮询 ✅、云端 allocate ✅、买家 order-claim（P 前缀 packageId）✅  
- **阻塞点**：IM 发消息 ❌（`XhsRim` / `ImLoginInfo` 未就绪）

---

## 三、阿奇锁 IM 发消息链路（已审计）

```
1. jsApi.getUserByOrderSn(orderSn)
   GET /api/edith/mcs/search_customer?seller_id={ImLoginInfo.csProviderId}&keyword={orderSn}
   headers: authorization=localStorage.accessToken（裸 token，无 Bearer）, x-subsystem=eva, ..._webmsxyw sign
   → buyerId = data.search_results[0].id

2. jsApi.getUserByOrderSnChatId(orderSn, buyerId)
   XhsRim.rimSdk.getChatInfo(arg1, arg2)
   arg1 = { promoterType: csProviderId, invitedRefId: buyerId, additionInfo: { version: 'v0.0.5' } }
   arg2 = { receiverAppUid: `1#2#2#${buyerId}`, creatorParentAppUid: `1#3#6#${csProviderId}`, bizType: 'chat' }
   → chatId

3. jsApi.sendTextMsg(content, chatId)
   XhsRim.sendTextMsg(content, { chatId })
   success iff result.status === 'success'
```

**关键依赖：**

- 页面必须加载 `window.XhsRim`（主要在 `https://walle.xiaohongshu.com/cstools/chat`）
- `window.ImLoginInfo` 来自 Vue：`#app.__vue_app__._context.provides.store.state.imStore.xUserInfo`
- 阿奇锁 IMSend 头部 **100ms 轮询**直到 `XhsRim && imLoginInfo` 都就绪
- 阿奇锁用 **CefSharp 可见 CEF 窗**加载客服页，`backgroundThrottling=false`

**订单号两套 ID（HAR 实测）：**

| 字段 | 示例 | 谁用 |
|------|------|------|
| orderId | `80223388178802120` | 卖家 fulfillment API / 发货助手 sync |
| packageId | `P802233881788021201` | 买家订单详情看到的订单号 |

规则：`packageId = P + orderId + 包裹序号`（首包裹常为 `1`）

---

## 四、自研版已做对齐（agiso-v1）

| 改动 | 文件 |
|------|------|
| 100ms bootstrap、getChatInfo 参数、getRim() 回退 | `im-send.js` |
| bindShopImForShip() 加载 /cstools/chat | `main.ts` |
| rim=fail 自动切 chat；发货前 ensureXhsRimLoaded | `autoship.service.ts` |
| prepare-im / im-health 本地 API | `api.service.ts` |
| packageId 规范化领取 | digit-hub `dist_db.py` |

---

## 五、当前实测状态（2026-08-14）

**测试店铺：** `shop_mssdfcrc_q8ty`（郭老师资料店）  
**测试订单：** `80223388178802120`  
**测试商品：** `6a7d264a95cfc00001f40426`

| 环节 | 结果 |
|------|------|
| 订单轮询 fulfillment API | ✅ 命中 |
| 心象测云端 allocate | ✅ already=true |
| get_csa_info | ✅ HTTP 200（偶发 401） |
| localStorage accessToken | ✅ 有 |
| ImLoginInfo.csProviderId | ❌ 经常为空（imLogin=fail） |
| window.XhsRim | ❌ 未加载（rim=fail） |
| IM sendTextMsg | ❌ 失败 |
| 买家 order-claim（P 前缀） | ✅ 已修复 |

**即使 `POST /api/shipping/prepare-im` 可见打开 chat 页，健康检查仍为：**

```
csa=ok  token=ok  imLogin=fail  rim=fail
```

**最新 ship_log 错误（解码后）：**

> 店铺 IM 未就绪，请在客服聊天页 /cstools/chat 完成登录，勿多开客户端

**其他观察：**

- WebSocket `zelda.xiaohongshu.com` 反复 code 1006 断开重连
- Cookie 常见 `sso=false`, `auth=true`
- 误用 `electron tools/_test_im_ship_e2e.js` 会弹出标题为 **「Eva」** 的空窗口，不是正式客户端

---

## 六、给 GLM / DeepSeek 的完整分析提示词（可直接复制）

```markdown
# 任务：分析小红书虚拟发货 IM 发消息为何失败，给出可落地的突破方案

## 背景

我们在用 Electron 自研「小红书发货助手」对标阿奇锁（Agiso）Pro 的虚拟发货能力：
订单识别 → 心象测云端分配测评链接 → 通过小红书客服 IM 把链接发给买家。

阿奇锁已验证可用；自研版订单轮询、云端分配均正常，但 IM 发消息始终失败。

## 项目路径

### 自研（Electron）
- 根目录：D:\eva\xhs-shipping-assistant
- IM 桥：resources/inject-scripts/im-send.js（agiso-v1）
- 发货服务：electron/services/autoship.service.ts
- 主进程：electron/main.ts
- 设计文档：docs/VIRTUAL_SHIP.md、docs/需求文档-订单识别与自动发消息.md
- 本文档：docs/IM_XHSRIM_ANALYSIS_PROMPT.md
- 本地 DB：C:\Users\Administrator\AppData\Roaming\xhs-shipping-assistant\data.db
- 日志：C:\Users\Administrator\AppData\Roaming\xhs-shipping-assistant\logs\20260814.log

### 阿奇锁原版（.NET + CefSharp）
- 安装目录：D:\eva\小红书发货助手Pro
- 主程序：AgisoXhsClient.exe
- 已提取审计：D:\eva\xhs-shipping-assistant\tools\_agiso_strings\
  - _imsend_core_extract.js
  - AgisoXhsClient.dll.txt
  - IMSend.js.full.txt

### 心象测云端
- D:\选品报告\资料生产工厂\digit-hub\services\xhs-cloud\cloud_deploy\

## 阿奇锁 IM 发消息链路（已审计）

1. search_customer(orderSn) → buyerId（seller_id = ImLoginInfo.csProviderId）
2. XhsRim.rimSdk.getChatInfo(arg1, arg2) → chatId
3. XhsRim.sendTextMsg(content, { chatId })

依赖：/cstools/chat 页、window.XhsRim、window.ImLoginInfo、accessToken、_webmsxyw 签名

## 当前阻塞

prepare-im 可见打开 chat 后仍：csa=ok token=ok imLogin=fail rim=fail
ship_log：IM 未就绪；WebSocket 1006；sso=false

## 请分析并回答

1. 根因：为何阿奇锁 CEF 能加载 XhsRim + ImLoginInfo，Electron BrowserView 不行？
   （CEF 注入、csBridge、ServiceTicket、partition/cookie、throttle、Vue 时序）

2. ImLoginInfo 为空：chat 已开、get_csa_info=200 时 imStore.xUserInfo 仍不出现的常见原因？

3. XhsRim 加载条件：除 /cstools/chat 外还需哪些前置？farmer-chat-app.getRim()？

4. 突破方案（按优先级）：
   - BrowserView vs BrowserWindow、可见/隐藏策略
   - preload / csBridge 注入
   - session / csProviderId 稳定获取
   - 是否应常开可见客服窗（完全模仿阿奇锁 CEF）
   - 有无不依赖 XhsRim 的 edith REST 替代发消息

5. Windows 验证清单：DevTools 检查项、console 命令、预期输出

请结合 _imsend_core_extract.js 与 AgisoXhsClient.dll.txt，给出文件/函数级代码建议。
```

---

## 七、关键代码引用（自研）

**健康检查日志格式：**

```
[Health] shop=shop_mssdfcrc_q8ty csa=ok rim=fail imLogin=fail token=ok
```

**im-send.js 健康检查条件：**

```javascript
health.ok = health.token && health.imLogin && health.rim && health.csa.ok
```

**阿奇锁 IMSend 头部轮询（_imsend_core_extract.js）：**

```javascript
setInterval(function () {
  const imLoginInfo = document.querySelector('#app')?.__vue_app__?._context?.provides?.store?.state?.imStore?.xUserInfo;
  if (!window.XhsRim || !imLoginInfo) return false;
  window.ImLoginInfo = imLoginInfo;
  return true;
}, 100);
```

---

## 八、勿混淆的启动方式

| 方式 | 窗口标题 | 是否正确 |
|------|----------|----------|
| 双击 / `start-assistant.bat` | 小红书发货助手 | ✅ |
| `npx electron tools/_test_im_ship_e2e.js` | Eva（空白） | ❌ 仅调试脚本 |

---

*文档路径见下方。*
