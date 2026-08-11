# PostgreSQL xhs_monitor 初始化

与 **vuemonitor** 共用同一 PG 实例（库名通常 `vuemonitor`），**独立 schema**，不修改 `public`。

## 1. 超级用户执行（仅首次）

```bash
sudo -u postgres psql -d vuemonitor -f /opt/xhs-cloud/cloud_deploy/database/init_xhs_monitor.sql
```

编辑 SQL 内 `CHANGE_ME_STRONG_PASSWORD` 后再执行，或与 `.env` 中密码一致。

## 2. 应用侧验证

```bash
source /opt/xhs-cloud/.env
/opt/xhs-cloud/venv/bin/python -c "
from cloud_deploy.scripts.bootstrap_env import bootstrap
bootstrap()
from cloud_deploy.cloud_api.database import init_db, ensure_admin
init_db(); ensure_admin()
print('OK')
"
```

## 3. 连接串示例（/opt/xhs-cloud/.env）

```bash
XHS_DATABASE_URL=postgresql://xhs_monitor_user:你的密码@127.0.0.1:5432/vuemonitor
```

应用内会自动 `SET search_path TO xhs_monitor, public`。

## 4. 权限说明

- `xhs_monitor_user` **仅有** `xhs_monitor` schema 权限
- **不授予** `public` 写权限，vuemonitor 代码零改动
- 备份：`pg_dump vuemonitor` 已包含 `xhs_monitor` schema
