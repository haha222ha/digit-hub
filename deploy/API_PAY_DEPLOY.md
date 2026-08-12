# API + 真支付（重装机）

## 主机一键（Workbench）

先把支付密钥放到 `/tmp/xhs_cloud.env`（本机 `deploy/prepare_pay_env.ps1` 生成，**勿提交 git**），然后：

```bash
cd /opt/digit-hub && sudo git pull
# 若已用 scp/粘贴准备好 /tmp/xhs_cloud.env：
sudo bash /opt/digit-hub/deploy/api_fresh_install.sh
bash /opt/xhs-cloud/cloud_deploy/scripts/verify_payment_setup.sh
```

## DNS / HTTPS

1. Cloudflare（或域名 DNS）：`monitor.xhs365.cn` A 记录 → `47.239.181.111`（建议先关闭代理/灰云）
2. 主机：

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d monitor.xhs365.cn --non-interactive --agree-tos -m admin@xhs365.cn --redirect || \
  sudo certbot --nginx -d monitor.xhs365.cn
```

3. 商户后台通知 URL：`https://monitor.xhs365.cn/api/v1/payment/notify/hwxun`

### 心理分销 psy.xhs365.cn

```bash
# DNS: psy → 同 ECS IP（灰云）
cd /opt/digit-hub && sudo git pull && sudo bash deploy/quick_update.sh
sudo bash deploy/certbot_psy.sh
sudo bash deploy/accept_psy_dist.sh
```

详见 `deploy/PSY_DIST_ACCEPTANCE.md`。

## 前端

`http://47.239.181.111/?api=live` 或 `https://monitor.xhs365.cn/?api=live`
