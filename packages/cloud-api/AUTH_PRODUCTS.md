# 统一授权码产品注册表

各业务系统（心象测 / 选品 insight / 云发卡 / 校招推送）**共享 xhs-cloud 同一套**：

- 表：`auth_codes` + `auth_code_activations`
- 激活 API：`POST /api/v1/auth/login-code`
- 权益合并：`entitlements_v2.merge_entitlements`
- 管理 CLI：`cloud_deploy/scripts/manage_auth_codes.py`
- Admin API：`/api/v1/admin/auth-codes`（需 `X-Cloud-Sync-Key`）

**产品层**在 `cloud_api/auth_product_registry.py` 注册，新增系统只需加 product/sku，不必重写发码逻辑。

## 概念

| 层 | 说明 | 示例 |
|----|------|------|
| **product** | 业务系统 | `assess` 心象测 |
| **sku** | 该系统下的发卡规格 | `single` / `card` / `monthly` |
| **plan_code** | 内核套餐码，决定 entitlements | `assess_single` |
| **activate_url** | 各 product 独立落地页 | 见下表 |

## 已注册产品

### assess（心象测）

| sku | plan_code | 说明 | 激活链接模板 |
|-----|-----------|------|----------------|
| `single` | assess_single | 单次报告 · 7天 | `https://monitor.xhs365.cn/?api=live&code={code}` |
| `card` | assess_code | 第三方发卡专用 | 同上 |
| `monthly` | assess_monthly | 月卡 30 次 | 同上 |

### insight（AI 选品情报）

| sku | plan_code |
|-----|-----------|
| experience_3d | experience_3d |
| monthly | monthly |
| quarterly | quarterly |
| halfyear | halfyear |
| yearly | yearly |

激活：`https://monitor.xhs365.cn/member?code={code}`

### faka / push（预留）

已在 registry 占位，`reserved: true`，上线前不可发码。

## CLI 用法（推荐）

```bash
cd /opt/xhs-cloud
export PYTHONPATH=/opt/xhs-cloud

# 查看所有产品与 sku
./venv/bin/python cloud_deploy/scripts/manage_auth_codes.py products

# 心象测 · 小红书/闲鱼发卡 50 个
./venv/bin/python cloud_deploy/scripts/manage_auth_codes.py generate \
  --product assess --sku card --count 50 --channel xianyu-batch-001 --export

# 选品 insight 月卡 10 个
./venv/bin/python cloud_deploy/scripts/manage_auth_codes.py generate \
  --product insight --sku monthly --count 10 --channel agent-a

# 兼容旧写法（仅 plan_code）
./venv/bin/python cloud_deploy/scripts/manage_auth_codes.py generate --plan monthly --count 5

# 列出最近授权码
./venv/bin/python cloud_deploy/scripts/manage_auth_codes.py list --limit 50
```

## 一键脚本（ECS）

```bash
# 统一入口：product sku count channel
sudo bash /opt/digit-hub/deploy/generate_auth_codes.sh assess card 50 xianyu-batch-001
```

## Admin HTTP API

```http
GET /api/v1/admin/auth-products
X-Cloud-Sync-Key: <XHS_CLOUD_SYNC_KEY>

POST /api/v1/admin/auth-codes
Content-Type: application/json
X-Cloud-Sync-Key: <key>

{"product":"assess","sku":"card","count":10,"channel":"xianyu"}
```

也支持 legacy body：`{"plan_code":"assess_single","count":10,...}`

## 新增一个系统（checklist）

1. 在 `payment_plans.py` 增加 plan + `entitlements_template`（含 `products.xxx`）
2. 在 `auth_product_registry.py` 增加 `product` + `skus` + `activate_path`
3. 在 `entitlements_v2.py` / 各 product 门控（如 `assess_access_for_user`）读 `products.xxx`
4. 前端增加 `?code=` 激活落地页
5. 发卡平台导入 CLI `--export` 输出的 TSV

## 环境变量

| 变量 | 说明 |
|------|------|
| `XHS_AUTH_ACTIVATE_ORIGIN` | 激活链接域名，默认 `https://monitor.xhs365.cn` |
