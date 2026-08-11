# GLM 全量审计指南 · 心象测 digit-hub

本文档供 **智谱 GLM**（或其他多模态大模型）对系统进行视觉、交互、商业逻辑、技术一致性、安全与部署的全方面只读审计。

---

## 一、线上环境（视觉 / 交互审计必访 URL）

| 角色 | URL |
|------|-----|
| 测评主站（live） | https://monitor.xhs365.cn/?api=live |
| 激活页 | https://monitor.xhs365.cn/?api=live#/activate |
| 带码激活 | https://monitor.xhs365.cn/?api=live&code={授权码} |
| 测评目录 | https://monitor.xhs365.cn/?api=live#/tests |
| 会员中心 | https://monitor.xhs365.cn/?api=live#/account |
| 运营后台 | https://monitor.xhs365.cn/admin/ |
| API 健康检查 | https://monitor.xhs365.cn/api/v1/health |
| 支付套餐 | https://monitor.xhs365.cn/api/v1/payment/plans |

**后台登录**：账号密码在 ECS `/opt/xhs-cloud/.env` 的 `XHS_CLOUD_ADMIN_USER` / `XHS_CLOUD_ADMIN_PASS`。**勿写入审计报告或提交 Git。**

---

## 二、绝对路径

### 2.1 本地开发（Windows）

```
D:\选品报告\资料生产工厂\digit-hub\                          # monorepo 根
D:\选品报告\资料生产工厂\digit-hub\README.md
D:\选品报告\资料生产工厂\digit-hub\LOCAL_ACCEPTANCE.md
D:\选品报告\资料生产工厂\digit-hub\docs\GLM_AUDIT_PROMPT.md   # 本文档
D:\选品报告\资料生产工厂\digit-hub\docs\ASSESS_OS.md          # 测评 OS 架构
D:\选品报告\资料生产工厂\digit-hub\docs\DESIGN_SYSTEM.md      # 视觉规范
D:\选品报告\资料生产工厂\digit-hub\docs\GEN_OS.md

D:\选品报告\资料生产工厂\digit-hub\apps\web\                  # 心象测 SPA（用户端）
D:\选品报告\资料生产工厂\digit-hub\apps\web\index.html
D:\选品报告\资料生产工厂\digit-hub\apps\web\src\main.js       # 路由入口
D:\选品报告\资料生产工厂\digit-hub\apps\web\src\pages.js      # 全部页面（含 activate/支付/结果）
D:\选品报告\资料生产工厂\digit-hub\apps\web\src\config.js     # mock/live、?code= 跳转
D:\选品报告\资料生产工厂\digit-hub\apps\web\src\router.js
D:\选品报告\资料生产工厂\digit-hub\apps\web\src\api\          # API 客户端
D:\选品报告\资料生产工厂\digit-hub\apps\web\src\api\access.js
D:\选品报告\资料生产工厂\digit-hub\apps\web\src\api\activate.js
D:\选品报告\资料生产工厂\digit-hub\apps\web\src\api\mock.js
D:\选品报告\资料生产工厂\digit-hub\apps\web\src\api\client.js
D:\选品报告\资料生产工厂\digit-hub\apps\web\src\result\       # 轻/重结果逻辑
D:\选品报告\资料生产工厂\digit-hub\apps\web\src\result\value.js
D:\选品报告\资料生产工厂\digit-hub\apps\web\src\result\scenes.js
D:\选品报告\资料生产工厂\digit-hub\apps\web\src\styles\app.css
D:\选品报告\资料生产工厂\digit-hub\apps\web\sw.js             # Service Worker

D:\选品报告\资料生产工厂\digit-hub\apps\admin\                # 浏览器运营后台
D:\选品报告\资料生产工厂\digit-hub\apps\admin\index.html

D:\选品报告\资料生产工厂\digit-hub\apps\gen-os\               # 本地测评生成 OS（5188，不上云）
D:\选品报告\资料生产工厂\digit-hub\apps\faka\                 # 云发卡预留

D:\选品报告\资料生产工厂\digit-hub\packages\base\             # A2HS / 顶栏基座
D:\选品报告\资料生产工厂\digit-hub\packages\skins\            # 测评皮 JSON + catalog
D:\选品报告\资料生产工厂\digit-hub\packages\style-packs\      # 三风格包
D:\选品报告\资料生产工厂\digit-hub\packages\content-packs\    # 题目/结果文案
D:\选品报告\资料生产工厂\digit-hub\packages\cloud-api\        # API 契约文档
D:\选品报告\资料生产工厂\digit-hub\packages\cloud-api\CONTRACT.md
D:\选品报告\资料生产工厂\digit-hub\packages\cloud-api\AUTH_PRODUCTS.md

D:\选品报告\资料生产工厂\digit-hub\services\xhs-cloud\cloud_deploy\           # 后端源码（同步到 ECS）
D:\选品报告\资料生产工厂\digit-hub\services\xhs-cloud\cloud_deploy\cloud_api\main.py
D:\选品报告\资料生产工厂\digit-hub\services\xhs-cloud\cloud_deploy\cloud_api\payment_plans.py
D:\选品报告\资料生产工厂\digit-hub\services\xhs-cloud\cloud_deploy\cloud_api\auth_product_registry.py
D:\选品报告\资料生产工厂\digit-hub\services\xhs-cloud\cloud_deploy\cloud_api\admin_portal_auth.py
D:\选品报告\资料生产工厂\digit-hub\services\xhs-cloud\cloud_deploy\cloud_api\admin_portal_service.py
D:\选品报告\资料生产工厂\digit-hub\services\xhs-cloud\cloud_deploy\cloud_api\admin_auth_codes_service.py
D:\选品报告\资料生产工厂\digit-hub\services\xhs-cloud\cloud_deploy\cloud_api\member_contact_settings.py
D:\选品报告\资料生产工厂\digit-hub\services\xhs-cloud\cloud_deploy\assets\
D:\选品报告\资料生产工厂\digit-hub\services\xhs-cloud\cloud_deploy\assets\uploads\
D:\选品报告\资料生产工厂\digit-hub\services\xhs-cloud\cloud_deploy\systemd\xhs-cloud-api.service

D:\选品报告\资料生产工厂\digit-hub\deploy\
D:\选品报告\资料生产工厂\digit-hub\deploy\quick_update.sh
D:\选品报告\资料生产工厂\digit-hub\deploy\nginx_apply.sh
D:\选品报告\资料生产工厂\digit-hub\deploy\api_fresh_install.sh
D:\选品报告\资料生产工厂\digit-hub\deploy\generate_auth_codes.sh
```

