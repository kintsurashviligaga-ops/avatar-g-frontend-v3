#!/usr/bin/env bash
# Build a throwaway local database with the BOG billing schema: base (Production shapes) + the repo's own migrations.
# Usage: PGURL=postgres://postgres@localhost:54329/postgres tests/sql/bog/build.sh <dbname>
set -euo pipefail
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"
here="$(cd "$(dirname "$0")" && pwd)"; root="$here/../../.."
db="${1:-bog_test}"
: "${PGURL:?set PGURL to a LOCAL postgres (never a Supabase project)}"
case "$PGURL" in *supabase*|*pooler*) echo "refusing: PGURL looks like a Supabase project" >&2; exit 2;; esac
psql "$PGURL" -v ON_ERROR_STOP=1 -qc "drop database if exists $db" -c "create database $db"
url="${PGURL%/*}/$db"
for f in "$here/00_base.sql" "$root/supabase/migrations/20260705_bog_orders.sql" "$root/supabase/migrations/20261002a_bog_billing.sql"; do
  psql "$url" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
done
echo "$url"
