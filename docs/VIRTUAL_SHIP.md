# 虚拟资源发货（对标阿奇锁）

## 阿奇锁真实链路（已审计）

```
待发货订单（fulfillment/order/page 或云 WS）
  → 匹配商品 GoodsId / product_binding
  → 取卡密/固定文案/链接
  → search_customer(orderSn) 找买家
  → XhsRim.getChatInfo → chatId
  → XhsRim.sendTextMsg(内容)  ← 核心是 IM，不是点「物流发货」
  → 记发货日志
```

## 本仓库对接文件

| 文件 | 作用 |
|---|---|
| `resources/inject-scripts/im-send.js` | IM 桥：`deliverByOrderSn` / `fetchPendingOrders` |
| `electron/services/autoship.service.ts` | 轮询订单 + 绑定 + 调 IM 发货 |
| `electron/services/inject.service.ts` | 注入 im-send |
| `resources/inject-scripts/api-interceptor.js` | 拦截订单 API 推 `xhs-new-order` |
| `electron/main.ts` | 客服窗 `bindImWebContents`；订单 IPC |

## 使用前提

1. 客服邮箱已登录，Cookie 含 `walle-eva-auth`
2. **保持打开** `/cstools/chat`（需要页面里的 `window.XhsRim`）
3. 在「发货」页绑定商品 ID + 卡密池/文案
4. 有待发货订单时自动 IM 发出

## 手动试单

设置里或 API：`autoship:manual-trigger`，传入 `{ order_id, product_id, status:'待发货' }`
