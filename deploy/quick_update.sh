#!/usr/bin/env bash
# 日常热更新：只拉代码 + 同步 API + 重启服务。不 apt、不重写 .env、不轮换 JWT/DB 密码。
# Usage: sudo bash /opt/digit-hub/deploy/quick_update.sh
set -euo pipefail

DIGIT_HUB="${DIGIT_HUB:-/opt/digit-hub}"
XHS_ROOT="${XHS_ROOT:-/opt/xhs-cloud}"
SRC="${DIGIT_HUB}/services/xhs-cloud/cloud_deploy"
BRANCH="${BRANCH:-main}"

echo "==> git pull ${DIGIT_HUB}"
cd "${DIGIT_HUB}"
git fetch origin
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

echo "==> sync API code (keep .env / data / venv)"
mkdir -p "${XHS_ROOT}/cloud_deploy" "${XHS_ROOT}/data"
rsync -a --delete \
  --exclude venv --exclude data --exclude .env --exclude '__pycache__' --exclude '*.pyc' \
  "${SRC}/" "${XHS_ROOT}/cloud_deploy/"
touch "${XHS_ROOT}/cloud_deploy/__init__.py" 2>/dev/null || true
mkdir -p "${XHS_ROOT}/cloud_deploy/assets/uploads"
chown -R admin:admin "${XHS_ROOT}/cloud_deploy/assets" 2>/dev/null || true

ENV_OUT="${XHS_ROOT}/.env"
if [[ -f "${ENV_OUT}" ]]; then
  if grep -q '^XHS_PAY_ENABLE_TEST_PLAN=' "${ENV_OUT}"; then
    sed -i 's/^XHS_PAY_ENABLE_TEST_PLAN=.*/XHS_PAY_ENABLE_TEST_PLAN=0/' "${ENV_OUT}"
  else
    echo 'XHS_PAY_ENABLE_TEST_PLAN=0' >> "${ENV_OUT}"
  fi
  echo "==> kept existing ${ENV_OUT} (JWT/admin/db unchanged)"
else
  echo "WARN: ${ENV_OUT} missing — run api_fresh_install.sh once first"
  exit 1
fi

echo "==> pip (requirements only)"
if [[ ! -x "${XHS_ROOT}/venv/bin/pip" ]]; then
  python3 -m venv "${XHS_ROOT}/venv"
fi
"${XHS_ROOT}/venv/bin/pip" install -q -r "${XHS_ROOT}/cloud_deploy/requirements-cloud.txt"

echo "==> verify web routes (activate landing)"
grep -q 'path === "/activate"' "${DIGIT_HUB}/apps/web/src/main.js" || {
  echo "ERROR: apps/web/src/main.js missing #/activate route — git pull incomplete?"
  exit 1
}

echo "==> nginx sites (/admin/ + monitor SSL if cert exists)"
bash "${DIGIT_HUB}/deploy/nginx_apply.sh"

echo "==> restart API"
systemctl restart xhs-cloud-api
sleep 2
systemctl is-active xhs-cloud-api

echo "==> smoke"
curl -fsS -o /dev/null -w "health:%{http_code}\n" http://127.0.0.1:8080/api/v1/health
curl -fsS -H "Host: monitor.xhs365.cn" http://127.0.0.1/src/main.js 2>/dev/null | grep -q '/activate' \
  && echo "web_main.js: activate route OK" \
  || echo "WARN: nginx /src/main.js missing activate — hard-refresh browser or purge CDN"
curl -fsS http://127.0.0.1:8080/api/v1/payment/plans 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); p=next((x for x in d.get('assess_plans',[]) if x.get('plan_code')=='assess_single'),{}); print('assess_single:', p.get('amount'), p.get('price_yuan'))" \
  || echo "(plans parse skip)"
curl -fsS http://127.0.0.1:8080/api/tests/list 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); t=(d.get('data') or {}).get('tests') or []; print('psy_dist_tests:', len(t))" \
  || echo "(dist tests skip)"
echo "DONE quick_update — users stay logged in; Workbench should not drop"
