# xhs365.cn 站点全景 · 路径导航（SSOT）

> 扫描基准：`digit-hub` 仓库 + `deploy/nginx_apply.sh` + 线上约定  
> 更新：2026-09-02  
> 用途：后续重规划路由、小红书引流、闲鱼/在线支付双通道时对照本文。

---

## 0. 两分支架构（你提到的 Cloud Tunnel vs 云主机）

### 0.1 本仓库 **已落盘** 的部署模型（主路径）

```text
访客浏览器
    ↓ HTTPS（Cloudflare 橙云 · Flexible SSL）
Cloudflare DNS（*.xhs365.cn A → 47.239.181.111）
    ↓ HTTP :80
阿里云 ECS nginx
    ├─ monitor.xhs365.cn  → apps/web + /api/ → uvicorn :8080
    ├─ psy.xhs365.cn      → apps/psy-dist + /api/ → :8080
    └─ default_server     → apps/web（IP 直访）
```

| 组件 | 路径/证据 |
|------|-----------|
| nginx 生成脚本 | `deploy/nginx_apply.sh` |
| 日常热更新 | `deploy/quick_update.sh` → `nginx_apply.sh` |
| API 进程 | `deploy/digit-api.service.example` → `:8080` |
| 运行时 env | ECS `/opt/xhs-cloud/.env` |
| CF Flexible 规则 | `.cursor/rules/cloudflare-flexible.mdc` |

**结论：** digit-hub 默认走 **ECS 直出 + Cloudflare 代理**，**不是** Cloudflare Tunnel（cloudflared）。

### 0.2 本仓库 **未找到** Cloud Tunnel 配置

全仓检索 `cloudflared` / `cf tunnel` / `零信任` → **无**。  
若你另有「Tunnel 分支」（例如内网开发机、闲鱼发货机、选品机推云），应在 **Tunnel 控制台** 或那台机器的文档里维护，**不要与 ECS nginx 混为一谈**。

### 0.3 建议的双分支职责划分（规划用）

| 分支 | 适合放什么 | 不要放什么 |
|------|------------|------------|
| **ECS + CF 橙云** | 公网 SaaS：`monitor` / `psy` / 支付回调 / 发卡 API | 闲鱼 backend-web :8089 |
| **Cloud Tunnel / 内网** | 闲鱼自动发货机、本地 xy_card_bridge、选品推送 | 对外 C 端测题主站（延迟/稳定性） |
| **本机 digit-hub** | 开发、发码、文档、git push | 不要假设本机 Key 在发货机 |

关联文档：`ops/两台电脑-SyncKey交接说明.md`、`ops/AUTH_CODE_XY_AUTOTOPUP.md`

### 0.4 其它域名（文档提及、本仓 nginx 未管）

| 域名 | 说明 |
|------|------|
| `assess.xhs365.cn` | 与 monitor 同栈，迁移文档预留 |
| `www.xhs365.cn` | ProductAnalyzer 下载，非本仓 nginx |
| `admin.xhs365.cn` | 旧 vuemonitor LLM 后台，非 digit-hub |

---

## 1. 域名 → 产品 → 根目录

| 域名 | 产品定位 | 静态根目录（ECS） | 后端 |
|------|----------|-------------------|------|
| **monitor.xhs365.cn** | C 端心象测 + 选品 insight 会员 | `/opt/digit-hub/apps/web` | FastAPI `:8080` |
| **psy.xhs365.cn** | **B2B 分销 SaaS** 营销站 + 商家工作台 + 测题静态 | `/opt/digit-hub/apps/psy-dist` | 同上 |
| **47.239.181.111** | 无 DNS 时的 assess 兜底 | `apps/web` | 同上 |

---

## 2. psy.xhs365.cn — 分销 SaaS（小红书推广主战场）

> **这就是你记得的「SaaS 首页」**：`apps/psy-dist/index.html`  
> 线上：https://psy.xhs365.cn/

### 2.1 公开页（无需登录）

