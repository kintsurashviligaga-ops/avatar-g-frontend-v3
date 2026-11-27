#!/usr/bin/env bash
# scripts/launch/verify.sh — the "GO" check for GREEN day (Phase 8.23). Read-only except the optional browser check.
#
#   CRON_SECRET=… scripts/launch/verify.sh                      health 6/6 + Supabase Auth + signing keys
#   CRON_SECRET=… VERIFY_ADMIN_TOKEN=… scripts/launch/verify.sh  … plus the cloud-browser / IPv6 guard check
#
# Prints PASS/FAIL per check and one last line: SUCCESS (exit 0) or FAIL (exit 1).
#
# Inputs (environment only; nothing is ever printed, logged or passed on a command line):
#   CRON_SECRET         REQUIRED. The value already in Vercel. Without it /api/health answers a bare {"ok":true} with
#                       no database or Redis check at all, which proves nothing; this script then FAILS on purpose.
#   VERIFY_ADMIN_TOKEN  Optional. A signed-in admin's Supabase access token (about an hour). Turns on check 4.
#   SUPABASE_ANON_KEY   Optional. The PUBLIC anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY). Sent to Auth health if given.
#   SITE                Default https://myavatar.ge
#   SUPABASE_REF        Default zwksnayknzggdcenqqxy (production; never another project)
#   SUPABASE_AUTH_URL   Tests only: overrides https://$SUPABASE_REF.supabase.co/auth/v1
#
# Check 4 runs two real cloud-browser tasks in the Vercel Sandbox (a few cents each, booked in the $20 sandbox ledger):
#   4a example.com must load and give a screenshot   → the browser works behind the #399 guard
#   4b a public NAME whose only answer is IPv6 ::1    → must be refused by the guard ("blocked"). This is the case #399
#      closes: before it, a DNS name pointing at an IPv6 private address was not checked inside the sandbox.
#   4c an IPv6 literal [::1]                         → must be refused at quote time (free, no sandbox)
# Runbook item 25: if 4a or 4b fails right after #399 is merged, revert #399.
set -u

SITE="${SITE:-https://myavatar.ge}"
SUPABASE_REF="${SUPABASE_REF:-zwksnayknzggdcenqqxy}"
IPV6_ONLY_NAME="${IPV6_ONLY_NAME:-0--1.sslip.io}"  # sslip.io: dashes stand for colons, so this name answers AAAA 0::1 (= ::1), no A

fails=0
pass() { printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; fails=$((fails + 1)); }
info() { printf '  info  %s\n' "$1"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "FAIL: $1 is not installed"; exit 1; }; }
need curl
need python3

TMP="$(mktemp -d)"; chmod 700 "$TMP"; trap 'rm -rf "$TMP"' EXIT

# curl with a secret header read from stdin (--config -), so the secret never appears in `ps` or shell history.
# usage: authcurl <secret> <curl args…>
authcurl() {
  local secret="$1"; shift
  printf 'header = "Authorization: Bearer %s"\n' "$secret" | curl --config - -sS --max-time 120 "$@"
}

json() { python3 -c "import json,sys; d=json.load(open(sys.argv[1])); $2" "$1" 2>/dev/null; }

echo "verify.sh — $SITE — $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 1. Health 6/6 ---------------------------------------------------------------------------------------------------
echo "1. /api/health (database, Redis, env)"
if [ -z "${CRON_SECRET:-}" ]; then
  fail "CRON_SECRET is not set: /api/health would answer a bare ok:true without touching the database"
else
  code="$(authcurl "$CRON_SECRET" -o "$TMP/health.json" -w '%{http_code}' "$SITE/api/health" || echo 000)"
  if [ "$code" != "200" ]; then
    fail "HTTP $code from /api/health"
  elif ! json "$TMP/health.json" "sys.exit(0 if 'database' in d else 1)"; then
    fail "health answered WITHOUT detail (no database field): CRON_SECRET does not match Vercel's"
  else
    n="$(json "$TMP/health.json" "print(sum([d.get('ok') is True, d.get('status')=='healthy', d.get('env')=='valid', d.get('missing')==[], d.get('database')=='connected', d.get('redis')=='connected']))")"
    json "$TMP/health.json" "
