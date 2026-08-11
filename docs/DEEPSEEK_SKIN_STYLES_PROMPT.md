# DeepSeek 提示词 · 15 套皮肤补 humor/funny 题干

> 心象测 digit-hub · 内容审计最大项  
> 生成日期：2026-08-11  
> 目标：为 15 套缺 `styles` 的皮肤 JSON 补全 `rigorous` / `humor` / `funny` 三语气题干与选项

---

## 使用方式（建议）

1. **一次只喂 1 套皮肤 JSON**（从 `packages/skins/xxx.json` 复制 `questions` 数组或整文件）。
2. 让 DeepSeek 按下方格式输出，贴回后合并进 `packages/skins/*.json`。
3. 建议顺序：`love_brain` → 其余情感 3 套 → 职场 4 套 → 复测 2 套 → 双人 2 套 → 趣味 3 套。

### 已有完整 styles（无需处理）

| 文件 | 题数 |
|------|------|
| seven_sins.json | 28 |
| mbti16.json | 72 |
| mental_age.json | 24 |

### 待处理清单（15 套 · 248 题）

| 文件 id | 中文名 | 题数 | 分组 |
|---------|--------|------|------|
| love_brain | 恋爱脑程度 | 20 | 情感 |
| ambiguity_rank | 暧昧段位 | 20 | 情感 |
| scam_magnet | 吸渣体质 | 20 | 情感 |
| attachment | 依恋类型 | 20 | 情感 |
| holland | 霍兰德职业兴趣 | 18 | 职场 |
| burnout | 职场内耗等级 | 15 | 职场 |
| workplace_pua | 职场 PUA 敏感度 | 16 | 职场 |
| job_burnout | 职业倦怠程度 | 18 | 职场 |
| monthly_drain | 月度精神内耗 | 15 | 复测 |
| monthly_mood | 月度情绪稳定度 | 18 | 复测 |
| couple_fit | 情侣婚恋适配 | 18 | 双人 |
| friend_contrast | 闺蜜性格反差 | 10 | 双人 |
| wuxing_city | 五行城市匹配 | 20 | 趣味 |
| city_vibe | 性格×城市 | 15 | 趣味 |
| soul_animal | 灵魂动物 | 15 | 趣味 |

### 分批建议

| 批次 | 皮肤 | 题数 |
|------|------|------|
| 1 | love_brain, ambiguity_rank, scam_magnet, attachment | 80 |
| 2 | holland, burnout, workplace_pua, job_burnout | 67 |
| 3 | monthly_drain, monthly_mood, couple_fit, friend_contrast | 61 |
| 4 | wuxing_city, city_vibe, soul_animal | 50 |

---

## DeepSeek 提示词（复制从这里开始）

