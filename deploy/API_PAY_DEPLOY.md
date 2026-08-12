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

**默认：Cloudflare Flexible（灵活）** — 访客 HTTPS 由 CF 处理，源站只监听 **:80**，一般**不需要** certbot。

1. Cloudflare：`monitor.xhs365.cn` / `psy.xhs365.cn` A → `47.239.181.111`（可橙云）
2. 商户后台通知 URL：`https://monitor.xhs365.cn/api/v1/payment/notify/hwxun`

（仅当改用 Full / Full strict 时，才在源站跑 certbot。）

### 心理分销 psy.xhs365.cn

```bash
# DNS: psy → 同 ECS IP（Flexible，可橙云）
cd /opt/digit-hub && sudo git pull && sudo bash deploy/quick_update.sh
sudo bash deploy/accept_psy_dist.sh
```

详见 `deploy/PSY_DIST_ACCEPTANCE.md`。
## 前端

`http://47.239.181.111/?api=live` 或 `https://monitor.xhs365.cn/?api=live`
