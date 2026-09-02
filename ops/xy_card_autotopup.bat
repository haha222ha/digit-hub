@echo off
REM 闲鱼卡池低水位自动补货（测题链接 + 额度激活码）
REM 计划任务建议：每 10~30 分钟跑一次
cd /d D:\digit-hub-git
set PYTHONIOENCODING=utf-8
REM Sync Key：优先环境变量；否则脚本会读 D:\xhs-data\config\local_sync.env
REM set XHS_CLOUD_SYNC_KEY=your-key
REM set XHS_CLOUD_API_URL=https://monitor.xhs365.cn
REM set PSY_INTEGRATION_TOKEN=your-psy-token

if not exist "ops\xy_card_bridge_map.json" (
  echo [ERR] missing ops\xy_card_bridge_map.json
  echo copy ops\xy_auth_code_bridge_map.example.json or xy_card_bridge_map.example.json first
  exit /b 1
)

python ops\xy_card_bridge.py --only-low-water
exit /b %ERRORLEVEL%
