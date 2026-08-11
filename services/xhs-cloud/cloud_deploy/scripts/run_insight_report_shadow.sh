#!/bin/bash
# V2 情报 Shadow 预生成（L0）— 默认写 data/insight_shadow，不影响 Legacy zip
# 用法:
#   bash cloud_deploy/scripts/run_insight_report_shadow.sh
#   bash cloud_deploy/scripts/run_insight_report_shadow.sh 2026-07-12
#   FORCE_INSIGHT=1 bash .../run_insight_report_shadow.sh   # 强制重跑
#
# 防重复：data/generation_records/insight_YYYY-MM-DD.json 已成功，或
# 当日 pipeline_summary.json 且 categories>0，则跳过。
set -euo pipefail

ROOT="${XHS_CLOUD_ROOT:-/opt/xhs-cloud}"
DATE="${1:-$(date +%Y-%m-%d)}"
DAY="${DATE//-/}"
PY="${ROOT}/venv/bin/python"
SCRIPT="${ROOT}/cloud_deploy/scripts/cloud_insight_report.py"
REC_DIR="${ROOT}/data/generation_records"
REC_FILE="${REC_DIR}/insight_${DATE}.json"
SUMMARY="${ROOT}/data/insight_shadow/insight_${DAY}/pipeline_summary.json"
FORCE="${FORCE_INSIGHT:-0}"
TRIGGER_BY="${INSIGHT_TRIGGER_BY:-timer}"

if [[ ! -x "$PY" ]]; then
  PY=python3
fi

if [[ ! -f "$SCRIPT" ]]; then
  echo "[insight-shadow] missing $SCRIPT" >&2
  exit 1
fi

cd "$ROOT"
export PYTHONPATH="${ROOT}:${PYTHONPATH:-}"
export XHS_INSIGHT_SHADOW="${XHS_INSIGHT_SHADOW:-1}"
mkdir -p "$REC_DIR"

_force_on() {
  local f
  f=$(echo "$FORCE" | tr '[:upper:]' '[:lower:]')
  [[ "$f" == "1" || "$f" == "true" || "$f" == "yes" || "$f" == "on" ]]
}

already_ok() {
  if _force_on; then
    return 1
  fi
  if [[ -f "$REC_FILE" ]]; then
    local st cats
    st=$("$PY" -c "import json,sys; d=json.load(open(sys.argv[1],encoding='utf-8')); print(d.get('status',''))" "$REC_FILE" 2>/dev/null || true)
    cats=$("$PY" -c "import json,sys; d=json.load(open(sys.argv[1],encoding='utf-8')); print(int(d.get('categories') or 0))" "$REC_FILE" 2>/dev/null || echo 0)
    if [[ "$st" == "ok" && "${cats:-0}" -gt 0 ]]; then
      echo "[insight-shadow] SKIP already generated (record): $REC_FILE categories=$cats"
      return 0
    fi
  fi
  if [[ -f "$SUMMARY" ]]; then
    local cats2
    cats2=$("$PY" -c "import json,sys; d=json.load(open(sys.argv[1],encoding='utf-8')); print(int(d.get('categories') or 0))" "$SUMMARY" 2>/dev/null || echo 0)
    if [[ "${cats2:-0}" -gt 0 ]]; then
      echo "[insight-shadow] SKIP already generated (summary): $SUMMARY categories=$cats2"
      DATE="$DATE" DAY="$DAY" REC_DIR="$REC_DIR" REC_FILE="$REC_FILE" SUMMARY="$SUMMARY" CATS="$cats2" "$PY" - <<'PY'
import json, os
from datetime import datetime
rec = {
  "kind": "insight_shadow",
  "report_date": os.environ["DATE"],
  "status": "ok",
  "categories": int(os.environ.get("CATS") or 0),
  "source": "pipeline_summary_backfill",
  "finished_at": datetime.now().isoformat(timespec="seconds"),
}
os.makedirs(os.environ["REC_DIR"], exist_ok=True)
open(os.environ["REC_FILE"], "w", encoding="utf-8").write(json.dumps(rec, ensure_ascii=False, indent=2))
print("[insight-shadow] wrote generation record", os.environ["REC_FILE"])
PY
      return 0
    fi
  fi
  return 1
}

if already_ok; then
  exit 0
fi

AGG="${ROOT}/cloud_deploy/scripts/aggregate_daily_category_metrics.py"
if [[ -f "$AGG" ]]; then
  echo "[insight-shadow] pre-aggregate daily_category_metrics date=$DATE"
  "$PY" "$AGG" "$DATE" || echo "[insight-shadow] aggregate skipped (table may not exist yet)"
fi

echo "[insight-shadow] date=$DATE shadow=1 triggered_by=$TRIGGER_BY"
set +e
SRC_ARGS=()
if [[ -n "${INSIGHT_PG_SOURCE:-}" ]]; then
  SRC_ARGS=(--source "$INSIGHT_PG_SOURCE")
fi
"$PY" "$SCRIPT" --date "$DATE" --playbook full "${SRC_ARGS[@]}"
RC=$?
set -e

DATE="$DATE" DAY="$DAY" REC_DIR="$REC_DIR" REC_FILE="$REC_FILE" SUMMARY="$SUMMARY" TRIGGER_BY="$TRIGGER_BY" RC="$RC" "$PY" - <<'PY'
import json, os
from datetime import datetime

rc = int(os.environ.get("RC") or "1")
summary_path = os.environ["SUMMARY"]
cats = 0
if os.path.isfile(summary_path):
    try:
        cats = int((json.load(open(summary_path, encoding="utf-8")) or {}).get("categories") or 0)
    except Exception:
        cats = 0

status = "ok" if (rc == 0 and cats > 0) else ("empty" if rc == 0 else "failed")
rec = {
  "kind": "insight_shadow",
  "report_date": os.environ["DATE"],
  "status": status,
  "categories": cats,
  "triggered_by": os.environ.get("TRIGGER_BY") or "timer",
  "exit_code": rc,
  "finished_at": datetime.now().isoformat(timespec="seconds"),
  "summary_path": summary_path,
}
os.makedirs(os.environ["REC_DIR"], exist_ok=True)
open(os.environ["REC_FILE"], "w", encoding="utf-8").write(json.dumps(rec, ensure_ascii=False, indent=2))
day_dir = os.path.dirname(summary_path)
if os.path.isdir(day_dir):
    open(os.path.join(day_dir, "generation_record.json"), "w", encoding="utf-8").write(
        json.dumps(rec, ensure_ascii=False, indent=2)
    )
print("[insight-shadow] wrote generation record", os.environ["REC_FILE"], "status=", status, "categories=", cats)
raise SystemExit(rc)
PY
