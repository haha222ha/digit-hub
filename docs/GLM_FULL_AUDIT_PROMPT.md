# 心象测 digit-hub · GLM 全模块完整审计提示词

> **用途**：整段复制给 **智谱 GLM**（或其他多模态模型）做一次覆盖全站的只读审计。  
> **产出文件建议名**：`GLM_FULL_AUDIT.md`  
> **日期基线**：2026-08-11（含支付 IP/出码、结果页 soft/full 优化后）  
> **线上**：https://monitor.xhs365.cn/  
> **代码**：`D:\选品报告\资料生产工厂\digit-hub\` · ECS `/opt/digit-hub` · API `/opt/xhs-cloud`  
> **仓库**：https://github.com/haha222ha/digit-hub （`main`）

---

## 怎么用

1. 把下方 **「主提示词」整段**贴给 GLM（可附带本文件路径让它读本地代码）。  
2. 要求 **375px 手机 + 桌面** 各走一遍主漏斗，必要时截图。  
3. 产出必须含：**证据（URL/文件/行号）+ 严重度 + 改法 + 验收**。  
4. 回收后与既有 Cursor/DeepSeek/CodeBuddy 稿对照，再合成实施清单。

**禁止**：改计分算法；建议整站改 React/Vue；伪造用户数；输出 `.env` 密码；无证据的空话。

---

## 主提示词（从这里复制到文末「输出格式」结束）

````markdown
# 角色
你是资深全栈产品审计师 + 移动端增长设计总监，同时具备：
- UX/UI（墨纸实验室气质、小红书分享卡、测评漏斗）
- 商业逻辑（自然流量 ¥1.99 vs 闲鱼/小红书发卡）
- 前后端一致性与支付安全（hwxun 微信/支付宝）
- 部署可靠性（nginx / Cloudflare / systemd）

对「心象测 digit-hub + xhs-cloud」做**完整模块只读审计**。重点不是夸奖，而是：**改哪里、怎么改、为什么、验收标准、工时 S/M/L**。

---

# 产品上下文（必读）

```
产品：心象测（digit-hub）
Slogan：三分钟，看见另一种自己
气质：INK PAPER LAB · 墨纸实验室
  - 纸纹底、墨色正文、seal #1f6b5c、ember #c45c26
  - 字体：Fraunces/Noto Serif SC + DM Sans/苹方
  - 高级感 = 克制装饰 + 强排版 + 微动效；禁止荧光/紫色 AI 模板风

商业双漏斗：
  A) 自然流量：首页 → 测 → 轻结果悬念 → ¥1.99 扫码解锁 → 完整报告 → 分享
  B) 发卡：?code= → #/activate → 权益生效 → 测/读报告

技术：
  - 前端：原生 ES Module SPA（无 React/Vue）+ Service Worker
  - 后端：FastAPI xhs-cloud + PostgreSQL
  - 支付：hwxun 易支付 mapi（微信 pay.hwxun.cn / 支付宝 xapay.hwxun.cn）
  - 部署：nginx + Cloudflare（源站常 :80）+ systemd xhs-cloud-api
  - 测评 OS：Skin × Tone(rigorous/humor/funny) × Base
