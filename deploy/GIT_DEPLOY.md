# 重装后：Git Push → 主机 Pull 部署

目标：`http://公网IP/` 打开心象测静态站（暂不绑 DNS）。

## A. 本机（你先做完再装主机）

1. GitHub 新建空仓库 **`haha222ha/digit-hub`**（建议 **Public**，不要勾 README）
2. 开 2FA 后建 **PAT（classic）**，勾选 `repo`
3. PowerShell：

```powershell
$env:Path = "D:\tools\PortableGit\bin;D:\tools\PortableGit\cmd;" + $env:Path
Remove-Item Env:http_proxy,Env:https_proxy,Env:HTTP_PROXY,Env:HTTPS_PROXY,Env:ALL_PROXY,Env:all_proxy -EA SilentlyContinue
cd "D:\选品报告\资料生产工厂\digit-hub"
git remote set-url origin https://github.com/haha222ha/digit-hub.git
git push -u origin main
```

用户名：`haha222ha`，密码：**粘贴 PAT**（不是登录密码）。

验证：浏览器打开 `https://github.com/haha222ha/digit-hub` 能看到代码。

## B. 主机（Workbench，重装完成、能进终端后）

防火墙/安全组：**放行 TCP 80**（以及 22 可选）。

一键：

```bash
curl -fsSL https://raw.githubusercontent.com/haha222ha/digit-hub/main/deploy/fresh_install.sh | sudo bash
```

若 raw 拉不动，用：

```bash
sudo apt-get update -y && sudo apt-get install -y git nginx curl
sudo git clone https://github.com/haha222ha/digit-hub.git /opt/digit-hub
sudo bash /opt/digit-hub/deploy/git_pull_deploy.sh
```

成功应看到 `home:200`。浏览器：`http://你的公网IP/`

## C. 以后更新

本机改完 → `git push`  
主机：

```bash
cd /opt/digit-hub && sudo git pull && sudo bash deploy/git_pull_deploy.sh
```

## 注意

- 重装后旧 SSH 公钥作废；本机连不上主机没关系，用 Workbench + GitHub 即可。
- 端口 22/80 若全关，说明系统还在初始化或防火墙未开——等「运行中」再执行 B。
- API/支付（xhs-cloud）第二步再装；先把静态站拉起来。
