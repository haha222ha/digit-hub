#!/usr/bin/env bash
# 兼容旧名：心象测发卡 → 统一基座 assess/card
exec "$(dirname "$0")/generate_auth_codes.sh" assess card "$@"
