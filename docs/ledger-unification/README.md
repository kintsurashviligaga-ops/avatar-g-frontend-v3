# Ledger Unification (Pillar 1) — REVIEW-ONLY runbook

> **STATUS: PREPARED, NOT APPLIED.** Nothing in this directory runs automatically. These files
> live in `docs/`, **not** `supabase/migrations/`, precisely so no CI or deploy step can apply them.
> Every mutating step is opt-in and transactional. Read this whole file before running anything.

This is the staged plan to end the **credits split-brain** on myavatar.ge. It exists so you can
verify the real state against the live database *yourself*, at your own pace, before any write.

---

## 0. Why this is dangerous (read first)

`main` auto-deploys to production. Credits are real money (Stripe top-ups). Two independent ledgers
have been running in parallel with **no sync between them**, and the tracked migrations **disagree
about the schema of `public.credit_ledger`**. That means:

- **We cannot know the live schema from the repo alone.** Two migrations define
  `public.credit_ledger` with *different, incompatible* columns (see §2). Whichever DDL actually ran
  last — or was hand-applied in the SQL editor — is the truth, and only the live DB knows it.
- **A wrong reconciliation either double-credits users (we lose money) or wipes balances (they lose
  what they paid for).** Neither is acceptable.

⇒ **Step 01 (introspection) is mandatory and blocking.** Do not run 02→04 until 01's output has
confirmed the assumptions each later step lists at its top.

---

## 1. The two ledgers (ground truth from the repo, 2026-07-23)

| | **Legacy ledger** | **Canonical ledger** |
|---|---|---|
| Balance of record | `public.credits.balance` (int) | `public.profiles.credits_balance` (int) |
| Audit table | `public.credit_ledger` **legacy shape**: `amount, balance_after, agent_id, idempotency_key` | `public.credit_ledger` **canonical shape**: `delta, reason, metadata` + trigger `trigger_update_credits_balance` |
| Idempotency | `UNIQUE(idempotency_key)` | `metadata->>'ref'` |
| Write RPC | `deduct_credits_transaction(uuid,int,uuid,text,text,text)` → record | `deduct_credits(uuid,int,text)` / `refund_credits(uuid,int,text)` → int |
| Monthly allowance | **YES** — FREE=100, PRO=1000, PREMIUM=5000, ENT=20000; auto-reset monthly (`reset_user_credits_if_due`, `refill_due_credits`) | **NONE** — pure wallet, funded by Stripe top-ups only |
| Defined in | `supabase/migrations/20260214_avatar_g_saas.sql` | `supabase/migrations/20260521_credits_rpc_ledger.sql` |
| Code entry point | `lib/billing/enforce.ts` | `lib/orchestrator/ledger.ts` |
| Live callers (10) | `video/generate`, `voice-lab/jobs`, `app/workflows{,/[id]{,/run}}`, `app/services/[slug]/run`, `agents/execute`, `ai`, `credits/balance`, `lib/workflows/runner` | `orchestrate`, all `orchestrator/*/produce` (reserve/refund), `nanobanana/image`, cron reap-refund |

