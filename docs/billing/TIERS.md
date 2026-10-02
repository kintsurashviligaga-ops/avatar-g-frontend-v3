# Subscription tiers — architecture, status, activation

Branch `feat/billing-tiers`, 2026-10-01. This is the **foundation** for monthly subscription tiers: one catalogue,
one resolver, a subscription checkout, and an idempotent monthly-allowance grant. **Nothing here changes what a
user is charged or granted today.** Every new money path is inert until the activation checklist below is done.

Live database facts in this document were read on 2026-10-01 from project `zwksnayknzggdcenqqxy` with read-only
`pg_catalog` / `information_schema` queries. No data rows were read and nothing was written.

---

## 1. The shape

```
lib/billing/tiers.ts            THE catalogue (isomorphic, pure)
   │   TIERS · TRIAL · tierById · tierFromStripePriceId · priceIdForTier · proDailyLimitForTier
   │   maxVideoSecondsForTier · canUseLongForm · monthlyAllowanceCredits · tierFromProfileTier
   │
   ├──► lib/billing/pricingConfig.ts   PRICING_TIERS (the live pricing page) — DERIVED from TIERS
   │
   ├──► lib/billing/resolveTier.ts     resolveUserTier(db, userId) → 'free' | 'starter' | 'creator' | 'business'
   │        1. active/trialing subscription, current_period_end in the future → its tier (price id, else stored tier)
   │        2. else comped profiles.tier
   │        3. else 'free'                      (never throws; every failure contributes "no evidence")
   │
   ├──► caps & allowances (pure functions, called by routes — NOT WIRED YET, see §5)
   │        proDailyLimitForTier · canUseLongForm · maxVideoSecondsForTier · allowsVeoTier · allowsChatMode
   │
   └──► Stripe
            POST /api/billing/subscribe {tier}   → Checkout Session, mode:'subscription', STRIPE_PRICE_<TIER>
            /api/stripe/webhook  invoice.paid    → lib/billing/subscriptionAllowance (pure plan + DI effects)
                                                 → wallet-ledger.grantSubscriptionAllowance
                                                 → RPC grant_subscription_allowance (migration 20261001a):
                                                   grants row (PK invoice_id) + credit_ledger 'purchase'
                                                   ref sub:<invoice> + subscriptions row refresh, one transaction
```

### The catalogue (today's live numbers, renamed — not a new price list)

| tier | page rung today | $/mo | credits / paid invoice | Pro turns/day | max film | long-form | Veo | premium templates | priority | price env |
|---|---|---|---|---|---|---|---|---|---|---|
| free | Free | 0 | 50 **once** (trial) | 5 | 8 s | – | lite, fast | – | – | – |
| starter | Basic | 19.99 | 230 | 20 | 24 s | – | lite, fast | – | – | `STRIPE_PRICE_STARTER` |
| creator | Pro | 39.99 | 525 | 100 | 48 s | – | lite, fast, standard | ✓ | – | `STRIPE_PRICE_CREATOR` |
| business (Business / Agency) | Business | 79.99 | 1200 | 300 | 240 s | ✓ | lite, fast, standard | ✓ | ✓ | `STRIPE_PRICE_BUSINESS` |

Credits are `Σ ceiling × media cost` (`tierCreditPool`), never a typed-in total. Pro turns are capped by the
operator's `CHAT_PRO_DAILY_LIMIT` as a **ceiling** (`min(tier, env)`; `0` = Pro off; same parse as
`chatProUserLimit()`). All tiers list all four chat modes; Pro is metered by the daily allowance.

`PRICING_TIERS` keeps its wire ids (`basic`, `pro`) and visible names ("Basic", "Pro") because
`/api/billing/tier-checkout`, `PricingSection`, `CreditsModal` and the JSON-LD key on them. Its prices, ceilings and
credits now come from `TIERS` via `PRICING_TIER_TO_TIER`; `pricingTiers.test.ts` fails if they drift. Renaming the
visible rungs to Starter / Creator is a product decision for launch day.

### The trial

`TRIAL` documents the grants that already exist; there is no trial balance and no expiry:

- **50 credits** — `on_auth_user_starter_balance` → `handle_auth_user_starter_balance()` inserts one ledger row
  (reason `purchase`, `metadata.kind = 'signup_bonus'`, ref `starter:<uid>`). Verified live.
- **1 free film** — `profiles.free_films_remaining DEFAULT 1` (`consume_free_film` / `restore_free_film`). Live data
  note: ~97% of existing profiles hold **3** (pre-20260802c accounts; deliberately not clawed back).
- **free text chat** — `CREDIT_COSTS.chat_message = 0`; Pro turns metered (free: 5/day once wired).
- 3 free avatar replies (`free_avatar_chats_remaining DEFAULT 3`).
- New: `profiles.trial_started_at` (migration) records when it began — backfilled from the `signup_bonus` row.

---

## 2. What is live vs inert

