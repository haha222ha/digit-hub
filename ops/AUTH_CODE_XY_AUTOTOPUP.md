# 云端激活码 ↔ 闲鱼自动发货 · Agent 对接契约

> 目标：闲鱼卖「分销额度激活码」时，卡池低水位由 Agent/计划任务自动向云端发码并写入闲鱼卡券。

## 1. 卖什么

| 概念 | 说明 |
|------|------|
| 激活码 / 兑换码 | 云端 `auth_codes` 表里的字符串，如 `XHS-xxxx-xxxx-xxxx` |
| 套餐 SKU | `psy_dist` / `quota_100` · `quota_500`（见 `auth_product_registry.py`） |
| 履约 | 买家拿到码 → https://psy.xhs365.cn →「兑换额度」→ 额度到账 |
| 不是 | 源码、测题单链、付款后自动打额度 |

差异化挂价（上架包）：100 次 ¥49.9 · 500 次 ¥128 · 2000 次 ¥238（=4×500 码）

## 2. 云端 API（已落盘）

鉴权头：`X-Sync-Key: <XHS_CLOUD_SYNC_KEY>`  
建议带浏览器 UA（Cloudflare 会拦裸 urllib）。

Base：`https://monitor.xhs365.cn`（或 `https://psy.xhs365.cn`）

### 发码（补卡核心）

```http
POST /api/v1/admin/auth-codes
Content-Type: application/json
X-Sync-Key: ...

{
  "product": "psy_dist",
  "sku": "quota_500",
  "count": 20,
  "channel": "xianyu-autotopup-q500"
}
```

响应关键字段：`codes[]`（一行一码写入闲鱼）、`plan_code`、`label`

### 查产品套餐

```http
GET /api/v1/admin/auth-products
```

### 查云端未兑库存（监控用）

```http
GET /api/v1/admin/auth-codes/stock?product=psy_dist&sku=quota_500
```

注意：**闲鱼是否断货以闲鱼卡池行数为准**；本接口只反映云端库未兑量。

## 3. 本机桥接脚本（已落盘）

| 文件 | 作用 |
|------|------|
| `ops/xy_card_bridge.py` | 统一桥：支持 `auth_code_from_cloud` + `claim_from_cloud` |
| `ops/xy_auth_code_bridge_map.example.json` | 额度激活码映射模板 |
| `ops/xy_card_bridge_map.example.json` | 链接卡 + 额度卡混合示例 |
| `ops/xy_card_autotopup.bat` | 低水位巡检入口（可挂计划任务） |

### 运行

```bat
cd /d D:\digit-hub-git
copy ops\xy_auth_code_bridge_map.example.json ops\xy_card_bridge_map.json
REM 编辑 map：填入真实 xy_item_id / 卡券名
python ops\xy_card_bridge.py --dry-run
python ops\xy_card_bridge.py --only-low-water
```

Sync Key 读取顺序：`XHS_CLOUD_SYNC_KEY` 环境变量 → `D:\xhs-data\config\local_sync.env` → map（不推荐）

### pair 字段（mode=auth_code_from_cloud）

| 字段 | 含义 |
|------|------|
| `auth_product` | 固定 `psy_dist` |
| `auth_sku` | `quota_100` / `quota_500` |
| `xy_item_id` | 闲鱼商品 ID |
| `xy_card_name` | 卡券池名称 |
| `low_water` | 可发单数低于此值则补 |
| `refill_batch` | 每次至少补多少「单」 |
| `codes_per_order` | 每单码行数；2000 次档用 `4`（4×500） |
| `channel` | 写入云端 note 的渠道标记 |

## 4. 自动补卡闭环（给 Agent）

```text
loop every 10~30 min:
  1. 登录闲鱼 backend-web，读各规格 data 卡池行数
  2. sellable = lines / codes_per_order
  3. if sellable < low_water:
       POST 云端 /api/v1/admin/auth-codes  mint (need * codes_per_order)
       把返回 codes 追加进卡池 data_content（一行一码，去重）
       绑定 xy_item_id + 同步 description 发货文案
  4. 写日志 / 回报剩余可发单数
```

已实现：`python ops/xy_card_bridge.py --only-low-water`

## 5. 闲鱼侧注意

1. 卡券类型 `data`，内容一行一码  
2. 自动发货文案用 `{DELIVERY_CONTENT}`；桥接默认文案已含兑换步骤  
3. **测题链接卡** 与 **额度激活码卡** 必须分池，禁止混放  
4. 多码档（2000=4 行）：要么闲鱼配置每单发 N 行，要么详情写清「发 4 枚请全部兑换」  
5. 码一经兑换不可重置再卖；售后未兑 → 吊销旧码 + 新发

## 6. 验收清单

- [ ] dry-run 显示 would_mint > 0 且不改库存  
- [ ] 实跑后闲鱼卡池行数增加，云端能 list 到新码  
- [ ] 自拍一单：收到激活码 → psy 兑换 → 额度 +100/500  
- [ ] 把库存抠到 low_water 以下，计划任务能自动补回  

## 7. 相关源码

- 套餐注册：`services/xhs-cloud/cloud_deploy/cloud_api/auth_product_registry.py`
- CLI：`services/xhs-cloud/cloud_deploy/scripts/manage_auth_codes.py`
- Admin 发码：`POST /api/v1/admin/auth-codes`
