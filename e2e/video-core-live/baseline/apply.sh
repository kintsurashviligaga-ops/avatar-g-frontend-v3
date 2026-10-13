#!/usr/bin/env bash
# The Video Core E2E Test Schema Baseline: applied to the THROWAWAY Supabase stack `supabase start` brings up inside
# the CI runner (e2e/video-core-live/supabase/config.toml). Built from repository files only, no Production dump:
#
#   1. scripts/lease-isolation/schema.sql — the Production shape of profiles, generation_jobs, credit_ledger, their
#      triggers and the money functions, read SELECT-only from Production on 2026-10-10 — minus the lines that stand
#      in for Supabase itself (roles, the stub auth.users, its two test rows) and its minimal trace table;
#   2. 010_supabase_contract.sql — profile columns, the trace ledger, RLS as Production has it, the renders bucket;
#   3. repo migrations applied VERBATIM, in Production's order: the one free film (consume / restore), analytics_events,
#      the starter grant on confirmation,
#      server-only job writes, the ledger's ref race hardening, the account lookup, the uploads bucket limits, the
#      storage read scope, the private renders bucket;
#   4. 020_auth_triggers.sql, 030_money_function_grants.sql (the free-film functions for the service role only, as
#      20260929a §1), then 900_verify.sql, which fails the run if any contract above does not hold.
#
# usage: e2e/video-core-live/baseline/apply.sh "<postgres url of the local stack>"
set -euo pipefail
DB_URL=${1:?usage: apply.sh <db url>}
cd "$(dirname "$0")/../../.."

# FAIL-CLOSED: only a database on this machine. The Production ref, a hosted Supabase host or any non-loopback host
# stops the run before a single statement is sent.
case "$DB_URL" in
  *zwksnayknzggdcenqqxy*) echo "apply.sh: REFUSED — the URL names the Production project" >&2; exit 64 ;;
esac
host=$(node -e 'try { console.log(new URL(process.argv[1]).hostname) } catch { console.log("") }' "$DB_URL")
case "$host" in
  127.0.0.1|localhost) ;;
  *) echo "apply.sh: REFUSED — database host '$host' is not this machine" >&2; exit 64 ;;
esac

run() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -X "$@"; }

sed -e '/^create role /d' \
    -e '/^grant anon, authenticated, service_role to authenticator;$/d' \
    -e '/^create schema auth; create table auth.users/d' \
    -e '/^insert into auth.users/d' \
    -e '/^create table public.agent_evolution_traces (/,/created_at timestamptz not null default now());$/d' \
    scripts/lease-isolation/schema.sql | run -f -
run -f e2e/video-core-live/baseline/010_supabase_contract.sql
for m in 20260602_free_film_promo 20260626b_analytics_events 20261001c_starter_grant_on_confirm 20261001f_generation_jobs_server_writes_twins_bucket \
         20261002d_ledger_ref_race_hardening 20261003f_auth_account_status 20261008c_uploads_bucket_limits \
         20261008d_storage_read_scope 20261009b_renders_private; do
  run -f "supabase/migrations/$m.sql"
done
run -f e2e/video-core-live/baseline/020_auth_triggers.sql
run -f e2e/video-core-live/baseline/030_money_function_grants.sql
run -f e2e/video-core-live/baseline/900_verify.sql
run -c "notify pgrst, 'reload schema'"
