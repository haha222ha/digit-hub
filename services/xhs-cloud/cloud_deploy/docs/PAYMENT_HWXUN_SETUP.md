# hwxun 微信 + 支付宝支付配置清单

支付分 **三块**：商户后台（网页手动）、服务器 `.env`、代码部署（git pull）。  
**商户后台无法通过 GitHub 配置**，必须在 hwxun 网站登录后填写。

---

## 一、服务器 `/opt/xhs-cloud/.env`（你可 SSH 编辑）

```bash
# 微信 pay.hwxun.cn
XHS_PAY_API_URL=https://pay.hwxun.cn/
XHS_PAY_PID=微信商户PID
XHS_PAY_KEY=微信商户密钥

# 支付宝 xapay.hwxun.cn（PID/KEY 与微信不同，必填）
XHS_PAY_ALIPAY_API_URL=https://xapay.hwxun.cn/
XHS_PAY_ALIPAY_PID=支付宝商户PID
XHS_PAY_ALIPAY_KEY=支付宝商户密钥

# 公网域名（用于生成下单 notify_url）
XHS_PAY_NOTIFY_BASE=https://monitor.xhs365.cn
```

改完后：

```bash
sudo systemctl restart xhs-cloud-api
```

自检：

```bash
bash /opt/xhs-cloud/cloud_deploy/scripts/verify_payment_setup.sh
```

---

## 二、微信商户后台（手动）https://pay.hwxun.cn/

| 项 | 值 |
|----|-----|
| 签名模式 | **MD5 + RSA 兼容** |
| 异步通知（若后台有全局项） | `https://monitor.xhs365.cn/api/v1/payment/notify/hwxun` |

> 下单时 API 也会在每笔订单里带 `notify_url`，与上表一致。

---

## 三、支付宝商户后台（手动）https://xapay.hwxun.cn/user/

| 项 | 值 |
|----|-----|
| 签名模式 | **MD5 + RSA 兼容**（我们下单/验签走 **MD5**，与兼容模式一致） |
| 异步通知 | `https://monitor.xhs365.cn/api/v1/payment/notify/hwxun` |
| 支付通道 | 新增并启用 **「支付宝云端免挂」**（或按文档配置收款通道） |

若下单报 **「没有找到可用支付账号」**：说明 PID/KEY 已对，但后台 **未绑定/启用支付宝收款通道**，与服务器无关。

### 官方 API 文档（xapay）

| 文档 | 地址 | 我们是否使用 |
|------|------|----------------|
| 页面跳转支付 | https://xapay.hwxun.cn/doc/epay_submit | 否（浏览器表单跳转 `submit.php`） |
| **API 接口支付** | https://xapay.hwxun.cn/doc/epay_mapi | **是**（服务端下单拿二维码） |
| 支付结果通知 | https://xapay.hwxun.cn/doc/epay_notify | 是（回调验签 + 返回 `success`） |
| MD5 签名 | https://xapay.hwxun.cn/doc/epay_md5 | 是 |

会员扫码购买走 **mapi**（非 submit）：`POST https://xapay.hwxun.cn/mapi.php`（与文档 `/xpay/epay/mapi.php` 等价），参数 `type=alipay`、`notify_url`、`clientip`、`device=pc`，`sign_type=MD5`。

回调收到 `trade_status=TRADE_SUCCESS` 且验签通过后，接口返回纯文本 **`success`**（已实现）。

参考：[支付宝云端配置教程](https://docs.qq.com/doc/DUXhLdXN1TFVHTHRq)

---

## 四、Nginx / 公网可达性

`monitor.xhs365.cn` 需反代到 `127.0.0.1:8080`（仓库 `nginx/monitor.conf`）。

支付回调测试（无参数应返回 `fail`，属正常）：

```bash
curl -s "https://monitor.xhs365.cn/api/v1/payment/notify/hwxun"
# 或
curl -s "http://127.0.0.1:8080/api/v1/payment/notify/hwxun"
```

---

## 五、部署更新（代码）

```bash
cd /opt/vuemonitor && git fetch origin main && git reset --hard origin/main
rsync -a /opt/vuemonitor/xhs-cloud/cloud_deploy/ /opt/xhs-cloud/cloud_deploy/ --delete
cd /opt/xhs-cloud && bash cloud_deploy/scripts/host-update.sh
```

或：

```bash
bash /opt/vuemonitor/xhs-cloud/cloud_deploy/scripts/pull-and-deploy.sh
```

---

## 六、联调命令

```bash
# 已配置通道
curl -s http://127.0.0.1:8080/api/v1/payment/channels

# 微信下单
curl -s -X POST http://127.0.0.1:8080/api/v1/payment/orders \
  -H 'Content-Type: application/json' \
  -d '{"plan_code":"monthly","channel":"wxpay"}'

# 支付宝下单（需 xapay 后台已启用收款通道）
curl -s -X POST http://127.0.0.1:8080/api/v1/payment/orders \
  -H 'Content-Type: application/json' \
  -d '{"plan_code":"monthly","channel":"alipay"}'
```