for k,want in [('ok',True),('status','healthy'),('env','valid'),('missing',[]),('database','connected'),('redis','connected')]:
    v=d.get(k); print('        %-8s %-12s %s' % (k, json.dumps(v)[:40], 'ok' if v==want else '<-- want '+json.dumps(want)))
if d.get('database_error'): print('        database_error', d['database_error'])
print('        payments', d.get('payments'), ' commit', d.get('commit'))"
    if [ "$n" = "6" ]; then pass "health 6/6"; else fail "health ${n:-0}/6"; fi
  fi
fi

# 2. Supabase Auth --------------------------------------------------------------------------------------------------
echo "2. Supabase Auth ($SUPABASE_REF)"
AUTH="${SUPABASE_AUTH_URL:-https://$SUPABASE_REF.supabase.co/auth/v1}"
if [ -n "${SUPABASE_ANON_KEY:-}" ]; then
  code="$(printf 'header = "apikey: %s"\n' "$SUPABASE_ANON_KEY" | curl --config - -sS --max-time 20 -o /dev/null -w '%{http_code}' "$AUTH/health" || echo 000)"
else
  code="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "$AUTH/health" || echo 000)"
fi
case "$code" in
  200) pass "Auth health 200" ;;
  401) fail "Auth health 401: Auth is up but wants the public anon key; run again with SUPABASE_ANON_KEY set" ;;
  000) fail "Auth health: no answer (DNS/timeout). The project is still paused or unreachable" ;;
  *)   fail "Auth health HTTP $code" ;;
esac

# 3. Signing keys (information only: decides whether #339 may go on) ----------------------------------------------
echo "3. Auth signing keys (for #339; not a pass/fail)"
if curl -sS --max-time 20 -o "$TMP/jwks.json" "$AUTH/.well-known/jwks.json" 2>/dev/null; then
  algs="$(json "$TMP/jwks.json" "print(','.join(sorted({k.get('alg','?') for k in d.get('keys',[])})) or 'none')")"
  case "$algs" in
    *ES256*|*RS256*) info "keys: $algs → #339 (AUTH_LOCAL_CLAIMS) may go on later, by card" ;;
    none|"")         info "no asymmetric keys (legacy HS256) → #339 stays off" ;;
    *)               info "keys: $algs" ;;
  esac
else
  info "JWKS not readable"
fi

# 4. Cloud browser behind the #399 guard ------------------------------------------------------------------------------
echo "4. Cloud browser + IPv6 guard (Vercel Sandbox)"
if [ -z "${VERIFY_ADMIN_TOKEN:-}" ]; then
  info "skipped: set VERIFY_ADMIN_TOKEN (an admin's access token) to run it. Required once right after #399 merges"
