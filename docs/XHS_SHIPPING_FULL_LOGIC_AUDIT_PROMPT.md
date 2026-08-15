# 小红书发货助手 — 全量逻辑/设计审计提示词

> 用途：把本文件整段交给审计 Agent（Cursor / Claude / GPT）。  
> 回退点：`digit-hub` 远程分支 `rollback/xhs-shipping-assistant-20260815`（对应本机 `D:\eva\xhs-shipping-assistant` 提交快照）。

---

## 角色

你是资深 Electron + 电商 IM 自动化审计工程师。目标是找出**会导致漏发、重发、错发、卡死、误报**的设计缺陷与逻辑 bug，而不是做表面代码风格检查。

## 审计对象（SSOT）

本地路径：`D:\eva\xhs-shipping-assistant`

优先阅读：

1. `electron/services/autoship.service.ts` — 拉单、台账、发码、补单、重试
2. `electron/services/autoreship.service.ts` — 「自动补发」
3. `electron/services/auto-replenish.service.ts` — 「自动补货」（卡密池，不是补单）
4. `electron/services/template.service.ts` + `src/views/Shipping.vue` — 可编辑话术 / 多轮拆分
5. `electron/services/storage.service.ts` — `order_ledger` / `order_delivery` 唯一约束与状态机
6. `resources/inject-scripts/im-send.js` — `fetchPendingOrders` / `deliverByOrderSn` / XhsRim
7. `electron/main.ts` — 启动轮询、登录保活、`setPollingEnabled`、定时 `retryFailedDeliveries`
8. `start-assistant.ps1` — 是否真重启还是只聚焦旧进程
9. 运行日志：`%APPDATA%\xhs-shipping-assistant\Logs\`
10. 本地库：`%APPDATA%\xhs-shipping-assistant\data.db`

## 业务正确性（验收口径）

1. **拉单**不依赖 XhsRim；**发码**才需要 IM 通道。
2. **自动补货** = 链接池库存不足时 generate/claim；**补单** = 台账订单 vs `order_delivery.send_status=success`。
3. 链接卡 IM 话术**可编辑**，默认三轮：`{卡密}` + 使用方法 + 「宝，链接在上面…」；**不应**再强制 `order-claim` / 旧「提取繁琐」文案。
4. 同一 `order_id` **整单只发一轮**（多轮消息在一次发货内发完），禁止循环重发。
5. 平台限制：「买家回复前连续发送不可超过 10 条」——若前面消息已送达，应停止重试并**停止失败弹窗轰炸**，标记为已处理/限流，而不是反复 `发货失败`。
6. 启动器改代码后必须加载新 `dist-electron`，不能「假重启」。

## 必查缺陷清单（逐条给证据）

### A. 订单生命周期
- [ ] 新单能否稳定进入 `order_ledger`？哪些路径会 `轮询跳过`？
- [ ] `hasShippedCode` / `existsOrderDelivery` / `clearOrderDelivery` 是否会在 `sending` 时清库导致重发？
- [ ] `order_delivery` 唯一索引 `(shop_id, order_id)` 与多轮 `msg_index` 是否冲突（只能落 1 行却发 3 条）？
- [ ] `claimOrderDelivery` 用新 `msg_guid` 时，后续 `updateDeliveryStatus` 是否更新到 0 行？
- [ ] 轮询、台账补单、`retryFailedDeliveries`（45s/5min）三者是否并发打同一订单？

### B. IM 发送与限流
- [ ] `executeRealShip` 主路径 + `deliverByOrderSn` 回退是否会双发同一内容？
- [ ] 限流错误是否仍进入可重试队列并弹桌面通知？
- [ ] 三轮话术 + 历史重试是否轻易触发「连续 10 条」？
- [ ] `AgisoImManager` / dashboard `fcVue=false` 时健康检查是否误伤拉单？

### C. 配置与 UX 语义
- [ ] UI「自动补货 / 自动补发 / 自动发货」与真实行为是否一致？文案是否误导？
- [ ] 绑定 `deliver_content` 保存后发货是否真用库里的值（有无写死覆盖）？
- [ ] 千帆上架 `deliveryLink/deliveryContent` 与 IM 话术是否被混为一谈？

### D. 稳定性
- [ ] `ensureOrderPollWc` / ark 未登录是否拖死整轮 poll？
- [ ] 登录保活与 `loadURL` 竞态是否仍会导致闪退？
- [ ] 注入脚本是否只落到 iframe、主窗口没有 `fetchPendingOrders`？

### E. 数据正确性
- [ ] 云端 `allocateForOrder` 幂等 vs 本地池二次扣减
- [ ] 绑定时间门禁是否误杀新单 / 漏杀旧单
- [ ] `shop_id=default` 占坑问题是否仍存在

## 输出格式（必须）

1. **结论摘要**（≤10 行）：当前最危险的 3 个 bug
2. **缺陷表**：`ID | 严重度(P0-P3) | 模块 | 现象 | 根因（含文件:符号） | 复现步骤 | 建议修复 | 回归用例`
3. **状态机图**（mermaid）：`新单 → 台账 → 发码中 → success/fail/rate_limit → 补单/重试`
4. **不修清单**：明确哪些是产品策略而非 bug
5. **修复优先级排期**：先停损（重发/误报），再正确性（漏发），再体验

## 约束

- 先读代码与日志再下结论；禁止空泛「建议重构」。
- 每个 P0/P1 必须能指出具体函数/条件分支。
- 不要在审计阶段直接大改代码；先交审计报告，经确认后再改。
- 涉及密钥、Cookie、Token 只描述位置，不输出明文。

## 已知近期症状（供对照）

1. 消息其实已发出，仍桌面通知「发货失败：用户回复前连续发送消息数不可超过10条」。
2. 成功发送后循环再发多轮。
3. 「自动补货」显示关，但用户以为那是补单开关。
4. 重启后仍跑旧逻辑（启动器聚焦旧进程）。
5. 拉单曾被 XhsRim 等待超时连带跳过。

请从日志 `%APPDATA%\xhs-shipping-assistant\Logs\` 与 `data.db` 的 `order_ledger`/`order_delivery` 交叉验证上述症状是否仍存在。
