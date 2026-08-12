#!/usr/bin/env bash
# 同步心理分销静态资源到 apps/psy-dist（开发机一次性或更新测题时用）
# Usage: bash deploy/sync_psy_dist.sh [SOURCE_PUBLIC_DIR]
set -euo pipefail

DIGIT_HUB="${DIGIT_HUB:-$(cd "$(dirname "$0")/.." && pwd)}"
SRC="${1:-}"
DEST="${DIGIT_HUB}/apps/psy-dist"

if [[ -z "${SRC}" ]]; then
  echo "Usage: bash deploy/sync_psy_dist.sh /path/to/lingbo-psy-distribution/public"
  echo "  Windows example: bash deploy/sync_psy_dist.sh 'D:/lingbo-psy-distribution/public'"
  exit 1
fi

if [[ ! -d "${SRC}" ]]; then
  echo "ERROR: source not found: ${SRC}"
  exit 1
fi

mkdir -p "${DEST}"
rsync -a --delete \
  --exclude uploads \
  "${SRC}/" "${DEST}/"
mkdir -p "${DEST}/uploads"

echo "DONE sync_psy_dist -> ${DEST}"
echo "Tests: $(find "${DEST}/tests" -name index.html 2>/dev/null | wc -l | tr -d ' ') bundles"
