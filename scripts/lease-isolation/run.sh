#!/usr/bin/env bash
# Crash recovery (E), retry exhaustion (F) and refunds (G) of Agent G's lease queue, the ledger's replay refusal
# (lib/orchestrator/ledgerOnce.pg.test.ts, before and after 20261002d) and multi-step runs on real ffmpeg
# (lib/agent/run/runIsolation.pg.test.ts), the delivery outbox's store (lib/notifications/outboxIsolation.pg.test.ts) and
# the R2 duplicate guard (lib/orchestrator/idempotencyStore.pg.test.ts, before and after its proposal) and a film's payment and
# stitches (lib/chat/filmBilling.pg.test.ts, before and after migration 20261014a) and the Library's stars
# (lib/library/libraryFavorites.pg.test.ts, before and after 20261024a), against a REAL but throwaway database: a local Postgres 16 with the
# Production shape (./schema.sql) behind a real PostgREST (Docker). Nothing here can reach Production: the database
# lives in a temp dir on this machine, PostgREST listens on 127.0.0.1, and every suite refuses any non-local URL.
#
#   needs: Postgres 16 server binaries (PG_BIN, default /usr/lib/postgresql/16/bin), Docker, node_modules.
#          Without Docker (or with Docker Hub refusing the pull): POSTGREST_BIN=<path to a postgrest v12.2.3 binary,
#          e.g. the static build from github.com/PostgREST/postgrest/releases> runs the same PostgREST as a process.
#   usage: scripts/lease-isolation/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
PG_BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
PG_PORT=${PG_PORT:-54329}
REST_PORT=${REST_PORT:-54330}
DIR=$(mktemp -d /tmp/lease-isolation.XXXXXX)
SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '/+=' | head -c 48)
NAME=lease-isolation-rest-$$
REST_PID=
as_pg() { if [ "$(id -u)" = 0 ]; then chown -R postgres "$DIR"; su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
cleanup() {
  if [ -n "$REST_PID" ]; then kill "$REST_PID" >/dev/null 2>&1 || true; else docker rm -f "$NAME" >/dev/null 2>&1 || true; fi
  as_pg "$PG_BIN/pg_ctl -D $DIR/data -m immediate stop" >/dev/null 2>&1 || true
  rm -rf "$DIR"
}
trap cleanup EXIT

as_pg "$PG_BIN/initdb -D $DIR/data -U postgres --auth=trust >/dev/null"
as_pg "$PG_BIN/pg_ctl -D $DIR/data -o '-p $PG_PORT -k $DIR -c listen_addresses=127.0.0.1' -l $DIR/pg.log -w start >/dev/null"
psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 -q -f scripts/lease-isolation/schema.sql

if [ -n "${POSTGREST_BIN:-}" ]; then
  PGRST_DB_URI="postgres://authenticator:local-only@127.0.0.1:$PG_PORT/postgres" PGRST_DB_SCHEMAS=public \
  PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$SECRET" PGRST_SERVER_PORT="$REST_PORT" PGRST_SERVER_HOST=127.0.0.1 \
    "$POSTGREST_BIN" >"$DIR/rest.log" 2>&1 &
  REST_PID=$!
else
  docker run -d --name "$NAME" --network host \
    -e PGRST_DB_URI="postgres://authenticator:local-only@127.0.0.1:$PG_PORT/postgres" -e PGRST_DB_SCHEMAS=public \
    -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$SECRET" -e PGRST_SERVER_PORT="$REST_PORT" \
    postgrest/postgrest:v12.2.3 >/dev/null
fi
for _ in $(seq 1 30); do curl -sf -o /dev/null "http://127.0.0.1:$REST_PORT/" && break; sleep 1; done

export LEASE_PG_REST_URL="http://127.0.0.1:$REST_PORT" LEASE_PG_JWT_SECRET="$SECRET"
node node_modules/.bin/jest lib/agent/media/leaseIsolation.pg.test.ts --no-watchman --ci --forceExit

# The ledger's replay refusal through the real client: first on Production's functions as they are, then with
# supabase/migrations/20261002d applied (PostgREST reloads its schema cache on the NOTIFY).
LEDGER_PHASE=before node node_modules/.bin/jest lib/orchestrator/ledgerOnce.pg.test.ts --no-watchman --ci --forceExit
# The 'before' suite's twins race on purpose and may leave more than one debit for their throwaway (user, 'twins') pair;
# 20261002d's preflight rightly refuses a ledger holding such a group, so those throwaway rows go before it is applied.
psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 -q -c "delete from public.credit_ledger where metadata->>'ref' = 'twins'"
psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261002d_ledger_ref_race_hardening.sql
psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -q -c "notify pgrst, 'reload schema'"
sleep 2
LEDGER_PHASE=after node node_modules/.bin/jest lib/orchestrator/ledgerOnce.pg.test.ts --no-watchman --ci --forceExit
# …and the lease queue's crash recovery and refunds still hold on the hardened functions.
node node_modules/.bin/jest lib/agent/media/leaseIsolation.pg.test.ts --no-watchman --ci --forceExit
# Multi-step runs end to end on the same database, every step on the real bundled ffmpeg (PART 7: I, E, F, G, H).
node node_modules/.bin/jest lib/agent/run/runIsolation.pg.test.ts --no-watchman --ci --forceExit
# The delivery outbox's live store: its JSON-path compare-and-set and due list on the same database (Omnichannel G).
node node_modules/.bin/jest lib/notifications/outboxIsolation.pg.test.ts --no-watchman --ci --forceExit
# Music Studio v1: quote → reserve → lease → deliver / refund-once on the live store + ledger.
node node_modules/.bin/jest lib/music/studio/musicIsolation.pg.test.ts --no-watchman --ci --forceExit
# R2: the duplicate guard in the database, first on a database without it (no table: it fails open, as before), then with
# the migration applied (supabase/migrations/20261013a_request_idempotency.sql; in Production since 2026-10-13).
IDEM_PHASE=before node node_modules/.bin/jest lib/orchestrator/idempotencyStore.pg.test.ts --no-watchman --ci --forceExit
psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261013a_request_idempotency.sql
psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -q -c "notify pgrst, 'reload schema'"
sleep 2
IDEM_PHASE=after node node_modules/.bin/jest lib/orchestrator/idempotencyStore.pg.test.ts --no-watchman --ci --forceExit
# Video Core final hardening, Phase 1: a film's payment and its stitches on the real ledger, first as Production is today
# before 20261014a (no film_billing: the ledger + cache, a paid film without its cache STOPS), then with the migration applied
# (supabase/migrations/20261014a_film_billing.sql; applied to Production 2026-10-15 on the owner's word).
FILM_PHASE=before node node_modules/.bin/jest lib/chat/filmBilling.pg.test.ts --no-watchman --ci --forceExit
# Applied twice: the migration must be re-runnable.
psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261014a_film_billing.sql
psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261014a_film_billing.sql
psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -q -c "notify pgrst, 'reload schema'"
sleep 2
FILM_PHASE=after node node_modules/.bin/jest lib/chat/filmBilling.pg.test.ts --no-watchman --ci --forceExit
# R3-A (the same migration): a scene Google failed is given back once, capped, owner-bound, service role only.
FILM_PHASE=after node node_modules/.bin/jest lib/chat/filmSceneRefund.pg.test.ts --no-watchman --ci --forceExit
# Phase 3 (B3) preflight: the storyboard revision proposal (docs/handoffs/video-core/proposals/20261012a_storyboard_revisions.sql)
# on the same database — applied twice (it must be re-runnable), checked, rolled back with its own footer, re-applied and
# checked again. NOT applied anywhere else: it waits for the owner's word and for the code that would write it.
B3=docs/handoffs/video-core/proposals/20261012a_storyboard_revisions.sql
psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 -q -f "$B3"
psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 -q -f "$B3"
psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 -q -f scripts/lease-isolation/b3-storyboard-revisions.check.sql
psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 -q \
  -c "drop table if exists public.storyboard_approvals; drop table if exists public.storyboard_revisions;"
psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 -q -f "$B3"
psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 -q -f scripts/lease-isolation/b3-storyboard-revisions.check.sql
# Phase 3 PR 4: Library stars through the Library route itself, on generation_jobs as its signed-in reader meets it in
# Production. First without supabase/migrations/20261024a_library_favorites.sql (as Production is until the owner applies
# it: the Library loads, stars answer 503), then with it applied twice (it must be re-runnable).
psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 -q -f scripts/lease-isolation/library-favorites.setup.sql
FAV_PHASE=before node node_modules/.bin/jest lib/library/libraryFavorites.pg.test.ts --no-watchman --ci --forceExit
psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261024a_library_favorites.sql
psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261024a_library_favorites.sql
psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -q -c "notify pgrst, 'reload schema'"
sleep 2
FAV_PHASE=after node node_modules/.bin/jest lib/library/libraryFavorites.pg.test.ts --no-watchman --ci --forceExit
