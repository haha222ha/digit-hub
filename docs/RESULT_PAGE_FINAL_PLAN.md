# 结果页优化 · 最终合成方案

**对照**: CodeBuddy `RESULT_PAGE_AUDIT.md` × Cursor `RESULT_PAGE_AUDIT_CURSOR.md`  
**实施轮**: 本提交 `apps/web`（cache v21）

## 合取结论

| 项 | CodeBuddy | Cursor | 落地 |
|----|-----------|--------|------|
| Hero 下二次 CTA | P0-1 | P0-1 | **做** · outcome-matched 文案用 Cursor |
| Checklist 折叠 | P0-2 | P0-2 | **做** |
| 雷达 tease 上移到 CTA 后 | P2-6 | Soft IA | **做** |
| Full TOC 锚点 | P0-3 | P1-1 | **做**（目录；深度区 details） |
| 分享双轨统一 | P1-4 | P0-4 | **做** |
| Full 复测 banner | P2-7 | 已有底部 | **保留并靠近 7 日后** |
| 锁场景减量 | — | P0-2 | **做** · soft 仅 1 张钩子 |
| CTA outcome-matched | 弱 | P0-3 | **做** |
| 「3 万+ 人」文案 | 建议 | **拒绝** | **不做**（无真实统计） |
| Scene/week Tone 全文 | P1-5 | P1-3 | **延后**（内容工时） |
| 7 日本地打卡 | — | P1-2 | **延后** |

## 本周验收

- Soft 首屏可见 outcome-matched 「¥1.99 解锁…」
- Checklist 默认折叠
- Hero→CTA→模糊雷达→瘦身价值区
- 分享区主按钮「一键导出分享图」；hero 弱化截图双轨
- Full 顶 TOC 可跳转；深度解读默认折叠
