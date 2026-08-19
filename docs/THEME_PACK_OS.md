# 主题测评包 OS（Theme Pack OS）

在 **Assess OS**（运行时：Skin × Tone × Base）之上，增加一条**上游生产管线**：从热点/影视/季节灵感 → 可上架的完整主题测评。

与 `note_cover` OS 同构：**Brief → 设计库 → 双轨投影**（测站皮肤 + 分销资产 + 笔记结果卡）。

## 五层模型

| 层 | 职责 | 落点文件 | 下游投影 |
|----|------|----------|----------|
| **0. 主题 Brief** | 灵感源、隐喻词典、合规边界、受众 | `brief.json` | 选题 intel、笔记文案 |
| **1. 视觉设计** | Token、材质、主图/结果卡构图 | `design.json` | `skin.theme` CSS 变量、主图 prompt |
| **2. 主题风格** | 叙事声口、梗密度、三 Tone 文案轨 | `voice.json` | `question.styles.*` |
| **3. 交互逻辑** | 计分模式、题量、进度 UX、双人/人口学 | `interaction.json` | `scoring` / `duo` / `askDemo` |
| **4. 题目与结果** | 维度、题干、选项分、结果叙事 | `content.json` | `packages/skins/{id}.json` |
| **5. 结果呈现视觉** | 轻结果卡、完整报告壳、分享图 spec | `reveal.json` | 笔记 HTML 结果卡、PDF 壳 |

```
热点 Brief
   ↓
theme-packs/{code}/   ← SSOT（编辑在此）
   ↓  python tools/theme_pack/build.py export {code}
packages/skins/{id}.json  +  apps/web/skins/
packages/psy-dist/brand/{code}_*.json   （主图/结果卡 prompt）
packages/skins/catalog.json             （登记）
```

## 目录约定

```
packages/theme-packs/
  catalog.json              # 已登记主题包索引
  _template/                # 复制即新包
    pack.json
    brief.json
    design.json
    voice.json
    interaction.json
    content.json
    reveal.json
  nly/                      # pilot：《牛来也》
    ...
```

`pack.json` 最小字段：

```json
{
  "id": "nly",
  "skin_id": "niu_lai_ye",
  "dist_code": "nly",
  "title": "牛来也 · 成长原型测",
  "status": "draft|review|live",
  "version": 1
}
```

## 与现有 OS 关系

| 模块 | 关系 |
|------|------|
| **Assess OS** | Theme Pack 导出后成为标准 `skin` JSON；运行时仍走 Tone 三风格 |
| **GEN_OS** | 本地工作台编辑 `voice.json` 三轨文案；`127.0.0.1:5188` |
| **Style Packs** | 全局 Tone Token；主题 `design.json` 只覆盖 `--theme-*` 局部变量 |
| **psy-dist** | `dist_code` 对应 `/tests/{code}/`；主图走 `images/shelf/{code}.jpg` |
| **note_cover** | `reveal.json` → `result_reveal_local_then_ark` 的 HTML 卡 spec |

## 生产流程（标准 SOP）

1. **Research**：写 `brief.json`（灵感、隐喻、禁踩线）
2. **Design**：`design.json` + `reveal.json`（视觉与结果卡同一气质）
3. **Structure**：`interaction.json` 定计分模式（常用 `dims` / `score_bands`）
4. **Content**：`content.json` 20–28 题；每维 4–7 题；选项分 3/2/1/0
5. **Voice**：`voice.json` 严谨/幽默/搞笑 三轨（可后补，导出时回退基题）
6. **Validate**：`python tools/theme_pack/build.py validate nly`
7. **Export**：`python tools/theme_pack/build.py export nly [--register-catalog]`
8. **Assets**：按 `design.shelf_prompt` 生主图 → `apps/psy-dist/images/shelf/nly.jpg`
9. **Deploy**：`git push` → ECS `quick_update.sh`；验 `/tests/nly/`

## 计分模式选型

| 主题类型 | 推荐 scoring | 结果形态 |
|----------|--------------|----------|
| 影视人格原型 | `dims` | 4–6 型主导维 |
| 病毒段位 | `score_bands` | 6–8 档称号 |
| 关系双人 | `dims` + `duo: true` | 对照页 |
| 周期复测 | `mental_age` / bands + `retest` | 时间序列 |

## 合规硬约束

- 娱乐向自我探索；禁医疗诊断、风水恐吓、版权角色名直出（用气质隐喻）
- 影视主题：写「气质原型」不写剧情剧透当卖点
- 主图：禁廉价霓虹花字、禁未授权 IP 角色脸

## 本地工具

```bash
# 校验
python tools/theme_pack/build.py validate nly

# 导出皮肤 + prompt 资产
python tools/theme_pack/build.py export nly --register-catalog

# 复制模板开新主题
python tools/theme_pack/build.py init my_theme --title "我的主题测"
```

GEN_OS 工作台（编辑 voice / 预览）：`cd apps/gen-os && python server.py` → http://127.0.0.1:5188/

## 扩展

- 新主题：复制 `_template/` → 填五层 JSON → validate → export
- 批量热点：从 `selection-intel/latest.json` 的 `theme_hooks[]` 自动生成 brief 草稿（待接 LLM 工具链）
