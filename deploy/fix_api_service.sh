#!/usr/bin/env bash
# Quick repair when xhs-cloud-api fails to listen on :8080
set -euo pipefail
XHS_ROOT="${XHS_ROOT:-/opt/xhs-cloud}"
ENV_OUT="${XHS_ROOT}/.env"
DB_NAME="${DB_NAME:-vuemonitor}"
DB_USER="${DB_USER:-xhs_monitor_user}"

echo "==> fix pg ownership (tables created by postgres, API runs as ${DB_USER})"
sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
ALTER SCHEMA xhs_monitor OWNER TO ${DB_USER};
DO \$\$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'xhs_monitor'
  LOOP
    EXECUTE format('ALTER TABLE xhs_monitor.%I OWNER TO ${DB_USER}', r.tablename);
  END LOOP;
  FOR r IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'xhs_monitor'
  LOOP
    EXECUTE format('ALTER SEQUENCE xhs_monitor.%I OWNER TO ${DB_USER}', r.sequence_name);
  END LOOP;
END
\$\$;
SQL

echo "==> status"
systemctl status xhs-cloud-api --no-pager -l || true
echo "==> recent logs"
journalctl -u xhs-cloud-api -n 80 --no-pager || true

echo "==> import test"
sudo -u admin bash -lc "set -a; source ${ENV_OUT}; set +a; cd ${XHS_ROOT}; PYTHONPATH=${XHS_ROOT} ${XHS_ROOT}/venv/bin/python -c 'from cloud_deploy.cloud_api.main import app; print(\"import_ok\")'"

echo "==> restart"
systemctl restart xhs-cloud-api
sleep 3
systemctl is-active xhs-cloud-api
curl -sS -o /dev/null -w "health:%{http_code}\n" http://127.0.0.1:8080/api/v1/health
curl -sS http://127.0.0.1:8080/api/v1/payment/plans | head -c 400; echo
bash "${XHS_ROOT}/cloud_deploy/scripts/verify_payment_setup.sh" || true
