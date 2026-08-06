# Remaining work — Agent G automation, Prompt Factory, load testing

Written 2026-08-02, after the day's fixes shipped and were verified live on myavatar.ge.
Everything below is **not started**. Each item is a money path or needs infrastructure, and each one has a
trap that this codebase has already sprung at least once.

---

## 1. Batch queue API for Agent G (`#7`, second half)

**Goal:** the orchestrator submits N video prompts, they render sequentially, results come back — no
manual step.

**What already exists (do not rebuild):**
- `lib/orchestrator/jobs.ts` — `createJob`, capped-parallel engine (3 concurrent)
- `lib/providers/latencyFailover.ts` — provider failover
- `addWatermark()` in `lib/video/remixOps.ts`, reachable as `op: 'watermark'` on `/api/video/remix`

**What is missing:** the batch endpoint itself, and its billing.

### ⚠️ Traps, in the order they will bite

1. **Each video costs credits.** `deduct_credits(user, amount, ref)` is verified working (50→25, replay
   is idempotent, overspend refused). The batch must debit **per item**, not once for the batch, or a
   partial failure either overcharges or gives work away.
2. **The idempotency `ref` must be PER TRANSACTION.** A fixed ref across a batch means item 2..N are free
   — this exact bug shipped before (see `billing-idempotency-and-chat-persistence` in memory).
3. **Refund on failure, per item.** Follow the saga in `app/api/video/assemble/route.ts`: reserve →
   dispatch → commit, with rollback releasing both the lock and the durable debit.
4. **`credit_ledger` has an AFTER INSERT trigger** maintaining `profiles.credits_balance`. Insert the
   ledger row ONLY. An extra `UPDATE profiles` pays twice — that shipped once.
5. **`credit_ledger.reason` CHECK** accepts `purchase | commit | refund | admin_adjustment` only.
   Specifics go in `metadata`.
6. **Watermark runs LAST.** `stripVeoWatermark` crops the bottom of the frame; running it after
   `addWatermark` cuts off the mark just applied.
7. **Never trust a client-supplied id for authorisation.** The `film:` token is base64url JSON the client
   holds; server-authoritative state lives in `lib/chat/filmStatusStore.ts`.

---

## 2. Agent G "Prompt Factory" (`#5`)

**Goal:** watch chat topics, detect ones that consumed 10k+ tokens across users, filter spam, generate
ready-made 8s video prompts, surface them in the admin panel with a Copy button.

**Nothing exists.** It needs, roughly in order:
1. Token accounting per conversation topic — check whether `agent_evolution_traces` already records
   enough (it is what `/api/admin/financials` uses for cost) before adding a table.
2. Clustering/topic extraction over chat history.
3. A spam/irrelevance filter.
4. Prompt generation.
5. A `Trending Prompts` admin section with Copy.

### ⚠️ Traps
- **Chat history is localStorage on `/dashboard`**, and `chat_sessions` / `chat_messages` are 0 rows with
  a schema that does not match the code (`lib/chat-history.ts` documents this). **There is no server-side
  corpus to analyse yet.** That is the first thing to solve, and it is a bigger job than the factory.
- Reading user chats server-side is a **privacy decision**, not just an engineering one. Say so out loud
  before building it.
- **`\b` never matches after Georgian or Cyrillic.** Any keyword filter must use
  `(?<![\p{L}\p{N}])` / `(?![\p{L}\p{N}])` with the `u` flag. Georgian is agglutinative — match STEM +
  `\p{L}*`, never whole words. This has cost multiple wrong diagnoses.

---

## 3. Load testing & checkout (`#8`)

**Not a code change.** Needs k6 or Artillery against a staging deploy, plus a decision about what load to
target. The checkout rails to exercise: Stripe (`/api/billing/wallet-topup`, `/api/billing/tier-checkout`),
Bank of Georgia (RSA-signed webhook), Apple IAP.

⚠️ **Supabase had unpaid invoices as of 2026-08-02** ("Outstanding invoices" in the dashboard). Load
testing against a database that may be suspended will produce meaningless results — settle that first.

---

## Verification rule for all of the above

**Nothing is verified until a real row, request or render has gone through it.** On 2026-08-02, four
separate changes read correctly and were wrong:

- a migration that "passed" three times while editing a function nothing called — and then took
  registration down entirely once wired correctly (`profiles.email` is NOT NULL)
- a watermark filter that type-checked but crashed ffmpeg, then a second version that silently burnt a
  mark over a third of the frame
- an audit that reported anonymous users rendering video free, on a route that 401s them on line one
- a lint fix where renaming a destructured prop in place looked right and would have broken four
  components

Run it. Read the row back. Then say it works.
