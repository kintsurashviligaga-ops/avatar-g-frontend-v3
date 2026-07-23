# 05 — `enforce.ts` repoint plan (code side)

> **PREPARED, NOT APPLIED.** Do this only AFTER balances are reconciled (03) and verified (04).
> Ship behind a flag / in a revertible commit. The legacy tables + RPCs stay intact until a much
> later, separate cleanup — so a revert is zero-data-change.

## Goal

Move the **10 legacy callers** off `public.credits` + `deduct_credits_transaction` and onto the
canonical `public.profiles.credits_balance` + `deduct_credits`/`refund_credits`, **without changing
the 10 call sites**. Do it by swapping the *internals* of `lib/billing/enforce.ts` while keeping its
exported API (`getBillingSnapshot`, `deductCreditsTransaction`, `enforcePlanAndCredits`, `assertPlan`,
`assertCredits`, `BillingSnapshot`) byte-identical in shape. Lowest blast radius.

## The 10 callers (unchanged after the swap)

`app/api/video/generate`, `app/api/voice-lab/jobs`, `app/api/app/workflows`,
`app/api/app/workflows/[id]`, `app/api/app/workflows/[id]/run`, `app/api/app/services/[slug]/run`,
`app/api/agents/execute`, `app/api/ai`, `app/api/credits/balance`, `lib/workflows/runner`.

(Additionally, several routes read `public.credits` directly — `app/api/app/status`,
`app/api/app/observability/me`, `app/api/billing/plan`, `app/api/voice/*`, `lib/voice/webhook-processing`,
`app/api/admin/billing/users/[id]`. These are OUT OF SCOPE for the first repoint — they only *read*.
Repoint them in a follow-up once the canonical path is proven. `app/api/billing/webhook` writes the
legacy tables from Stripe and must be handled together with the free-tier decision below.)

## Internal swap (sketch — verify signatures against 01's RPC list first)

**`getBillingSnapshot(userId)`** — keep the `subscriptions` read (plan/status is a separate, valid
table). Replace the `credits` read with `profiles.credits_balance`:

```ts
const [{ data: sub }, { data: prof }] = await Promise.all([
  supabase.from('subscriptions').select('plan, status, current_period_end').eq('user_id', userId).single(),
  supabase.from('profiles').select('credits_balance').eq('id', userId).single(),
]);
return {
  userId, plan: normalizePlan(sub.plan), status: sub.status, currentPeriodEnd: sub.current_period_end,
  credits: {
    balance: prof?.credits_balance ?? 0,
    monthlyAllowance: /* see FREE-TIER DECISION */,
    resetAt: /* see FREE-TIER DECISION */,
  },
};
```
Drop the `ensure_user_billing_rows` / `reset_user_credits_if_due` calls **only** if the free monthly
allowance is retired (see below); otherwise keep a canonical equivalent that tops up the wallet.

**`deductCreditsTransaction({ userId, amount, jobId, agentId, reason, idempotencyKey })`** — call the
canonical RPC. Note the contract difference: canonical `deduct_credits` **RAISES** on insufficient
(the legacy one returned `{ success:false }`). Translate the raise into the existing
`BillingEnforcementError(402, 'INSUFFICIENT_CREDITS')` so callers behave identically:

```ts
const ref = idempotencyKey; // stable per logical charge; canonical dedups on metadata->>'ref'
const { data, error } = await supabase.rpc('deduct_credits', { p_user_id: userId, p_amount: amount, p_ref: ref });
if (error) {
  if (/insufficient/i.test(error.message)) throw new BillingEnforcementError('Insufficient credits', 402, 'INSUFFICIENT_CREDITS');
  throw new Error(error.message);
}
return { newBalance: typeof data === 'number' ? data : 0 };
```
`jobId`/`agentId`/`reason` no longer map to dedicated columns (canonical ledger uses `metadata`). If
you want them retained, fold them into the ref/metadata — but do NOT change the ref's dedup identity
(keep it == `idempotencyKey`) or idempotency breaks.

**`assertCredits` / `assertPlan` / `enforcePlanAndCredits`** — unchanged; they operate on the snapshot.

## ⚠️ FREE-TIER DECISION (blocking — this is a pricing/product call)

The legacy path gave every plan a **monthly allowance** (FREE=100, PRO=1000, PREMIUM=5000,
ENT=20000) that **auto-reset monthly**. The canonical wallet has **no such concept** — it's funded by
Stripe top-ups only. Repointing FREE users onto it **silently removes their 100 free credits/month.**
Choose ONE and document it before shipping:

- **(a) Keep the allowance** — add a canonical monthly top-up (cron or on-read `reset_if_due`
  equivalent) that credits `profiles.credits_balance` up to the plan allowance via a
  `credit_ledger` insert tagged `ref='monthly:<plan>:<user>:<yyyymm>'` (idempotent per month). Then
  `getBillingSnapshot` reports the real `monthlyAllowance`/`resetAt`. Preserves current behavior.
- **(b) Retire the free monthly allowance** — a deliberate pricing change. `getBillingSnapshot` reports
  `monthlyAllowance: 0`, `resetAt: null`. Communicate to users; update pricing copy. Cheaper, but a
  visible product change — needs sign-off.

Also reconcile **`app/api/billing/webhook`** (Stripe): it currently credits the legacy `public.credits`.
It must credit the canonical wallet instead (or as well) so purchases land where spend is now debited —
otherwise paid top-ups go to the abandoned ledger. Handle this in the SAME change as the repoint.

## Order of operations

1. Reconcile + verify balances (03 → 04). **Do not repoint before this.**
2. Decide + implement the free-tier policy (a or b) and the Stripe-webhook target.
3. Swap `enforce.ts` internals (above). Typecheck + the billing tests must stay green; add tests for
   the insufficient→402 translation and the idempotent ref.
4. Ship behind a flag if feasible; canary one low-traffic route (`app/api/ai`) first, watch
   `deduct_credits` errors + balances, then roll the rest.
5. Follow-up PR: repoint the read-only `public.credits` consumers listed above.
6. Much later, separate migration: retire the legacy `public.credits` tables + `*_transaction` RPCs
   once nothing reads them (grep clean). Not part of this work.

## Rollback

Revert the `enforce.ts` commit — the legacy `public.credits` + `deduct_credits_transaction` are
untouched, so the old path resumes with zero data change. Any canonical debits made in the interim
remain valid on `profiles.credits_balance` (that ledger is the survivor either way).

## Verification checklist before merge

- [ ] 01 confirmed canonical `credit_ledger` shape + trigger live.
- [ ] 02 numbers reviewed; policy chosen; MAX_TOPUP cap sized.
- [ ] 03 committed; 04 all-green (0 users short, 0 negatives, idempotent).
- [ ] Free-tier policy decided + documented; Stripe webhook repointed.
- [ ] `enforce.ts` swap keeps the exported API shape; insufficient→402 preserved; ref == idempotencyKey.
- [ ] `npm run typecheck` 0 · `npm test` green (+ new billing tests) · `npm run build` ok.
- [ ] Canary one route before rolling all 10.
