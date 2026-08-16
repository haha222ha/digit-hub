# 心理分销 digit-hub · 发货助手对接审计（2026-08-16）

## 结论

**发货 allocate 自愈已在云端落地，本地 30/50 补货不依赖再改云端即可用。**  
若线上 `psy.xhs365.cn` 已部署含 `allocate_for_order_with_autotopup` 的版本，无需为「库存不足自动 generate」单独发版；仅当源站落后于此能力时才需 `quick_update.sh`。

## 云端已具备（`cloud_api`）

| 能力 | 路径 / 函数 | 说明 |
|---|---|---|
| 查额度 | `GET /api/quota/info` | `remaining_quota` |
| 生成链接扣额度 | `POST /api/links/generate` | 单次 ≤50 |
| 领取入池 | `POST /api/faka/claim-links` | 发卡助手本地池 |
| 库存 | `GET /api/faka/inventory` | unclaimed / claimed |
| 商品↔测题绑定同步 | `POST /api/ship/bindings/sync` | allocate 依赖此绑定 |
| **按单分配 + 自愈** | `POST /api/ship/allocate` → `allocate_for_order_with_autotopup` | 库存不足 → generate（默认 50）→ 再分配 |
| 自助领链接 | `POST /api/order-claim` | 同样 autotopup |
| 一键补齐缺失测题 | `generate_missing_links` | 控制台用，默认按测题补 |

环境变量：`XHS_DIST_ALLOCATE_AUTOTOPUP`（默认 **50**，上限 50）。

## 与本地发货助手分工

| 场景 | 谁负责 |
|---|---|
| 订单 IM 发链接 | 云端 `allocate`（幂等 + 自愈） |
| 本地池预览 / 巡检补货 | 本地 `AutoReplenish`：≤30 → generate+claim 50 |
| 额度不足停补货 | 本地暂停巡检 + 桌面通知；云端 allocate 抛「额度不足」 |
| 未绑测题 | 云端拒绝；本地须先绑卡并 `bindings/sync` |

## 部署判定

```bash
# 源站有 autotopup 即可（函数名或环境变量）
grep -n allocate_for_order_with_autotopup /opt/xhs-cloud/cloud_deploy/cloud_api/dist_service.py
```

有 → **不必**为本次发货自愈再部署。  
无 → `cd /opt/digit-hub && sudo bash deploy/quick_update.sh`（以你们实际部署路径为准）。

## 本次本地仍补齐的优化

1. allocate 返回「未绑定」时：先 `bindings/sync` 再试一次  
2. 额度不足时：补货巡检暂停（不误伤「仅 claim」）  
3. 店铺未绑定商品：标题规则一键绑 `link_card` + 默认补货 30/50  
