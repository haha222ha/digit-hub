#!/usr/bin/env bash
# 日常热更新：只拉代码 + 同步 API + 重启服务。不 apt、不重写 .env、不轮换 JWT/DB 密码。
# Usage: sudo bash /opt/digit-hub/deploy/quick_update.sh
set -euo pipefail

DIGIT_HUB="${DIGIT_HUB:-/opt/digit-hub}"
XHS_ROOT="${XHS_ROOT:-/opt/xhs-cloud}"
SRC="${DIGIT_HUB}/services/xhs-cloud/cloud_deploy"
BRANCH="${BRANCH:-main}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: 请用 sudo 运行（需写 /opt/xhs-cloud 并 systemctl restart）:"
  echo "  sudo bash ${DIGIT_HUB}/deploy/quick_update.sh"
  exit 1
fi

echo "==> git pull ${DIGIT_HUB}"
cd "${DIGIT_HUB}"
# 若仓库曾被 root 拉过，先交回 admin，避免下次 admin git pull 再 Permission denied
if id admin >/dev/null 2>&1; then
  chown -R admin:admin "${DIGIT_HUB}" 2>/dev/null || true
fi
# git 操作尽量用 admin，避免再次把 .git 写成 root
if id admin >/dev/null 2>&1; then
  sudo -u admin git fetch origin
  sudo -u admin git checkout "${BRANCH}"
  sudo -u admin git pull --ff-only origin "${BRANCH}"
else
  git fetch origin
  git checkout "${BRANCH}"
  git pull --ff-only origin "${BRANCH}"
fi

echo "==> sync API code (keep .env / data / venv)"
mkdir -p "${XHS_ROOT}/cloud_deploy" "${XHS_ROOT}/data"
# --no-group/--no-owner：避免目标目录属组不可改时报一堆 chgrp
rsync -a --delete --no-owner --no-group \
  --exclude venv --exclude data --exclude .env --exclude '__pycache__' --exclude '*.pyc' \
  "${SRC}/" "${XHS_ROOT}/cloud_deploy/"
touch "${XHS_ROOT}/cloud_deploy/__init__.py" 2>/dev/null || true
mkdir -p "${XHS_ROOT}/cloud_deploy/assets/uploads" "${XHS_ROOT}/cloud_deploy/assets/psy-dist"
if [[ -f "${DIGIT_HUB}/packages/psy-dist/tests-catalog.json" ]]; then
  cp -f "${DIGIT_HUB}/packages/psy-dist/tests-catalog.json" \
    "${XHS_ROOT}/cloud_deploy/assets/psy-dist/tests-catalog.json"
fi
if [[ -f "${DIGIT_HUB}/packages/psy-dist/selection-intel/latest.json" ]]; then
  mkdir -p "${XHS_ROOT}/cloud_deploy/assets/psy-dist/selection-intel"
  cp -f "${DIGIT_HUB}/packages/psy-dist/selection-intel/latest.json" \
    "${XHS_ROOT}/cloud_deploy/assets/psy-dist/selection-intel/latest.json"
  echo "==> synced selection-intel/latest.json"
fi
if id admin >/dev/null 2>&1; then
  chown -R admin:admin "${XHS_ROOT}/cloud_deploy/assets" 2>/dev/null || true
fi

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
ok=0
for _ in $(seq 1 15); do
  if systemctl is-active --quiet xhs-cloud-api; then
    ok=1
    break
  fi
  sleep 1
done
if [[ "$ok" -ne 1 ]]; then
  echo "ERROR: xhs-cloud-api not active"
  systemctl status xhs-cloud-api --no-pager -l || true
  journalctl -u xhs-cloud-api -n 50 --no-pager || true
  exit 1
fi
systemctl is-active xhs-cloud-api

echo "==> smoke (wait until :8080 answers)"
health_ok=0
for _ in $(seq 1 45); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:8080/api/v1/health 2>/dev/null || true)"
  if [[ "${code}" == "200" ]]; then
    echo "health:200"
    health_ok=1
    break
  fi
  sleep 1
done
if [[ "${health_ok}" -ne 1 ]]; then
  echo "ERROR: API health not ready on :8080"
  systemctl status xhs-cloud-api --no-pager -l || true
  journalctl -u xhs-cloud-api -n 60 --no-pager || true
  ss -lntp 2>/dev/null | grep -E ':8080|:8000' || true
  exit 1
fi
curl -fsS -H "Host: monitor.xhs365.cn" http://127.0.0.1/src/main.js 2>/dev/null | grep -q '/activate' \
  && echo "web_main.js: activate route OK" \
  || echo "WARN: nginx /src/main.js missing activate — hard-refresh browser or purge CDN"
curl -fsS http://127.0.0.1:8080/api/v1/payment/plans 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); p=next((x for x in d.get('assess_plans',[]) if x.get('plan_code')=='assess_single'),{}); print('assess_single:', p.get('amount'), p.get('price_yuan'))" \
  || echo "(plans parse skip)"
curl -fsS http://127.0.0.1:8080/api/tests/list 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); t=(d.get('data') or {}).get('tests') or []; print('psy_dist_tests:', len(t)); assert len(t) >= 30" \
  || echo "(dist tests skip — check catalog path / API logs)"
echo "DONE quick_update — users stay logged in; Workbench should not drop"
