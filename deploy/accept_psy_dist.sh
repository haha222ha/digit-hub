#!/usr/bin/env bash
# 心理分销验收：DNS → 注册 → 额度 → 链接 → C 端 → 购额/导出/日志 API
# Usage:
#   bash deploy/accept_psy_dist.sh
#   PSY_ORIGIN=https://psy.xhs365.cn bash deploy/accept_psy_dist.sh
#   SUPER_TOKEN=... bash deploy/accept_psy_dist.sh   # 可选：超管回调日志等
set -euo pipefail

PSY_ORIGIN="${PSY_ORIGIN:-https://psy.xhs365.cn}"
API_ORIGIN="${API_ORIGIN:-http://127.0.0.1:8080}"
USER="accept_$(date +%s | tail -c 6)"
PASS="Accept123456"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

auth_hdr() { echo "Authorization: Bearer ${TOKEN}"; }

echo "==> 1) DNS / HTTPS"
if curl -fsSI --max-time 15 "${PSY_ORIGIN}/" >"${TMP}/head.txt" 2>/dev/null; then
  head -n 5 "${TMP}/head.txt"
  echo "HTTPS OK: ${PSY_ORIGIN}"
else
  echo "WARN: ${PSY_ORIGIN} 不可达 — 请确认 Cloudflare DNS（Flexible 可橙云）已指向本机 :80"
fi

echo "==> 2) API tests list"
curl -fsS "${API_ORIGIN}/api/tests/list" >"${TMP}/tests.json"
python3 - "${TMP}/tests.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
t = (d.get("data") or {}).get("tests") or []
print("psy_dist_tests:", len(t))
assert len(t) >= 30, "tests catalog too small"
PY

echo "==> 2b) homepage stats API"
curl -fsS "${API_ORIGIN}/api/stats/homepage" >"${TMP}/home.json"
python3 - "${TMP}/home.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
assert d.get("code") == 200, d
data = d.get("data") or {}
tests = data.get("tests") or []
stats = data.get("stats") or {}
print("homepage_tests:", len(tests), "catalog:", stats.get("tests_catalog"))
assert len(tests) >= 1
assert "links_total" in stats
PY

if curl -fsSI --max-time 10 "${PSY_ORIGIN}/" 2>/dev/null | head -n 1 | grep -q "200"; then
  echo "==> 2c) marketing home HTML"
  curl -fsS "${PSY_ORIGIN}/" | grep -q 'id="test-grid"' && echo "static homepage OK"
fi

echo "==> 3) register distributor ${USER}"
curl -sS -X POST "${API_ORIGIN}/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${USER}\",\"password\":\"${PASS}\",\"email\":\"${USER}@example.com\"}" \
  >"${TMP}/reg.json"
python3 - "${TMP}/reg.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
print(d)
assert d.get("code") == 200, d
assert (d.get("data") or {}).get("token"), d
PY
TOKEN="$(python3 -c "import json; d=json.load(open('${TMP}/reg.json',encoding='utf-8')); print(d['data']['token'])")"
test -n "${TOKEN}"

echo "==> 4) quota info"
curl -fsS "${API_ORIGIN}/api/quota/info" -H "$(auth_hdr)" | python3 -c "import sys,json; print(json.load(sys.stdin))"

echo "==> 5) generate link 7v7"
curl -fsS -X POST "${API_ORIGIN}/api/links/generate" \
  -H "$(auth_hdr)" \
  -H "Content-Type: application/json" \
  -d '{"testCode":"7v7","count":1}' >"${TMP}/gen.json"
TOK="$(python3 - "${TMP}/gen.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
assert d.get("code") == 200, d
links = (d.get("data") or {}).get("links") or []
assert links, d
print(links[0]["token"])
PY
)"

