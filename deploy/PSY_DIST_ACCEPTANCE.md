# 心理分销（psy.xhs365.cn）上线验收

> **默认假设**：域名走 Cloudflare **Flexible（灵活）** + Always Use HTTPS。  
> 访客 HTTPS 由 CF 终结，**源站只开 :80 HTTP，不申请 Let's Encrypt**。可橙云。

## 1. DNS

| 类型 | 主机记录 | 值 | 代理 |
|------|----------|-----|------|
| A | `psy` | `47.239.181.111`（ECS 公网 IP） | 可橙云（Flexible） |

验证：

```bash
dig +short psy.xhs365.cn
# 橙云时可能是 CF Anycast IP，属正常
curl -I https://psy.xhs365.cn/
```

## 2. 源站（无证书）

只需部署 nginx :80 + API，**不要**跑 `certbot_psy.sh`（除非以后改 Full/Strict）。

```bash
cd /opt/digit-hub
sudo git pull
sudo bash deploy/quick_update.sh
```

`nginx_apply.sh` 在无证书时只写 `:80`；有证书才会写 443（本站默认不用）。

## 3. 代码部署

同上 `quick_update.sh`。Smoke 期望含：`psy_dist_tests: 36`

## 4. 完整业务链路验收

### 自动化（API）

```bash
sudo bash /opt/digit-hub/deploy/accept_psy_dist.sh
# 或指定域名
PSY_ORIGIN=https://psy.xhs365.cn sudo bash /opt/digit-hub/deploy/accept_psy_dist.sh
```

覆盖：测题列表 → 注册分销商 → 查额度 → 生成链接 → validate/start/complete → 套餐/文档/购额方式 → 额度日志/测题结果/导出 → JSAPI bootstrap（可选 SUPER_TOKEN 验回调日志）。

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
