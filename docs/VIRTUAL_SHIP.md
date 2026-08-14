# 虚拟资源发货（对标阿奇锁）

## 阿奇锁真实链路（已审计）

```
待发货订单（fulfillment/order/page 或云 WS）
  → 匹配商品 GoodsId / product_binding
  → 取卡密/固定文案/链接
  → search_customer(orderSn) 找买家（seller_id = ImLoginInfo.csProviderId）
  → XhsRim.rimSdk.getChatInfo(arg1, arg2) → chatId
  → XhsRim.sendTextMsg(内容)  ← 核心是 IM，不是点「物流发货」
  → 记发货日志
```

## 架构（agiso-v1）

- **IM 页**：`/cstools/chat` 才挂载 `window.XhsRim`（dashboard 仅有 ImLoginInfo，无 rim）
- **发码 WebContents**：隐藏客服窗 + 主窗 BrowserView，均后台加载 chat
- **健康检查**：`checkImHealth()`；`rim=fail` 时自动 `loadURL(/cstools/chat)` 等待 XhsRim
- **100ms 轮询**：im-send 注入后持续同步 `window.ImLoginInfo`（对标阿奇锁 IMSend 头）

## 本仓库对接文件

| 文件 | 作用 |
|---|---|
| `resources/inject-scripts/im-send.js` | IM 桥：`deliverByOrderSn` / `checkImHealth` / `fetchPendingOrders` |
| `electron/services/autoship.service.ts` | 轮询 + chat 页发货 + `[Health]` 日志 |
| `electron/main.ts` | `bindShopImForShip` + 隐藏客服窗 `ensureShopImWindow` |
| `electron/services/inject.service.ts` | 注入 im-send |

## 使用前提

1. 客服邮箱已登录，Cookie 含 `walle-eva-auth`
2. 后台 chat 页已加载（日志 `[Health] csa=ok rim=ok imLogin=ok`）
3. 在「发货」页绑定商品 ID + 心象测/卡密池
4. **勿多开客户端**（多 chat 窗互踢 CSA）

## 手动试单

设置里或 API：`autoship:manual-trigger`，传入 `{ order_id, product_id, status:'待发货' }`

健康状态 IPC：`health:kefu-status`
