# 02 — Data retention policy (DRAFT)

What we keep, for how long, and what deleting an account removes. Proposed periods are marked **(proposed)**; GG decides.
Facts were read from main on 2026-11-13. Production Supabase was paused that day, so database-side facts (cascades,
row counts) are unverified until GG runs `sql/01_fk_cascades_readonly.sql`.

## Data store matrix

| Data | Where | Kept today | Proposed policy |
|------|-------|-----------|-----------------|
| Account, profile | `auth.users`, `profiles` | until account deletion | same |
| Chat sessions, messages | `chat_sessions`, `chat_messages` | until the user or account deletion removes them | same; R-2 decides inactive accounts |
| Chat memory (embeddings) | `memories` / `agent_g_memory` | until deletion | same; text only, Google-only after #306 |
| Generated media | Storage `renders`, `studio`, `job-artifacts`, `avatars`, `twins` | no expiry | **(proposed)** keep while the account lives; signed links 7 days |
| Agent G workspaces | Storage `workspaces` | no expiry | **(proposed)** same as media |
| Uploads | Storage (per feature) | no expiry | **(proposed)** 90 days unless attached to a kept chat or result |
| Job rows | `jobs`, `generation_jobs` | no expiry | **(proposed)** 180 days for failed/cancelled, keep completed with their result |
| Credit ledger, BOG orders | `credits_ledger` / ledger tables, BOG tables | forever | keep for the legal accounting period, **pseudonymised** after account deletion (R-1) |
| Vertex Interactions (Omni, research) | Google, `store=true` | **7 days** (Google side) | same (D-04) |
| Vertex request logs | Google Cloud | Google defaults | no prompts logged by us beyond errors |
| App logs | Vercel | Vercel plan retention | never log prompts, emails or tokens |
| Telegram inbound | telegram tables | no expiry | **(proposed)** 30 days |
| Rate-limit counters | Upstash/Redis | TTL windows | same |

## Account deletion today (`app/api/account/delete/route.ts`)

It deletes rows from 9 tables (`avatars, credits, credits_ledger, jobs, chat_sessions, chat_messages,
business_profiles, agent_g_memory, profiles`), then deletes the auth user. Gaps:

- **D-1 Storage is never purged.** Files in `renders`, `studio`, `job-artifacts`, `workspaces`, `avatars`, `twins`
  stay after the account is gone. Fix: list and remove the user's prefixes in each bucket before `deleteUser`.
- **D-2 Tables not listed** (memories, generation_jobs, research tables, Agent G workspace rows, telegram events) rely
  on `ON DELETE CASCADE` that nobody has verified. The SQL below lists every foreign key to `auth.users` and its rule.
- **D-3 Errors are invisible.** `supabase.from(t).delete()` returns `{ error }`; it does not throw, so the `try/catch`
  never sees a failure. Fix: check `error`, report it (without the user id), and still finish the auth delete.
- **D-4 Ledger rows are deleted.** That erases payment history we may be legally required to keep and breaks
  reconciliation with BOG. Proposal (R-1): keep ledger rows, replace `user_id` with a tombstone id. This touches the
  ledger, so it waits for GG's `01_introspect.sql` output and the ledger-unification plan; live BOG code is not touched.

## Read-only SQL for GG

`docs/v5.1-phase6/sql/01_fk_cascades_readonly.sql` lists, for every table that points at `auth.users` or
`public.profiles`, the column and its `ON DELETE` rule. It only reads catalog views. Run it in the production SQL editor
after Supabase is back, and paste the result; the account-deletion PR is written from that list.