| piece | state |
|---|---|
| `TIERS`, helpers, `TRIAL` | **live code, read by the pricing page** (numbers unchanged) |
| `PRICING_TIERS` | **live**, now derived; identical output (pinned by `PricingSection.test.tsx`) |
| `TIER_STRIPE_PRICE_ENV` | env names changed `STRIPE_PRICE_BASIC/PRO` → `STRIPE_PRICE_STARTER/CREATOR`; only tests read it |
| `resolveUserTier` | **inert** — not called by any route yet |
| `POST /api/billing/subscribe` | **inert** — 503 `not_configured` until `STRIPE_PRICE_<TIER>` + `STRIPE_SECRET_KEY`; nothing in the UI calls it |
| invoice.paid allowance | **inert** — with no `STRIPE_PRICE_<TIER>` every invoice is `no_tier`, no I/O |
| migration `20261001a` | **not applied** |
| caps (Pro/day, film length, Veo, templates) | **not wired** — `app/api/chat/gemini/route.ts` and `components/studio/OmniStudio.tsx` are being edited elsewhere |

---

## 3. Stripe flow in detail

**Checkout** (`/api/billing/subscribe`): signed-in user only (`requireAuthenticatedUser`); body `{tier}` must be a
paid tier id; 409 `already_subscribed` if `resolveUserTier` finds an entitling subscription (plan changes go through
the portal, not a second subscription). `user_id` + `tier` go into **`subscription_data.metadata`** as well as the
session metadata — Stripe snapshots subscription metadata onto every invoice, so the grant can find its user even
when `invoice.paid` arrives before `checkout.session.completed` (Stripe does not order events). Promotion codes are
off (a 100 % code would produce a `$0` invoice, which grants nothing). Provider errors are logged, never returned.

**Grant** (`invoice.paid` in `/api/stripe/webhook`):

- skipped silently: no subscription on the invoice, or no line price equal to a `STRIPE_PRICE_<TIER>`;
- skipped (logged): two tiers on one invoice, status ≠ paid, `amount_paid ≤ 0`, `billing_reason` other than
  `subscription_create` / `subscription_cycle` (prorations do not mint a second month — an upgrade gets its new
  allowance on the next cycle);
- user: subscription metadata `user_id` (UUID-checked), else `subscriptions` by subscription id, then customer id
  (service role);
- grant: `grant_subscription_allowance` — atomic, at most once per invoice (PK `invoice_id`, plus the ledger's
  `credit_ledger_user_ref_positive_uniq` on ref `sub:<invoice id>`), reason **`purchase`**, and an upsert of the
  `subscriptions` row (tier, price, `current_period_end` = the paid line's period end; a stale redelivery never moves
  it backwards);
- failure (no user, RPC error): `RetryableWebhookError` → the route answers **500** and does not mark the event
  processed, so Stripe redelivers. This is the **only** new 5xx; every other handler error keeps the route's
  "log and 200" behaviour. The affiliate-commission half of `invoice.paid` runs exactly as before regardless.

Because the entitlement row is refreshed from **paid invoices**, an unpaid subscription lapses to free at
`current_period_end` even though the `customer.subscription.*` path cannot write (bug F below).

---

## 4. Activation checklist (in this order)

1. **Stripe** (dashboard, live mode): one Product per paid tier with a **recurring monthly USD** Price equal to the
   catalogue (19.99 / 39.99 / 79.99). Make sure the webhook endpoint `https://myavatar.ge/api/stripe/webhook`
   subscribes to `invoice.paid` (plus the events it already handles).
2. **Fix the anon-client webhook writes first** (bug F): switch `lib/stripe/subscriptions.ts` (and the `subscriptions`
   reads in `app/api/stripe/webhook/route.ts`) to `createServiceRoleClient()`. Not required for the grant, but
   without it cancellations never reach `subscriptions.status` and every subscription checkout reports a Sentry error.
3. **Apply** `supabase/migrations/20261001a_subscription_tiers.sql` (Supabase MCP `apply_migration` or the SQL
   editor). Its VERIFY block raises and rolls back if anything is exposed.
4. **Run** `node scripts/check-db-exposure.mjs` — expect `LOCKED DOWN`; it now also probes `subscriptions`,
   `subscription_allowance_grants` and `grant_subscription_allowance`.
5. **Vercel env** (Production, then Preview if wanted): `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_CREATOR`,
   `STRIPE_PRICE_BUSINESS` = the recurring price ids. **Never** reuse `STRIPE_PRICE_PRO` (legacy plan system).
   Check `CHAT_PRO_DAILY_LIMIT`: it becomes a ceiling over every tier (a value of 20 would cap business at 20).
6. **Wire the caps** (separate PRs, owners of those files): `proDailyLimitForTier(await resolveUserTier(svc, uid), process.env)`
   in place of `chatProUserLimit()` in `/api/chat/gemini`; `maxVideoSecondsForTier` / `canUseLongForm` /
   `allowsVeoTier` at film dispatch (`lib/chat/filmComposite.ts`) and in OmniStudio's options;
   make `hasPaidPlan()` (`lib/billing/entitlements.ts`) consult `resolveUserTier` (bug H).
