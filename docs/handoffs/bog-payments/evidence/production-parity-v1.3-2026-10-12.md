# Production parity — v1.3 (2026-10-12 19:45–19:58Z, read-only SELECTs on Supabase project zwksnayknzggdcenqqxy)

Compared against the local copy built by `tests/sql/bog/build.sh` (base + `20260705_bog_orders.sql` + `20261002a_bog_billing.sql`).

| Object | Production | Local copy |
|---|---|---|
| `bog_fulfill_order` src md5 (comments/whitespace stripped) | 05cb3dc8607faf376e324bc41b5a5dea | same |
| `bog_claim_renewal` | ec2d5510c524dd46fa0bf3fa1571e104 | same |
| `bog_record_renewal_failure` | 713af6abcacde51cec49af528a6bf889 | same |
| `credit_wallet_gel` | 87a4aaeae59e7faf3314027975fbbe10 | same |
| `grant_subscription_allowance` | a44bc3ef9cbc1e3e34d37322b39766ca | same |
| `update_credits_balance` | 45e2665e2a589f3af47aa016f15b8497 | same |
| `bog_orders` columns (name:type:nullable:default) md5 | 6dbef94821bcb29b5011399544f35385 (19 columns) | same |
| `bog_orders` constraints md5 | 109a0bda289373572e9c857e436f5083 (8; no CHECK on `status`) | same |
| `bog_orders` indexes md5 | 78e68aa9fdccd7885a579ea874cf39e8 (7) | same |
| `subscriptions` / `subscription_allowance_grants` indexes | 9d52948e… / ecaf3d35… | same |
| `credit_ledger` idempotency indexes | `credit_ledger_user_ref_positive_uniq`, `_negative_uniq` (user_id, metadata->>'ref') | same (Production has 5 extra non-BOG indexes; the only other unique one is partial on job_id IS NOT NULL) |
| `wallet_topups` | pkey(ref) + a non-unique user index | pkey(ref) |

Money functions: SECURITY DEFINER, no EXECUTE for `anon`/`authenticated` (except the trigger function `update_credits_balance`).
`bog_orders` rows: 4, all `init_failed`, last 2026-10-06 14:02Z. No migration is needed for PR #59.
