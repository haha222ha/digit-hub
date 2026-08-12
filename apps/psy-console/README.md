# 心象测工作台（psy-console）

## 决策（已实施）
- 品牌：深化现有青绿+金 Logo + `brand/tokens.json`
- 技术：原生 ES Module SPA（本机无 npm；可零构建部署）
- 范围：Auth + 生成链接 / 链接管理 / 兑换额度（对接现网已通 API）
- 未通 API 的旧菜单先不展示，避免空白页

## 运行时目录
可访问静态文件在 [`apps/psy-dist/console/`](../psy-dist/console/)。  
品牌规范在 [`brand/`](brand/)。

## 路由
`/login` `/register` `/reset-password` `/admin/generate-link` `/admin/link-management` `/admin/redeem-quota`

Nginx：`/` 营销首页；其余前端回落 `/console/index.html`。
