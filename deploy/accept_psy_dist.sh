#!/usr/bin/env bash
# 心理分销验收：DNS → SSL → 注册 → 额度 → 链接 → C 端校验
# Usage:
#   bash deploy/accept_psy_dist.sh
#   PSY_ORIGIN=https://psy.xhs365.cn bash deploy/accept_psy_dist.sh
set -euo pipefail

PSY_ORIGIN="${PSY_ORIGIN:-https://psy.xhs365.cn}"
API_ORIGIN="${API_ORIGIN:-http://127.0.0.1:8080}"
USER="accept_$(date +%s | tail -c 6)"
PASS="Accept123456"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

echo "==> 1) DNS / HTTPS"
if curl -fsSI --max-time 15 "${PSY_ORIGIN}/" >"${TMP}/head.txt" 2>/dev/null; then
  head -n 5 "${TMP}/head.txt"
  echo "HTTPS OK: ${PSY_ORIGIN}"
else
  echo "WARN: ${PSY_ORIGIN} 不可达 — 请先配 DNS A 记录并执行:"
  echo "  sudo bash /opt/digit-hub/deploy/certbot_psy.sh"
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
curl -fsS "${API_ORIGIN}/api/quota/info" -H "Authorization: Bearer ${TOKEN}" | python3 -c "import sys,json; print(json.load(sys.stdin))"

echo "==> 5) generate link 7v7"
curl -fsS -X POST "${API_ORIGIN}/api/links/generate" \
  -H "Authorization: Bearer ${TOKEN}" \
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

echo "==> 7) C-end URL: ${PSY_ORIGIN}/test/7v7/${TOK}"
echo "DONE accept_psy_dist — 浏览器打开上方链接完成做题验收"
