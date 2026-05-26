#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_MODE="${1:-auto}"

if [[ "$DB_MODE" != auto && "$DB_MODE" != docker && "$DB_MODE" != local ]]; then
  echo "Usage: ./setup-dev.sh [auto|docker|local]" >&2
  exit 1
fi

node "$SCRIPT_DIR/scripts/setup-dev.mjs" "--db=$DB_MODE"
