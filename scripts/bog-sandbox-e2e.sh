#!/usr/bin/env bash
# scripts/bog-sandbox-e2e.sh — our BOG integration against Bank of Georgia's REAL sandbox (api-sandbox.bog.ge):
#
#   real route handlers (checkout, order status, subscription, cron)
#     → real supabase-js → a local PostgREST → a throwaway local Postgres with the BOG money functions (tests/sql/bog)
#     → BOG's sandbox for OAuth, orders, saved cards, automatic charges, refunds and receipts,
#   and a headless Chromium that pays on BOG's own page with BOG's published test cards.
#   (__tests__/integration/bog-sandbox.e2e.test.ts says what each scenario proves and why nothing live is reachable.)
#
# Needs: a LOCAL Postgres (PGURL), a PostgREST v12 binary (POSTGREST_BIN), Chromium for playwright-core, and the
# sandbox pair from Business Manager → Sandbox objects, in the environment only:
#   BOG_SANDBOX_CLIENT_ID, BOG_SANDBOX_SECRET_KEY
# Never the live pair: the suite talks to the sandbox hosts only and refuses every other host.
#   PGURL=postgres://postgres@localhost:54329/postgres POSTGREST_BIN=/path/postgrest scripts/bog-sandbox-e2e.sh
# Screenshots of BOG's page land in BOG_SANDBOX_SHOTS_DIR (default ./bog-sandbox-shots).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
: "${PGURL:?PGURL must point at a LOCAL postgres}"
: "${POSTGREST_BIN:?POSTGREST_BIN must point at a postgrest v12 binary}"
: "${BOG_SANDBOX_CLIENT_ID:?BOG_SANDBOX_CLIENT_ID (the SANDBOX client id) is not set}"
: "${BOG_SANDBOX_SECRET_KEY:?BOG_SANDBOX_SECRET_KEY (the SANDBOX secret) is not set}"
export PGOPTIONS="-c client_min_messages=warning"

url=$("$root/tests/sql/bog/build.sh" bog_sandbox)
psql "$url" -v ON_ERROR_STOP=1 -q -f "$root/tests/sql/bog/05_postgrest.sql"
port="${PGRST_PORT:-39982}"
jwt_secret="local-sandbox-e2e-$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
hostport="${url#*@}"; hostport="${hostport%%/*}"
PGRST_DB_URI="postgres://authenticator:local-e2e-only@${hostport}/bog_sandbox" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
  PGRST_JWT_SECRET="$jwt_secret" PGRST_SERVER_PORT="$port" PGRST_SERVER_HOST=127.0.0.1 PGRST_LOG_LEVEL=crit \
  "$POSTGREST_BIN" >/tmp/bog-sandbox-postgrest.log 2>&1 &
pid=$!
trap 'kill $pid 2>/dev/null || true' EXIT
for _ in $(seq 50); do curl -sf "http://127.0.0.1:$port/" >/dev/null && break; sleep 0.2; done
BOG_E2E_POSTGREST="http://127.0.0.1:$port" BOG_E2E_JWT_SECRET="$jwt_secret" \
  BOG_SANDBOX_SHOTS_DIR="${BOG_SANDBOX_SHOTS_DIR:-$root/bog-sandbox-shots}" \
  npx jest --runInBand --forceExit --testTimeout=300000 __tests__/integration/bog-sandbox.e2e.test.ts "$@"
