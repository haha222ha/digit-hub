# 心理分销（psy.xhs365.cn）上线验收

## 1. DNS

在域名 DNS（Cloudflare 建议先**关闭代理/灰云**）添加：

| 类型 | 主机记录 | 值 |
|------|----------|-----|
| A | `psy` | `47.239.181.111`（ECS 公网 IP） |

验证：

```bash
dig +short psy.xhs365.cn
# 应返回 ECS IP
curl -I http://psy.xhs365.cn/
```

## 2. SSL（Let's Encrypt）

DNS 生效后，在 ECS 执行：

```bash
cd /opt/digit-hub
sudo git pull
sudo bash deploy/quick_update.sh
sudo bash deploy/certbot_psy.sh
```

证书路径：`/etc/letsencrypt/live/psy.xhs365.cn/`  
`nginx_apply.sh` 检测到证书后会自动写 **443 + 80→HTTPS 跳转**。

## 3. 代码部署

```bash
cd /opt/digit-hub && sudo git pull && sudo bash deploy/quick_update.sh
```

Smoke 期望含：`psy_dist_tests: 36`

## 4. 完整业务链路验收

### 自动化（API）

```bash
sudo bash /opt/digit-hub/deploy/accept_psy_dist.sh
# 或指定域名
PSY_ORIGIN=https://psy.xhs365.cn sudo bash /opt/digit-hub/deploy/accept_psy_dist.sh
```

覆盖：测题列表 → 注册分销商 → 查额度 → 生成链接 → validate/start/complete。

### 人工（浏览器）

1. 打开 https://psy.xhs365.cn/login 注册分销商（默认约 5 额度）
2. **买额度**（任选）  
   - 管理台「额度购买」→ 微信/支付宝（需 hwxun 已配置）  
   - 或超管发额度码后「兑换码充值」：
     ```bash
     cd /opt/xhs-cloud && export PYTHONPATH=/opt/xhs-cloud
     ./venv/bin/python cloud_deploy/scripts/manage_auth_codes.py generate \
       --product psy_dist --sku quota_100 --count 1 --export
     ```
3. **生成链接**：选测题（如 `mbti` / `7v7`）→ 复制 `/test/{code}/{token}`
4. **C 端做题**：手机打开链接 → 做完直接看完整报告（免注册）
5. **超管查看**：https://monitor.xhs365.cn/admin/ → Tab「心理分销」  
   可见：额度订单、链接明细、分销商、测题分布

## 5. 支付回调

分销额度套餐 `psy_quota_*` 与心象测共用：

`https://monitor.xhs365.cn/api/v1/payment/notify/hwxun`

支付成功后自动给分销商充 `quota`。
