# 设计审计对照 · 最终优化方案

**对照稿**: Cursor `docs/DESIGN_UX_AUDIT_CURSOR.md` × DeepSeek `digit-hub-visual-audit.md`  
**实施提交**: 见本轮 `apps/web` 变更（cache v19）

---

## 1. 两稿对比（8 维）

| 维度 | Cursor | DeepSeek | 胜出 |
|------|--------|----------|------|
| 品牌贴合 | 墨纸定调清晰，拒荧光 | 四色评分细、质感层到位 | 平 |
| 证据密度 | 线上 DOM rail=19、文件路径 | 页面分项打分、CSS 行号 | DeepSeek 略细 |
| 可执行性 | 本周/两周分层 + 线框 | 创意落 CSS，但本周排了 2 天文案 | Cursor |
| 转化相关 | sticky CTA、划线价、授权码折叠 | 锚价+社会证明+退款文案 | 合取 |
| 题目层 | comedy/funny 映射提醒 | **15 套缺 styles 铁证** + love_brain 改写样例 | DeepSeek |
| 移动端 | sticky / safe-area / 滚动锁 | 375 检查表完整；poll/prompt 已过时 | Cursor（时效） |
| 克制创意 | 印章解锁、墨迹、今日一签 | 墨滴进度、撕纸边、火漆章 | 合取 DeepSeek CSS |
| 路线图 | 排除已修项 | 仍把 prompt/poll 当 P0 | Cursor |

**结论**: DeepSeek 内容审计更出色；Cursor 产品/转化落地更准。最终方案 = **Cursor IA/漏斗 + DeepSeek 内容诊断与三件 CSS 仪式感**。

---

## 2. 最终方案（已实施 / 延后）

### 已实施（本轮）

1. 首页：**今日主推大卡** + 横滑仅 5 张「更多」+ 目录入口  
2. A2HS 下移到「为什么」之后，减少抢 CTA  
3. 目录：去「复购剧本」黑话；promise 默认露出；chip 筛选（全部/≤5分钟/关系/职场）  
4. lane 文案友好化（情感引流→关系向）  
5. intro：Tone claim 大字；无 `styles` 的皮诚实提示  
6. play：25/50/75 里程碑文案 + 进度条墨滴  
7. 轻结果：sticky 解锁条 + 划线价提示 + 撕纸底边  
8. 支付抽屉：划线锚价、创建 spinner、授权码折叠  
9. 分享卡：火漆「心」章  
10. drawer 打开时 `body overflow:hidden`

### 明确延后（不进本轮）

| 项 | 原因 |
|----|------|
| 15 套皮肤补全 humor/funny 题干 | 内容工时 M(2d+)，单独排期 |
| 伪造「已有 3280 人解锁」 | 无真实数据时宁可不做，避免信任透支 |
| 「不满意退款」 | 需支付/客服政策确认 |
| prompt()/poll 修复 | 已在 `959b8f9`/`aa00154` 完成 |

---

## 3. 验收清单

- [ ] 首页首屏可见「今日主推」单卡，横滑不再铺满 18 张  
- [ ] `#/tests` 可用 ≤5 分钟筛选  
- [ ] `love_brain` intro 出现「统一题干」提示  
- [ ] 轻结果解锁条 sticky 在底部  
- [ ] 支付抽屉可见 ¥9.9 → ¥1.99；授权码在 details 内  
- [ ] 分享卡右上角火漆章；进度条末端墨滴  

部署：`sudo bash /opt/digit-hub/deploy/quick_update.sh`