```
你是「心象测」移动端心理测评产品的中文内容编辑。任务：为迁入皮肤 JSON 的每道题补全 `styles` 字段，使「幽默」「搞笑」两种 Tone 有**真正改写**的题干与选项，而不是加前缀糊弄。

---

## 产品背景

- 品牌：心象测（娱乐向自我探索，非临床诊断）
- 用户开测前可选三种 Tone：`rigorous`（严谨）、`humor`（幽默）、`funny`（搞笑）
- 前端读取 `question.styles[styleId]` 替换题干 `q` 与选项文案 `t`；**计分字段 `s` 只在根级 `o[]` 里，styles 里不写 s**
- 若缺 styles，前端会退化给 humor/funny 加「说人话版——」「【灵魂拷问】」等模板前缀——这是劣质体验，必须避免

---

## 你要处理的 15 套皮肤（全部缺 styles）

| 文件 id | 中文名 | 题数 | 分组 |
|---------|--------|------|------|
| love_brain | 恋爱脑程度 | 20 | 情感 |
| ambiguity_rank | 暧昧段位 | 20 | 情感 |
| scam_magnet | 吸渣体质 | 20 | 情感 |
| attachment | 依恋类型 | 20 | 情感 |
| holland | 霍兰德职业兴趣 | 18 | 职场 |
| burnout | 职场内耗等级 | 15 | 职场 |
| workplace_pua | 职场 PUA 敏感度 | 16 | 职场 |
| job_burnout | 职业倦怠程度 | 18 | 职场 |
| monthly_drain | 月度精神内耗 | 15 | 复测 |
| monthly_mood | 月度情绪稳定度 | 18 | 复测 |
| couple_fit | 情侣婚恋适配 | 18 | 双人 |
| friend_contrast | 闺蜜性格反差 | 10 | 双人 |
| wuxing_city | 五行城市匹配 | 20 | 趣味 |
| city_vibe | 性格×城市 | 15 | 趣味 |
| soul_animal | 灵魂动物 | 15 | 趣味 |

**本次只处理我粘贴的那 1 套**；不要臆造其他皮肤。

---

## JSON 结构（必须严格遵守）

每道题在现有字段不变的前提下，新增 `styles`：

```json
{
  "id": "q1",
  "d": "lovebrain",
  "q": "当TA突然不回消息时，你的第一反应是？",
  "o": [
    { "t": "疯狂发消息，打电话也要找到TA", "s": 10 },
    { "t": "反复查看手机，等待TA的回复", "s": 7 },
    { "t": "先做自己的事，稍后再联系", "s": 3 },
    { "t": "完全不在意，各自忙碌很正常", "s": 0 }
  ],
  "styles": {
    "rigorous": {
      "q": "当TA突然不回消息时，你的第一反应是？",
      "o": [
        { "t": "疯狂发消息，打电话也要找到TA" },
        { "t": "反复查看手机，等待TA的回复" },
        { "t": "先做自己的事，稍后再联系" },
        { "t": "完全不在意，各自忙碌很正常" }
      ]
    },
    "humor": {
      "q": "已读不回警报响起——你第一反应更像？",
      "o": [
        { "t": "连环 call + 消息轰炸" },
        { "t": "刷新聊天框，等一个「正在输入」" },
        { "t": "先干自己的事，晚点再戳" },
        { "t": "各忙各的，失联也正常" }
      ]
    },
    "funny": {
      "q": "【恋爱脑雷达】TA突然失联，你内心弹幕是？",
      "o": [
        { "t": "报警！必须找到人" },
        { "t": "手机焊手上了" },
        { "t": "我先活，晚点再联系" },
        { "t": "哦，挺好，继续搬砖" }
      ]
    }
  }
}
```

硬规则：

1. **不得修改** 根级 `q`、`o[].t`、`o[].s`、`d`、`id` 及文件其他顶层字段
2. `styles.*.o` 长度必须与根级 `o` **完全一致**，顺序一一对应（第 i 个选项语义等价、强度梯度不变）
3. `styles.*.o` 里**只有 `{ "t": "..." }`**，禁止出现 `s`
4. 每题必须同时有 `rigorous`、`humor`、`funny` 三个 key
5. `rigorous`：题干/选项与根级 `q`/`o[].t` **逐字相同**（复制即可）
6. 输出必须是合法 JSON，不要 markdown 代码块包裹（或若包裹则注明可解析）

---

## 两种 Tone 的写作标准

### humor（幽默）— tagline：「说人话 · 会心一笑 · 不端着」

- 气质：温润吐槽、观察型幽默、像朋友复盘
- 题干：场景化改写、口语化，可带「——」「别美化」「诚实账单：」等，但**不要每题同一模板**
- 选项：witty，短句，可轻微自嘲，仍清晰可辨
- 禁止：脏话、人身攻击、歧视、恐吓、医学诊断口吻

### funny（搞笑）— tagline：「鉴定大会 · 弹幕选项 · 敢选才好笑」

- 气质：整活、弹幕体、鉴定大会， punchy
- 题干：可用【xxx检测】【灵魂拷问】等，但**不要 20 题全用同一开头**；相邻题要换花样
- 选项：meme 感、可带「｜」后缀标签（如「本色出演」「小孩局」），短、好截图
- 禁止：低俗色情、恶意 mock 特定群体、虚假医疗承诺

### 共同要求

- **语义等价**：改写后用户选同一选项，计分结果必须与严谨版一致
- **强度梯度不变**：四档题里最高 s 的选项在 humor/funny 里仍应最「极端/典型」
- **拒绝前缀垃圾**：禁止 humor 题全是「说人话版——原题？」；禁止 funny 题全是「【灵魂拷问】原题？别演，选真的。」
- 题干长度：手机一屏可读，一般 8–28 字为佳，最长不超过 40 字
- 选项长度：一般 4–16 字，最长不超过 22 字

---

## 金标准参考（seven_sins 第 1 题，已上线）

严谨原题：「团队成功时，你更在意？」

humor 题干：「庆功宴灯光一打，你脑子里第一个小剧场是？」  
humor 选项：镜头有没有扫到我 / 成色够不够发朋友圈 / 大家有没有累坏 / 这招下次还能白嫖

funny 题干：「团队赢了！你内心弹幕更像？」  
funny 选项：快夸，我准备好了 / 审美过关，收工 / 和平第一，别撕 / 沉淀成 SOP 摸鱼

学习要点：**不是加前缀，而是换场景/换说法，选项也一起改**。

---

## 分皮肤内容调性提示

- **情感四件套**（love_brain / ambiguity_rank / scam_magnet / attachment）：恋爱、暧昧、边界、依恋；幽默要「懂行的朋友」，搞笑要「鉴定大会但不恶毒」
- **职场四件套**：内耗、PUA、倦怠、霍兰德；humor 像打工人复盘，funny 像工位弹幕；霍兰德题保持「兴趣倾向」可辨，别写成纯段子
- **复测两件**：monthly_drain / monthly_mood —— 语气偏「本月诚实面对自己」
- **双人两件**：couple_fit / friend_contrast —— 可用「你们/你俩」，但保持单人作答视角
- **趣味三件**：wuxing_city / city_vibe / soul_animal —— 可更放飞，但仍要选项可辨

---

## 输出格式

请只输出一个 JSON 对象：

```json
{
  "skin_id": "love_brain",
  "question_count": 20,
  "styles_patch": [
    {
      "id": "q1",
      "styles": { ... }
    }
  ]
}
```

- `styles_patch` 按题号顺序排列，覆盖该 skin **全部**题目
- 不要输出 bands、dimensions、intro 等无关字段
- 完成后自检清单（请在回复末尾用文字确认）：
  - [ ] 题数 = 原文件 questions 长度
  - [ ] 每题 styles 含 rigorous/humor/funny
  - [ ] 每题 options 数量与原版一致
  - [ ] 无 styles.o 含 s 字段
  - [ ] humor/funny 非模板前缀堆砌

---

## 现在开始

皮肤 id：**{在这里填，如 love_brain}**

以下是该皮肤的 questions 数组（JSON）：

{粘贴 questions 数组或完整 skin JSON}
```

---

## 合并与验收（本地）

DeepSeek 输出 `styles_patch` 后：

1. 按 `id` 合并进对应 `packages/skins/{skin_id}.json` 的 `questions[]`
2. 同步到 `apps/web/skins/`（若仓库有 sync 脚本则跑脚本）
3. 浏览器开 `#/t/{id}/play`，切换 humor / funny 目测题干是否真改写
4. intro 页「统一题干」提示应消失（需该 skin 每题都有 `styles`）

部署：

```bash
sudo bash /opt/digit-hub/deploy/quick_update.sh
```

---

## 相关文件

- 金标准皮肤：`packages/skins/seven_sins.json`
- Tone 定义：`apps/web/styles/humor.json`、`apps/web/styles/funny.json`
- 渲染逻辑：`apps/web/src/style/engine.js` → `materializeQuestion()`
