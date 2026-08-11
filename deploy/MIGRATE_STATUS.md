# 心象测 ECS 迁移状态（2026-08-11）

## 目标架构

```
浏览器 → https://assess.xhs365.cn (nginx)
           ├─ /        → /opt/digit-hub/apps/web  (静态 SPA)
           └─ /api/    → 127.0.0.1:8080           (xhs-cloud uvicorn)
```

- 前端：工厂仓 `digit-hub/apps/web`
- API：复用/重装 `xhs-cloud`（含 `GET /api/v1/assess/access`）
- 不上：`gen-os`、选品爬虫、97 皮 Flask

## 当前阻塞

| 项 | 状态 |
|----|------|
| 主机 | `47.239.181.111`（SSH Host: `xhs365-wipe`） |
| 主机密钥 | 已变更（疑似清盘重装）；本机 `known_hosts` 已更新 |
| SSH 登录 | **失败：`Permission denied (publickey)`** |
| 可用密钥 | 仅 `~/.ssh/id_ed25519_wipe_backup`（wipe-backup-cursor-20260810） |
| 公网页 | `https://monitor.xhs365.cn` → Cloudflare **521**（源站未起来） |

**结论：本地部署包可备好，但必须先把公钥写进 ECS 的 `authorized_keys`（或控制台临时开密），才能继续上传与起服。**

## 你需要做的一步（恢复 SSH）

在阿里云 ECS 控制台任选其一：

1. **密钥对 / 远程连接（Workbench/VNC）** 登录后执行：

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIqHe186K9WJhV82HrxIQlAWkJiKxII5HMeRXbUkaWL7 wipe-backup-cursor-20260810' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

用户优先用 `admin`（与本机 `~/.ssh/config` 的 `xhs365-wipe` 一致）；若只有 `root`，告诉我改 config。

2. 或在控制台绑定/注入该公钥后回复「SSH 好了」。

验证：

```powershell
ssh xhs365-wipe "echo OK && hostname"
```

## 恢复 SSH 后本脚本会自动执行

```powershell
powershell -ExecutionPolicy Bypass -File "D:\选品报告\资料生产工厂\digit-hub\deploy\push_to_ecs.ps1"
```

步骤概要：

1. 打包并上传 `apps/web` → `/opt/digit-hub/apps/web`
2. 同步 `xhs-cloud/cloud_deploy`（若 `/opt/xhs-cloud` 空则引导最小安装）
3. 写入 nginx：`assess.xhs365.cn` → 静态 + `/api/` 反代 `:8080`
4. 起/重启 `xhs-cloud-api` + `nginx`
5. 冒烟：首页 HTML、`/api/v1/health`、`/api/v1/assess/access`

## 已就绪的本地产物

- `deploy/nginx.xinxiang.conf.example`（将改为 assess.xhs365.cn）
- `deploy/pack_and_push` 脚本（本目录生成）
- 前端 live 模式：同域 `/api/` + `?api=live`