else
  BR="$SITE/api/agent/browser/run"
  code="$(authcurl "$VERIFY_ADMIN_TOKEN" -o "$TMP/avail.json" -w '%{http_code}' "$BR" || echo 000)"
  if [ "$code" != "200" ] || ! json "$TMP/avail.json" "sys.exit(0 if d.get('enabled') is True else 1)"; then
    fail "browser not enabled for this token (HTTP $code). Check AGENT_G_SANDBOX, BROWSER_ENABLED=1, BROWSER_SNAPSHOT_ID, and that the token is an admin's and not expired"
  else
    # quote <steps-json> <outfile>  → HTTP code
    quote() {
      printf '{"action":"quote","request":{"steps":%s}}' "$1" > "$TMP/q.body"
      authcurl "$VERIFY_ADMIN_TOKEN" -o "$2" -w '%{http_code}' -H 'Content-Type: application/json' --data-binary @"$TMP/q.body" "$BR" || echo 000
    }
    # run <quote-json> <outfile>  → HTTP code
    run() {
      json "$1" "print(json.dumps({'action':'run','request':d['request'],'token':d['token']}))" > "$TMP/r.body" || return 1
      authcurl "$VERIFY_ADMIN_TOKEN" -o "$2" -w '%{http_code}' -H 'Content-Type: application/json' --data-binary @"$TMP/r.body" "$BR" || echo 000
    }

    # 4a. example.com loads, with a screenshot
    c="$(quote '[{"op":"goto","url":"https://example.com/"},{"op":"text"},{"op":"screenshot","name":"verify"}]' "$TMP/qa.json")"
    if [ "$c" != "200" ]; then
      fail "4a quote for example.com: HTTP $c $(json "$TMP/qa.json" "print(d.get('error'), d.get('message'))")"
    else
      c="$(run "$TMP/qa.json" "$TMP/ra.json")"
      if [ "$c" = "200" ] && json "$TMP/ra.json" "
s=d.get('steps') or []
ok = d.get('ok') is True and 'example.com' in (d.get('finalUrl') or '') and len(s)>=3 and all(x.get('ok') for x in s)
sys.exit(0 if ok else 1)"; then
        pass "4a example.com loaded, text read, screenshot taken ($(json "$TMP/ra.json" "print(d.get('workspace',{}).get('folder',''))"))"
      else
        fail "4a example.com run: HTTP $c $(json "$TMP/ra.json" "print(d.get('error') or [x.get('error') for x in d.get('steps',[]) if x.get('error')])")"
      fi
    fi

    # 4b. a public name whose only address is IPv6 loopback must be refused by the in-sandbox guard
    c="$(quote "[{\"op\":\"goto\",\"url\":\"http://$IPV6_ONLY_NAME/\"}]" "$TMP/qb.json")"
    if [ "$c" != "200" ]; then
      # Refused before any sandbox: still safe, but it did not exercise the #399 path.
      info "4b quote refused up front (HTTP $c): safe, but the in-sandbox guard was not exercised"
      fail "4b inconclusive: the IPv6 DNS path was not tested"
    else
      c="$(run "$TMP/qb.json" "$TMP/rb.json")"
      verdict="$(json "$TMP/rb.json" "
s=d.get('steps') or []
errs=' '.join(str(x.get('error') or '') for x in s) + ' ' + str(d.get('message') or '')
loaded=any(x.get('ok') and x.get('op')=='goto' for x in s)
print('LOADED' if loaded else ('BLOCKED' if 'blocked' in errs.lower() else 'OTHER:'+errs.strip()[:160]))")"
      case "$verdict" in
        BLOCKED) pass "4b http://$IPV6_ONLY_NAME/ (AAAA ::1) refused by the guard: the IPv6 gap is closed in the real sandbox" ;;
        LOADED)  fail "4b http://$IPV6_ONLY_NAME/ LOADED: the IPv6 guard is NOT working. Revert #399's deploy and stop" ;;
        *)       fail "4b inconclusive (HTTP $c, ${verdict:-no answer}): not loaded, but not refused by the guard either. Check DNS for $IPV6_ONLY_NAME" ;;
      esac
    fi

    # 4c. an IPv6 literal is refused at quote time (free)
    c="$(quote '[{"op":"goto","url":"http://[::1]/"}]' "$TMP/qc.json")"
    if [ "$c" = "400" ]; then pass "4c http://[::1]/ refused at quote time"; else fail "4c http://[::1]/ quote answered HTTP $c (want 400)"; fi
  fi
fi

echo
if [ "$fails" -eq 0 ]; then
  echo "SUCCESS: every check passed."
  exit 0
fi
echo "FAIL: $fails check(s) failed. Do not continue the runbook until each is understood."
exit 1
