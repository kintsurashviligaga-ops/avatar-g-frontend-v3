#!/usr/bin/env bash
# Crash recovery (E), retry exhaustion (F) and refunds (G) of Agent G's lease queue against a REAL but throwaway
# database: a local Postgres 16 with the Production shape (./schema.sql) behind a real PostgREST (Docker), then
# lib/agent/media/leaseIsolation.pg.test.ts. Nothing here can reach Production: the database lives in a temp dir on
# this machine, PostgREST listens on 127.0.0.1, and the suite refuses any non-local URL.
#
#   needs: Postgres 16 server binaries (PG_BIN, default /usr/lib/postgresql/16/bin), Docker, node_modules.
#   usage: scripts/lease-isolation/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
PG_BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
PG_PORT=${PG_PORT:-54329}
REST_PORT=${REST_PORT:-54330}
DIR=$(mktemp -d /tmp/lease-isolation.XXXXXX)
SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '/+=' | head -c 48)
NAME=lease-isolation-rest-$$
as_pg() { if [ "$(id -u)" = 0 ]; then chown -R postgres "$DIR"; su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  as_pg "$PG_BIN/pg_ctl -D $DIR/data -m immediate stop" >/dev/null 2>&1 || true
  rm -rf "$DIR"
}
trap cleanup EXIT

as_pg "$PG_BIN/initdb -D $DIR/data -U postgres --auth=trust >/dev/null"
as_pg "$PG_BIN/pg_ctl -D $DIR/data -o '-p $PG_PORT -k $DIR -c listen_addresses=127.0.0.1' -l $DIR/pg.log -w start >/dev/null"
psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 -q -f scripts/lease-isolation/schema.sql

docker run -d --name "$NAME" --network host \
  -e PGRST_DB_URI="postgres://authenticator:local-only@127.0.0.1:$PG_PORT/postgres" -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$SECRET" -e PGRST_SERVER_PORT="$REST_PORT" \
  postgrest/postgrest:v12.2.3 >/dev/null
for _ in $(seq 1 30); do curl -sf -o /dev/null "http://127.0.0.1:$REST_PORT/" && break; sleep 1; done

LEASE_PG_REST_URL="http://127.0.0.1:$REST_PORT" LEASE_PG_JWT_SECRET="$SECRET" \
  node node_modules/.bin/jest lib/agent/media/leaseIsolation.pg.test.ts --no-watchman --ci --forceExit
