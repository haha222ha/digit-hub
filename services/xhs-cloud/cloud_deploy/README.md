# 选品云端（XHS Monitor）完整版

> **仓库**：https://github.com/haha222ha/vuemonitor（`xhs-cloud/` 目录）  
> **部署路径**：`/opt/xhs-cloud`（与 `/opt/vuemonitor` 分离，零侵入）

---

## 测试

```powershell
# 本地（无 PG 也可跑 22 项）
cd E:\vuemonitor\xhs-cloud
.\cloud_deploy\tests\run_e2e.ps1

# 服务器完整 PG 测试
export E2E_DATABASE_URL="$XHS_DATABASE_URL"
bash /opt/xhs-cloud/cloud_deploy/tests/run_e2e.sh
```

覆盖：parse/pack、真实 15MB data.js、ingest、API 鉴权、PG 同步/删除 stale 行、周报不污染日报、run_full。

| 功能 | 脚本 / 服务 | 说明 |
|------|-------------|------|
| 报告入库 | `run_daily_pipeline.py` / `xhs-ingest-report.timer` | 本地 gen_report → scp → zip + PG |
| 云端日报 | `cloud_gen_report.py` / `run_full_pipeline.py full` | 读 PG 生成 `全量MMDD/` |
| 周报 | `run_full_pipeline.py weekly` / `xhs-weekly-report.timer` | 周期聚合 → `周报MMDD/` |
| 月报 | `run_full_pipeline.py monthly` / `xhs-monthly-report.timer` | 上月聚合 → `月报YYYYMM/` |
| 历史冷启动 | `import_historical_reports.py` | 批量导入本地 `全量*` 目录 |
| sold_history 回补 | `backfill_sold_history_pg.py` | 本地 SQLite → `goods_sold_daily` |
| sold_snapshots | `backfill_sold_snapshots_pg.py` | 日内快照，默认永久保留 |
| 增量日照 | `sync_incremental_sold_daily.py` | 已在池商品新日期 |
| 快照清理 | `prune_sold_snapshots.py` + timer | 仅当 `RETENTION_DAYS>0` 时启用 |
| 规则引擎 | `rules/rule_engine.py` | pool/status/告警 |
| 云扫描守护 | `daemon/cloud_daemon.py` | 写 PG（需 XHS_CRAWLER_ROOT） |
| 会员 API | `xhs-cloud-api.service` | 登录、402 封禁、zip 下载 |
| 本地推云 | `tools/cloud_sync_client.py` | API 推 data.js / sold-history |

**不改**：`gen_report.py`、vuemonitor `server/`、爬虫。

---

## 2. 架构

```
本地 Windows
  gen_report → 全量MMDD/data.js
       │ scp / cloud_sync_client
       ▼
/opt/xhs-cloud/data/incoming/  ──ingest──► PG xhs_monitor + report_archives/*.zip
       │
       │  或云端 generate/full（PG 已有数据时）
       ▼
xhs-cloud-api :8080 → 会员下载 zip（html + data.js）

/opt/vuemonitor :8000  ← 现网，零改动
```

---

## 3. 服务器首次安装

**推荐（免手填 nano）：**

```bash
git clone https://github.com/haha222ha/vuemonitor.git /opt/vuemonitor
sudo bash /opt/vuemonitor/xhs-cloud/cloud_deploy/install.sh /opt/vuemonitor/xhs-cloud
sudo -u postgres psql -d vuemonitor -f /opt/xhs-cloud/cloud_deploy/database/init_xhs_monitor.sql
bash /opt/vuemonitor/xhs-cloud/cloud_deploy/scripts/bootstrap_from_vuemonitor.sh
# 按脚本提示把 XHS_CLOUD_SYNC_KEY 写入 /opt/vuemonitor/server/.env
cd /opt/xhs-cloud && bash cloud_deploy/scripts/host-update.sh
sudo systemctl start xhs-cloud-api
sudo systemctl enable xhs-ingest-report.timer
```

