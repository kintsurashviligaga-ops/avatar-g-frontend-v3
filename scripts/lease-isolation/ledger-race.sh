#!/usr/bin/env bash
# The deduct_credits / refund_credits same-ref race (gap C1), proven against a REAL but throwaway Postgres 16 that
# carries Production's credit_ledger, profiles, balance trigger and the two functions verbatim (./schema.sql).
#
#   1. Fidelity: the local function bodies hash to the same md5 as Production's pg_get_functiondef (read 2026-10-10).
#   2. Live definitions: two calls with one ref, both past the EXISTS check before either takes the row lock
#      (held open here by a third session), are charged TWICE; two same-ref refunds leave the loser an ERROR (23505).
#   3. supabase/migrations/20261002d applied: the same interleaving charges ONCE, the losing caller gets the balance
#      back as success, the losing refund is a no-op success; 20 parallel same-ref debits charge once; 20 parallel
#      distinct debits against 100 credits stop at exactly 0 (never negative); the migration re-applies cleanly and
#      refuses to build over existing duplicates.
#   4. deduct_credits_once (new in 20261002d) answers {balance, charged}: exactly one caller per ref is told it charged,
#      sequential or concurrent, so a route can refuse a replay before it renders (gap C5).
#   5. The rollback restores the live bodies and drops what 20261002d added.
#
# Nothing here can reach Production: the database lives in a temp dir on this machine and listens on 127.0.0.1.
#   needs: Postgres 16 server binaries (PG_BIN, default /usr/lib/postgresql/16/bin) and psql. No Docker.
#   usage: scripts/lease-isolation/ledger-race.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
PG_BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
PG_PORT=${PG_PORT:-54331}
DIR=$(mktemp -d /tmp/ledger-race.XXXXXX)
MIGRATION=supabase/migrations/20261002d_ledger_ref_race_hardening.sql
ROLLBACK=scripts/lease-isolation/20261002d.rollback.sql
# Production's pg_get_functiondef md5s, read-only, 2026-10-10 (before 20261002d).
PROD_DEDUCT_MD5=4dbf2c2d88226377dc6cd4c361b72184
PROD_REFUND_MD5=ca910a5fce271c2ac3c11f5ea2d8cb2a

as_pg() { if [ "$(id -u)" = 0 ]; then chown -R postgres "$DIR"; su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
cleanup() {
  as_pg "$PG_BIN/pg_ctl -D $DIR/data -m immediate stop" >/dev/null 2>&1 || true
  rm -rf "$DIR"
}
trap cleanup EXIT

export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -X -A -t -q -v ON_ERROR_STOP=1)
q() { "${PSQL[@]}" -c "$1"; }
PASS=0; FAIL=0
check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then PASS=$((PASS + 1)); echo "  ok    $1"; else FAIL=$((FAIL + 1)); echo "  FAIL  $1: expected [$2], got [$3]"; fi
}

as_pg "$PG_BIN/initdb -D $DIR/data -U postgres --auth=trust >/dev/null"
as_pg "$PG_BIN/pg_ctl -D $DIR/data -o '-p $PG_PORT -k $DIR -c listen_addresses=127.0.0.1' -l $DIR/pg.log -w start >/dev/null"
"${PSQL[@]}" -f scripts/lease-isolation/schema.sql >/dev/null

new_user() { # new_user <credits> → uuid
  local u; u=$(q "select gen_random_uuid()")
  q "insert into public.profiles (id, email, credits_balance) values ('$u', 'race-$u@local.test', $1)" >/dev/null
  echo "$u"
}
debits() { q "select count(*) from public.credit_ledger where user_id = '$1' and delta < 0 and metadata->>'ref' = '$2'"; }
credits() { q "select count(*) from public.credit_ledger where user_id = '$1' and delta > 0 and metadata->>'ref' = '$2'"; }
balance() { q "select credits_balance from public.profiles where id = '$1'"; }
waiting_on_locks() { q "select count(*) from pg_stat_activity where wait_event_type = 'Lock'"; }

# Forces the interleaving the race needs: a third session holds the profile row lock, both callers run their EXISTS
# check (nothing there yet), then queue on the lock; the holder lets go only once BOTH are seen waiting.
interleave() { # interleave <user> <sql> <out-prefix>
  local u=$1 sql=$2 out=$3 n=0
  "${PSQL[@]}" -c "begin; select 1 from public.profiles where id = '$u' for update; select pg_sleep(4); commit;" >/dev/null &
  local holder=$!
  until [ "$(q "select count(*) from pg_stat_activity where query like '%pg_sleep(4)%' and state = 'active' and pid <> pg_backend_pid()")" = 1 ]; do sleep 0.05; done
  "${PSQL[@]}" -c "$sql" >"$out.a" 2>&1 & local a=$!
  "${PSQL[@]}" -c "$sql" >"$out.b" 2>&1 & local b=$!
  while [ "$(waiting_on_locks)" != 2 ] && [ $n -lt 60 ]; do sleep 0.05; n=$((n + 1)); done
  waiting_on_locks >"$out.waiters"
  wait $holder || true; wait $a || true; wait $b || true
}
errors_in() { cat "$1.a" "$1.b" | grep -c "ERROR" || true; }

