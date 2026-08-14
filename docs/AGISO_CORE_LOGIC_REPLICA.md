# 阿奇锁核心逻辑完整复刻 · 需求文档（备份 + 蓝本）

> 复刻对象：`D:\eva\小红书发货助手Pro`（阿奇锁 v2.0.1.1）
> 目标：`D:\eva\xhs-shipping-assistant`（自研 Electron 发货助手）
> 日期：2026-08-14

---

## 0. 架构总览

```
阿奇锁（CefSharp CEF）
├── C# 层（AgisoXhsClient.dll + Agiso.XhsClient.Core.dll）
│   ├── XhsAssistantClient     # 自己的后端客户端（Alds）
│   ├── OrderImMsgManager      # 订单消息队列管理器
│   ├── MsgWebSocket           # 内部消息 WebSocket（订单消息，非买家消息）
│   └── CefSharp 浏览器        # 加载 walle 客服页
│
├── 注入 JS 层（Agiso.XhsClient.Resources.dll 嵌入）
│   ├── IMSend.js              # 发消息核心（jsApi，7 个方法）
│   └── XHS_FIX（imsend_tail）# csBridge 桥 + NeDB/shell/clipboard 补丁
│
└── 远程页面（walle.xiaohongshu.com/cstools/...）
    └── window.XhsRim          # 页面 IM SDK（真正发消息）
        window._webmsxyw       # 页面签名函数
        imStore.xUserInfo      # csProviderId
```

---

## 1. 发消息核心链路（IMSend.js · jsApi · 完整拆解）

### 1.1 建会话 getUserByOrderSnChatId

```javascript
getUserByOrderSnChatId: async function (taskId, orderSn, buyerId) {
    const arg1 = {
        promoterType: 'OFFICIAL',
        invitedRefId: buyerId,
        promoterType: window.ImLoginInfo?.csProviderId,   // 覆盖为客服 ID
        additionInfo: { version: this.chatSdkVersion },   // chatSdkVersion = 'v0.0.5'
    };
    const arg2 = {
        receiverAppUid: `1#2#2#${buyerId}`,                        // 买家 appUid
        creatorParentAppUid: `1#3#6#${window.ImLoginInfo?.csProviderId}`, // 客服 appUid
        bizType: 'chat',
    };
    try {
        const chatInfo = await window.XhsRim.rimSdk.getChatInfo(arg1, arg2);
        if (!chatInfo.success) {
            AcMain.taskResult(taskId, false, `${orderSn} 建会话失败 ${JSON.stringify(chatInfo)}`, "");
        } else {
            AcMain.taskResult(taskId, true, "", chatInfo.data.id);  // 返回 chatId
        }
    } catch (e) {
        AcMain.taskResult(taskId, false, `${orderSn} 建会话异常 ${e.message}`, "");
    }
}
```

**关键**：`chatId = chatInfo.data.id`，`receiverAppUid` 格式 `1#2#2#${buyerId}`，`creatorParentAppUid` 格式 `1#3#6#${csProviderId}`。

### 1.2 发文本 sendTextMsg

```javascript
sendTextMsg: async function (taskId, content, chatId) {
    const r = await window.XhsRim.sendTextMsg(content, { chatId });
    if (r?.status !== 'success') {
        AcMain.taskResult(taskId, false, `发送文本失败 ${r?.message}`, "");
    } else {
        AcMain.taskResult(taskId, true, `发送成功 ${r?.message}`, "");
    }
}
```

### 1.3 发图片 sendImageMsg

```javascript
sendImageMsg: async function (taskId, url, chatId) {
    const response = await fetch(url);
    const blob = await response.blob();
    const imageFile = new File([blob], "小红书PC-IMG-" + Date.now(), { type: "image/png" });
    const r = await window.XhsRim.sendImageMsg(imageFile, { chatId });
    // r.status === 'success'
}
```

### 1.4 发视频 sendCustomVideoMsg（content_type: 73）

```javascript
sendCustomVideoMsg: async function (taskId, content, chatId) {
    const payload = { "content": content, "content_type": 73 };
    const configOptions = { "chatId": chatId };
    window.XhsRim.sendCustomMsg(payload, configOptions).then(result => {
        // result.status === 'success'
    });
}
```

