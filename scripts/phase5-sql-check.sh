#!/usr/bin/env bash
# Runs tests/sql/phase5/10_money.sql against a THROWAWAY local Postgres (initdb in a temp dir, a unix socket, no TCP).
# Never touches Supabase. Needs the Postgres 16 server binaries (PG_BIN, default /usr/lib/postgresql/16/bin).
# When run as root, the server runs as the unprivileged `postgres` user (Postgres refuses to run as root).
set -euo pipefail
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d /tmp/phase5-pg.XXXXXX)"
chmod 755 "$WORK"
AS=()
if [ "$(id -u)" = "0" ]; then chown postgres "$WORK"; AS=(runuser -u postgres --); fi
cleanup() { "${AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -r -f -- "$WORK"; }
trap cleanup EXIT
"${AS[@]}" "$PG_BIN/initdb" -D "$WORK/data" -A trust -U postgres >/dev/null
"${AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -o "-k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null
cp -r "$REPO/docs/v5.1-phase5" "$REPO/tests/sql/phase5" "$WORK/"
mkdir -p "$WORK/docs" "$WORK/tests/sql" && mv "$WORK/v5.1-phase5" "$WORK/docs/" && mv "$WORK/phase5" "$WORK/tests/sql/"
[ -n "${AS[*]}" ] && chown -R postgres "$WORK/docs" "$WORK/tests"
cd "$WORK"
"${AS[@]}" psql -X -q -h "$WORK" -U postgres -d postgres -v ON_ERROR_STOP=1 -f tests/sql/phase5/10_money.sql