7. **Test-mode rehearsal** with Stripe test keys on a preview: subscribe → confirm one `credit_ledger` row
   (`reason='purchase'`, `metadata->>'ref' = 'sub:in_…'`), one `subscription_allowance_grants` row, a
   `subscriptions` row with the right tier; resend the event from the dashboard → still one row.
8. Point the UI (pricing page / CreditsModal "Choose") at `/api/billing/subscribe`.

---

## 5. Known money bugs found — NOT fixed here

| # | bug | evidence | impact |
|---|---|---|---|
| A | `debit_wallet_gel` (repo `20260528b`) debits `CEIL(amount_gel)` **credits**, while `credit_wallet_gel` credits `floor(GEL × 10)` | `lib/observability/agentTrace.ts` passes the clip's `costRetailGel`; 20260528b line 60 | ~10× under-charge on film-clip legs — and the function is **missing on prod**, so those debits are silent no-ops today |
| B | Film / music-video balance gate compares **credits** to **GEL** | `filmComposite.readWalletBalanceGel` returns `profiles.credits_balance`; `filmBalanceDecision(balance, forecast.totalRetailGel)` | gate is ~10× too permissive |
| C | One-time tier packs are booked as reason **`refund`** | `grantPurchasedCredits` → `refund_credits` | pack revenue is indistinguishable from refunds in `credit_ledger` (subscriptions use `purchase`) |
| D | ~~`/api/stripe/webhook` answers **200** when a handler throws~~ **FIXED 2026-10-02** | a failed tier-pack grant and a failed wallet top-up credit now throw `RetryableWebhookError` → 500 → Stripe redelivers (both refs idempotent) | `route.test.ts` pins the 500s |
| E | Tables the Stripe code uses **do not exist live**: `subscriptions`, `webhook_events`, `billing_webhook_events`, `user_profiles`, `affiliate_referrals`, `affiliates`, `affiliate_commission_events` | `pg_class` listing | **a paid Stripe GEL wallet top-up is never credited**: `/api/billing/wallet-topup` puts no `user_id` in the session metadata, and BOTH webhooks resolve the user by customer id in `subscriptions` (missing table + bug F). Event dedupe is in-memory only; affiliate commissions never recorded. `20261001a` creates `subscriptions` but client writes stay revoked, so this needs a code fix: stamp `user_id` in the top-up session metadata and read it first (as `tier_topup` already does) |
| F | Webhook / subscription helpers use **`createRouteHandlerClient()`** (anon, cookie-based) | `lib/stripe/subscriptions.ts`, both webhook routes, `tier-checkout`'s customer upsert | no session in a webhook → RLS hides/blocks every row even once tables exist; `upsertSubscription` throws on every subscription checkout |
| G | Free film **length is not capped** | `filmComposite` drops a free film to Veo Fast but allows 48 s | $5.76 of Veo per signup; signup is auto-confirmed → farmable. Wire `maxVideoSecondsForTier('free')` (8 s) |
| H | Watermark decision ignores subscriptions | `hasPaidPlan()` checks `wallet_topups` + `profiles.tier` only; allowances are ledger rows, not top-ups | a paying subscriber would get watermarked output |
| I | `STRIPE_PRICE_PRO` meant two things | legacy `stripe-prices.ts` PRO plan **and** the tier ladder's `pro` env | **fixed here** (ladder now uses `STRIPE_PRICE_CREATOR`) |
| J | Credits are sold below cost on video | `lib/credits/pricing.ts` (1 credit = 0.10 GEL; a video credit costs ~0.104 GEL) | already documented there; tiers keep the 2.5–4.5× margin band on full consumption |
| K | `handle_auth_user_starter_balance` is SECURITY DEFINER with EXECUTE for anon | live `has_function_privilege` | not callable via PostgREST (returns `trigger`), so not exploitable; violates the P0 rule — revoke in a later migration |

---

## 6. Deliberately left out

- No route enforces tier caps yet (see checklist step 6).
- No proration / mid-cycle upgrade top-up; no per-seat (`quantity`) allowance; no annual prices.
- No `customer.subscription.deleted` → immediate downgrade (the row lapses at period end; bug F blocks status sync).
- No new trial balance or expiry — the existing signup grants *are* the trial.
- `/api/billing/webhook` (the second Stripe endpoint) is untouched and does not grant allowances.
- Legacy catalogues (`PLANS`, `CREDIT_PACKS`, `lib/billing/plans.ts`, `lib/pricing/canonicalPricing.ts`,
  `lib/stripe/plans.ts`, `lib/monetization/plans.ts`) are not deleted; new code must not read them.

## 7. Assumptions not verified

- Which Stripe endpoint(s) are registered in the dashboard, and whether they subscribe to `invoice.paid`.
- Whether `CHAT_PRO_DAILY_LIMIT`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` are set in Vercel (not read).
- Stripe API `2026-02-25.clover` invoice shape (`parent.subscription_details`, `lines[].pricing.price_details.price`)
  is taken from the installed `stripe@20.4.0` types; the pre-basil shape is handled too.
- The migration has not been executed anywhere; its SQL was checked against the live catalog shape, not run.
