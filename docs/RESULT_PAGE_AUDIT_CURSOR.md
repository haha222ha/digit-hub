# 心象测 · 结果页专项审计稿（Cursor）

**提示词版本**: `docs/RESULT_PAGE_AUDIT_PROMPT.md`  
**审计日期**: 2026-08-11  
**角色**: 移动端增长设计 + 结果页转化  
**证据**: 代码阅读（`pages.js` / `value.js` / `scenes.js` / `exportCard.js` / `app.css`）+ 行业共识（partial reveal / 首屏身份 / 单一 CTA / 分享首折）+ 既有 `DESIGN_UX_FINAL_PLAN` 已知缺口  
**约束遵守**: 不改计分；不引入框架；不伪造人数；建议可静态落地  

> 本稿用于与 DeepSeek / GLM 等同题对照。重点是**可排期改法**。

---

## 1. 三句话定调

1. **现在像什么**：像一份排版讲究的「实验室预览报告」——类型名与金句够格截图，sticky ¥1.99 也在，但首屏到支付之间仍堆了价值清单与锁场景，像说明书中段，不像「测完就想解锁/转发」的高潮页。  
2. **应该像什么**：仍是墨纸实验室，但 soft 首屏 = **身份冲击 + 一句证据 + 一个解锁动机 + 分享入口**；full = **同一身份骨架 + 可执行的本周动作 + 可折叠深度**。  
3. **最大杠杆**：压缩 soft 中段、把 **outcome-matched CTA 贴到 hero 下**，并统一分享为「一键出卡」，而不是再堆模块。

---

## 2. 评分表

| 维度 | 分 | 一句话理由 |
|------|----|------------|
| 首屏身份冲击 | 4 | Hero 类型/金句/肖像已强；缺首屏内即时解锁钮 |
| Partial reveal 可信度 | 3 | 锁雷达/场景方向对，但 checklist 过长、模糊层略「空」 |
| Soft→付费转化 | 3 | sticky 已有，但 fold 上无 CTA；文案偏通用「解锁完整报告」 |
| Full 行动价值 | 4 | 场景 + 7 日计划骨架好；移动端缺折叠/锚点 |
| 分享传播力 | 3 | 有卡有按钮，但截图金句与导出卡双轨；预填回链弱 |
| Tone 兑现 | 3 | hero/chrome 有差；scenes/week-plan 基本无 Tone |
| 移动端可读 | 3 | soft 偏长；full 更长，滚动成本高 |
| 品牌贴合 | 4 | 墨纸/印章/陶土价签一致，未滑向荧光风 |

---

## 3. 改项清单

### P0（本周，转化杠杆）

#### P0-1 Hero 下即时解锁 CTA
- **改哪里**: `pages.js` → `renderSoftResult`；`app.css` → `.hero-unlock-cta`
- **怎么改**: 在 `narrativeHeroHtml` 之后、价值块之前，插入一条紧凑 CTA：`¥1.99 解锁「{主导维/类型}」完整调节报告`，点击同 `#cta` → `openPayDrawer`。Sticky 条保留作滚后保险。
- **为什么**: Mobile CTA visibility + One primary CTA（行业：主行动要紧贴结果身份）
- **工时**: S
- **验收**:
  - [ ] 375 视口不滚动即可看到类型名 + 解锁钮
  - [ ] Sticky 仍在；两处 CTA 打开同一抽屉

#### P0-2 Soft 中段瘦身：清单默认折叠
- **改哪里**: `result/value.js` → `softValueHtml` / `unlockValueStripHtml`
- **怎么改**: 「完整报告你将获得」改为 `<details>`，默认收起，摘要一行「雷达 · 场景 · 7 日计划 · 复测」；锁场景只留 **1 张**强钩子卡，其余进「解锁后可见 N 个场景」。
- **为什么**: Scan don't essay；Partial reveal 要「货真」但不占满折下
- **工时**: S
- **验收**:
  - [ ] soft 首屏下第一屏不再被五条 checklist 占满
  - [ ] 仍能感知「里面有货」