echo "1. fidelity with Production"
check "deduct_credits body = Production's" "$PROD_DEDUCT_MD5" "$(q "select md5(pg_get_functiondef('public.deduct_credits(uuid,integer,text)'::regprocedure))")"
check "refund_credits body = Production's" "$PROD_REFUND_MD5" "$(q "select md5(pg_get_functiondef('public.refund_credits(uuid,integer,text)'::regprocedure))")"

echo "2. live definitions (Production today)"
U=$(new_user 100)
interleave "$U" "select public.deduct_credits('$U', 30, 'race-live')" "$DIR/d1"
check "both debits were past the EXISTS check, waiting on the row lock" 2 "$(cat "$DIR/d1.waiters")"
check "one ref charged TWICE (the race)" 2 "$(debits "$U" race-live)"
check "balance 100 - 2 x 30" 40 "$(balance "$U")"
check "neither caller saw an error" 0 "$(errors_in "$DIR/d1")"

U=$(new_user 100)
interleave "$U" "select public.deduct_credits('$U', 60, 'race-live-60')" "$DIR/d3"
check "60 + 60 against 100: charged once, but" 1 "$(debits "$U" race-live-60)"
check "the loser of a CHARGED request is told insufficient_credits" 1 "$(cat "$DIR/d3.a" "$DIR/d3.b" | grep -c insufficient_credits || true)"

U=$(new_user 0)
interleave "$U" "select public.refund_credits('$U', 30, 'refund-live')" "$DIR/r1"
check "both refunds waiting" 2 "$(cat "$DIR/r1.waiters")"
check "credit-back landed once (positive unique index)" 1 "$(credits "$U" refund-live)"
check "the losing refund is told it FAILED (23505)" 1 "$(errors_in "$DIR/r1")"
check "duplicate key is the error" 1 "$(cat "$DIR/r1.a" "$DIR/r1.b" | grep -c 'duplicate key value violates unique constraint "credit_ledger_user_ref_positive_uniq"' || true)"

echo "3. preflight refuses to build over duplicates"
# The live table above now holds a duplicate debit group; the migration must stop with its own message, not half-apply.
set +e; "${PSQL[@]}" -f "$MIGRATION" >"$DIR/m0" 2>&1; rc=$?; set -e
check "migration refused" 3 "$rc"
check "refusal names the duplicates" 1 "$(grep -c '20261002d preflight: 1 (user, ref) group' "$DIR/m0" || true)"
check "no index built" 0 "$(q "select count(*) from pg_indexes where indexname = 'credit_ledger_user_ref_negative_uniq'")"
check "functions untouched" "$PROD_DEDUCT_MD5" "$(q "select md5(pg_get_functiondef('public.deduct_credits(uuid,integer,text)'::regprocedure))")"
q "delete from public.credit_ledger where metadata->>'ref' = 'race-live'" >/dev/null

echo "4. 20261002d applied"
"${PSQL[@]}" -f "$MIGRATION" >/dev/null
"${PSQL[@]}" -f "$MIGRATION" >/dev/null
check "re-applies cleanly; index valid" t "$(q "select indisvalid from pg_index where indexrelid = 'public.credit_ledger_user_ref_negative_uniq'::regclass")"
check "anon / authenticated still cannot execute" "false false" "$(q "select has_function_privilege('anon', 'public.deduct_credits(uuid,integer,text)', 'execute') || ' ' || has_function_privilege('authenticated', 'public.deduct_credits(uuid,integer,text)', 'execute')")"

U=$(new_user 100)
interleave "$U" "select public.deduct_credits('$U', 30, 'race-fixed')" "$DIR/d2"
check "both debits waiting, as before" 2 "$(cat "$DIR/d2.waiters")"
check "one ref charged ONCE" 1 "$(debits "$U" race-fixed)"
check "balance 100 - 30" 70 "$(balance "$U")"
check "neither caller saw an error" 0 "$(errors_in "$DIR/d2")"
check "both callers were told the same balance" "70 70" "$(cat "$DIR/d2.a" "$DIR/d2.b" | tr '\n' ' ' | sed 's/ $//')"

U=$(new_user 100)
interleave "$U" "select public.deduct_credits('$U', 60, 'race-fixed-60')" "$DIR/d4"
check "60 + 60 against 100: charged once" 1 "$(debits "$U" race-fixed-60)"
check "both callers told the charge stands (balance 40), no insufficient_credits" "40 40" "$(cat "$DIR/d4.a" "$DIR/d4.b" | tr '\n' ' ' | sed 's/ $//')"

