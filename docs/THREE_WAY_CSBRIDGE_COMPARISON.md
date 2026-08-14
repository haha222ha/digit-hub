# csBridge 三方对比（官方千帆 / 阿奇锁 / 自研助手）

> 2026-08-14 v3 — **取代** v2 中「getRemote 必须是布尔 true」的错误结论

## 结论（一句话）

阿奇锁用 **CefSharp + 完整 mock electron**（含 `app` / `remote` / `session.cookies`）成功挂载 XhsRim；自研版失败主因是 **mock 残缺**，不是 `getRemote` 类型，也不是 `nodeIntegration` 开关方向。

## 壳技术差异

| 维度 | 官方千帆 | 阿奇锁 Pro | 自研助手 |
|------|----------|------------|----------|
| 壳 | Electron（真实 remote） | CefSharp（纯浏览器） | Electron（remote 已废弃） |
| csBridge | 有，真实 API | 有，**全 mock** | 有，mock **不完整** |
| 页面 | walle-eva | walle-eva | walle-eva |
| 发消息 | XhsRim | XhsRim | XhsRim（目标） |

## getRemote：函数 vs 布尔（已推翻 v2）

**证据**：`Agiso.XhsClient.Resources.dll` → XHS_FIX 明文 JS：

```javascript
getRemote: function () {
    return window.csBridge.remote;
},
```

阿奇锁用**函数**也能成功 → `getRemote === true` **不是**必要条件。

自研应改为：

```typescript
getRemote: () => remote,
remote,
```

## mockRequire('electron') 对比（真正差异 #1）

阿奇锁：

```javascript
function mockRequire(moduleName) {
    if (moduleName === 'electron') {
        return {
            shell: mockShell,
            nativeImage: mockNativeImage,
            clipboard: mockClipboard,
            remote: window.csBridge.remote,
            ipcRenderer: window.csBridge.ipcRenderer,
            app: window.csBridge.remote.app,  // ★ 必须有
        };
    }
    return {};
}
```

| 字段 | 官方 | 阿奇锁 | 自研（修复前） |
|------|------|--------|----------------|
| shell | ✅ | ✅ mock | ✅ |
| nativeImage | ✅ | ✅ mock | ✅ |
| clipboard | ✅ | ✅ mock | ✅ |
| ipcRenderer | ✅ | ✅ mock | ✅ |
| remote | ✅ 真实 | ✅ mock | ⚠️ 引用 shim |
| **app** | ✅ | ✅ **mock** | ❌ **缺** |

IM SDK 常见路径：`csBridge.getRemote().require('electron').app` 或 `csBridge.require('electron').app`。

## getCurrentWindow().webContents.session.cookies（真正差异 #2）

阿奇锁 mock：

```javascript
getCurrentWindow: function () {
    return {
        webContents: {
            session: {
                cookies: {
                    get: () => Promise.resolve([]),
                    set: () => Promise.resolve(),
                    remove: () => Promise.resolve(),
                }
            }
        },
        // ...
    };
},
```

自研修复前：`session.defaultSession.cookies` 在 electron mock 里，但 **currentWindow.webContents.session.cookies 缺失**。

## Feature flags（真正差异 #3）

阿奇锁 DLL 明文：

```javascript
deprecateIpcQ: true,
supportNewAcct: true,
```

自研修复前：缺这两项。

## remote 对象结构（阿奇锁）

```javascript
remote: {
    getCurrentWindow: () => window.csBridge.getCurrentWindow(),
    require: mockRequire,
    shell, nativeImage, clipboard,
    app: { getPath, getVersion, getName, isPackaged },
    dialog: { showMessageBox, showOpenDialog, showSaveDialog },
},
```

## 修复清单（P0，给 Cursor）

**文件**：`electron/cs-bridge-shim.ts`

1. `getRemote: () => remote`（函数，对齐阿奇锁）
2. 顶层 `require: mockRequire`，与 `remote.require` 同源
3. `mockRequire('electron')` 返回 6 字段：**含 `app: appShim`**
4. `getCurrentWindow().webContents.session.cookies` → get/set/remove
5. `deprecateIpcQ: true`、`supportNewAcct: true`
6. 保持 `clientDb` IPC NeDB、`supportTab` 等已有对齐

**不要**：

- ❌ 把 `getRemote` 改成布尔 `true`
- ❌ 改 `nodeIntegration:false`（与 milestone 客服登录可用配置冲突时需单独验证）
- ❌ 移除 csBridge

## 验收

DevTools（客服 chat 页）：

```javascript
typeof window.csBridge.getRemote === 'function'  // true
window.csBridge.getRemote().require('electron').app  // object
window.csBridge.getCurrentWindow().webContents.session.cookies.get  // function
window.csBridge.deprecateIpcQ  // true
typeof window.XhsRim  // 'object'
```

API：

```powershell
curl -s http://127.0.0.1:19527/api/shipping/im-health
curl -s -X POST http://127.0.0.1:19527/api/shipping/auto-ship -H "Content-Type: application/json" -d "{\"orderId\":\"P802233881788021201\",\"productId\":\"6a7d264a95cfc00001f40426\"}"
```
