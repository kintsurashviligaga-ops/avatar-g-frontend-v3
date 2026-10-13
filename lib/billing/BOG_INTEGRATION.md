# Bank of Georgia payments (api.bog.ge)

Two products, both settled in **GEL** through BOG's hosted payment page:

| Product | What the customer gets | How it's charged |
|---|---|---|
| **Top-up (PAYG)** — 10 / 20 / 50 ₾ (any amount in the tier store) | `floor(₾ × 10)` credits, once (1 credit = 0.10 ₾) | one payment |
| **Plan** — Starter 54 ₾ · Creator 108 ₾ · Business 216 ₾ per month | the tier's monthly allowance (230 / 525 / 1200 credits) + the tier's entitlements | first payment on BOG's page; every month after, automatically on the card saved at that payment |

Plan prices are the pricing page's `$ × GEL_PER_USD`, rounded (`lib/billing/bogCatalog.ts`; a test fails if they drift).

## Where to put the credentials (never in code)

BOG's Business Manager (https://manager.bog.ge) shows the Online Payments credentials as **OPAY Client ID** and **OPAY Secret Key** — the OAuth client id and secret of https://api.bog.ge/docs/payments/introduction. Merchant ID and Terminal ID are not used by the API. Add them as environment variables:

**Vercel** → Project → Settings → Environment Variables, **Production** scope. Mark the secret **Sensitive**. Do not put the live pair on Preview: previews share the Production database, so a preview payment would credit a real account. The code enforces it too: on a Vercel Preview or Development deployment (`VERCEL_ENV` ≠ `production`) the checkout mode is always `off`, whatever the env holds.

