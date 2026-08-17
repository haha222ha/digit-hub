# 换机快照 API（digit-hub）

## 身份

发卡助手**不另建账号**：用已有心象测用户 + Bearer / `xxpsy_` 对接 Token。  
详见发货助手 `docs/ACCOUNT_IDENTITY.md`。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ship/client-version` | **公开**；返回 `latest` / `min_version` / `force` / `download_url` / `notes` |
| POST | `/api/ship/snapshot/push` | body: `{ snapshot, device_label }` |
| GET | `/api/ship/snapshot/pull?device_label=default` | 返回 `{ snapshot, updated_at }` |

### 客户端强制更新（环境变量）

| 变量 | 含义 | 示例 |
|---|---|---|
| `SHIP_CLIENT_LATEST` | 最新版本号 | `1.1.0` |
| `SHIP_CLIENT_MIN` | 最低允许版本；低于则强制更新 | `1.0.0` |
| `SHIP_CLIENT_FORCE` | 低于 min 时是否强制（true/false） | `true` |
| `SHIP_CLIENT_DOWNLOAD_URL` | 安装包直链 | `https://psy.xhs365.cn/releases/...exe` |
| `SHIP_CLIENT_NOTES` | 更新说明 | `修复补货；更新后自动同步配置` |

客户端：低于 `min_version` 且 `force=true` → 不可关遮罩 → 下载安装 → 重启后自动 `snapshot/pull`。

表：`dist_ship_snapshots`（按 `user_id` + `device_label`）

## 标签约定（写死）

- **账号级配置**：`device_label=default`（多机共享；登录/设置页 push·pull 用这个）
- 本机 `shipping-xxxx` clientId **不要**再当配置主标签（早期版本误用过，客户端 pull 会兼容并迁移）

## 客户端行为

1. 心象测登录成功 → **先 pull default → 合并** → syncBindings → 本地有绑定才 push  
2. 空机不 push，避免盖掉云端已有配置  
3. 千帆 Cookie 不上云

## 部署

含 `save_ship_snapshot` / `load_ship_snapshot` 与上述路由后执行线上 `quick_update`（或等价发版）。
