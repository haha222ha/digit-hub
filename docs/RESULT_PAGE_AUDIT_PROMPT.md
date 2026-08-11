# 心象测 · 结果页专项优化审计提示词

> 供 **DeepSeek / GLM / Claude / GPT** 等同题对照。  
> 范围：**仅轻结果页（soft）+ 完整报告页（full）+ 分享卡**，不扩到首页/目录/测题。  
> 线上：https://monitor.xhs365.cn/  
> 代码根：`D:\选品报告\资料生产工厂\digit-hub\`（ECS：`/opt/digit-hub`）  
> 生成日期：2026-08-11

---

## 一、怎么用（给执行者）

1. 把下方「主提示词」整段复制给另一模型。  
2. 要求对方**先读线上结果页**（完成任意测评，如七宗罪），再读代码路径。  
3. 对照稿命名建议：`RESULT_PAGE_AUDIT_<模型名>.md`。  
4. 回收后用文末「对照表」做横向评分，再合成最终实施清单。

**禁止对方做的事**：改计分算法、引入 React/Vue、伪造虚假用户数、承诺退款（除非明确有政策）、整站重写。

---

## 二、行业调研摘要（写进提示词的外部共识）

来源综合：Woobox / QSM / genlead / Opinion Stage / Formspring 等「结果页转化」实践，以及国内病毒人格测（SBTI/FPTI 类）的分享卡模式。

| 原则 | 要点 |
|------|------|
| Partial reveal | 先给身份标签（可分享），深度解读/雷达/行动计划放付费墙后；比完全空白墙更可信 |
| First viewport = identity | 类型名 + 金句/肖像必须首屏可见，无需滚动 |
| One primary CTA | 结果后只保留一个主行动（解锁/购买）；多 CTA 互相残杀 |
| Proof of listening | 用 1–2 条「基于你的作答」证据，让人觉得测的是自己 |
| Share in first fold | 分享按钮靠近首屏；预填文案含类型名；卡片要像截图资产 |
| Mobile CTA visibility | 主 CTA 在手机上尽量不滚或 sticky，避免长文把支付顶没 |
| Scan, don't essay | 轻结果宜短；完整报告才允许深读 |
| Outcome-matched next step | CTA 文案应接结果（「解锁你的七维调节实验」），忌泛「了解更多」 |

心象测已有形态：**轻结果悬念 → ¥1.99 解锁完整报告**，属于 partial reveal + 低价付费墙，审计应强化这条漏斗，而不是改成邮箱门禁。

---

## 三、产品现状快照（务必写进上下文）

```
产品：心象测 · 墨纸实验室
Slogan：三分钟，看见另一种自己
商业：自然流量免费测 → 轻结果 → ¥1.99 解锁；发卡码可直达已付费
技术：原生 ES Module SPA，无 React/Vue；Skin × Tone(rigorous/humor/funny)

轻结果路由：#/t/:id/result?rid=
完整报告路由：#/report/:id
支付：底部 sticky 解锁条 → 抽屉选微信/支付宝即出码

关键文件：
- apps/web/src/pages.js          # renderSoftResult / renderFullReport / openPayDrawer
- apps/web/src/result/value.js   # softValueHtml / fullValueHtml / unlock strip
- apps/web/src/result/scenes.js  # 场景解读（锁/解锁）
- apps/web/src/result/narrative.js
- apps/web/src/share/exportCard.js
- apps/web/src/style/engine.js   # resultChrome / Tone
- apps/web/src/styles/app.css    # .result-hero .unlock-bar .value-block .scene-card

已知已做（勿重复当 P0）：
- sticky 解锁条 + ¥9.9→¥1.99 锚价
- 支付渠道点击即出二维码
- 授权码折叠；drawer 滚动锁
- Tone 影响 hero/chrome/分享卡配色

已知缺口（可审）：
- Hero 下方缺即时 CTA，长页时首屏无支付入口
- 价值 checklist 默认全展开
- 分享路径双轨（截图金句 vs 导出卡）未统一
- 无真实社会证明；禁止编造人数
- 多数迁入皮 humor/funny 题干仍缺（结果语气深度不均）
- 完整报告信息密度高，移动端可能疲劳
```

---

## 四、主提示词（复制给其他 AI）

````markdown
# 角色
你是资深移动端增长设计总监 + 测评产品结果页专家。你熟悉 16Personalities 的结构可信感、小红书 3:4 分享卡审美、以及「partial reveal → 低价解锁」漏斗。输出必须贴合「心象测 · 墨纸实验室」：暖纸底、墨青 seal、陶土 ember、衬线标题——禁止荧光娱乐风、禁止紫色 AI 模板风。

# 任务
对心象测的**最终结果体验**做专项优化审计，范围仅：
1. 轻结果页（soft / paywall 前）
2. 完整报告页（full / 付费后）
3. 分享卡 / 导出 / 传播闭环
4. Soft → Pay → Full 转化路径

产出必须是「可直接排期实施」的方案，不是空泛夸奖。

# 必做调研动作
1. 打开 https://monitor.xhs365.cn/ ，完成一套短测评（推荐 `#/t/seven_sins`），截图轻结果首屏 + 滚到底 + 支付抽屉。
2. 若可支付/有码，进入 `#/report/...` 截图完整报告首屏与「场景/7日计划」段。
3. 阅读代码：`apps/web/src/pages.js` 中 `renderSoftResult`/`renderFullReport`，以及 `result/value.js`、`result/scenes.js`、`share/exportCard.js`。
4. 对照行业共识：身份首屏、单一主 CTA、partial reveal、分享预填、移动端 CTA 可见。

