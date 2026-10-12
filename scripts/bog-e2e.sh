#!/usr/bin/env bash
# scripts/bog-e2e.sh — Bank of Georgia payments, end to end, with ZERO network and ZERO real credentials:
#
#   real route handlers (checkout, webhook, order status, subscription, cron)
#     → real supabase-js → a local PostgREST → a local Postgres holding the BOG money functions
#       (tests/sql/bog: Production's table shapes + the repo's migrations; the functions are code-identical to
#        Production's, checked by md5 on 2026-10-12)
#     → a fake BOG API inside the test (OAuth, orders, saved cards, receipts) that signs its callbacks with a
#       throwaway RSA key.
#
# Needs: a local Postgres you can create databases in (PGURL) and a PostgREST binary (POSTGREST_BIN, v12).
#   PGURL=postgres://postgres@localhost:54329/postgres POSTGREST_BIN=/path/postgrest scripts/bog-e2e.sh
# Also runs the SQL-only suites (tests/sql/bog/10_scenarios.sql, 20_concurrency.sh).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
: "${PGURL:?PGURL must point at a LOCAL postgres}"
: "${POSTGREST_BIN:?POSTGREST_BIN must point at a postgrest v12 binary}"
export PGOPTIONS="-c client_min_messages=warning"

echo "── SQL scenarios"
url=$("$root/tests/sql/bog/build.sh" bog_scenarios)
psql "$url" -q -f "$root/tests/sql/bog/10_scenarios.sql" 2>&1 | grep -E "ok  |FAIL|ERROR|ALL OK" | sed 's/^.*NOTICE:  //'
echo "── SQL concurrency"
"$root/tests/sql/bog/20_concurrency.sh" "$("$root/tests/sql/bog/build.sh" bog_race)"

echo "── route-level end to end"
url=$("$root/tests/sql/bog/build.sh" bog_e2e)
psql "$url" -v ON_ERROR_STOP=1 -q -f "$root/tests/sql/bog/05_postgrest.sql"
port="${PGRST_PORT:-39981}"
jwt_secret="local-e2e-only-$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
hostport="${url#*@}"; hostport="${hostport%%/*}"
PGRST_DB_URI="postgres://authenticator:local-e2e-only@${hostport}/bog_e2e" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
  PGRST_JWT_SECRET="$jwt_secret" PGRST_SERVER_PORT="$port" PGRST_LOG_LEVEL=crit "$POSTGREST_BIN" >/tmp/bog-e2e-postgrest.log 2>&1 &
pid=$!
trap 'kill $pid 2>/dev/null || true' EXIT
for _ in $(seq 50); do curl -sf "http://localhost:$port/" >/dev/null && break; sleep 0.2; done
BOG_E2E_POSTGREST="http://localhost:$port" BOG_E2E_JWT_SECRET="$jwt_secret" \
  npx jest --runInBand --forceExit --testTimeout=30000 __tests__/integration/bog-payments.e2e.test.ts "$@"
