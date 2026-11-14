# v8 pricing: launch checklist (billing steps)

This is the billing part only. It slots into the master post-DB runbook (thread "Polish UX and remove redundant options before launch"): run it after that runbook's "Supabase is back and healthy" checks, and before any step that opens new features to users.

Nothing here has been run yet. All SQL is in `docs/v8.1-finance/sql/` (also `/mnt/project-files/v8.1-finance/sql/`) and was tested on a local Postgres 16. Paste each file into the production SQL editor: https://supabase.com/dashboard/project/zwksnayknzggdcenqqxy/sql/new

About 10 minutes in total, most of it waiting for the deploy.

## Before you start

- Supabase is up and the master runbook's health checks pass.
- You have sent GREEN for the pricing PRs.

## Steps

**1. Preflight (read-only, 1 min).** Run `00_preflight.sql`. Every row must say `ok = true`. Note the last two numbers (`users_with_balance`, `credits_outstanding`): step 6 checks against them. If any row is false, stop and send me the output.

**2. Allow the Pro plan in the database (1 min).** Run `01_pro_tier.sql`. The last query must show `pro` in all three constraints and `grant_allows_pro = true`. Running it twice is harmless.

**3. Merge the code.** Tell me GREEN and I merge, one card each, with CI green before each: #313 → #343 → #351 → #353 → #354, then #345 (pricing page) and #344 (Finance dashboard). Every one lands with its flag off, so production keeps today's prices after each merge.

**4. Turn v8 on in Vercel (1 min).** Vercel → avatar-g-frontend-v3 → Settings → Environment Variables → add `NEXT_PUBLIC_PRICING_V8` = `on` for **Production**. Optional: `ADMIN_FINANCE_DASHBOARD` = `on` for the founder dashboard.

**5. Redeploy and wait for READY (3–5 min).** Deployments → latest Production → ⋯ → Redeploy (without build cache). The flag is built into the page, so a plain env change does nothing until this finishes. Check that myavatar.ge/ka/pricing shows Start 25 ₾ / Creator 55 / Pro 129 / Business 299.

**6. Give existing users their 1.7× balance (1 min).** Run `02_legacy_conversion_launch.sql` right after READY. Its check queries show `users` (must equal step 1's `users_with_balance`), `before` (step 1's `credits_outstanding`) and `bonus_added` (about 70 % of it); `ledger_rows` and `ledger_bonus` must match `users` and `bonus_added`. Running it twice is harmless: nobody is topped up twice.

**7. Check one real purchase (2 min).** On your own account: buy the 10 ₾ top-up and check that the balance goes up by 100. If you want to test a plan, buy Start (25 ₾) and check +280.

**8. Set the day-30 reminder.** On day 30 after step 6, run `04_legacy_conversion_day30.sql`. It takes back only the part of the extra 70 % that was not spent; anything bought after launch is never touched. Before day 30 it does nothing, so running it early is safe. I can set this reminder for you.

## If something goes wrong

- **Before step 6:** set `NEXT_PUBLIC_PRICING_V8` back to off (or delete it) and redeploy. Prices return to today's. Step 2 can stay.
- **After step 6:** turn the flag off and redeploy as above, then run `99_rollback.sql`. It takes back the unspent part of the 1.7× extra. The Pro tier stays allowed; nothing sells it while the flag is off.
- **A v8 customer after rollback:** their plan keeps renewing at the price and credits they bought (renewals follow the subscription, not the flag).

## What changes for users at step 5

- Every action costs the v8 price (65 % margin at the cheapest credit; an 8 s 720p video goes from ✦38 to ✦66). Existing balances get +70 % at step 6 to cover that for 30 days.
- Plans: Start 25 ₾ / 280, Creator 55 / 650, Pro 129 / 1,550, Business 299 / 3,700 credits a month. Existing subscriptions keep their old price and allowance.
- Top-ups: 10 ₾ / 100, 25 / 260, 50 / 540, 100 / 1,100 credits (the bonus is granted at payment).
- Free plan: live avatar 1 minute a day (was 5).

Note: the day-30 take-back is written to the credit ledger as `v8_legacy_conversion_end`. When the Finance dashboard is on, check that it is not counted as usage; I will exclude it if it is.