# 审计维度（每项必须：现状一句 + 问题 + 改法 + 文件路径 + 验收）

## A. 轻结果 · 首屏信息架构（375px）
- 类型名 / 金句 / 肖像是否 3 秒可懂？
- 首屏是否同时出现「可分享身份」与「解锁动机」？
- Hero 与 sticky bar 之间是否信息过载？

## B. Partial Reveal 质量
- 锁什么、露什么是否合理？（身份可露；雷达/场景深度/7日计划应收）
- 模糊层 / locked 场景是否显得「真有货」还是「空壳糊弄」？
- 「完整报告你将获得」清单是否过长、是否应折叠？

## C. 转化漏斗 Soft → ¥1.99
- 主 CTA 文案是否 outcome-matched？
- sticky 是否够？是否需要 hero 下二次 CTA？
- 价格锚点、风险降低文案（免编造人数）如何克制加强？
- 支付成功后进入 full 的路径是否顺？

## D. 完整报告 · 可读与行动
- 信息层级：标签 → 证据 → 场景 → 本周动作 → 深度文，是否清晰？
- 移动端是否需要折叠章节 / 目录锚点？
- 7 日微实验是否可执行、是否可复测回流？
- 哪些块应上移到 soft 作钩子、哪些必须留在 full？

## E. 分享与传播
- 分享卡 3:4 是否「小红书值得发」？缺什么视觉符号？
- Web Share / 下载 / 页内预览是否三轨过乱？
- 预填文案是否含类型名 + 回链动机（「你也是哪种」）？
- Duo / 再测一个 / 复测提醒是否抢主 CTA？

## F. Tone（严谨/幽默/搞笑）在结果层的兑现
- resultChrome / narrative 是否真随 Tone 变？
- 场景与 week-plan 是否几乎无 Tone？应否差异化？
- 缺 styles 的皮在结果页如何诚实表达？

## G. 信任与合规
- 免责声明位置是否恰当（不冲淡身份，也不消失）？
- 禁止：伪造解锁人数、伪临床诊断口吻、诱导恐吓。

# 输出格式（严格）

## 1. 三句话定调
（现在像什么 / 应该像什么 / 最大杠杆在哪）

## 2. 评分表（每项 1–5）
| 维度 | 分 | 一句话理由 |
|------|----|------------|
| 首屏身份冲击 | | |
| Partial reveal 可信度 | | |
| Soft→付费转化 | | |
| Full 行动价值 | | |
| 分享传播力 | | |
| Tone 兑现 | | |
| 移动端可读 | | |
| 品牌贴合 | | |

## 3. P0 / P1 / P2 改项清单
每项含：
- 标题
- 改哪里（文件路径 + 函数/CSS 类）
- 怎么改（具体交互/文案/线框文字描述）
- 为什么（对应哪条行业原则）
- 工时估计（S/M/L）
- 验收标准（可勾选）

## 4. Soft 页建议信息架构（上→下，375）
用列表画出你建议的区块顺序（标注 fold 上下）。

## 5. Full 页建议信息架构（上→下）
同上；标明可折叠区块。

## 6. 明确不做
列出你拒绝的诱惑方案及原因（如假社会证明、加邮箱门等）。

## 7. 本周可落地 5 条
只写本周能合进 static SPA 的改动。

# 约束
- 不改计分与维度算法
- 不引入新框架
- 价格维持体验价叙事时可优化文案，勿擅自改后端金额逻辑
- 建议须能在 apps/web 静态资源内落地
````

---

## 五、对照评分表（回收多份方案后填）

| 维度 | Cursor | DeepSeek | GLM | 其他 | 胜出 |
|------|--------|----------|-----|------|------|
| 首屏身份冲击 | | | | | |
| Partial reveal | | | | | |
| Soft→付费 | | | | | |
| Full 行动价值 | | | | | |
| 分享传播 | | | | | |
| Tone 兑现 | | | | | |
| 可执行性（路径+验收） | | | | | |
| 品牌克制 | | | | | |

**合成规则建议**：转化/IA 偏可执行稿；视觉仪式感可合取创意稿；涉及假数据/退款的项一律剔除。

---

## 六、建议验收样机

| 皮肤 | 为何 |
|------|------|
| seven_sins | 金标准，styles 完整 |
| love_brain | 迁入皮，缺 styles，测诚实提示与结果语气 |
| mbti16 | 长报告压力测试（可选） |

部署回归：`sudo bash /opt/digit-hub/deploy/quick_update.sh`
