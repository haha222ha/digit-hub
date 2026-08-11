# digit-hub ↔ xhs-cloud API 契约

实现：`apps/web/src/api/mock.js`  
开关：`?api=live` 或 `localStorage.xinxiang_api=live`（见 `src/config.js`）  
真服时 nginx 将 `/api/` 反代到 xhs-cloud uvicorn。

## 支付（与 xhs-cloud 对齐）

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/v1/payment/plans` | `{ plans, assess_plans:[{plan_code,label,amount,...}], addons }` |
| GET | `/api/v1/payment/channels` | `{ channels:[{channel:wxpay\|alipay,label}] }` |
| POST | `/api/v1/payment/orders` | body `{ plan_code, channel }` → `{ order_no, qrcode, payurl, status }` |
| GET | `/api/v1/payment/orders/{order_no}` | 轮询；`paid` 且未履约时 `next_action=complete_account` |
| POST | `/api/v1/payment/orders/{order_no}/complete` | 支付成功后注册/登录绑定 |
| POST | `/api/v1/payment/orders/{order_no}/claim` | 已登录用户认领已支付订单 |
| GET | `/api/v1/payment/qrcode?data=` | 服务端 PNG 二维码 |
| POST | `/api/v1/payment/notify/hwxun` | 易支付回调（仅服务端） |

### 测评套餐 plan_code

- `assess_single` — 7 天 · ¥1.99 · 报告额度 1  
- `assess_monthly` — 30 天 · ¥29.9 · 额度 30（前期前端收银台隐藏，API 保留）

发卡渠道授权码 plan 建议 `assess_single` 或 `assess_code`（权益相同，额度 1）。

落地链接：`https://monitor.xhs365.cn/?api=live&code=XXXX` → 自动跳转激活页。

权益写入 `entitlements.products.assess` + `assess_enabled`。

## 鉴权 / 验权

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/v1/auth/login-code` | `{ auth_code, device_id, device_label }` |
| POST | `/api/v1/auth/activate` | 需已登录 Bearer；body `{ auth_code }` |
| GET | `/api/v1/member/profile` | 含 entitlements |
| GET | `/api/v1/assess/access?skin_id=` | **服务端验权**：`{ allowed, reason, entitlements, skin_id }` |

完整报告阅读前必须 `allowed=true`（live 模式以服务端为准，接口失败视为未解锁，不读 localStorage 缓存权益）。

xhs-cloud 实现：`GET /api/v1/assess/access` → `assess_access_for_user`（未登录返回 `need_login_or_pay`）。

## Mock 专用

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/v1/payment/mock-pay` | `{ order_no }` — 模拟网关回调 |
| POST | `/api/v1/payment/orders/{order_no}/claim` | 与真服同形，本地履约 |

**本地演示授权码（唯一有效）：`XXCE-DEMO-8888`**

## 本地联调

```text
# mock（默认）
http://127.0.0.1:5173/

# 切真服（需同域或配置 xinxiang_api_base）
http://127.0.0.1:5173/?api=live
```

验收路径：

1. 轻结果 → 解锁 → 选套餐 →「模拟支付成功」→ 完整报告  
2. 或输入 `XXCE-DEMO-8888` → 授权码登录解锁  
3. `GET /api/v1/assess/access?skin_id=seven_sins` → `allowed: true`
