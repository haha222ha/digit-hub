# xlxtest L3 整站镜像

原站 Vue SPA 离线镜像（约 289 个 asset，~12MB），用于 **~99% 像素级** 复刻 `/past` 历史人物匹配。

## 访问地址

### 分销接入（推荐）

```
https://psy.xhs365.cn/test/past_xlx/{token}
```

走 digit-hub 分销链接校验、开始/完成记录；内嵌原站 Vue（欢迎页→答题→原站结果页）。

### 演示/内测（无 token）

```
https://psy.xhs365.cn/xlx-mirror/past
```

## 特性

- 完整原站 UI：欢迎页、答题、雷达对比结果、晒单弹窗、截图分享
- **分销桥接** `shared/xlx-digit-integration.js`：token → verifyToken、start/complete-test
- **演示模式** `mirror-bootstrap.js`：无 token 时 mock 授权
- 历史记录仍写入浏览器 `xlxtest:history:past:v1`（可与 `past_new/import.html` 互通）

## 架构

```
/test/past_xlx/{token}
  └─ tests/past_xlx/index.html  （PsyTestValidator 校验）
       └─ iframe /xlx-mirror/past?token=...&psy_integrated=1
            └─ xlx-digit-integration.js + 原站 Vue chunks
```

## 部署

```bash
cd /opt/digit-hub && git pull
sudo bash deploy/quick_update.sh
sudo bash deploy/nginx_apply.sh && sudo nginx -s reload
```

## 重建镜像（原站发版后）

在开发机：

```bash
python "D:/Program Files/ProductAnalyzer/tools/_build_xlx_mirror.py"
```

会更新 `apps/psy-dist/xlx-mirror/assets/` 与 `index.html`（保留 `mirror-bootstrap.js` 手工改动）。

## 文件

| 文件 | 说明 |
|------|------|
| `index.html` | xlxtest 入口（资源路径已改为 `/xlx-mirror/assets/`） |
| `mirror-bootstrap.js` | 域名锁/API/路由 shim |
| `assets/` | 289 个 JS/CSS/字体 |
| `manifest.json` | 资源清单 |

## 注意

- 镜像为**静态前端**，不含 xlxtest 后端；除 `/api/public/*` 代理外 API 均 mock
- 包体较大，首次 `git pull` 会下载 ~12MB assets
- 仅供自有分销/内测；请遵守原站内容与授权规则