### 1.5 发笔记 sendCustomNotesMsg（content_type: 92）

```javascript
sendCustomNotesMsg: async function (taskId, content, chatId) {
    const payload = { "content": content, "content_type": 92 };
    const configOptions = {
        "chatId": chatId,
        manualInsertFn: function (msgObj, utils) {
            utils.appendMsg(msgObj);   // 手动插入消息到会话
        }
    };
    window.XhsRim.sendCustomMsg(payload, configOptions).then(result => {
        // result.status === 'success'
    });
}
```

### 1.6 查客户 searchCustomer（REST + 签名）

```javascript
// 核心：查买家 ID
const token = localStorage.getItem('accessToken');
const sellerId = window.ImLoginInfo?.csProviderId;
const apiUrl = `/api/edith/mcs/search_customer?seller_id=${sellerId}&keyword=${orderSn}&page_no=1&page_size=5&cancel_token=%7B%22promise%22:%7B%7D%7D`;
const url = 'https://walle.xiaohongshu.com' + apiUrl;
const sign = window._webmsxyw(apiUrl);   // 页面签名
const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
        'accept': 'application/json, text/plain, */*',
        'x-subsystem': 'eva',
        'authorization': token,
        ...sign,
    }
});
const result = await response.json();
const buyerId = result.data?.search_results?.[0]?.id;
```

### 1.7 获取视频列表 getVideosList

```javascript
// 接口：/api/edith/walle/csa_tools/videos（分页 page_no/page_size，sort_key=upload_time）
// host：walle.xiaohongshu.com
// 参数：seller_id + 分页
// 返回：result.data.list + result.data.total
```

### 1.8 获取商品笔记 getGoodsNoteList

```javascript
// 接口：/api/edith/goods-note/list（分页 page_num/page_size）
// host：ark.xiaohongshu.com（注意不是 walle！）
// 返回：result.data.note_infos + result.data.total
```

---

## 2. csBridge 完整结构（XHS_FIX · 复刻关键）

### 2.1 顶层 csBridge

```javascript
window.csBridge = {
    require: mockRequire,                    // mock require("electron")
    clipboard: mockClipboard,                // mock 剪贴板
    nativeImage: mockNativeImage,            // mock 图片
    getCurrentWindow: function() { return mockWindow; },  // mock 窗口
    getDeviceId: function() { return '{_deviceId}'; },
    appInfo: { injectJsPath: '', appVersion: '1.1.57' },
    deprecateIpcQ: true,                     // ★ feature flag
    supportNewAcct: true,                    // ★ feature flag
    getRemote: function() { return window.csBridge.remote; },  // 返回 remote
    sitEnvDb: { updateSitUrl: function(config) {...} },
    clientDb: { registDb: function(dbName) {...} },  // NeDB 模拟
};
```

### 2.2 mockRequire（关键！返回含 app + remote）

```javascript
function mockRequire(moduleName) {
    if (moduleName === 'electron') {
        return {
            shell: mockShell,                    // shell
            nativeImage: mockNativeImage,
            clipboard: mockClipboard,
            remote: window.csBridge.remote,      // ★ remote
            ipcRenderer: window.csBridge.ipcRenderer,
            app: window.csBridge.remote.app      // ★ app（自研版缺这个！）
        };
    }
    return {};
}
```

### 2.3 mockWindow（getCurrentWindow 返回，含 session.cookies）

```javascript
{
    getCurrentWindowData: function(key) {...},
    webContents: {
        session: {
            cookies: {                            // ★ session.cookies（自研版缺！）
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
    // ... 更多
}
```

### 2.4 clientDb.registDb（NeDB 内存模拟）

```javascript
clientDb: {
    registDb: function(dbName) {
        // 返回 NeDB 风格：{ insert, update, remove, find, findOne, count }
        // 数据存内存（阿奇锁）或 localStorage（自研版）
    }
}
```

---

## 3. C# 层核心逻辑（DLL IL 反编译）

### 3.1 平台消息类型枚举（PlatformMsgType）