| URL | 文件/实现 | 用途 |
|-----|-----------|------|
| `/` | `apps/psy-dist/index.html` + `home.js` | **营销首页**：测题墙、商家流程、公开定价 |
| `/pricing/` | `apps/psy-dist/pricing/index.html` | Waffo 合规公开价目 |
| `/terms/` | `apps/psy-dist/terms/index.html` | 服务条款 |
| `/privacy/` | `apps/psy-dist/privacy/index.html` | 隐私政策 |
| `/order-claim` | `apps/psy-dist/order-claim.html` | 买家凭订单领链（C 端） |
| `/tests/{code}/` | `apps/psy-dist/tests/*/index.html` | 单套测题静态页 |
| `/test/{code}/{token}` | nginx → API | 分销链接入口（一测一链） |
| `/test/hub/{token}` | nginx → API → `/pick/` | **选题链接**入口（全库下拉 · 三次） |
| `/pick/` | `apps/psy-dist/pick/index.html` | C 端授权码登录 + 选题 + 测题卡片列表（localStorage 记次数） |
| `/catalog/` | `apps/psy-dist/catalog/index.html` | C 端测题产品列表（无需授权码，可先逛） |
| `/shared/` | 静态 | 共享资源 |

### 2.2 商家工作台（需登录）

| URL | 路由实现 | 用途 |
|-----|----------|------|
| `/login` | `console/index.html` SPA | 登录 |
| `/register` | 同上 | 注册 |
| `/admin/dashboard` | `console/js/main.js` | 工作台 |
| `/admin/purchase-quota` | `console/js/pages/admin.js` | **在线购买额度**（微信/支付宝/Waffo） |
| `/admin/redeem-quota` | 同上 | **兑换激活码**（闲鱼购码后粘贴） |
| `/admin/generate-link` | 同上 | 生成测评链接 |
| `/super-admin/*` | 同上 | 超管 |

Console 路由表：`apps/psy-dist/console/js/main.js`

### 2.3 定价与套餐（plan_code）

| 套餐 | 官网价 | 闲鱼渠道价（运营） | 配置 |
|------|--------|---------------------|------|
| `psy_quota_100` | ¥59 / 100 次 | 如 ¥49.9 体验档 | `payment_plans.py` + `auth_product_registry.py` |
| `psy_quota_500` | ¥199 / 500 次 | 如 ¥128 主力档 | 同上 |
| 2000 次组合 | 无单 plan | ¥238 = 4×500 码 | 闲鱼多码发货 |

公开价展示：`index.html#pricing`、`/pricing/`  
后台购买：`/admin/purchase-quota`  
发码 CLI/API：`manage_auth_codes.py`、`POST /api/v1/admin/auth-codes`

### 2.4 闲鱼相关（已部分实现）

| 能力 | 位置 | 状态 |
|------|------|------|
| 超管配置闲鱼店链 | `dist_site_config.xianyu_shop_link` | DB 字段已有 |
| 购买页「去闲鱼购码」 | `admin.js` → `openXianyuModal` | **需登录** 才可见 |
| 闲鱼自动补卡 | `ops/xy_card_bridge.py` | 跑在 **发货机**，非 ECS |
| 上架素材 | `ops/xianyu-listings/quota-500/` | 运营文档 |

配置读写：`services/xhs-cloud/cloud_deploy/cloud_api/dist_ops.py`  
API：`GET /api/config/customer-service`（需 token）

---

## 3. monitor.xhs365.cn — C 端 + 选品会员

| URL | 说明 |
|-----|------|
| `/?api=live` | 心象测 SPA live |
| `/#/tests` | 测题目录 |
| `/#/activate?code=` | 激活码 |
| `/#/account` | 会员/单次付费 |
| `/member` | insight 选品会员 HTML（API 渲染） |
| `/admin/` | 统一运营后台（授权码、反馈） |
| `/api/v1/payment/notify/hwxun` | **支付回调**（微信/支付宝） |

静态：`apps/web/`  
登录/register：**302 到 psy.xhs365.cn**（nginx 配置）

---

## 4. API 层（FastAPI :8080）

| 前缀 | 用途 |
|------|------|
| `/api/v1/health` | 健康检查 |
| `/api/v1/payment/plans` | 套餐列表 |
| `/api/v1/payment/orders` | 创建支付订单 |
| `/api/v1/admin/auth-codes` | Sync Key 发激活码 |
| `/api/v1/admin/auth-products` | 产品/SKU 注册表 |
| `/api/*`（dist_routes） | 分销 console 兼容树 |
| `/api/quota/redeem` | 额度兑换 |

入口：`services/xhs-cloud/cloud_deploy/cloud_api/main.py`  
分销兼容：`dist_routes.py`

---

