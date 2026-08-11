# 上云部署清单（D4 · 设计验收后执行）

本地前端已可独立验收。上云时：

## 1. 系统

Ubuntu 22.04 · 安装 nginx、postgresql、python3-venv、certbot

## 2. 代码

```bash
sudo mkdir -p /opt/digit-hub
# 同步本仓库 digit-hub + 从 vuemonitor 检出 xhs-cloud/cloud_deploy
```

静态站：`/opt/digit-hub/apps/web`  
API：复用 `xhs-cloud` uvicorn（见 `digit-api.service.example`）

## 3. 配置

- 新库 `digit_hub`
- `.env`：JWT / Admin / DB / hwxun（参考本地 wipe 备份键名，**轮换密钥**）
- 前端 `src/api/client.js`：`USE_MOCK = false`

## 4. Nginx

见 `nginx.xinxiang.conf.example` → HTTPS → 回调  
`https://域名/api/v1/payment/notify/hwxun`

## 5. 烟测

1. 打开首页品牌首屏  
2. 完成七宗罪测评 → 轻结果  
3. 真支付测试金额 → 回调 → 完整报告可读  
4. 授权码激活同样可读  

## 6. 明确不上

选品爬虫、旧 Flask `/admin`、97 皮整包。
