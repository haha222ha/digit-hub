# PC 客户端 V2 门控（GA 前 checklist）

> 完整 PRD：`projects/ai-market-intelligence-v2/docs/23-PC-CLIENT-V2-REDESIGN-AND-PACKAGING.md`

## 今日可验收（无需合并 xhs_shelf_time）

1. PC 设置 `XHS_CLOUD_BASE=https://monitor.xhs365.cn`
2. 登录后 JWT 调 `/api/v1/member/profile` → `portal_route` / `insight_enabled`
3. `insight_only` 用户：PC 只展示情报入口，隐藏 Legacy zip 下载

## GA 仍待办

- [ ] 合并 `xhs_shelf_time` ProductAnalyzer 情报 Tab
- [ ] `deploy/downloads/productanalyzer-version.json` 最低版本门控
- [ ] 用户报告路径 `{user_id}/{date}/{category}/`

## 临时方案

Web 会员页 https://monitor.xhs365.cn/member 为 **唯一正式入口**；PC 继续 Legacy 至 GA。