## 5. nginx 路由速查（ECS 生效文件）

生成：`sudo bash deploy/nginx_apply.sh`  
输出：`/etc/nginx/conf.d/monitor.xhs365.cn.conf`、`psy.xhs365.cn.conf`、`assess.xinxiang.conf`

**psy 关键规则：**

- `/` → 营销 `index.html`（不是 console）
- `/console/*`、`/login` → 商家 SPA
- `/member`、`/assets/member*` → 反代 API
- `/assets/*`（非 member）→ **磁盘静态**，禁止误反代

**monitor 关键规则：**

- `/login` 等 → 302 到 psy
- `/api/` → 反代 :8080

---

## 6. 环境变量 → 域名映射

| 变量 | 默认 | 作用 |
|------|------|------|
| `XHS_PSY_ORIGIN` | `https://psy.xhs365.cn` | 分销链接、激活落地 |
| `XHS_AUTH_ACTIVATE_ORIGIN` | `https://monitor.xhs365.cn` | assess/insight 激活链 |
| `XHS_PAY_NOTIFY_BASE` | `https://monitor.xhs365.cn` | 支付回调域名 |
| `XHS_PUBLIC_ORIGIN` | psy | 生成 dist 链接 URL |
| `XHS_CLOUD_SYNC_KEY` | — | 发码 / 闲鱼 bridge |
| `PSY_DOMAIN` / `MONITOR_DOMAIN` | nginx_apply 用 | 部署时 vhost 名 |

示例：`services/xhs-cloud/cloud_deploy/.env.example`

---

## 7. 仓库目录 → 线上映射

```text
digit-hub/
├── apps/web/              → monitor / assess 静态
├── apps/psy-dist/         → psy 营销 + console + tests
├── apps/admin/            → monitor.xhs365.cn/admin/
├── services/xhs-cloud/    → ECS /opt/xhs-cloud API
├── deploy/                → nginx、systemd、热更新
├── ops/                   → 闲鱼 bridge、发码、上架包
├── packages/cloud-api/    → AUTH_PRODUCTS 契约
└── docs/                  → 本文 + 推广设计
```

---

## 8. 一键 URL 清单（收藏）

| 场景 | URL |
|------|-----|
| **SaaS 营销首页** | https://psy.xhs365.cn/ |
| **小红书推广引导（双通道）** | https://psy.xhs365.cn/get |
| 公开定价 | https://psy.xhs365.cn/pricing/ |
| 商家注册 | https://psy.xhs365.cn/register |
| 商家登录 | https://psy.xhs365.cn/login |
| 在线买额度 | https://psy.xhs365.cn/admin/purchase-quota |
| 兑换激活码 | https://psy.xhs365.cn/admin/redeem-quota |
| C 端心象测 | https://monitor.xhs365.cn/?api=live |
| 运营后台 | https://monitor.xhs365.cn/admin/ |
| API 健康 | https://monitor.xhs365.cn/api/v1/health |

---

## 9. 当前缺口（相对「小红书双通道引导页」）

| 缺口 | 现状 |
|------|------|
| 公开引导页（未登录双按钮） | ✅ `/get` · `apps/psy-dist/get/` |
| 闲鱼链对访客公开 | ✅ `GET /api/public/purchase-options` |
| 小红书专用落地 URL | ✅ `https://psy.xhs365.cn/get` |
| 官网价 vs 闲鱼价统一叙事 | 首页只有官网价，闲鱼价在 ops 文档 |

→ 设计方案见：`docs/XHS_PROMOTION_LANDING_DESIGN.md`  
→ **已实现**：`https://psy.xhs365.cn/get` · API `GET /api/public/purchase-options`

---

## 10. 相关文档索引

| 文档 | 路径 |
|------|------|
| 推广引导页设计 | `docs/XHS_PROMOTION_LANDING_DESIGN.md` |
| 授权码产品表 | `packages/cloud-api/AUTH_PRODUCTS.md` |
| 闲鱼额度上架 | `ops/xianyu-listings/quota-500/README.md` |
| 自动补卡 | `ops/AUTH_CODE_XY_AUTOTOPUP.md` |
| 支付部署 | `deploy/API_PAY_DEPLOY.md` |
| 分销验收 | `deploy/PSY_DIST_ACCEPTANCE.md` |
| CF Flexible | `.cursor/rules/cloudflare-flexible.mdc` |
