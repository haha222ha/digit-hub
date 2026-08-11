# GLM 视觉 · 交互 · 系统设计优化提示词 · 心象测

供 **智谱 GLM / 多模态设计审计** 使用。聚焦**视觉冲击感、移动端体验、题目设计、多测评抽屉、转化漏斗**，在现有「墨纸实验室」气质上给出可落地改法。

---

## 一、产品与品牌上下文（必读）

```
产品：心象测（digit-hub）
Slogan：三分钟，看见另一种自己
气质：INK PAPER LAB · 墨纸实验室
  - 纸纹背景、墨色正文、seal 深绿 #1f6b5c、ember 陶土 #c45c26
  - 字体：Fraunces/Noto Serif SC（标题）+ DM Sans/苹方（正文）
  - 高级感 = 克制装饰 + 强排版 + 微动效，不是花哨渐变

商业目标：
  - 自然流量：免费测 → 轻结果悬念 → ¥1.99 解锁完整报告
  - 发卡流量：?code= → 激活 → 已付费体验
  - 传播：轻结果分享卡（3:4 小红书）、类型标签、可截图金句

技术约束：
  - 原生 ES Module SPA，无 React/Vue
  - 测评 OS：Skin（皮）× Tone（严谨/幽默/搞笑）× Base 能力
  - 改 UI 主要落点：app.css、tokens.css、pages.js、packages/skins/
  - 不要建议整站重写框架
```

---

## 二、必访 URL（375px 手机 + 桌面各一套截图）

| 页面 | URL |
|------|-----|
| 首页 Hero + 横向测评卡 | https://monitor.xhs365.cn/ |
| 全部测评目录（分组抽屉） | https://monitor.xhs365.cn/#/tests |
| 开测前 intro（风格切换） | https://monitor.xhs365.cn/#/t/seven_sins |
| 测题页 play | https://monitor.xhs365.cn/#/t/seven_sins/play |
| 轻结果 + 解锁抽屉 | 完成任意测评后 |
| 激活页 | https://monitor.xhs365.cn/#/activate |
| 会员中心 | https://monitor.xhs365.cn/#/account |

---

## 三、代码与资产路径

```
D:\选品报告\资料生产工厂\digit-hub\docs\DESIGN_SYSTEM.md
D:\选品报告\资料生产工厂\digit-hub\docs\ASSESS_OS.md
D:\选品报告\资料生产工厂\digit-hub\apps\web\src\styles\tokens.css    # 设计 token
D:\选品报告\资料生产工厂\digit-hub\apps\web\src\styles\app.css       # 主样式
D:\选品报告\资料生产工厂\digit-hub\apps\web\src\pages.js             # 页面结构/HTML
D:\选品报告\资料生产工厂\digit-hub\apps\web\src\result\value.js      # 轻/重结果信息架构
D:\选品报告\资料生产工厂\digit-hub\apps\web\src\result\scenes.js     # 场景长文
D:\选品报告\资料生产工厂\digit-hub\apps\web\src\quiz\session.js      # 测题交互/退出挽回
D:\选品报告\资料生产工厂\digit-hub\packages\skins\catalog.json       # 测评目录分组
D:\选品报告\资料生产工厂\digit-hub\packages\skins\*.json               # 各测评皮题目
D:\选品报告\资料生产工厂\digit-hub\packages\tones\                    # 三风格 JSON
D:\选品报告\资料生产工厂\digit-hub\packages\content-packs\            # 题目/结果文案母版
```

---

## 四、主提示词（复制给 GLM）

