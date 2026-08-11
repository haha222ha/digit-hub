# 测评生成 OS（本地专用 · 不上云）

面向「生成与打磨」的工作台，把测评拆成三层，并支持三种体验风格同步输出：

| 层级 | 内容 |
|------|------|
| 1 界面设计 | Token、圆角、色板、动效密度 |
| 2 题目设计 | 严谨 / 幽默 / 搞笑 三语气题干与选项 |
| 3 结果页 | 导语、CTA、结果外壳语气与视觉 |

用户在测评站开测前选择风格；本 OS 只在 `127.0.0.1` 写本地文件。

## 启动

```bash
cd apps/gen-os
python server.py
```

打开：**http://127.0.0.1:5188/**

测评站预览仍用：`apps/web` → **http://127.0.0.1:5173/**

## 数据落盘

- 风格包：`packages/style-packs/{rigorous,humor,funny}.json`
- 皮肤题库：`packages/skins/*.json`（同步 `apps/web/skins`）
- 题目字段：`question.styles.rigorous|humor|funny = { q, o:[{t}] }`

## 与测评站关系

- 测评站读取 `apps/web/styles` + 皮肤 `styles` 变体
- 生成 OS 负责编辑与保存；不部署到 ECS
