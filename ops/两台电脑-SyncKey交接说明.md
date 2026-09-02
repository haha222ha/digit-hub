# 两台电脑：云端运维机 vs 闲鱼发货机

## 角色

| 机器 | 职责 |
|------|------|
| **本机（digit-hub / 运维）** | 持有 `XHS_CLOUD_SYNC_KEY`；维护套餐与发码 API；可手工 mint |
| **闲鱼发货机** | 跑闲鱼自动发货 + `xy_card_bridge.py`；低水位时用 Sync Key 向云端 mint 激活码写入卡池 |

发货机 agent 已对接完映射后，**只差 Sync Key**。密钥在运维机，不在发货机。

## 运维机要做的

1. 确认 `D:\xhs-data\config\local_sync.env` 或 `ops/.cloud_sync.env` 有 Key  
2. 桌面交接包：`xianyu-pc-synckey-handoff\`（内含 `cloud_sync.env`，勿外传）  
3. U 盘 / 内网拷到发货机即可；**不要**在群聊贴密钥明文  

## 发货机要做的

```bat
copy cloud_sync.env  <digit-hub>\ops\.cloud_sync.env
cd /d <digit-hub>
python ops\xy_card_bridge.py --dry-run --only-low-water
python ops\xy_card_bridge.py --only-low-water
```

期望：2000 档（可发单数 2 < 低水位 4）出现 `imported` / 库存上升。

## 验收

付款 → 自动收到 `XHS-…` → https://psy.xhs365.cn「兑换额度」到账。