#### P0-3 CTA 文案 outcome-matched
- **改哪里**: `style/engine.js` `resultChrome`；`narrative.js` `ctaHint`；`pages.js` soft CTA 文案
- **怎么改**: 按 mode 生成：七宗罪→「解锁七维调节实验」；恋爱脑→「解锁边界与本周动作」；MBTI→「解锁四维弹性区间解读」；默认→「解锁完整报告 · ¥1.99」。Sticky 与 Hero CTA 共用同一生成函数。
- **为什么**: Outcome-matched next step
- **工时**: S
- **验收**:
  - [ ] seven_sins / love_brain / mbti16 文案可区分
  - [ ] 不含「了解更多」类空话

#### P0-4 分享路径收束为一条主路径
- **改哪里**: `pages.js` soft/full 底栏；`share/exportCard.js`；hero 内「截图这句话」弱化
- **怎么改**: 主按钮统一「生成分享卡」；hero 金句旁改为小字「已写入分享卡」。预填文案：`我是「{type}」· 心象测｜你也来测？` + 站点短链（首页或该皮 intro）。
- **为什么**: Share in first fold；减少决策疲劳
- **工时**: S–M
- **验收**:
  - [ ] soft 可见区分的主分享按钮靠近身份区（hero 下或 sticky 上方次按钮）
  - [ ] 系统分享/下载文案含类型名

#### P0-5 Soft 增加「1 条听答证据」
- **改哪里**: `result/narrative.js` 或 `value.js`
- **怎么改**: 在类型名下增加一行 evidence：取最高维或 MBTI 最偏极轴，文案模板「因为你在「{维}」上显著偏高/偏好…」。已有 `.evidence-chip` 则合并为不超过 2 枚，避免噪点。
- **为什么**: Proof of listening
- **工时**: S
- **验收**:
  - [ ] soft 可见与得分相关的一句「被看见」文案
  - [ ] 不暴露完整雷达数值（仍属付费）

### P1（下周，完整报告与 Tone）

#### P1-1 Full 页章节折叠 + 迷你目录
- **改哪里**: `pages.js` `renderFullReport`；`value.js` `fullValueHtml`；`app.css`
- **怎么改**: 「深度解读」「同龄对照」「历史曲线」默认 `<details>`；顶部加锚点条：画像 | 场景 | 7日 | 证据 | 深度。
- **为什么**: 移动端可读；深度不挡行动
- **工时**: M
- **验收**:
  - [ ] 进入 full 不滚即可点到「7日」
  - [ ] 深度文默认折叠

#### P1-2 7 日计划「今日第几步」状态
- **改哪里**: `result/value.js` `buildWeekPlan`；localStorage key per rid
- **怎么改**: 七个勾可选本地打卡（仅前端），显示「已完成 x/7」；复测 banner 与之联动文案。
- **为什么**: Full 行动价值可感知
- **工时**: M
- **验收**:
  - [ ] 刷新后勾选保留
  - [ ] 不要求登录

#### P1-3 Tone 渗入场景标题/动作一句
- **改哪里**: `result/scenes.js`；可选 content-packs
- **怎么改**: 不为全文重写，只对 `scene` 标题与 `act` 行做 Tone 词典映射（funny 加弹幕后缀；humor 换口语动词）。缺 styles 的皮在 soft 顶部保留诚实 pill。
- **为什么**: Tone 兑现不应停在 kicker
- **工时**: M
- **验收**:
  - [ ] 同 rid 切换 Tone 后重进结果，场景标题有可感知差异
  - [ ] rigorous 保持克制

