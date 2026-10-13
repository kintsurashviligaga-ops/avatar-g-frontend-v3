#!/usr/bin/env bash
# The three settlers (callback, return page, cron) racing on ONE paid order, and overlapping cron ticks racing on
# ONE due renewal — real parallel sessions against the local database built by build.sh. Usage: 20_concurrency.sh <url>
set -euo pipefail
url="$1"; N="${N:-16}"
export PGOPTIONS="-c client_min_messages=warning"
q() { psql "$url" -v ON_ERROR_STOP=1 -Atqc "$1"; }
q "insert into auth.users (id,email) values ('00000000-0000-4000-8000-0000000000c1','race@test.local') on conflict do nothing;
   insert into public.bog_orders (shop_order_id,user_id,amount_gel,kind,credits) values ('myavatar-topup-race000000000000','00000000-0000-4000-8000-0000000000c1',50,'topup',500);"
for i in $(seq "$N"); do q "select public.bog_fulfill_order('myavatar-topup-race000000000000','bog-race',null,false)->>'granted'" & done > /tmp/bog_race_$$ ; wait
granted=$(grep -c true /tmp/bog_race_$$ || true); rm -f /tmp/bog_race_$$
bal=$(q "select credits_balance from public.profiles where id='00000000-0000-4000-8000-0000000000c1'")
[ "$granted" = 1 ] && [ "$bal" = 500 ] || { echo "FAIL C1: $N parallel settlements → granted=$granted balance=$bal (want 1 / 500)"; exit 1; }
echo "ok  C1 $N parallel settlements of one 50 GEL top-up → granted once, balance 500"

q "insert into public.bog_orders (shop_order_id,user_id,amount_gel,kind,tier,credits) values ('myavatar-plan-race000000000000','00000000-0000-4000-8000-0000000000c1',54,'subscription','starter',230);
   select public.bog_fulfill_order('myavatar-plan-race000000000000','bog-race-plan',null,true);
   update public.subscriptions set current_period_end = now() + interval '20 minutes' where stripe_subscription_id='bog:bog-race-plan';" >/dev/null
sub=$(q "select id from public.subscriptions where stripe_subscription_id='bog:bog-race-plan'")
for i in $(seq "$N"); do q "select public.bog_claim_renewal('$sub',230)->>'claimed'" & done > /tmp/bog_claim_$$ ; wait
claimed=$(grep -c true /tmp/bog_claim_$$ || true); rm -f /tmp/bog_claim_$$
orders=$(q "select count(*) from public.bog_orders where subscription_id='$sub' and kind='renewal'")
[ "$claimed" = 1 ] && [ "$orders" = 1 ] || { echo "FAIL C2: $N parallel claims → claimed=$claimed orders=$orders (want 1 / 1)"; exit 1; }
echo "ok  C2 $N parallel renewal claims of one period → one claim, one order (one charge)"

ren=$(q "select shop_order_id from public.bog_orders where subscription_id='$sub' and kind='renewal'")
for i in $(seq "$N"); do q "select public.bog_fulfill_order('$ren','bog-race-renew',null,false)->>'granted'" & done > /tmp/bog_ren_$$ ; wait
granted=$(grep -c true /tmp/bog_ren_$$ || true); rm -f /tmp/bog_ren_$$
bal=$(q "select credits_balance from public.profiles where id='00000000-0000-4000-8000-0000000000c1'")
[ "$granted" = 1 ] && [ "$bal" = 960 ] || { echo "FAIL C3: renewal settled $N× in parallel → granted=$granted balance=$bal (want 1 / 960)"; exit 1; }
echo "ok  C3 $N parallel settlements of one renewal → granted once (500 + 230 + 230 = 960)"
echo "ALL OK — 20_concurrency"
