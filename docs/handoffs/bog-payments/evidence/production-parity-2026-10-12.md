# Production parity of the BOG money functions (2026-10-12, read-only)

Query run on Production (zwksnayknzggdcenqqxy) and on the local test database built by `tests/sql/bog/build.sh`:

```sql
select proname, md5(regexp_replace(regexp_replace(prosrc,'--[^\n]*','','g'),'\s+',' ','g')),
       md5(pg_get_function_arguments(oid)), prosecdef
  from pg_proc where pronamespace='public'::regnamespace and proname in (...);
```

| function | source md5 (comments + whitespace stripped) | args | security definer | Production = local |
|---|---|---|---|---|
| bog_fulfill_order | 05cb3dc8607faf376e324bc41b5a5dea | 1c12e520… | yes | ✓ |
| bog_claim_renewal | ec2d5510c524dd46fa0bf3fa1571e104 | 04c855f7… | yes | ✓ |
| bog_record_renewal_failure | 713af6abcacde51cec49af528a6bf889 | 54e35bfc… | yes | ✓ |
| credit_wallet_gel | 87a4aaeae59e7faf3314027975fbbe10 | 7a79d0ce… | yes | ✓ |
| grant_subscription_allowance | a44bc3ef9cbc1e3e34d37322b39766ca | ffdf8396… | yes | ✓ |
| update_credits_balance (trigger) | 45e2665e2a589f3af47aa016f15b8497 | — | no | ✓ |

Execute privilege on all five money functions: anon ✗, authenticated ✗ (Production).

Production `bog_orders` (all rows, user ids omitted): 4 orders, all `init_failed`, `reject_reason` null —
2026-10-03 07:38 topup 10 ₾; 2026-10-03 15:51 ×2 subscription 54 ₾; 2026-10-06 14:02 subscription 54 ₾.
