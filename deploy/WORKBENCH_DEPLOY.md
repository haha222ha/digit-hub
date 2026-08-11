# Workbench 一键部署（本机 SSH 客户端签名阶段被重置时用）
# 目标：不依赖 DNS，用 http://47.239.181.111/

## 本机文件（Windows）

- `D:\选品报告\资料生产工厂\digit-hub\deploy\dist\xinxiang-web.tgz`
- `D:\选品报告\资料生产工厂\digit-hub\deploy\remote_bootstrap.sh`

## 阿里云 Workbench

1. 上传上述两个文件到服务器 `/tmp/`（Workbench「文件」/上传）。
2. 在终端执行：

```bash
sudo bash /tmp/remote_bootstrap.sh ip
ls -la /opt/digit-hub/apps/web/index.html
curl -sS -o /dev/null -w "home:%{http_code}\n" http://127.0.0.1/
ss -lntp | grep -E ':80|:8080|:8000' || true
```

3. 浏览器打开：`http://47.239.181.111/`

API（xhs-cloud）若未装，首页静态仍可看；`?api=live` 需 `:8080` 起来后再说。

## DNS

`assess.xhs365.cn` 可以后再加 A 记录 → `47.239.181.111`，再改 nginx `server_name`。
