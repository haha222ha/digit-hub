# digit-hub · 心象测

本地完善的测评主站（墨纸实验室视觉）。支付/会员先走 mock，契约对齐 `vuemonitor/xhs-cloud`。

## 快速预览

```bash
cd apps/web
python -m http.server 5173
```

打开 `http://127.0.0.1:5173/`

## 结构

```
digit-hub/
  packages/base/         # 基座（A2HS 装到桌面、顶栏壳）
  packages/style-packs/  # 严谨/幽默/搞笑 三风格包
  packages/skins/        # 皮肤 JSON（含三语气 styles）
  packages/cloud-api/    # API 契约说明
  apps/web/              # 心象测 SPA（用户开测前选风格）
  apps/gen-os/           # 测评生成 OS · 仅本地 127.0.0.1:5188
  apps/faka/             # 云发卡预留
  docs/DESIGN_SYSTEM.md
  docs/GEN_OS.md
  deploy/                # 上云 nginx / systemd 示例（不含 gen-os）
```

基座同步：`python tools/sync_base.py`  
风格同步：`python tools/sync_styles.py`

### 测评生成 OS（本地）

```bash
cd apps/gen-os
python server.py
# http://127.0.0.1:5188/
```

## 首发三皮

1. `seven_sins` 七宗罪分布  
2. `mbti16` 16 型人格  
3. `mental_age` 心理年龄  

## Mock 权益

会员页可「模拟解锁」；`localStorage` 键 `xinxiang_entitlements`。
