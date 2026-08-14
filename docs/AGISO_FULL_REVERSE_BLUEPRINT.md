# 阿奇锁完整代码拆解 · AI 复刻蓝本

> 复刻源：`D:\eva\小红书发货助手Pro`（阿奇锁 v2.0.1.1）
> 目标：`D:\eva\xhs-shipping-assistant`（自研 Electron 发货助手）
> 用途：供 AI 直接审计复刻，代码级拆解，自包含
> 日期：2026-08-14

---

## 0. 架构总览（一句话理解）

```
阿奇锁 = CefSharp(CEF) 壳 + 加载 walle 远程客服页 + 注入 JS(IMSend.js + XHS_FIX)
  ↓
真正发消息 = 远程页面的 window.XhsRim（页面 IM SDK）
  ↓
阿奇锁的 JS 只是「调用」window.XhsRim，不做 WebSocket 直连
```

三个 host（从 jsApi 接口提取）：
| host | 用途 |
|---|---|
| `walle.xiaohongshu.com` | 查客户、转接会话、视频列表 |
| `eva.xiaohongshu.com` | 转接客服列表 |
| `ark.xiaohongshu.com` | 商品笔记列表 |

---

## 1. 发消息核心 · jsApi 完整拆解（IMSend.js）

### 1.0 常量与就绪轮询

```javascript
// 常量
chatSdkVersion: 'v0.0.5'

// 就绪轮询（每 100ms 检查一次，直到 XhsRim + imLoginInfo 都就绪）
setInterval(function () {
  const imLoginInfo = document.querySelector('#app')
    ?.__vue_app__?._context.provides?.store?.state?.imStore?.xUserInfo;
  if (!window.XhsRim || !imLoginInfo) {
    return false;   // 未就绪，继续等
  }
  window.ImLoginInfo = imLoginInfo;   // 把 csProviderId 等挂到 window.ImLoginInfo
  return true;
}, 100);
```

**关键**：`window.XhsRim` 是页面自己挂载的，注入脚本只「等」不「挂」。`ImLoginInfo` 从 Vuex 的 `imStore.xUserInfo` 读。

### 1.1 查买家 getUserByOrderSn（search_customer）

```javascript
getUserByOrderSn: async function (taskId, orderSn) {
  const token = localStorage.getItem('accessToken');
  if (!token) { AcMain.taskResult(taskId, false, 'accessToken为空', ""); return null; }

  const sellerId = window.ImLoginInfo?.csProviderId;
  const apiUrl = `/api/edith/mcs/search_customer?seller_id=${sellerId}&keyword=${orderSn.trim()}&page_no=1&page_size=5&cancel_token=%7B%22promise%22:%7B%7D%7D`;
  const url = 'https://walle.xiaohongshu.com' + apiUrl;
  const sign = window._webmsxyw(apiUrl);   // 页面签名函数

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json, text/plain, */*',
      'x-subsystem': 'eva',
      ...sign,
      authorization: token,
    },
  });
  const packages = await response.json();
  // 成功返回 packages.data.search_results[0]?.id（买家 ID）
}
```

### 1.2 转接会话 transferConversation（POST）

```javascript
// POST /api/edith/mcs/transfer_conversation  (host: walle.xiaohongshu.com)
// body: { chat_id: chatId, csa_user_id: csaId }
// headers: accept + content-type:application/json + x-subsystem:eva + authorization + ...sign
```

### 1.3 获取转接客服列表 getTransferCsId（POST）

```javascript
// POST /api/edith/seller/online/csas/desensitize  (host: eva.xiaohongshu.com)
// body: { seller_id: sellerId }
```

### 1.4 建会话 getUserByOrderSnChatId（★ 核心）