### 2.2 生产 ECS（Linux）

```
/opt/digit-hub/                                    # Git 仓库（前端 + deploy + 后端源码副本）
/opt/digit-hub/apps/web/                           # nginx 静态根 WEB_ROOT
/opt/digit-hub/apps/admin/index.html               # 运营后台
/opt/digit-hub/deploy/quick_update.sh              # 日常热更新
/opt/digit-hub/deploy/nginx_apply.sh

/opt/xhs-cloud/                                    # 运行中的 API
/opt/xhs-cloud/.env                                # 密钥（JWT/DB/管理员/支付）
/opt/xhs-cloud/cloud_deploy/cloud_api/main.py
/opt/xhs-cloud/cloud_deploy/assets/uploads/        # 上传的客服二维码
/opt/xhs-cloud/venv/

/etc/nginx/conf.d/monitor.xhs365.cn.conf           # 域名 vhost
/etc/nginx/conf.d/assess.xinxiang.conf             # default_server
/var/log/nginx/error.log
/var/log/nginx/access.log

/etc/systemd/system/xhs-cloud-api.service
```

### 2.3 Git 仓库

```
https://github.com/haha222ha/digit-hub  (branch: main)
```

### 2.4 本地预览（GLM 无法访问线上时）

```bash
cd D:\选品报告\资料生产工厂\digit-hub\apps\web
python -m http.server 5173
# mock:  http://127.0.0.1:5173/
# live:  仍建议用线上 https://monitor.xhs365.cn/?api=live
```

---

## 三、业务背景（审计上下文）