| 枚举 | 值 | 含义 |
|---|---|---|
| Text | 1 | 文本 |
| Image | 2 | 图片 |
| Order | 3 | 订单卡片 |
| GoodsLink | 12 | 商品链接 |
| DxCard | 26 | Dx 名片 |

### 3.2 内部消息类型（MsgType）

| 枚举 | 值 | 含义 |
|---|---|---|
| 发货消息 | 1 | 自动发货消息 |
| 智能答复 | 2 | 智能回复 |

### 3.3 订单消息模型（OrderImMsg / XhsSendImMsg）

```
OrderImMsg {
    tid             // 订单号
    oid             // 子订单号
    messageType     // 消息类型（MsgType）
    resultMsg       // 发送结果
    msgGuid         // 消息 GUID（幂等）
    uid             // 用户 ID
    reissueMinutes  // 补发间隔（分钟）
    orderSn         // 订单序列号
    idNo            // 幂等 ID
}
```

### 3.4 核心类

- `OrderImMsgManager` - 订单消息队列管理（Enqueue/StartProcessing）
- `OrderImMsgRepository` - 消息持久化（DisableOrderImMsgAsync/UpdateStatusAsync/UpdateStatusByMsgGuidAsync）
- `ConvertToXhsSendImMsg` - OrderImMsg → XhsSendImMsg 转换
- `MsgWebSocket` - 内部消息 WebSocket（订单消息，非买家消息）
- `XhsAssistantClient.DoExecuteAsync` - 后端统一请求入口

---

## 4. 复刻到自研版的完整实施清单

### 4.1 已正确（不用改）

| 项 | 自研版文件 | 状态 |
|---|---|---|
| 发消息协议（7 个 jsApi） | `resources/inject-scripts/im-send.js` | ✅ 已写对 |
| executeJavaScript 注入 | `electron/services/inject.service.ts` | ✅ 已正确 |
| 离屏策略 | `electron/main.ts` | ✅ 已改 |
| get_csa patch | `resources/inject-scripts/api-interceptor.js` | ✅ 已改 |

### 4.2 待实施（P0，本任务的代码改动）

| # | 改动 | 文件 | 对齐阿奇锁的什么 |
|---|---|---|---|
| 1 | `nodeIntegration: true → false` | `electron/main.ts` | 让页面无全局 require，走 csBridge.require |
| 2 | 补 `require("electron").app` | `electron/cs-bridge-shim.ts` | mockRequire 的 app 字段 |
| 3 | 补 `webContents.session.cookies` | `electron/cs-bridge-shim.ts` | mockWindow 的 session.cookies |
| 4 | 补 `deprecateIpcQ`/`supportNewAcct` | `electron/cs-bridge-shim.ts` | feature flag |

### 4.3 完整对齐清单（csBridge 字段对照）

| csBridge 字段 | 阿奇锁 | 自研版当前 | 需补 |
|---|---|---|---|
| require("electron").shell | mockShell | ✅ 有 | - |
| require("electron").nativeImage | mockNativeImage | ✅ 有 | - |
| require("electron").clipboard | mockClipboard | ✅ 有 | - |
| require("electron").remote | mock remote | ✅ 有 | - |
| require("electron").ipcRenderer | mock ipcRenderer | ✅ 有 | - |
| **require("electron").app** | **mock app** | **❌ 缺** | **★ 补** |
| getCurrentWindow().webContents.session.cookies | mock cookies | ❌ 缺 | ★ 补 |
| deprecateIpcQ | true | ❌ 缺 | 补 |
| supportNewAcct | true | ❌ 缺 | 补 |
| appInfo.injectJsPath | '' | ❌ 缺 | 补 |

---

## 5. 验收标准

```
1. typeof window.require → 'undefined'（页面无全局 require）
2. window.csBridge.require("electron").app → 非 undefined
3. window.csBridge.require("electron").remote → 非 undefined
4. window.csBridge.getCurrentWindow().webContents.session.cookies → 非 undefined
5. typeof window.XhsRim → 'object'（IM SDK 初始化成功）
6. window.ImLoginInfo.csProviderId → 非空
7. 测试订单 80223388178802120 真发 → ship_log status=success
```
