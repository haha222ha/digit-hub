#!/usr/bin/env bash
# On ECS after git clone/pull of digit-hub.
# Usage: sudo bash /opt/digit-hub/deploy/git_pull_deploy.sh
set -euo pipefail
REPO_DIR="${REPO_DIR:-/opt/digit-hub}"
WEB_SRC="${REPO_DIR}/apps/web"
WEB_ROOT="${WEB_ROOT:-/opt/digit-hub/apps/web}"
NGINX_SITE="/etc/nginx/conf.d/assess.xinxiang.conf"
BRANCH="${BRANCH:-main}"

echo "==> ensure packages"
export DEBIAN_FRONTEND=noninteractive
command -v git >/dev/null || apt-get install -y git
command -v nginx >/dev/null || { apt-get update -y && apt-get install -y nginx; }

if [[ ! -d "${REPO_DIR}/.git" ]]; then
  echo "ERROR: ${REPO_DIR} is not a git checkout. Clone first:"
  echo "  sudo git clone https://github.com/haha222ha/digit-hub.git ${REPO_DIR}"
  exit 1
fi

echo "==> git pull"
cd "${REPO_DIR}"
git fetch origin
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

# WEB_SRC already is WEB_ROOT when cloned to /opt/digit-hub
echo "==> web at ${WEB_ROOT}"
test -f "${WEB_ROOT}/index.html"

echo "==> nginx default_server (IP, no DNS required)"
cat > "${NGINX_SITE}" <<'EOF'
server {
    listen 80 default_server;
    server_name _;
    root /opt/digit-hub/apps/web;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, must-revalidate";
    }
    location /api/ {
        proxy_pass http://127.0.0.1:8080/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
EOF
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "==> smoke"
curl -sS -o /dev/null -w "home:%{http_code}\n" http://127.0.0.1/ || true
ls -la "${WEB_ROOT}/index.html"
echo "DONE -> http://SERVER_IP/"