```
产品名：心象测（digit-hub）
定位：移动端测评 SPA + xhs-cloud 后端

双渠道获客：
  1) 站内自然流量：免费轻结果 → 结果页扫码 ¥1.99 单次解锁 或 填授权码
  2) 闲鱼/小红书发卡：链接带 ?code= → #/activate 激活

定价：
  - assess_single ¥1.99（7 天 · 1 次报告）
  - assess_monthly ¥29.9 保留但前端收银台隐藏

技术栈：
  原生 ES Module SPA（无 React/Vue）+ FastAPI + PostgreSQL + nginx + Cloudflare

复用：
  vuemonitor/xhs-cloud 内核（授权码、会员、支付、portal admin）
```

---

## 四、主审计提示词（复制给 GLM）

```markdown
# 角色
你是资深全栈产品审计师，擅长 UX/UI、商业漏斗、前后端一致性、支付与安全、部署可靠性。
请对「心象测 digit-hub + xhs-cloud」做**只读审计**，输出可执行的改进清单，不要泛泛而谈。

# 审计范围

## 1. 视觉与交互（必做）
访问以下 URL，移动端（375px）与桌面各评估一次，必要时截图说明：
- https://monitor.xhs365.cn/?api=live （首页）
- https://monitor.xhs365.cn/?api=live#/tests （目录）
- 任选 1 个测评完整走通：intro → play → 轻结果 → 解锁抽屉 → 完整报告
- https://monitor.xhs365.cn/?api=live#/activate （激活页）
- https://monitor.xhs365.cn/?api=live#/account （会员中心）
- https://monitor.xhs365.cn/admin/ （运营后台，若有测试账号则登录审计）

对照视觉规范：docs/DESIGN_SYSTEM.md（墨纸实验室气质）

## 2. 商业逻辑与漏斗
- 自然流量 vs 发卡 (?code=) 两条路径是否清晰、无断点
- live 模式是否禁止 localStorage 假解锁（access.js / value.js）
- 轻结果收紧策略（隐藏百分比、模糊场景）是否影响转化又保悬念
- ¥1.99 单次价与收银台 SKU 是否与 API payment/plans 一致
- 激活成功后权益是否能在 assess/access 验权通过

## 3. 信息架构与路由
- Hash 路由完整性（#/activate、#/t/:id/result 等）
- mock 默认 vs ?api=live 切换是否易误导生产用户
- Service Worker / CDN 缓存是否导致旧版 JS（404「页面不存在」）

## 4. 运营后台
- 授权码生成/导出 TSV、吊销流程
- 客服微信上传 → /assets/uploads 预览 → 保存配置 闭环
- 反馈/关键词/系统状态 Tab 可用性

## 5. 后端与契约
- 对照 packages/cloud-api/CONTRACT.md 与 AUTH_PRODUCTS.md
- portal admin API (/api/v1/portal/admin/*) 鉴权边界
- 支付回调、授权码 activate、assess/access 验权链路

## 6. 部署与运维
- nginx：/api/、/assets/、/admin/ 三条路径
- quick_update 热更新是否覆盖前端 + API
- 单点故障、日志可观测性

# 代码库路径（本地只读审计）
根目录：D:\选品报告\资料生产工厂\digit-hub\

关键文件：
- apps/web/src/main.js, pages.js, config.js
- apps/web/src/api/access.js, api/activate.js, api/mock.js
- apps/web/src/result/value.js, result/scenes.js
- apps/admin/index.html
- services/xhs-cloud/cloud_deploy/cloud_api/main.py
- services/xhs-cloud/cloud_deploy/cloud_api/payment_plans.py
- services/xhs-cloud/cloud_deploy/cloud_api/auth_product_registry.py
- deploy/nginx_apply.sh, deploy/quick_update.sh
- packages/cloud-api/CONTRACT.md
- docs/DESIGN_SYSTEM.md, docs/ASSESS_OS.md

# 输出格式（严格遵守）

## A. 执行摘要（5 条以内）

## B. 漏斗与商业逻辑
| 问题 | 严重度 P0-P3 | 证据 | 建议 | 验收方式 |

## C. 视觉与交互
| 问题 | 页面 | 严重度 | 建议改法 | 参考模式 |

## D. 技术债与一致性
前后端契约偏差、缓存、路由问题

## E. 安全与合规
鉴权、密钥暴露、支付、PII

## F. 部署与可靠性

## G. 优先级路线图
- 本周必做（估工时 S/M/L）
- 两周内
- 可延后

## H. 若只能改 3 处
最高 ROI 的 3 个改动及理由

# 约束
- 不要建议重写为 React/Vue，除非有充分理由
- 区分「生产 live 路径」与「mock 演示路径」
- 每条建议必须可验证（写出如何验收）
- 不要输出真实密码或 .env 内容
```

