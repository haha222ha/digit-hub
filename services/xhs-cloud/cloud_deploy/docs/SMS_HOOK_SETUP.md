# 支付宝风控短信 Webhook（SMS Forwarder ↔ order_core）

## 地址（部署 digit-hub / monitor.xhs365.cn 后）

| 用途 | 方法 | URL |
|------|------|-----|
| 手机推送 | `POST` | `https://monitor.xhs365.cn/api/v1/hooks/sms-forward?token=你的TOKEN` |
| 短路径 | `POST` | `https://monitor.xhs365.cn/hooks/sms-forward?token=你的TOKEN` |
| 电脑取码 | `GET` | `https://monitor.xhs365.cn/api/v1/hooks/sms-code/latest?token=你的TOKEN&consume=1` |

Header 亦可：`X-Sms-Token: 你的TOKEN`

## 服务器配置

在 `/opt/xhs-cloud/.env`（或本地 `.env`）增加：

```bash
XHS_SMS_HOOK_TOKEN=请换成足够长的随机串
```

代码：`cloud_api/sms_hook_routes.py`（已挂到 `main.py`）。

重启云 API 后生效。落盘：`$XHS_DATA_DIR/sms_hook_latest.json`。

## 手机 SMS Forward

1. 安装 SMS Forward / SMS Forwarder 类应用  
2. Webhook URL 填上面的 **POST** 地址（带 token）  
3. 过滤建议：发件人含银行/支付宝，或正文含「验证码」「支付宝」  
4. 请求体：JSON `{"text":"..."}` 或纯文本均可  

## 电脑 order_core

`order_config.json`：

```json
{
  "sms_hook_base": "https://monitor.xhs365.cn",
  "sms_hook_token": "与 XHS_SMS_HOOK_TOKEN 相同"
}
```

支付密码输入后若出现「请输入短信验证码」：
1. 轮询 `sms-code/latest`（默认最长 90s）  
2. 取到 6 位码 → adb 回填  
3. 失败则回退本机弹框  

## 自测

```bash
# 模拟手机推送
curl -X POST "https://monitor.xhs365.cn/api/v1/hooks/sms-forward?token=TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"【支付宝】验证码783421，5分钟内有效\"}"

# 电脑取码
curl "https://monitor.xhs365.cn/api/v1/hooks/sms-code/latest?token=TOKEN&consume=1"
# → {"ok":true,"code":"783421",...}
```

## 注意

- Bark 只适合通知 iPhone，**不要**当收码主通道  
- token 勿提交到公开仓库  
- 仅转发自己号码的业务验证码  