```markdown
# 角色
你是资深移动端产品设计总监 + 交互视觉顾问，擅长高转化趣味测评产品（参考：16Personalities 结构感、Duolingo 进度、小红书分享卡审美），但输出必须贴合「心象测 · 墨纸实验室」品牌，不能变成泛娱乐荧光风。

# 任务
对心象测做一次**视觉冲击力 + 交互逻辑 + 系统设计**专项审计，输出「可交给前端直接改」的建议。重点不是写报告，而是：**改哪里、怎么改、为什么、验收标准**。

# 审计维度（每项必须给具体文件路径 + 改法）

## 1. 品牌视觉冲击力（Mobile First）
- 首屏 3 秒内：价值、气质、行动是否一屏完成？
- 「墨纸实验室」是否足够**有记忆点**？缺什么（印章动效、纸边阴影、打字机 kicker、品牌字动画）？
- seal / ember 双色是否用在对的地方（CTA、解锁、进度）？
- 与竞品心理测验 App 比，**高级感差距**在哪？如何在不加插画的前提下提升？

## 2. 首页 · 横向测评卡抽屉（rail）
- 当前：首页横向滑动卡片 + 「浏览全部」→ #/tests
- 评估：卡片信息密度（题数/分钟/promise）、滑动阻力、首尾卡曝光、more 卡转化
- 建议：是否改为「今日主推 1 张 + 次级横滑」？卡片是否需要封面色/图标/序号强化？
- 代码：`pages.js` renderHome、`.rail-card` 相关 CSS

## 3. 多测评目录页 #/tests（分组抽屉）
- 六组：性格认知 / 情感关系 / 职场发展 / 周期复测 / 双人对照 / 趣味集邮
- 评估：accordion 展开效率、分组命名、live/coming 状态、复购引导
- 建议：搜索/筛选？热门标签？「5 分钟以内」快捷筛？
- 代码：`catalog.json`、`pages.js` renderCatalog、`.catalog-group`

## 4. 题目设计（内容 + 呈现）
- 读 2 套 live 皮（如 seven_sins、love_brain）的 JSON 题目
- 评估：题干长度、选项对称性、口语化、陷阱题、疲劳点（第几题开始流失）
- Tone 三风格：严谨/幽默/搞笑 切换是否有**可感知差异**？
- 建议：每皮「钩子题」位置、进度里程碑 copy、双人对照题差异
- 代码：`packages/skins/*.json` 的 `question.voice[toneId]`

## 5. 测题页 play（一题一屏）
- 触控目标、进度条、选项反馈动画、上一题/离开挽回
- 手机端：拇指热区、safe-area、键盘遮挡、横屏
- 建议：题间过渡是否可更「仪式化」？进度是否加 milestone（25%/50%/75%）？
- 代码：`quiz/session.js`、`app.css` `.quiz-stage` `.option`

## 6. 轻结果 → 解锁漏斗（¥1.99）
- 悬念 vs 转化：blur 雷达、隐藏百分比、场景 tease 是否足够痒？
- 解锁抽屉：价格锚点、信任元素、支付/授权码双路径层级
- 支付成功注册表单（已非 prompt）：移动端表单体验
- 建议：划线价？社会证明？「已有 xxx 人解锁」？限时感如何不低俗？
- 代码：`result/value.js`、`pages.js` openPayDrawer

## 7. 分享与传播
- 分享卡 3:4、金句 hook、dominant type 视觉权重
- 小红书/闲鱼语境：标题、标签、截图引导文案
- 代码：`share/exportCard.js`、轻结果页分享区

## 8. 手机端布局系统
- `--max: 720px` 是否合适？顶栏 + 底栏 + drawer 层级
- 字体阶梯、行高、段间距在 375px 下是否易读？
- 横滑区、accordion、支付 drawer 的 z-index 与滚动锁定
- 建议：是否需要 bottom tab（首页/目录/我的）？还是保持单页流？

# 输出格式

## A. 视觉诊断（3 句话定调：现在像什么、应该像什么、最大差距）

## B. 冲击力提升清单（按页面）
| 页面 | 现状问题 | 改法（具体到 CSS class / copy） | 预期效果 | 工时 S/M/L |

## C. 题目与内容设计
| 测评皮 | 题目问题 | 改写示例（1 题 Before/After） | Tone 差异建议 |

## D. 目录与多测评抽屉
| 组件 | 问题 | 信息架构改法 | 线框描述（文字） |

## E. 移动端专项
| 问题 | 375px 证据 | 改法 | WCAG/触控 |

## F. 转化漏斗视觉优化
轻结果 → 抽屉 → 支付/激活：逐步建议 + 心理机制说明

## G. 优先级路线图
- 本周可上线（纯 CSS/copy，不动计分）
- 两周（结构调整）
- 需内容生产（新题/新皮）

## H. 三个「惊艳但克制」的创意
必须符合墨纸气质，拒绝 neon/渐变堆砌。每个创意说明：实现路径 + 风险。

# 约束
- 所有建议必须可在前端静态 SPA 内实现，不引入重型 UI 库
- 计分逻辑不可改，只改呈现与 copy
- 区分 live 生产路径与 mock 演示
- 每条建议写验收方式（截图对比点 / 用户路径）
- 引用代码时用 `文件路径:大致行号` 格式
```

---

## 五、分模块子提示词

### 5.1 仅视觉冲击力

```markdown
只审计「墨纸实验室」视觉冲击力。打开 https://monitor.xhs365.cn/ 手机模式。
对照 tokens.css 色板，评估：首屏、测题页、轻结果、解锁抽屉。
输出：5 个「最小改动、最大视觉冲击」的 CSS 补丁（含具体 property 值）。
禁止：紫色渐变、玻璃拟态泛滥、过大圆角卡通风。
```

### 5.2 仅题目与 Tone

```markdown
读取 packages/skins/seven_sins.json、love_brain.json 与 packages/tones/。
评估题目在 rigorous/humor/funny 三 Tone 下的差异度与口语质量。
输出：每皮 3 道「应重写」的题干 + 改写样例；1 条「钩子题应前移」建议。
```

### 5.3 仅目录与横滑抽屉

```markdown
审计首页 rail 与 #/tests 分组页的信息架构。
参考：App Store Today 卡片、Spotify 横向列表、Notion 模板库。
输出：catalog.json 分组是否应合并/重命名；首页应展示几张卡；是否加「🔥 5分钟」filter。
附 ASCII 线框。
```

### 5.4 仅移动端布局

```markdown
375×812 视口走完整路径：首页 → intro → play(5题) → 轻结果 → 解锁抽屉。
找：拇指够不到的按钮、文字过小、横滑卡顿、drawer 遮挡、safe-area 问题。
输出：app.css 媒体查询补丁清单。
```

---

## 六、竞品与参考 moodboard（给 GLM 的审美锚点）

| 参考 | 学什么 | 不学什么 |
|------|--------|----------|
| 16Personalities | 结果类型英雄区、结构清晰 | 过于冗长问卷 |
| Duolingo | 进度条、退出挽回、里程碑 | 过度 gamification 视觉 |
| 小红书测评帖 | 分享卡比例、金句、标签 | 廉价边框模板 |
| Apple HIG | 触控 44pt+、动效克制 | — |
| 墨纸信笺/实验室手册 | 纸纹、印章、排版留白 | — |

---

## 七、当前已知基线（审计勿重复建议）

- ✅ 生产域名自动 live；发卡链带 api=live
- ✅ 轻结果 blur + 隐藏百分比
- ✅ 支付后 inline 注册表单（非 prompt）
- ✅ 测题 option min-height 52px
- ✅ prefers-reduced-motion
- ⚠️ 支付抽屉暂无划线价锚点
- ⚠️ 目录页无搜索/时长筛选
- ⚠️ 首页 rail 信息密度高，缺「主推单卡」视觉焦点

---

## 八、建议附件

| 优先级 | 文件/素材 |
|--------|-----------|
| P0 | 手机截图：首页、play、轻结果、解锁抽屉 |
| P0 | tokens.css + app.css |
| P1 | catalog.json + seven_sins.json + love_brain.json |
| P1 | pages.js（renderHome、renderCatalog、renderSoftResult） |
| P2 | value.js、session.js |

---

*文档版本：2026-08-11 · 配合 GLM_AUDIT_PROMPT.md 技术审计使用*