```

---

# 已上线 / 勿再当 P0 重复报（除非你有新证据证伪）

以下在 2026-08-11 前多轮已修或已确认；**不要再列为「必须立刻修」**，除非线上仍复现：

1. 生产域名自动 `live` API（`config.js` isProductionHost）
2. 支付注册：已非 `prompt()`，改为表单
3. 支付轮询 timer 清理；drawer `body overflow:hidden`
4. nginx gzip；`/api/v1/auth/` 限流；`/admin/` 500（index.htmlindex.html）已修
5. 首页今日主推大卡 + rail 精简；目录 chip 筛选；lane 文案友好化
6. intro Tone claim；无 `styles` 皮诚实提示
7. play 25/50/75 里程碑 + 墨滴进度
8. 轻结果 sticky 解锁 + ¥9.9→¥1.99；支付点渠道即出码
9. 支付 `clientip` 公网 IPv4 清洗（修「用户IP地址不合法」）
10. 下单限频 + pending 复用；nginx payment/orders 限流
11. 结果页（新）：Hero 下 outcome-matched CTA；checklist 折叠；雷达 tease 上移；分享「一键导出」；Full TOC；深度折叠；分享卡火漆「心」
12. JWT 有过期；支付 notify 有验签（若你质疑，请给代码证据）

**仍开放 / 可审重点**：
- 15 套迁入皮缺 `styles.humor/funny`（仅 seven_sins/mbti16/mental_age 完整）
- Soft/Full 结果体验可继续打磨（Tone 渗入场景/week-plan、7 日打卡等）
- 无真实社会证明数据（禁止编造人数）
- 退款政策未定
- 会员选品 portal（`/member`）与测评站体验一致性
- 长皮（mbti16 72 题）疲劳与缓存/SW 策略
- 后台运营闭环与安全加固空间

---

# 必访 URL（375px + 桌面）

| 模块 | URL |
|------|-----|
| 首页 | https://monitor.xhs365.cn/ |
| 目录 | https://monitor.xhs365.cn/#/tests |
| Intro（风格） | https://monitor.xhs365.cn/#/t/seven_sins |
| Intro（缺 styles） | https://monitor.xhs365.cn/#/t/love_brain |
| Play | https://monitor.xhs365.cn/#/t/seven_sins/play |
| Soft 结果 | 测完后 `#/t/:id/result?rid=` |
| Full 报告 | `#/report/:id`（需解锁） |
| 激活 | https://monitor.xhs365.cn/#/activate |
| 会员中心 | https://monitor.xhs365.cn/#/account |
| 选品会员页 | https://monitor.xhs365.cn/member |
| 运营后台 | https://monitor.xhs365.cn/admin/ |
| API 健康 | https://monitor.xhs365.cn/api/v1/health |
| 支付套餐 | https://monitor.xhs365.cn/api/v1/payment/plans |
| 支付渠道 | https://monitor.xhs365.cn/api/v1/payment/channels |

后台账号在 ECS `/opt/xhs-cloud/.env`（`XHS_CLOUD_ADMIN_*`）。**勿写入报告。**

---

# 代码与资产地图（按模块）

## M0 文档 / 契约
- `docs/DESIGN_SYSTEM.md` `docs/ASSESS_OS.md` `docs/GEN_OS.md`
- `docs/DESIGN_UX_FINAL_PLAN.md` `docs/RESULT_PAGE_FINAL_PLAN.md`
- `packages/cloud-api/CONTRACT.md` `packages/cloud-api/AUTH_PRODUCTS.md`

## M1 前端壳与路由
- `apps/web/index.html` `apps/web/sw.js` `apps/web/manifest.webmanifest`
- `apps/web/src/main.js` `router.js` `config.js` `pages.js`

## M2 设计系统 / Tone
- `apps/web/src/styles/tokens.css` `apps/web/src/styles/app.css`
- `apps/web/styles/{rigorous,humor,funny,catalog}.json`
- `apps/web/src/style/engine.js`

## M3 测评皮与内容
- `packages/skins/catalog.json` `packages/skins/*.json`
- `packages/content-packs/` `packages/tones/`（若存在）
- 字段：`question.styles.rigorous|humor|funny = { q, o:[{t}] }`；计分 `o[].s` 仅根级

## M4 测题会话
- `apps/web/src/quiz/session.js`（进度、退出挽回、选项交互）

## M5 结果 / 分享 / PDF
- `apps/web/src/result/{value,scenes,narrative,retest}.js`
- `apps/web/src/share/exportCard.js` `exportPdf.js`
- `apps/web/src/viz/{norms,history}.js`

## M6 支付 / 权益 / 激活
- `apps/web/src/api/{client,access,activate,mock}.js`
- `pages.js` → `openPayDrawer` `startCheckout`
- `services/xhs-cloud/cloud_deploy/cloud_api/{payment_service,payment_plans,hwxun_pay,request_ip}.py`
- `services/xhs-cloud/cloud_deploy/docs/PAYMENT_HWXUN_SETUP.md`

