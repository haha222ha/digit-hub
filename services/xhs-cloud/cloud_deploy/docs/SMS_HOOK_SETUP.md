# 支付宝风控短信 Webhook（SMS Forwarder ↔ order_core）

## 地址（部署 digit-hub / monitor.xhs365.cn 后）

| 用途 | 方法 | URL |
|------|------|-----|
| 手机推送 | `POST` | `https://monitor.xhs365.cn/api/v1/hooks/sms-forward?token=你的TOKEN` |
| 短路径 | `POST` | `https://monitor.xhs365.cn/hooks/sms-forward?token=你的TOKEN` |
| 电脑取码 | `GET` | `https://monitor.xhs365.cn/api/v1/hooks/sms-code/latest?token=你的TOKEN&consume=1` |

Header 亦可：`X-Sms-Token: 你的TOKEN`

## 手机 SMS Forward 模板

建议整段纯文本：

```text
{发件人号码} {短信正文} {{手机尾号4位}}{发送时间}
```

示例：

```text
95188 【支付宝】支付宝验证码：448291，请勿向他人泄露您的验证码！唯一热线95188 {{7214}}2026-08-22 00:36:25
```

服务器会抽取 `448291`，并记下尾号 `7214`。可选环境变量 `XHS_SMS_PHONE_TAIL=7214` 只接受匹配尾号的短信。

## 服务器配置

在 `/opt/xhs-cloud/.env`（或本地 `.env`）增加：

```bash
XHS_SMS_HOOK_TOKEN=请换成足够长的随机串
XHS_SMS_PHONE_TAIL=7214
```

代码：`cloud_api/sms_hook_routes.py`（已挂到 `main.py`）。

重启云 API 后生效。落盘：`$XHS_DATA_DIR/sms_hook_latest.json`。

## 电脑 order_core

`order_config.json`：

```json
{
  "sms_hook_base": "https://monitor.xhs365.cn",
  "sms_hook_token": "与 XHS_SMS_HOOK_TOKEN 相同",
  "sms_phone_tail": "7214"
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