```javascript
getUserByOrderSnChatId: async function (taskId, orderSn, buyerId) {
  const arg1 = {
    promoterType: 'OFFICIAL',
    invitedRefId: buyerId,
    promoterType: window.ImLoginInfo?.csProviderId,   // 覆盖为客服 ID
    additionInfo: { version: this.chatSdkVersion },   // 'v0.0.5'
  };
  const arg2 = {
    receiverAppUid: `1#2#2#${buyerId}`,                          // 买家 appUid 格式
    creatorParentAppUid: `1#3#6#${window.ImLoginInfo?.csProviderId}`, // 客服 appUid 格式
    bizType: 'chat',
  };
  const chatInfo = await window.XhsRim.rimSdk.getChatInfo(arg1, arg2);
  if (!chatInfo.success) {
    AcMain.taskResult(taskId, false, `创建会话失败 ${JSON.stringify(chatInfo)}`, "");
  } else {
    AcMain.taskResult(taskId, true, "", chatInfo.data.id);   // ★ 返回 chatId
  }
}
```

**appUid 格式（关键协议）**：
- 买家：`1#2#2#${buyerId}`
- 客服：`1#3#6#${csProviderId}`

### 1.5 发文本 sendTextMsg

```javascript
const r = await window.XhsRim.sendTextMsg(content, { chatId });
// 成功判断：r.status === 'success'
```

### 1.6 发图片 sendImageMsg

```javascript
const response = await fetch(url);
const blob = await response.blob();
const imageFile = new File([blob], "小红书PC-IMG-" + Date.now(), { type: "image/png" });
const r = await window.XhsRim.sendImageMsg(imageFile, { chatId });
```

### 1.7 发视频 sendCustomVideoMsg（content_type: 73）

```javascript
const payload = { content: content, content_type: 73 };
const configOptions = { chatId: chatId };
window.XhsRim.sendCustomMsg(payload, configOptions).then(result => {
  // result.status === 'success'
});
```

### 1.8 发笔记 sendCustomNotesMsg（content_type: 92）

```javascript
const payload = { content: content, content_type: 92 };
const configOptions = {
  chatId: chatId,
  manualInsertFn: function (msgObj, utils) {
    utils.appendMsg(msgObj);   // 手动插入消息到会话
  }
};
window.XhsRim.sendCustomMsg(payload, configOptions).then(result => {
  // result.status === 'success'
});
```

### 1.9 获取视频列表 getVideosList（分页）

```javascript
// GET /api/edith/walle/csa_tools/videos?page_no=1&page_size=50&sort_key=upload_time&sort=0&seller_id=${sellerId}
// host: walle.xiaohongshu.com
// 返回: result.data.list + result.data.total（循环分页直到 allVideos.length >= total）
```

### 1.10 获取商品笔记 getGoodsNoteList（分页）

```javascript
// GET /api/edith/goods-note/list?page_num=1&page_size=50
// host: ark.xiaohongshu.com（注意不是 walle！）
// 返回: result.data.note_infos + result.data.total
```

### 1.11 统一的签名与请求头模式（所有 REST 接口通用）

```javascript
// 签名
const sign = window._webmsxyw(apiUrl);   // 页面签名函数，返回签名 headers

// 通用 headers
headers: {
  'accept': 'application/json, text/plain, */*',
  'content-type': 'application/json;charset=UTF-8',  // 仅 POST
  'x-subsystem': 'eva',                                // ★ 固定值
  'authorization': token,                              // localStorage.accessToken
  ...sign,                                             // _webmsxyw 签名
}
```

---

## 2. csBridge 完整拆解（XHS_FIX · 复刻关键）

### 2.1 顶层 csBridge 结构

```javascript
window.csBridge = {
  require: mockRequire,                 // ★ 模拟 require("electron")
  clipboard: mockClipboard,             // mock 剪贴板
  nativeImage: mockNativeImage,         // mock 图片
  getCurrentWindow: function() { return mockWindow; },  // mock 窗口
  getDeviceId: function() { return '{_deviceId}'; },
  appInfo: { injectJsPath: '', appVersion: '1.1.57' },
  deprecateIpcQ: true,                  // ★ feature flag
  supportNewAcct: true,                 // ★ feature flag
  getRemote: function() { return window.csBridge.remote; },
  sitEnvDb: { updateSitUrl: function(config) {...} },
  clientDb: { registDb: function(dbName) {...} },  // NeDB 模拟
};
```