---

## 五、分模块子提示词

### 5.1 视觉 / 交互专项

```markdown
仅审计心象测移动端 UX/UI。打开 https://monitor.xhs365.cn/?api=live ，
按 docs/DESIGN_SYSTEM.md 的「墨纸实验室」气质评估：

- 首屏 3 秒是否传达价值
- 测题页触控目标、进度感知、退出挽回
- 轻结果「悬念 vs 转化」平衡（value.js、scenes.js）
- 支付抽屉层级、价格感知、信任元素
- 激活页 / card 买家路径是否像「已付费」体验

输出：截图位说明 + 改 CSS/文案的具体位置（文件路径:行号范围）

代码：
- D:\选品报告\资料生产工厂\digit-hub\apps\web\src\styles\app.css
- D:\选品报告\资料生产工厂\digit-hub\apps\web\src\pages.js
```

### 5.2 商业逻辑 / 漏斗专项

```markdown
审计双渠道漏斗（自然流量 ¥1.99 vs 发卡 ?code=）：

阅读 CONTRACT.md、config.js、bootstrapCardCodeRedirect、renderActivate、
payment drawer、access.js。

列出：每一步用户状态、权益存储位置、服务端验权点、可作弊路径。

重点：
- live 模式 localStorage 解锁是否已封堵
- assess_single 1.99 端到端

输出 Mermaid 漏斗图 + 断点清单。
```

### 5.3 运营后台专项

```markdown
审计：
- D:\选品报告\资料生产工厂\digit-hub\apps\admin\index.html
- portal API（admin_portal_service.py、main.py /api/v1/portal/admin/*）

走查：登录 → 生成 assess 码 → 复制 TSV → 客服微信上传 → 保存 → 反馈 Tab

找：无 try/catch 的操作、缺少 loading、权限边界、与 vuemonitor 能力差距
```

### 5.4 部署 / 基础设施专项

```markdown
审计 deploy/nginx_apply.sh、quick_update.sh 与 ECS 路径：
/opt/digit-hub、/opt/xhs-cloud、/etc/nginx/conf.d/

历史问题：
- /admin/ index.htmlindex.html
- #/activate 缓存导致「页面不存在」
- /assets/ 未反代导致二维码预览失败

输出：nginx 配置检查表 + 发布 checklist + 回滚步骤
```

---

## 六、建议附件（喂给 GLM 的优先级）

| 优先级 | 文件 |
|--------|------|
| P0 | `packages/cloud-api/CONTRACT.md` |
| P0 | `packages/cloud-api/AUTH_PRODUCTS.md` |
| P0 | `docs/DESIGN_SYSTEM.md` |
| P0 | 线上各页面截图（手机 + PC） |
| P1 | `apps/web/src/pages.js`（体量大，可分段） |
| P1 | `services/xhs-cloud/cloud_deploy/cloud_api/main.py` |
| P2 | `deploy/nginx_apply.sh` |
| P2 | `apps/admin/index.html` |

---

## 七、已知历史问题（供审计对照是否已修复）

1. nginx `/admin/` 曾返回 500（index.htmlindex.html 路径拼接）— 已用 exact alias 修复
2. `#/activate` 曾显示「页面不存在」— 旧 main.js 缓存 / 未跑 quick_update
3. 客服微信选文件「没反应」— 需点上传按钮；已改自动上传 + /assets 反代
4. 生产默认 mock 模式 — 链接须带 `?api=live`

审计时请验证以上 4 项在当前线上的实际状态。
