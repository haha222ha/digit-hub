# 测评 OS（Assess OS）

心象测不只是「几套题」，而是一套可编排的测评操作系统：**内容皮（Skin）× 表达风格（Tone）× 基座能力（Base）**。

用户在开测前选择风格，**题目文案、界面视觉、结果页叙事**三层同步切换，形成多样性而不改计分内核。

## 三层模型

| 层 | 职责 | 落点 |
|----|------|------|
| **1. 界面设计** | 高级感视觉：纸张/墨色/排版/动效按 Tone 换肤 | `packages/tones/*.json` → `data-tone` + CSS |
| **2. 题目设计** | 同一计分点，不同声口（严谨 / 幽默 / 搞笑） | `question.voice[toneId]` |
| **3. 结果展示** | 轻结果/完整报告的信息架构与文案语气随 Tone | `result/value.js` + tone result chrome |

## 计分模式

| scoring | 说明 | 示例皮 |
|---------|------|--------|
| `dims` | 维度百分比重，主导维取 `results[topId]` | 七宗罪 |
| `mbti` | 四维偏好 → 四字母类型 | mbti16 |
| `mental_age` | 维度 + 换算分映射 `bands`（心理年龄阶段） | mental_age |
| `score_bands` | 维度累加总分映射病毒式段位 `bands[]` | love_brain 等迁入皮 |
| `holland` | RIASEC 六维 → 三联兴趣码 + combos | holland |

`score_bands` 的 band 字段：`max, label, quote, advice?, emoji?, color?, tags?`。结果含 `band` 对象供叙事/段位徽章使用。

## 人口学轻问诊

开测前可选 2 问（状态 / 使用目的），写入 `result.demographics` + `result.demoLine`，**不参与计分**，只影响叙事措辞。  
触发：`skin.duo` / `skin.askDemo` / 情感类 id。实现：`src/demo/demographics.js`。

## 双人对照

`skin.duo: true` 的皮（如 couple_fit、friend_contrast）：

```
座位 A 作答 → 轻结果「邀请对方」→ 座位 B 作答 → #/t/:id/duo 对照页
```

同设备 localStorage 会话：`src/duo/session.js`。

## PDF 导出

完整报告页「下载完整报告 PDF」：Canvas 墨纸分页 → JPEG → 纯 JS 拼 PDF（无 CDN，CJK 安全）。  
实现：`src/share/exportPdf.js`。

## 三种官方 Tone

| id | 名称 | 气质 | 适合 |
|----|------|------|------|
| `rigorous` | 严谨 | 实验室、低装饰、证据优先 | 认真自我分析、正式场景 |
| `humor` | 幽默 | 温润吐槽、松弛、仍可读 | 日常探索、分享欲适中 |
| `funny` | 搞笑 | 夸张、梗感、娱乐向 | 社交传播、轻松局 |

计分维度与选项分值**不随 Tone 改变**；Tone 只改「怎么说」和「怎么长什么样」。

## 目录复购分组

`packages/skins/catalog.json` 六组：性格认知 / 情感关系 / 职场发展 / 周期复测 / 双人对照 / 趣味集邮。

## 用户路径

```
选测评皮 → 选 Tone → [可选人口学] → [心理年龄阶段] → 答题 → 轻结果 → 完整报告（PDF/分享）
双人皮额外：A → B → 对照页
```

## 从九十多套迁入

```bash
python tools/import_legacy_quiz.py --app 恋爱脑程度检测 --id love_brain --mode score_bands
python tools/import_legacy_quiz.py --app 霍兰德职业兴趣测试 --id holland --mode holland
python tools/batch_import_legacy.py
```

批量清单见 `tools/batch_import_legacy.py`。产出同步到 `packages/skins/` 与 `apps/web/skins/`。

## 扩展

- 新 Tone：在 `packages/tones/` 加 JSON + CSS 变量块，登记 `catalog.json`
- 新皮：题库带 `voice` 三套文案；无 `voice` 时回退基题 + Tone 包装器
- **新主题包**：走 [Theme Pack OS](./THEME_PACK_OS.md) — `packages/theme-packs/` → `tools/theme_pack/build.py export`
- 发卡等模块只复用 Base，不强制 Tone；测评模块强制走 OS

同步：`python tools/sync_tones.py` · 变体生成：`python tools/gen_tone_variants.py`
