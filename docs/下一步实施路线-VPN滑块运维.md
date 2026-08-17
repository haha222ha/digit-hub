# 下一步实施路线 + 闲鱼 VPN/滑块运维方案

> 2026-08-17 · 与「平台隔离发卡」原则一致

---

## A. 业务实施路线（建议顺序）

### 总原则

1. **虚拟**：XHS / 闲鱼 **各自生成、各自发卡**（云端可统一「库存账本」，但领取批次按渠道隔离）。  
2. **实体**：闲鱼出单 → PDD 下单（已有 bot）→ 回填运单。  
3. **不改坏**现网闲鱼卡密自动发货。

### 阶段图

```
Week 1-2   虚拟隔离闭环（闲鱼）
Week 2-3   实体 PDD 适配器打通 1 单
Week 3+    多店差异化上架 + 侵权过滤
Later      XHS App 自动采购 / 订单级 allocate
```

### Phase 1 — 虚拟：闲鱼独立库存（现在就做）

| 步骤 | 做什么 | 验收 |
|------|--------|------|
| 1.1 | 云端为闲鱼渠道单独 claim 链接/卡密（或后台手工导入闲鱼 `data` 卡） | 闲鱼卡池有货，且 **不来自** XHS unused 拷贝 |
| 1.2 | `xy_item_id` ↔ `psy_test_code` 映射表（运营维护） | 一商品一测题 |
| 1.3 | 闲鱼 `batch-save` 绑货 + 补货脚本（`claim_from_cloud`，不是 pull XHS） | 付款自动发卡 |
| 1.4 | XHS 发货助手继续自己的补货策略 | 两边库存数量独立 |

**明确不做：** 长期用 `pull_unused_cards` 从发货助手扒卡到闲鱼。

### Phase 2 — 实体：闲鱼 ← PDD（下一优先）

| 步骤 | 做什么 | 验收 |
|------|--------|------|
| 2.1 | `PddUpstreamAdapter` 调 `01-拼多多自动下单系统` `/order` | Mock 换成真下单 |
| 2.2 | 闲鱼 `pending_ship` 虚实分流（physical 跳过卡密） | 虚拟回归仍过 |
| 2.3 | 地址标准化 + 幂等键 | 不重复下单 |
| 2.4 | 运单回填（先 stub 可联调，再真实 consign） | job=`done` |

### Phase 3 — 选品上架工业化

| 步骤 | 做什么 |
|------|--------|
| 3.1 | 侵权/品牌过滤 + 人工复核队列 |
| 3.2 | 主图二创 + 标题差异化 → 闲鱼多店分发 |
| 3.3 | 10 店：独立代理/配置目录，错峰擦亮 |

### Phase 4 — 增强

- 闲鱼出单 → 云端 `allocate` 实时发卡（零预存）  
- XHS App 逆向采购  
- 毛利/经营性卖家阈值看板  

### 文档索引

- 总调研：`D:\Program Files\ProductAnalyzer\docs\三平台对接-闲鱼中枢-需求与可行性调研.md`  
- 导卡对接：`digit-hub/docs/评测发卡-闲鱼导卡绑货对接.md`  
- 代发契约：`digit-hub-restore-.../restore\DROPSHIP_CONTRACT_v0.1.md`

---

## B. VPN 一开就要重登：原因与做法

### 原因（高概率）

闲鱼 / 淘系风控看 **出口 IP + Cookie 环境**。VPN 开关会换出口 IP，会话立刻变「异地」，触发 Token 失效 / 滑块 / 要求重登。这和「系统坏了」无关，是风控常态。

### 推荐运维策略

| 场景 | 建议 |
|------|------|
| 闲鱼挂机发货 / 补发 / 擦亮 | **走国内直连**，不要挂全局 VPN |
| 推 GitHub / 拉外网依赖 | **分应用代理**（仅 Cursor/Git/浏览器扩展走 VPN），或开 VPN 干完立刻关 |
| 必须开 VPN 时 | 预期要重登；先关自动滑块，用原装 Chrome 手动过一次 |

可在系统代理里把 `goofish.com` / `taobao.com` / `alicdn.com` 设为 **直连**（bypass），避免误走 VPN。

---

## C. 自动滑块失败、原装 Chrome 一次成功：原因与做法

### 原因

系统默认常拉起 **Playwright/Drission 的 Chromium（或自动化环境）**，指纹/无头/行为与真人 Chrome 差一截，淘系滑块通过率低。你本机 **Google Chrome 手动拖** 环境最「像真人」，所以一次过。

系统里其实已有相关能力：

- 滑块可优先 `channel=chrome`（系统 Chrome）  
- 可设 `captcha.slider_mode=real_mouse`  
- 可设 `captcha.local_slider_disabled=true` **关掉自动滑**，改手动  
- 发布可用 `start-chrome-cdp.bat` + `BROWSER_CDP_URL=http://127.0.0.1:9222`

### 推荐组合（按稳妥程度）

**方案 1（最稳，推荐日常挂机）**

1. 后台关闭本地自动滑块：`captcha.local_slider_disabled = true`  
2. Token/风控弹出时跑手动脚本（或扫码重登）  
3. VPN 与闲鱼业务分离（见上）

**方案 2（还想自动滑时）**

1. 确认已装系统 Chrome  
2. 后台把滑块模式改为 **`real_mouse`**（真人鼠标）  
3. 避免无头；尽量让它走系统 Chrome 通道  
4. 仍失败 → 立刻停自动重试，改手动（狂失败会加重「被挤爆」）

**方案 3（发布/CDP）**

```bat
D:\Program Files\ProductAnalyzer\xianyu-auto-reply\start-chrome-cdp.bat
```

各服务 `.env`：

```env
BROWSER_CDP_URL=http://127.0.0.1:9222
```

---

## D. 本周可执行清单（给你勾）

- [ ] 闲鱼业务机：**默认不挂全局 VPN**；Git 用分应用代理  
- [ ] 打开 `local_slider_disabled`，减少 Chromium 空滑污染风控  
- [ ] 为闲鱼渠道单独从云端 claim / 手工导卡（隔离库存）  
- [ ] 选 1 个闲鱼测品绑卡，回归自动发货  
- [ ] 并行启动 Phase 2：PDD 适配器对接 dropship job（先 1 单）  

---

## E. 下一步开发优先级（给 Agent）

1. **P0b**：`xy_card_bridge.py` 实现 `claim_from_cloud`（闲鱼专用批次）  
2. **P0c**：闲鱼付款分流 + PDD adapter 最小闭环  
3. **运维**：文档化「VPN bypass + 手动滑块」成 bat/一键脚本  
4. 不上：从 XHS 本地 unused 长期同步到闲鱼  