## M7 运营后台
- `apps/admin/index.html`
- `cloud_api/admin_portal_*.py` `admin_auth_codes_service.py`

## M8 选品会员 Portal（同源 API）
- `cloud_deploy/assets/member_portal.html`

## M9 部署 / nginx / 运维
- `deploy/quick_update.sh` `deploy/nginx_apply.sh` `deploy/api_fresh_install.sh`
- ECS：`/etc/nginx/conf.d/monitor.xhs365.cn.conf` `digit-hub-rate-limit.conf`
- `systemd/xhs-cloud-api.service`

## M10 本地 Gen OS（不上云，可选审）
- `apps/gen-os/` `docs/GEN_OS.md`

根目录：`D:\选品报告\资料生产工厂\digit-hub\`  
运行副本：`/opt/digit-hub` + `/opt/xhs-cloud`

---

# 审计模块清单（逐项必须覆盖）

对每个模块输出：**现状一句 → 问题（可空）→ 证据 → 建议 → 严重度 P0–P3 → 工时 S/M/L → 验收**。

## A. 品牌与视觉系统
- 首屏品牌信号是否够强（墨纸实验室记忆点）
- seal/ember 是否用在 CTA/解锁/进度的正确位置
- 375px 字体阶梯、行高、触控热区、safe-area
- 动效：是否「有仪式感」还是噪音

## B. 首页（Home）
- 今日主推大卡 vs rail「更多」信息密度与转化
- A2HS 位置是否抢 CTA
- 主 CTA 路径是否清晰

## C. 目录（#/tests）
- 六组 IA、chip 筛选、promise 可读性
- live/coming、分钟数、lane 文案
- 空态 / 筛选无结果

## D. Intro（开测前）
- Tone 三选一 claim 是否可读、可切换
- 无 styles 皮的诚实提示是否到位
- youGet / disclaimer / 开始按钮层级

## E. Play（测题）
- 一题一屏、进度、里程碑、选项反馈
- 离开挽回、上一题、横屏/键盘
- 长皮（mbti16）疲劳风险

## F. Soft 轻结果（付费前）
- 身份首屏 + Hero CTA + sticky 双保险是否够
- Partial reveal：露什么/锁什么是否「有货」
- checklist 折叠、场景钩子数量、模糊雷达位置
- outcome-matched CTA 文案是否贴类型
- **禁止建议伪造解锁人数**

## G. 支付抽屉 / 下单
- 渠道点击即出码、限频提示、错误文案可读性
- ¥9.9→¥1.99 锚价、授权码折叠
- 支付成功 → 注册/claim → 进 Full 是否顺
- IP/限频/复用 pending 是否合理（可读 `request_ip.py` `payment_service.py`）

## H. Full 完整报告
- TOC 锚点、章节折叠、7 日计划可执行性
- 场景 + 行动句价值
- 同龄对照 / 历史曲线 / 深度文信息过载风险
- PDF / 分享 / 复测回流

## I. 分享传播
- 3:4 卡是否「小红书值得发」
- 预填文案是否含类型名 + 回站动机
- Web Share vs 下载路径

## J. Tone 兑现（严谨/幽默/搞笑）
- UI token + hero/chrome 是否真变
- 题目 `styles` 覆盖率（抽查 love_brain vs seven_sins）
- 结果 scenes/week-plan 是否几乎无 Tone（已知缺口，给可落地方案）

## K. 内容资产（Skins）
- catalog 18 live 皮结构一致性
- 15 套缺 styles 的优先级建议（哪几套先补 ROI 最高）
- 计分模式：score_bands / mbti / holland / seven_sins 结果质量差异

## L. 激活 / 发卡漏斗（#/activate）
- `?code=` 深链、错误态、成功后跳转
- 与自然流量权益模型是否冲突

## M. 会员中心（#/account）
- 登录态、权益展示、客服入口、续费路径

## N. 选品会员 Portal（/member）
- 与测评站视觉/支付交互一致性
- 点渠道即出码、限频是否与测评站对齐

## O. 运营后台（/admin/）
- 授权码生成/导出/吊销
- 客服二维码上传 → `/assets/` 预览
- 鉴权、会话过期、误操作风险

## P. API 契约与安全
- `/api/v1/payment/*` `/api/v1/auth/*` `/api/v1/assess/access` `/api/v1/portal/admin/*`
- JWT、Sync Key、Admin Portal Token 边界
- 支付回调验签、幂等、订单状态机
- 限流是否足够（auth + payment）
- 日志是否可能泄露 PII/密钥

## Q. 部署与可靠性
- `quick_update.sh` 覆盖面（前端+API+nginx）
- Cloudflare / SSL / 源站 :80 认知是否正确
- SW 缓存导致旧版风险与 cache bust（当前约 v21 / SW v10）
- 单点：API down、支付网关 down、PG down 的用户可见态

## R. 合规与信任
- 免责声明位置（娱乐向、非临床）
- 禁止恐吓/伪诊断口吻
- 退款/售后文案是否应出现（无政策则建议「明确不做」）

---

# 行业参照（结果/漏斗，勿生搬硬套）
- Partial reveal：身份可分享，深度付费
- First viewport = 类型名 + 金句
- One primary CTA；outcome-matched 文案
- Share in first fold；预填含类型名
- Scan don't essay（轻结果短、完整报告可折）

---

# 输出格式（严格）

## 1. 执行摘要（≤7 条 bullet）
最大风险 / 最大杠杆 / 总体健康度（1–10）

## 2. 全模块评分表（每项 1–5 + 一句理由）
| 模块 | 分 | 理由 |
|------|----|------|
| A 品牌视觉 | | |
| B 首页 | | |
| C 目录 | | |
| D Intro | | |
| E Play | | |
| F Soft 结果 | | |
| G 支付 | | |
| H Full 报告 | | |
| I 分享 | | |
| J Tone | | |
| K 内容/Skins | | |
| L 激活发卡 | | |
| M 会员中心 | | |
| N 选品 Portal | | |
| O 运营后台 | | |
| P API/安全 | | |
| Q 部署 | | |
| R 合规信任 | | |

## 3. 发现清单（主表）
| ID | 模块 | 问题 | 严重度 | 证据(URL/文件) | 建议改法 | 工时 | 验收 |
|----|------|------|--------|----------------|----------|------|------|

严重度：P0 阻断转化/资金/安全 · P1 显著体验 · P2 优化 · P3 锦上添花

## 4. 明确「不做」清单
与品牌/信任/政策冲突的诱惑方案及原因（如假人数、邮箱门、整站重写）

## 5. 路线图
- **本周（≤5 项）**
- **两周**
- **可延后**

## 6. 若只能改 3 处
最高 ROI 三项 + 理由（必须跨模块思考，不要全挤在同一页）

## 7. 给实施者的文件级 checklist
按路径列出「打开此文件改什么」

---

# 约束
- 不改计分与维度算法
- 不引入 React/Vue/新构建链（除非论证 ROI 极大）
- 区分 mock 与 live；生产以 `monitor.xhs365.cn` 为准
- 价格文案可优化，勿擅自改后端金额逻辑而不说明
- 每条建议必须可静态 SPA 或现有 FastAPI 内落地
- 不要输出真实密码或完整 `.env`
````

---

## 附：相关专项文档（可选用，完整审计不必全贴）

| 文档 | 用途 |
|------|------|
| `docs/GLM_AUDIT_PROMPT.md` | 早期全量版（部分「已修项」可能过时） |
| `docs/GLM_DESIGN_UX_PROMPT.md` | 视觉/交互专项 |
| `docs/RESULT_PAGE_AUDIT_PROMPT.md` | 仅结果页 |
| `docs/DEEPSEEK_SKIN_STYLES_PROMPT.md` | 15 套皮补 styles 文案 |
| `docs/RESULT_PAGE_FINAL_PLAN.md` | 结果页已实施合成 |
| `docs/DESIGN_UX_FINAL_PLAN.md` | 前期 UX 已实施合成 |

**建议**：完整审计只用本文主提示词；避免旧稿把已修 bug 再标成 P0。

---

## 部署回归（审计后若实施）

```bash
cd /opt/digit-hub && sudo git pull && sudo bash deploy/quick_update.sh
```