**The contradiction:** both migrations `CREATE TABLE public.credit_ledger` with incompatible columns.
The canonical migration's `deduct_credits`/`refund_credits` `INSERT INTO credit_ledger (user_id, delta,
reason, metadata)`. If the **legacy** shape is what's actually live (`amount`/`balance_after` are
`NOT NULL`, no `delta`/`metadata` columns), those inserts **fail** — and `classifyLedgerError` maps
`"column ... does not exist"` to `skipped` (fail-open), which would mean **every produce reserve is
silently free right now.** Conversely if the canonical shape is live, the legacy
`deduct_credits_transaction` inserts fail. **Step 01 resolves which is true.** Do not assume.

---

## 2. Runbook (run in order; stop at any surprise)

All SQL is meant for the **Supabase SQL editor** (or the read-only runner in §4). Read-only steps are
safe to run anytime. The one mutating step (03) is transactional and previews before it commits.

1. **`01_introspect.sql`** *(read-only)* — dump the real columns/constraints of `public.credits`,
   `public.credit_ledger`, `public.profiles`; list which `*credits*` RPCs actually exist + their
   signatures; confirm whether `trigger_update_credits_balance` exists. **Resolves the §1
   contradiction.** Paste its output into a scratch doc — every later step's assumptions reference it.

2. **`02_report_divergence.sql`** *(read-only)* — per-user and aggregate comparison of
   `public.credits.balance` vs `profiles.credits_balance`: how many users diverge, by how much, total
   credits (= real GEL) at stake, users present in one table but not the other, any negative balances.
   **This is the financial-impact report.** Decide the reconciliation policy (§3) from these numbers.

3. **`03_reconcile.sql`** *(MUTATING — guarded)* — reconciles the two balances per the policy you
   chose. Ships wrapped in `BEGIN … ROLLBACK` with a **preview `SELECT`** so the first run shows
   exactly what *would* change and commits **nothing**. Only after you've reviewed the preview and
   confirmed 01's assumptions do you switch `ROLLBACK` → `COMMIT`. Writes go **through the canonical
   ledger** (an insert per user so the balance trigger applies it and the audit trail is intact) —
   never a raw `UPDATE profiles`. Idempotent: re-running credits nothing new (guarded by a stable ref).

4. **`04_verify.sql`** *(read-only)* — post-reconciliation checks: no user diverges beyond tolerance,
   no negative balances, ledger sum == balance for a sample, reconciliation rows all present.

5. **Code repoint** — only *after* balances are reconciled and verified. See §5 + `05_enforce_repoint_plan.md`.

---

## 3. Reconciliation policy (decide from 02's numbers — this is a product call, not a mechanical one)

The two balances diverge because they counted different spend. Pick ONE and record the decision:

- **A. Canonical wins, top-up the difference** *(safest for the user, costs us the diff)* — for each
  user set the canonical balance to `max(profiles.credits_balance, public.credits.balance)` by crediting
  the positive delta. No user ever loses credits; some gain the legacy free-tier remainder. Bounded by
  02's "sum of positive (legacy − canonical)" figure.
- **B. Canonical wins, no top-up** *(cheapest, some users lose the legacy free-tier remainder)* — leave
  `profiles.credits_balance` as-is; legacy balances are abandoned. Only do this if 02 shows the legacy
  remainder is negligible / all free-tier allowance (not purchased credits).
- **C. Sum both** *(only if the two ledgers counted genuinely disjoint spend)* — credit
  `public.credits.balance` on top of the canonical balance. **Risky:** double-counts if any spend hit
  both. 02's overlap check must show disjoint activity first.

**Recommended default: A**, capped at a per-user sanity limit (03 has a `MAX_TOPUP_PER_USER` guard) so
a single corrupt legacy row can't mint a fortune. Confirm the cap against 02's max-divergence figure.

---

## 4. Read-only reporting runner (optional convenience)

`scripts/report-ledger-divergence.mjs` runs **01 + 02 only** (both read-only) against your project via
the Supabase Management API, using **your** `SUPABASE_ACCESS_TOKEN` (never stored in the repo), and
prints the results. It refuses to run anything mutating. Mirrors the existing
`scripts/apply-ledger-migration.mjs` convention.

```bash
SUPABASE_ACCESS_TOKEN=sbp_xxx SUPABASE_PROJECT_REF=<ref> node scripts/report-ledger-divergence.mjs
```

`03_reconcile.sql` is intentionally **not** runnable via any script — apply it by hand in the SQL
editor so a human reads the preview before committing.

---

## 5. Code repoint (`enforce.ts` → canonical) — summary

Full detail in `05_enforce_repoint_plan.md`. In short, once balances are reconciled:

- Repoint the 10 legacy callers so reads (`getBillingSnapshot`) and writes (`deductCreditsTransaction`)
  use `profiles.credits_balance` + `deduct_credits`/`refund_credits`. Keep the `enforce.ts` public API
  identical (a thin internal swap) so the 10 call sites don't change shape — lowest blast radius.
- **Free-tier decision (blocking):** the canonical wallet has **no monthly allowance**. Moving FREE
  users onto it silently removes their 100 credits/month. Either (a) keep a monthly top-up job that
  credits the canonical wallet, or (b) formally retire the free monthly allowance (a pricing change).
  This must be an explicit product decision, documented, before the repoint ships.
- Ship behind a flag if possible; the reserve-before-render Saga (already canonical) is unaffected.

---

## 6. Rollback

- **01/02/04** are read-only — nothing to roll back.
- **03** — if the preview looks wrong, it's already `ROLLBACK` (no-op). If you committed and regret it,
  each reconciliation is a single `credit_ledger` insert per user tagged with a stable ref
  (`recon:2026xxxx:<user>`); a compensating negative-delta insert per ref reverses it exactly. 04 lists
  the refs written.
- **Code repoint** — behind a flag / revertible commit; the legacy tables/RPCs are left intact until a
  later, separate cleanup migration, so a revert restores the old path with zero data change.

---

## 7. Safety attestation (Iteration 6, WS5 pt 1 — re-verified 2026-07-23)

This whole directory is **schema-discovery only** and is decoupled from any auto-applied path. Verified:

- **`01_introspect.sql`, `02_report_divergence.sql`, `04_verify.sql` contain ZERO active mutating
  statements** (no `INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/CREATE/GRANT/REVOKE/MERGE` outside comments).
  They are pure `SELECT` / catalog reads.
- **`03_reconcile.sql` is the ONLY mutating file, and it is fail-safe by construction:** it ships wrapped
  `BEGIN; … ROLLBACK;` with both its `INSERT` and its `COMMIT` **commented out**, so a first run commits
  nothing and only prints a preview. A human must uncomment the `INSERT` and flip `ROLLBACK`→`COMMIT` by
  hand after reviewing.
- **Nothing here auto-applies.** These files live in `docs/`, NOT `supabase/migrations/`, so no deploy or
  CI step can run them; no `package.json` script references them.
- **The only runner is read-only + guarded.** `scripts/report-ledger-divergence.mjs` executes ONLY 01+02
  and refuses any statement containing a mutating keyword (regex guard), so it cannot write even if a file
  is later edited. `03` is deliberately not runnable by any script — apply by hand in the SQL editor.

Re-verify at any time:
```bash
# expect "0 active mutating statements" for 01/02/04:
for f in 01_introspect 02_report_divergence 04_verify; do
  echo "$f: $(grep -viE '^\s*--|^\s*$' docs/ledger-unification/$f.sql \
    | grep -icE '\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|MERGE)\b') mutating"
done
```