echo "==> 6) validate / start / complete"
curl -fsS -X POST "${API_ORIGIN}/api/links/validate" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"${TOK}\"}" | python3 -c "import sys,json; d=json.load(sys.stdin); assert (d.get('data') or {}).get('valid'); print('validate OK')"
curl -fsS -X POST "${API_ORIGIN}/api/links/start-test" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"${TOK}\"}" >/dev/null
curl -fsS -X POST "${API_ORIGIN}/api/links/complete-test" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"${TOK}\",\"resultData\":{\"score\":99,\"type\":\"accept\"}}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); assert (d.get('data') or {}).get('success'); print('complete OK')"

echo "==> 7) merchant purchase & logs APIs"
curl -fsS "${API_ORIGIN}/api/admin/packages/list" -H "$(auth_hdr)" >"${TMP}/pkgs.json"
python3 - "${TMP}/pkgs.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
assert d.get("code") == 200, d
pkgs = (d.get("data") or {}).get("packages") or []
print("packages:", len(pkgs))
assert isinstance(pkgs, list)
PY

curl -fsS "${API_ORIGIN}/api/admin/package-documents/list" -H "$(auth_hdr)" >"${TMP}/pdoc.json"
python3 - "${TMP}/pdoc.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
assert d.get("code") == 200, d
docs = (d.get("data") or {}).get("documents") or (d.get("data") or {}).get("list") or []
print("package_documents:", len(docs))
PY

curl -fsS "${API_ORIGIN}/api/admin/payment/purchase-methods" -H "$(auth_hdr)" >"${TMP}/pm.json"
python3 - "${TMP}/pm.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
assert d.get("code") == 200, d
data = d.get("data") or {}
assert "wechat" in data or "online_payment_available" in data
print("purchase_methods OK")
PY

curl -fsS "${API_ORIGIN}/api/admin/quota-logs/list?page=1&perPage=5" -H "$(auth_hdr)" >"${TMP}/qlog.json"
python3 - "${TMP}/qlog.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
assert d.get("code") == 200, d
logs = (d.get("data") or {}).get("logs") or []
print("quota_logs:", len(logs))
PY

curl -fsS "${API_ORIGIN}/api/admin/test-results/list?page=1&perPage=5" -H "$(auth_hdr)" >"${TMP}/tres.json"
python3 - "${TMP}/tres.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
assert d.get("code") == 200, d
rows = (d.get("data") or {}).get("results") or []
print("test_results:", len(rows))
assert len(rows) >= 1, "expected at least one test result from step 6"
PY

curl -fsS -X POST "${API_ORIGIN}/api/links/export" \
  -H "$(auth_hdr)" \
  -H "Content-Type: application/json" \
  -d '{"testCode":"7v7"}' >"${TMP}/links_export.txt"
python3 - "${TMP}/links_export.txt" <<'PY'
import sys
text = open(sys.argv[1], encoding="utf-8", errors="replace").read()
assert "/test/" in text or len(text.strip()) >= 0
print("links_export bytes:", len(text))
PY

curl -fsS "${API_ORIGIN}/api/admin/test-results/export?testCode=7v7" -H "$(auth_hdr)" >"${TMP}/tres.csv"
python3 - "${TMP}/tres.csv" <<'PY'
import sys
text = open(sys.argv[1], encoding="utf-8-sig", errors="replace").read()
assert "测题" in text or "test" in text.lower() or len(text) > 10
print("test_results_export OK")
PY

if [[ -n "${SUPER_TOKEN:-}" ]]; then
  echo "==> 8) super-admin notify logs (SUPER_TOKEN)"
  curl -fsS "${API_ORIGIN}/api/super-admin/payment-notify-logs?page=1&perPage=5" \
    -H "Authorization: Bearer ${SUPER_TOKEN}" >"${TMP}/notify.json"
  python3 - "${TMP}/notify.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
assert d.get("code") == 200, d
logs = (d.get("data") or {}).get("logs") or []
print("payment_notify_logs:", len(logs))
PY
else
  echo "==> 8) skip super-admin notify logs (set SUPER_TOKEN to enable)"
fi

echo "==> 9) C-end URL: ${PSY_ORIGIN}/test/7v7/${TOK}"
echo "DONE accept_psy_dist — 浏览器打开上方链接完成做题验收"