**日常管理（可视化）：** 登录 `admin.xhs365.cn` → 侧边栏 **选品会员** → 生成授权码 / 查看状态 / 复制会员链接。

**纯线上全自动（推荐）：**

```bash
# 1. 上传爬虫（一次性，从 Windows）
scp -r "D:/jiekoufenxi/小红书多设备爬虫/"* admin@你的IP:/opt/xhs/crawler/

# 2. 服务器启用
bash /opt/xhs-cloud/cloud_deploy/scripts/enable_pure_online.sh
```

手动配置 `.env` 仍可用 `bootstrap_from_vuemonitor.sh`（免 nano）。

---

## 4. 统一流水线 `run_full_pipeline.py`

```bash
cd /opt/xhs-cloud
export PYTHONPATH=/opt/xhs-cloud

# 入库（incoming 最新 全量*）
python cloud_deploy/scripts/run_full_pipeline.py ingest

# 云端从 PG 生成日报 + zip + 登记
python cloud_deploy/scripts/run_full_pipeline.py full --date 2026-06-19

# 历史冷启动（批量）
python cloud_deploy/scripts/import_historical_reports.py --root /path/to/reports

# 周报 / 月报
python cloud_deploy/scripts/run_full_pipeline.py weekly
python cloud_deploy/scripts/run_full_pipeline.py monthly
```

---

## 5. 本地 Windows 开发（一次 push 前自测）

```powershell
cd E:\vuemonitor\xhs-cloud
copy .env.dev.example .env.dev
docker compose -f docker-compose.dev.yml up -d

# 初始化 PG（若 init 脚本未自动执行）
docker compose -f docker-compose.dev.yml exec postgres psql -U postgres -d vuemonitor -f /docker-entrypoint-initdb.d/02_xhs_monitor.sql

set XHS_CLOUD_ROOT=%CD%
set XHS_ENV_FILE=%CD%\.env.dev
set PYTHONPATH=%CD%

# 批量导入历史报告
python cloud_deploy\scripts\import_historical_reports.py --root C:\Users\Administrator\Desktop\每日选品全量数据

# 云端生成日报
python cloud_deploy\scripts\run_full_pipeline.py full
```

---

## 6. 日常 git 部署

```bash
cd /opt/vuemonitor && git fetch origin main && git reset --hard origin/main
rsync -a /opt/vuemonitor/xhs-cloud/ /opt/xhs-cloud/ --delete --exclude data --exclude venv --exclude .env
cd /opt/xhs-cloud && bash cloud_deploy/scripts/host-update.sh
```

---

## 7. systemd 定时任务

| Timer | 时间 | 作用 |
|-------|------|------|
| `xhs-ingest-report.timer` | 每日 20:00 | scp 报告入库 |
| `xhs-daily-report.timer` | 每日 17:00 | PG 云端生成日报（会员页展示 18:00） |
| `xhs-weekly-report.timer` | 周日 17:00 | 周报 |
| `xhs-monthly-report.timer` | 每月 1 日 17:00 | 月报 |

本地 gen_report 模式只需 enable `xhs-ingest-report.timer`。

---

## 8. 文件索引

| 路径 | 作用 |
|------|------|
| `cloud_deploy/reporting/` | PG 读取、data.js 生成 |
| `cloud_deploy/scripts/cloud_gen_report.py` | 云端日报 |
| `cloud_deploy/scripts/cloud_period_report.py` | 周报/月报 |
| `cloud_deploy/scripts/run_full_pipeline.py` | 统一入口 |
| `cloud_deploy/scripts/import_historical_reports.py` | 历史冷启动 |
| `cloud_deploy/assets/index_with_gr.html` | 报告 HTML 模板 |
| `docker-compose.dev.yml` | 本地 PG 联调 |
| `docs/DEPLOY_CHECKLIST.md` | 部署检查清单 |

---

*完整版 · 本地开发完成后一次性 push/pull 部署*
