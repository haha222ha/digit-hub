# C 端选题链接（Hub Link）设计

> 状态：已落地 · 与「一测一链」并存  
> 仓库：`digit-hub` · 产品：`psy_dist`（心象测分销）

## 目标

在 **不改动** 现有「一测一链」的前提下，新增一种链接模式：

- 商家生成 **1 条选题链接**（扣 1 额度）
- C 端打开后通过 **下拉框** 选择全部已启用测题中的任意一套
- 同一 token **最多开测 3 次**（`max_uses=3`），**允许同题复测**
- 首次开测起算有效期（沿用 `link_expire_hours`）

## 双模式对照

| | 单测题链接（旧） | 选题链接（新） |
|--|------------------|---------------|
| `link_mode` | `single`（默认） | `hub` |
| 落库 `test_code` | 具体测题码 | `__hub__`（占位） |
| C 端 URL | `/test/{code}/{token}` | `/test/hub/{token}` → `/pick/?token=` |
| 选题 | 链接已绑定，无下拉 | 下拉 = `list_tests()` 全部已启用 |
| 扣次 | `start-test` +1 | 同左（在测题页点开始时） |
| 额度 | 1 条 = 1 额度 | 同左 |

## 用户路径

```text
商家「生成链接」选「选题链接」
  → 得到 https://psy.xhs365.cn/test/hub/{token}
  → C 端打开 → /pick/?token=… 或直接打开 /pick/ 手动输入授权码
  → 校验成功后写入 localStorage（xx_hub_session_v1：token / usedCount / maxUses / remainingUses）
  → 下拉选题 → /tests/{code}/index.html?token=…
  → link-validator 开始测试时同步剩余次数到 localStorage
  → 次数用尽 → 提示「更换授权码」→ 清会话 → 输入新码
```

## C 端本机会话（localStorage）

| 键 | 说明 |
|----|------|
| `xx_hub_session_v1` | 当前授权码会话：`token`、`usedCount`、`maxUses`、`remainingUses`、`linkMode`、`masked`、`updatedAt` |

- 打开 `/pick/` 无 URL token 时优先恢复本机会话，并 `validate` 与服务端校正次数
- 「更换授权码」清除本键后重新输入
- 测题页 `start-test` / `complete-test` 成功后写回剩余次数

## 数据

- 表：`dist_links`
- 新列：`link_mode TEXT NOT NULL DEFAULT 'single'`
- Hub 常量：`HUB_TEST_CODE = "__hub__"`

## API

| 接口 | 变更 |
|------|------|
| `POST /api/links/generate` | body 可选 `linkMode: "single"\|"hub"`；hub 时可不传 `testCode` |
| `POST /api/links/validate` | 响应含 `linkMode` / `usedCount` / `maxUses`；hub 不校验 URL 测题绑定 |
| `POST /api/links/complete-test` | 可选 `testCode`；hub 时用该码写入 `dist_test_results` |
| `GET /test/hub/{token}` | 302 → `/pick/?token=` |

## 兼容

- 旧客户端不传 `linkMode` → 行为与改前完全一致
- 发卡 / IM allocate / 一键补齐仍只生成 **single** 测题链接
- 撤销未用链接还额度逻辑不变

## 实现落点

| 层 | 路径 |
|----|------|
| DB/业务 | `services/xhs-cloud/cloud_deploy/cloud_api/dist_db.py` · `dist_service.py` · `dist_routes.py` |
| B 端 | `apps/psy-dist/console/js/pages/admin.js` · `api.js` |
| C 端 | `apps/psy-dist/pick/` · `static/js/link-validator.js` |
| 站点地图 | `docs/SITE_MAP_XHS365.md` |
| nginx | `deploy/nginx_apply.sh`（`/pick/` 静态；`/test/hub/` 走 API） |