| Name | Value |
|---|---|
| `BOG_CLIENT_ID` | OPAY Client ID |
| `BOG_SECRET_KEY` | OPAY Secret Key |
| `BOG_ENV` | leave it unset (= `production`) on Vercel. A **sandbox** pair never goes into Vercel: every deployment (Preview too) writes to the Production database, so with `BOG_ENV=sandbox` on any Vercel deployment checkout, callbacks and the cron refuse with `BOG_SANDBOX_BLOCKED` and the button is hidden (`bogSandboxBlocked`). Sandbox runs only locally or in CI |
| `BOG_CHECKOUT_MODE` | optional: `admin` = only admins can start a BOG payment (the owner's live test), `off` = nobody, unset = everyone. Any other value reads as `off`, and so does any Preview / Development deployment. Settling (callbacks, return page, cron renewals) is never affected |

Before saving a pair, check it with ONE token request (no order, no money): `node scripts/bog-oauth-check.mjs`. The file is self-contained (Node 18+, no packages), so it also runs alone from any folder. It asks for the pair in the terminal with the Secret Key typed blind (nothing echoed, nothing in shell history), prints one verdict line (`✓ ok · HTTP 200 · production · client …1234`) and never prints the secret in any form (verbatim, JSON-escaped, URL-encoded, base64) or a token; `BOG_ENV=sandbox` for a sandbox pair. Exit 0 accepted, 1 refused, 2 usage, 130 Ctrl+C. Never put the secret on a command line.

Then **redeploy** (env changes apply on the next deployment). Locally, the same names go into `.env.local` (gitignored).

That is all. You do **not** need `BOG_CALLBACK_PUBLIC_KEY`: BOG's published callback keys (live and sandbox) are built into `lib/billing/bogClient.ts`; set it only if BOG ever rotates the key. Optional: `BOG_CALLBACK_IP_ALLOWLIST` (comma-separated, an extra gate on top of the signature).

**Ask BOG for two things:**
1. **Automatic payments with a saved card** ("ბარათის დამახსოვრება ავტომატური გადახდებისთვის / subscriptions") enabled for your merchant. Without it plans still sell, but as one month that does not renew (the checkout logs a warning).
2. **Sandbox credentials**, to test the whole flow with the test cards at https://api.bog.ge/docs/en/sandbox/payments/test-cards before going live.

**Limits (bank letter, 2026-10-12):** 500 ₾ per transaction, 1,000 ₾ per 24 hours, 5,000 ₾ per 30 days. The checkout refuses a single order above 500 ₾ with `BOG_LIMIT` before BOG is asked (`BOG_LIMITS_GEL` in `lib/billing/bogCatalog.ts`); the rolling limits are not enforced in code, and the admin card shows the paid ₾ against them. Whether the rolling limits are per merchant or per card is a question for the bank: if per merchant, a busy day's renewals can hit 1,000 ₾ and BOG would decline the rest.

The callback URL is sent with every order: `https://<your site>/api/billing/bog/webhook` (from `NEXT_PUBLIC_SITE_URL`). Nothing to register. A sandbox order (local or CI only) carries the callback of the deployment that created it, never the Production site.

## How it works

```
CreditsModal ──POST /api/billing/bog/checkout──▶ bog_orders row (amount, credits, tier — server-priced)
                                                 → BOG create order (+ save card for plans)
             ◀── redirectUrl ──  customer pays on payment.bog.ge
BOG ──signed callback──▶ /api/billing/bog/webhook ─▶ settleBogOrder ─▶ bog_fulfill_order (RPC, one transaction)
customer returns ─▶ /{locale}/dashboard?bog=<order>&pay=… ─▶ GET /api/billing/bog/orders/<order> (reconciles from the receipt)
cron every 10 min ─▶ /api/cron/bog-billing: reconcile pending orders · expire dead checkouts · renew due plans
```

- **Exactly once.** Money moves only in `bog_fulfill_order` (migration `20261002a_bog_billing.sql`), under the order's row lock: a top-up through `credit_wallet_gel(… 'bog:<order>')` (the `wallet_topups.ref` primary key), a plan month through `grant_subscription_allowance(invoice 'bog:<order>')`. Callback, return page and cron may all settle the same order — one credits.
- **The receipt decides whether, our row decides how much.** A receipt whose amount, currency or ids disagree with the order row is flagged `amount_mismatch` and credits nothing.
- **Lost callbacks.** BOG documents no callback retry. The return page and the cron read `GET /receipt/:id` instead.
- **Renewals.** `bog_claim_renewal` inserts one order per subscription period (unique index), so overlapping cron ticks cannot double-charge; the charge's `Idempotency-Key` is derived from that order id, so a retried request is not a second charge. Declined → retry after 24 h; three declines in a row → `past_due` (entitlement already ended at `current_period_end` — `resolveUserTier` gates on it).
- **Cancel.** `DELETE /api/billing/bog/subscription` (the "Cancel auto-renewal" link in the credits modal): the plan stays active until its period ends, the saved card is deleted at BOG, nothing is charged again.
- **Upgrade / downgrade.** Buying a different plan starts it now; older plans stop renewing (their paid period runs out).
- **Refunds** are made in BOG's business manager. The order follows BOG's own status, one way only: `completed` → `refund_requested` (asked, not yet done) → `refunded_partially` (`refund_amount` < paid) → `refunded`; it never moves back, and a replayed or late `completed` receipt for an order already in a refund state is ignored (no second credit, and a cancelled plan stays cancelled). Bookkeeping only: credits already granted are **not** taken back automatically (that is the refund policy, unchanged; adjust by hand if needed). A refund on an order we never credited is logged for review and not recorded. The return page shows each refund state in ka/en/ru.

## Files

| File | Role |
|---|---|
| `lib/billing/bogClient.ts` | API client (OAuth, orders, saved cards, receipt, signature) |
| `lib/billing/bogCatalog.ts` | what can be bought, in ₾ (shared by UI and server) |
| `lib/billing/bogSettlement.ts` | receipt → credits (shared by webhook, return page, cron) |
| `lib/billing/wallet-ledger.ts` | the three BOG RPC wrappers (service role) |
| `lib/billing/bogCheckoutClient.ts` | browser calls + the localized return messages |
| `app/api/billing/bog/{checkout,webhook,orders/[id],subscription}` | routes |
| `app/api/cron/bog-billing` | reconcile + renew (vercel.json, every 10 min) |
| `supabase/migrations/20261002a_bog_billing.sql` | tables, functions, VERIFY block |

Stripe: the credits window offers the older card checkout whenever `/api/checkout/capabilities` answers `bog:false` for this visitor (BOG not configured, `BOG_CHECKOUT_MODE=off`, `admin` for a non-admin, a Preview / Development deployment, a sandbox pair on Vercel, billing tables missing) and Stripe is configured. A BOG refusal after the click does **not** fall back to Stripe. No Stripe payment has been completed in Production yet.

## Is it working? (admin)

**Admin → Billing → "Bank of Georgia — readiness"** (`GET /api/admin/billing/bog`) shows what the deployment runs with: credentials set or not, `production`/`sandbox`, the last 4 characters of the client id, the callback URL, whether the billing tables exist, whether `CRON_SECRET` is set, who may start a checkout (`BOG_CHECKOUT_MODE`), a red line when a sandbox pair sits on a Vercel deployment, the paid ₾ of the last 24 h / 30 days against the bank's limits (rolling windows from the credit time; counts every order BOG took money for: completed, refund states and `amount_mismatch`, so it errs high; its own query, not the recent-orders list; says so when it hits 1,000 orders), and the latest orders with their reject reasons. No secret and no user id ever leaves the server.

**"Test credentials with BOG"** (`POST /api/admin/billing/bog {action:'oauth'}`) sends ONE OAuth token request to BOG — no order, no money — and says what BOG answered: `ok`, `credentials_refused` (wrong pair, or a sandbox pair against production / live pair with `BOG_ENV=sandbox`), `forbidden` (merchant not enabled for the API), `no_answer`, … with the next step in words.

## Testing without BOG

`npm run test:bog-e2e` (needs a local Postgres and a PostgREST v12 binary — see `scripts/bog-e2e.sh`):

1. **SQL scenarios** (`tests/sql/bog/10_scenarios.sql`): the money functions in a real Postgres whose tables are Production's shapes and whose functions are code-identical to Production's (md5 of the comment-stripped source, checked 2026-10-12). Top-up once, plan, renewal, back-off, three declines → `past_due`, upgrade, client roles locked out.
2. **Races** (`tests/sql/bog/20_concurrency.sh`): 16 parallel settlements of one order, 16 parallel renewal claims → one credit, one charge.
3. **Route-level end to end** (`__tests__/integration/bog-payments.e2e.test.ts`): the real routes → supabase-js → PostgREST → that Postgres, against a fake BOG that signs callbacks with a throwaway RSA key. Lost callbacks, forged/tampered callbacks, amount/currency mismatch, declines, refused credentials, renewals, cancel.

`scripts/bog-sandbox-smoke.mjs` is the first contact with BOG's real **sandbox** (refuses anything but `BOG_ENV=sandbox`): `oauth`, `order` (1 ₾ sandbox order + payment-page link for a test card), `receipt <id>`. A sandbox order never points at Production: its callback and return links go to `https://bog-sandbox-smoke.invalid` (a name that never resolves) unless `BOG_SANDBOX_RETURN_BASE` names another https host, and that host may not be myavatar.ge, any `*.vercel.app`, or the site the environment names; the order id is `sandbox-smoke-…`, which our webhook never treats as ours. Every check runs before the first request (`scripts/bog-sandbox-smoke.test.ts`).
