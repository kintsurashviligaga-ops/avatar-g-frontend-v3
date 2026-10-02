# Bank of Georgia payments (api.bog.ge)

Two products, both settled in **GEL** through BOG's hosted payment page:

| Product | What the customer gets | How it's charged |
|---|---|---|
| **Top-up (PAYG)** — 10 / 20 / 50 ₾ (any amount in the tier store) | `floor(₾ × 10)` credits, once (1 credit = 0.10 ₾) | one payment |
| **Plan** — Starter 54 ₾ · Creator 108 ₾ · Business 216 ₾ per month | the tier's monthly allowance (230 / 525 / 1200 credits) + the tier's entitlements | first payment on BOG's page; every month after, automatically on the card saved at that payment |

Plan prices are the pricing page's `$ × GEL_PER_USD`, rounded (`lib/billing/bogCatalog.ts`; a test fails if they drift).

## Where to put the credentials (never in code)

BOG's business manager gives you a **client_id** and a **client_secret**. Add them as environment variables:

**Vercel** → Project → Settings → Environment Variables (Production, and Preview if you want previews to take payments). Mark both **Sensitive**:

| Name | Value |
|---|---|
| `BOG_CLIENT_ID` | your client_id |
| `BOG_SECRET_KEY` | your client_secret |
| `BOG_ENV` | `sandbox` while testing with BOG's sandbox credentials; remove it (or `production`) for live |

Then **redeploy** (env changes apply on the next deployment). Locally, the same names go into `.env.local` (gitignored).

That is all. You do **not** need `BOG_CALLBACK_PUBLIC_KEY`: BOG's published callback keys (live and sandbox) are built into `lib/billing/bogClient.ts`; set it only if BOG ever rotates the key. Optional: `BOG_CALLBACK_IP_ALLOWLIST` (comma-separated, an extra gate on top of the signature).

**Ask BOG for two things:**
1. **Automatic payments with a saved card** ("ბარათის დამახსოვრება ავტომატური გადახდებისთვის / subscriptions") enabled for your merchant. Without it plans still sell, but as one month that does not renew (the checkout logs a warning).
2. **Sandbox credentials**, to test the whole flow with the test cards at https://api.bog.ge/docs/en/sandbox/payments/test-cards before going live.

The callback URL is sent with every order: `https://<your site>/api/billing/bog/webhook` (from `NEXT_PUBLIC_SITE_URL`). Nothing to register.

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
- **Refunds** are made in BOG's business manager. The order is marked `refunded`; credits already granted are **not** taken back automatically (adjust by hand if needed).

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

Stripe code is still present but no longer offered while BOG is configured; it remains the fallback only when BOG credentials are absent.