### 2.2 mockRequire（★ 返回含 app + remote，自研版曾缺 app）

```javascript
function mockRequire(moduleName) {
  if (moduleName === 'electron') {
    return {
      shell: mockShell,
      nativeImage: mockNativeImage,
      clipboard: mockClipboard,
      remote: window.csBridge.remote,      // mock remote
      ipcRenderer: window.csBridge.ipcRenderer,
      app: window.csBridge.remote.app      // ★ app（关键！）
    };
  }
  return {};
}
```

### 2.3 mockWindow（getCurrentWindow 返回，★ 含 session.cookies）

```javascript
{
  getCurrentWindowData: function(key) {...},
  webContents: {
    session: {
      cookies: {
        get: () => Promise.resolve([]),
        set: () => Promise.resolve(),
        remove: () => Promise.resolve()
      }
    }
  },
  isMaximized: () => false,
  isMinimized: () => false,
  focus: () => window.focus(),
  isFocused: () => document.hasFocus(),
  isFullScreen: () => false,
  // ... setMaximumSize/setMinimumSize/setMaximizable/maximize/minimize 等
}
```

### 2.4 clientDb.registDb（NeDB 模拟）

```javascript
clientDb: {
  registDb: function(dbName) {
    // 返回 NeDB 风格: { insert, update, remove, find, findOne, count }
    // 每个方法支持 callback 和 Promise 双风格
    // 数据存内存（阿奇锁）或 localStorage
  }
}
```

### 2.5 XHS_FIX 的其他补丁（页面功能）

1. **NeDB 模拟**（createNedbLike）：模拟 NeDB 数据库 API（find/findOne/insert/update/remove/count），数据存 localStorage 或通过 userConfigDb 桥
2. **mockShell**：`openExternal(url)` → 用 `window.location.href = url` 触发 C# OnBeforeBrowse 跳转
3. **mockClipboard**：`setClipboardText/setClipboardImage`（内存存储）+ paste 事件拦截
4. **webview → iframe 拦截**：把页面里的 `<webview>` 标签替换成 `<iframe>`（CefSharp 不支持 webview）

---

## 3. C# 层拆解（DLL IL 反编译）

### 3.1 枚举

| 枚举 | 成员 | 值 |
|---|---|---|
| `PlatformMsgType` | Text / Image / Order / GoodsLink / DxCard | 1 / 2 / 3 / 12 / 26 |
| `MsgType` | 发货消息 / 智能答复 | 1 / 2 |
| `ReceiveMsgType` | Customer / Seller / System | 0 / 1 / 2 |

### 3.2 数据模型

```
OrderImMsg {
  tid, oid, messageType, resultMsg, msgGuid, uid, reissueMinutes, orderSn, idNo
}
XhsSendImMsg   // 由 ConvertToXhsSendImMsg(OrderImMsg) 转换
ReceiveMsg { appCid, appUid, contentType, createTime, buyerNick, customerSellers }
XhsAutoReplyMsg { uid, messageId, replyTime, matchReplyItem, msgCreateTime }
AccountList { accoutNo, isPrimaryAcc, csProviderId, avatarUrl, bUserId, cUserId, sellerTypeName, nickName }
```

### 3.3 核心类（`Agiso.XhsClient.Core.Alds` 命名空间）

| 类 | 作用 |
|---|---|
| `XhsAssistantClient` | 后端客户端（统一请求入口） |
| `XhsSdk` | SDK 入口 |
| `OrderImMsgManager` | 订单消息队列（Enqueue/StartProcessing） |
| `OrderImMsgRepository` | 消息持久化（DisableOrderImMsgAsync/UpdateStatusAsync/UpdateStatusByMsgGuidAsync） |
| `MsgWebSocket` | 内部消息 WebSocket（订单消息，非买家消息） |