#### P1-4 分享卡视觉补强（火漆位置与类型色带）
- **改哪里**: `share/exportCard.js`
- **怎么改**: 右上明确「心」火漆；类型名下加 4–6px seal 色带；footer 固定「心象测 · monitor.xhs365.cn」。
- **为什么**: 病毒测分享卡标准件
- **工时**: S
- **验收**:
  - [ ] 导出 PNG 在小红书预览中类型名一眼可读
  - [ ] 含站点来源

### P2（可排期）

| 项 | 说明 | 工时 |
|----|------|------|
| Soft 锁场景「撕纸预览」质感 | 替代纯 blur，增强「有货」感 | S |
| Full PDF 封面与 soft 卡同源 | 降低两套视觉 | M |
| 真实解锁计数（若后端有） | 仅真实数据可上 | L |
| 结果页 A/B：有无 hero CTA | 埋点后验 | M |

---

## 4. Soft 页建议信息架构（375，上→下）

**折上（首屏）**
1. 品牌条 / Tone pill / 免责声明（极弱）
2. 类型名（最大）+ 短肖像/段位
3. 金句（可截图式，但不单独抢 CTA）
4. 1–2 枚 evidence chip（听答）
5. **主 CTA：outcome-matched · ¥1.99**
6. 次操作：生成分享卡

**折下**
7. 轻价值：主导信号（无精确 %）+ 1 张锁场景钩子  
8. `<details>` 完整报告清单  
9. 模糊雷达暗示（短）  
10. Sticky 解锁条（滚后）  
11. 授权码入口（已在支付抽屉；页内可不重复）  
12. 再测一个 / Duo（最弱）

---

## 5. Full 页建议信息架构（上→下）

1. 同 soft 的身份 Hero（无付费 CTA，改「导出分享卡 / PDF」）  
2. 锚点：画像 | 场景 | 7日 | 证据 | 深度  
3. 三卡片：置信度 / 支点 / 切口（保留）  
4. **场景全文 + 本周动作**（默认展开）  
5. **7 日微实验**（默认展开 + 本地打卡）  
6. 结构证据：雷达 + 维条（展开）  
7. `<details>` 同龄对照  
8. `<details>` 历史曲线  
9. `<details>` 深度解读 `r.full[]`  
10. 分享卡 + PDF + 复测提醒  

---

## 6. 明确不做

| 诱惑 | 拒绝原因 |
|------|----------|
| 伪造「已有 N 人解锁」 | 无数据则伤信任；FINAL_PLAN 已否决 |
| Soft 前邮箱门禁 | 与 ¥1.99 漏斗冲突；中国移动场景摩擦大 |
| 结果页堆 3+ 主按钮 | 违反 One primary CTA |
| 把完整雷达放到 soft | 削弱付费差异；仅可示意模糊 |
| 整页改成大插画 meme 风 | 破坏墨纸实验室品牌 |
| 不满意退款文案 | 无客服/支付政策前不上 |

---

## 7. 本周可落地 5 条

1. Hero 下即时 ¥1.99 CTA（与 sticky 双保险）  
2. Soft checklist 默认折叠 + 锁场景减到 1 张钩子  
3. CTA 文案按 mode outcome-matched  
4. 分享主路径收束 + 预填含类型名  
5. Soft 增加/收敛为 ≤2 条听答证据  

（对应 P0-1～P0-5；预计 0.5–1 人日可合进 `apps/web`。）

---

## 附：与提示词行业原则映射

| 原则 | 本稿落点 |
|------|----------|
| Partial reveal | P0-2、§4 |
| First viewport identity | P0-1、§4 |
| One primary CTA | P0-1、P0-3、§6 |
| Proof of listening | P0-5 |
| Share in first fold | P0-4、P1-4 |
| Scan don't essay | P0-2、P1-1 |
| Outcome-matched CTA | P0-3 |

---

**对照用法**: 将他模型输出与本稿按 `RESULT_PAGE_AUDIT_PROMPT.md` 第五节表打分，再合成 `RESULT_PAGE_FINAL_PLAN.md` 后实施。
