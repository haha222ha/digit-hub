#!/bin/bash
set -e
cd /opt/xhs-cloud
if [ -f .env ]; then
    set -a
    . ./.env
    set +a
fi
/opt/xhs-cloud/venv/bin/python <<'PYEOF'
from cloud_deploy.rank_engine.ab_test import list_metrics, aggregate_daily, aggregate_total, list_test_dates
print("=== dates ===")
print(list_test_dates())
print("=== aggregate_daily ===")
import json
print(json.dumps(aggregate_daily(), ensure_ascii=False, indent=2))
print("=== aggregate_total ===")
print(json.dumps(aggregate_total(), ensure_ascii=False, indent=2))
print("=== metrics count ===")
print(len(list_metrics()))
print("=== metrics sample (first 3) ===")
for m in list_metrics()[:3]:
    print(m)
PYEOF