### 3.4 关键方法

```
XhsAssistantClient.DoExecuteAsync<T>          # 统一请求执行
XhsAssistantClient.CodeLoginAsync             # 登录
XhsAssistantClient.GetAcprSubAccountLoginAsync  # 客服子账号登录
XhsAssistantClient.GetDeadLineAsync           # 到期时间
ConvertToXhsSendImMsg(orderImMsg)             # 订单消息 → 发送消息
```

---

## 4. 登录逻辑拆解

```
1. ark 授权：https://ark.xiaohongshu.com/ark/authorization
2. 登录页：https://walle.xiaohongshu.com/cstools/login
3. 客服工作台：https://walle.xiaohongshu.com/cstools/seller/dashboard
4. 登录后：localStorage.accessToken + imStore.xUserInfo.csProviderId 就绪
```

---

## 5. 完整数据流（发消息全链路）

```
[1] 登录 → accessToken(localStorage) + csProviderId(imStore.xUserInfo)
[2] 查买家 → search_customer(orderSn) → buyerId
[3] 建会话 → XhsRim.rimSdk.getChatInfo(arg1, arg2) → chatId
[4] 发消息 → XhsRim.sendTextMsg/sendImageMsg/sendCustomMsg(content, {chatId})
[5] 判断成功 → result.status === 'success'
```

---

## 6. 复刻清单（自研版对齐阿奇锁）

### 6.1 已对齐（不用改）

| 项 | 状态 |
|---|---|
| 发消息协议（10 个 jsApi 方法） | ✅ im-send.js |
| csBridge.require("electron").app | ✅ 已补 |
| csBridge.session.cookies | ✅ 已补 |
| deprecateIpcQ / supportNewAcct / supportTab | ✅ 已补 |
| nodeIntegration:false + contextIsolation:false | ✅ 已改 |
| clientDb.registDb（NeDB IPC） | ✅ client-db-shim.ts |

### 6.2 待核对（自研版可能还缺的）

| 项 | 阿奇锁有 | 自研版待确认 |
|---|---|---|
| mockClipboard（setClipboardText/setClipboardImage + paste 拦截） | ✅ | ⚠️ 需核对 |
| webview → iframe 拦截 | ✅ | ⚠️ 需核对 |
| mockShell.openExternal（window.location.href 跳转） | ✅ | ⚠️ 需核对 |
| NeDB localStorage 兜底（userConfigDb 桥） | ✅ | ⚠️ 需核对 |
| getTransferCsId（eva.xiaohongshu.com 接口） | ✅ | ⚠️ im-send.js 待核对 |

### 6.3 三个 host 的接口清单（自研版需确认全覆盖）

| host | 接口 | 方法 | jsApi |
|---|---|---|---|
| walle | /api/edith/mcs/search_customer | GET | getUserByOrderSn |
| walle | /api/edith/mcs/transfer_conversation | POST | transferConversation |
| eva | /api/edith/seller/online/csas/desensitize | POST | getTransferCsId |
| walle | /api/edith/walle/csa_tools/videos | GET | getVideosList |
| ark | /api/edith/goods-note/list | GET | getGoodsNoteList |

---

## 7. 验收标准（复刻完成判定）

```
1. typeof window.require → 'undefined'
2. window.csBridge.require("electron").app → 非 undefined
3. window.csBridge.getCurrentWindow().webContents.session.cookies → 非 undefined
4. typeof window.XhsRim → 'object'
5. window.ImLoginInfo.csProviderId → 非空
6. 测试订单 80223388178802120 真发 → ship_log status=success
7. 发视频 content_type=73 成功
8. 发笔记 content_type=92 成功
```