U=$(new_user 0)
interleave "$U" "select public.refund_credits('$U', 30, 'refund-fixed')" "$DIR/r2"
check "both refunds waiting" 2 "$(cat "$DIR/r2.waiters")"
check "credit-back landed once" 1 "$(credits "$U" refund-fixed)"
check "the losing refund is a success, not an error" 0 "$(errors_in "$DIR/r2")"
check "balance 0 + 30" 30 "$(balance "$U")"

U=$(new_user 100)
for i in $(seq 1 20); do "${PSQL[@]}" -c "select public.deduct_credits('$U', 10, 'storm')" >/dev/null 2>&1 & done; wait
check "20 parallel same-ref debits charge once" 1 "$(debits "$U" storm)"
check "balance 100 - 10" 90 "$(balance "$U")"

U=$(new_user 100)
for i in $(seq 1 20); do "${PSQL[@]}" -c "select public.deduct_credits('$U', 10, 'floor-$i')" >/dev/null 2>&1 & done; wait
check "20 parallel distinct debits of 10 against 100: exactly 10 land" 10 "$(q "select count(*) from public.credit_ledger where user_id = '$U' and delta < 0")"
check "balance stops at 0, never negative" 0 "$(balance "$U")"

U=$(new_user 50)
q "select public.deduct_credits('$U', 20, 'replay')" >/dev/null
check "a replayed ref (sequential) is a no-op that answers the balance" 30 "$(q "select public.deduct_credits('$U', 20, 'replay')")"
check "still one debit" 1 "$(debits "$U" replay)"
q "select public.refund_credits('$U', 20, 'replay')" >/dev/null
q "select public.refund_credits('$U', 20, 'replay')" >/dev/null
check "a replayed refund credits once (no minting)" 50 "$(balance "$U")"
check "negative amounts still refused" 1 "$( (q "select public.deduct_credits('$U', -5, 'neg')" 2>&1 || true) | grep -c invalid_amount || true)"

echo "5. deduct_credits_once tells its own charge from a replay"
U=$(new_user 100)
check "first call charges" '{"balance": 70, "charged": true}' "$(q "select public.deduct_credits_once('$U', 30, 'once-1')")"
check "a sequential replay is not charged and says so" '{"balance": 70, "charged": false}' "$(q "select public.deduct_credits_once('$U', 30, 'once-1')")"
q "select public.deduct_credits('$U', 10, 'once-2')" >/dev/null
check "a ref deduct_credits already took is a replay here" '{"balance": 60, "charged": false}' "$(q "select public.deduct_credits_once('$U', 10, 'once-2')")"
interleave "$U" "select public.deduct_credits_once('$U', 20, 'once-race')" "$DIR/o1"
check "both waiting on the row lock" 2 "$(cat "$DIR/o1.waiters")"
check "interleaved same-ref: charged once" 1 "$(debits "$U" once-race)"
check "exactly one caller is told charged=true" 1 "$(cat "$DIR/o1.a" "$DIR/o1.b" | grep -c '"charged": true' || true)"
check "the other is told charged=false (refuse, do not render)" 1 "$(cat "$DIR/o1.a" "$DIR/o1.b" | grep -c '"charged": false' || true)"
U=$(new_user 100)
for i in $(seq 1 20); do "${PSQL[@]}" -c "select public.deduct_credits_once('$U', 10, 'once-storm')" >>"$DIR/o2" 2>&1 & done; wait
check "20 parallel same-ref: one debit" 1 "$(debits "$U" once-storm)"
check "20 parallel same-ref: exactly one charged=true" 1 "$(grep -c '"charged": true' "$DIR/o2" || true)"
check "insufficient still refused" 1 "$( (q "select public.deduct_credits_once('$U', 500, 'once-big')" 2>&1 || true) | grep -c insufficient_credits || true)"
check "an empty ref is refused" 1 "$( (q "select public.deduct_credits_once('$U', 5, ' ')" 2>&1 || true) | grep -c invalid_ref || true)"
check "anon / authenticated cannot execute it" "false false" "$(q "select has_function_privilege('anon', 'public.deduct_credits_once(uuid,integer,text)', 'execute') || ' ' || has_function_privilege('authenticated', 'public.deduct_credits_once(uuid,integer,text)', 'execute')")"

echo "6. rollback"
"${PSQL[@]}" -f "$ROLLBACK" >/dev/null
check "deduct_credits_once gone" "" "$(q "select to_regprocedure('public.deduct_credits_once(uuid,integer,text)')")"
check "index gone" 0 "$(q "select count(*) from pg_indexes where indexname = 'credit_ledger_user_ref_negative_uniq'")"
check "deduct_credits back to Production's body" "$PROD_DEDUCT_MD5" "$(q "select md5(pg_get_functiondef('public.deduct_credits(uuid,integer,text)'::regprocedure))")"
check "refund_credits back to Production's body" "$PROD_REFUND_MD5" "$(q "select md5(pg_get_functiondef('public.refund_credits(uuid,integer,text)'::regprocedure))")"

echo
echo "ledger race: $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
