# Avatar G SaaS Implementation

## Overview
This implementation adds the core SaaS layer for Avatar G:
- Billing plans + monthly credits
- Stripe checkout, portal, and webhook processing
- Plan/credit enforcement and transaction-safe deductions
- Multi-agent execution with job tracking
- Dashboard usage analytics
- Premium landing/agent visual state

## Key Files
- `supabase/migrations/20260214_avatar_g_saas.sql`
- `lib/billing/plans.ts`
- `lib/billing/enforce.ts`
- `lib/billing/stripe.ts`
- `lib/agents/registry.ts`
- `lib/jobs/jobs.ts`
- `lib/supabase/auth.ts`
- `app/api/billing/checkout/route.ts`
- `app/api/billing/portal/route.ts`
- `app/api/billing/webhook/route.ts`
- `app/api/credits/balance/route.ts`
- `app/api/agents/execute/route.ts`
- `app/api/jobs/[id]/route.ts`
- `app/api/jobs/list/route.ts`
- `app/dashboard/page.tsx`
- `app/api/profile/landing/route.ts`
- `app/[locale]/page.tsx`
- `app/services/agent-g/page.tsx`

## Plan Model
Canonical plans (single source):
- `FREE`
- `PRO`
- `PREMIUM`
- `ENTERPRISE`

Each plan defines:
- monthly credits
- refill policy
- allowed agents
- limits and features

## Data Model
Migration `20260214_avatar_g_saas.sql` provides/normalizes:
- `subscriptions`
  - `user_id`, `stripe_customer_id`, `stripe_subscription_id`, `plan`, `status`, `current_period_end`, `cancel_at_period_end`, `updated_at`
- `credits`
  - `user_id`, `balance`, `monthly_allowance`, `reset_at`, `updated_at`
- `jobs`
  - `id`, `user_id`, `agent_id`, `status`, `cost`, `input_json`, `output_json`, `error`, `created_at`, `updated_at`
- `billing_webhook_events` (idempotency)
- `credit_ledger` (credit audit + idempotency)

RPC functions:
- `ensure_user_billing_rows`
- `reset_user_credits_if_due`
- `deduct_credits_transaction`
- `refill_due_credits`

## Security Notes
- Stripe secret key and webhook secret are server-only.
- Supabase service role key is server-only.
- Private APIs require authenticated user.
- Dashboard redirects unauthenticated users to `/login`.
- Webhook signature is verified with Stripe secret.
- Webhook events are idempotent via `billing_webhook_events`.
- Credit deduction is idempotent + row-lock safe via `deduct_credits_transaction`.

## Env Vars
Public:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`

Server-only:
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_PREMIUM`
- `STRIPE_PRICE_ENTERPRISE`

## Local Test Flow
1. Apply migration in Supabase.
2. Configure env vars.
3. Run app (`npm run dev`).
4. Sign in and open `/dashboard`.
5. Start checkout via `POST /api/billing/checkout`.
6. Complete checkout in Stripe test mode.
7. Send Stripe webhook events to `POST /api/billing/webhook`.
8. Execute agent with `POST /api/agents/execute`.
9. Poll job status via `GET /api/jobs/{id}`.
10. Validate usage/credits in dashboard.

## Verification Checklist
### Development
- [ ] Migration applied without errors
- [ ] Checkout session created for paid plans
- [ ] Portal session opens for subscribed users
- [ ] Webhook verifies signature and rejects invalid signatures
- [ ] Duplicate webhook event is ignored (idempotent)
- [ ] Agent execution creates job and deducts credits once
- [ ] `402` returned on insufficient credits
- [ ] `403` returned on insufficient plan
- [ ] Dashboard shows plan, status, credits, next reset, recent jobs
- [ ] Usage by service displays this-month totals
- [ ] Landing uses demo avatar when none exists
- [ ] Landing autoloads user avatar when available
- [ ] Premium users see "Agent Online"

### Vercel
- [ ] Production env vars are set (server/public separated)
- [ ] Webhook endpoint configured in Stripe Dashboard
- [ ] Build succeeds on Vercel
- [ ] Private routes remain authenticated in production
- [ ] No service-role secret appears in client bundle
