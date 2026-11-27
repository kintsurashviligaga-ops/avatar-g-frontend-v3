# CURRENT_STATE — MyAvatar.ge and Agent G

**As of:** 2026-11-27, 13:00 UTC
**Status:** docs only. This file changes no code, turns on no flag and merges nothing.
**Sibling documents:** [CAPABILITY_TRUTH_MATRIX.md](CAPABILITY_TRUTH_MATRIX.md) · [E2E_ACCEPTANCE_MATRIX.md](E2E_ACCEPTANCE_MATRIX.md) · [EVIDENCE_LEDGER.md](EVIDENCE_LEDGER.md)

Every number here was read with `gh api` on 2026-11-27, unless the line says where else it comes from.

---

## 1. One-line state

**STANDBY.** Production runs `main`. Everything built since 2026-11-13 waits in draft PRs with its flags off. Nothing merges until the production Supabase project is active again and GG says GREEN. After that, the merges happen one PR at a time, each with its own approval card.

## 2. What `main` and production are

| Fact | Value | How it was checked |
|---|---|---|
| `main` head | `0ea1566` ("docs(audit): add Phase 8.16 counter-audit evidence matrix", 2026-11-22) | `gh api repos/.../commits/main` |
| Latest Production deployment | the same SHA `0ea1566`, created 2026-11-22 07:34 UTC | `gh api repos/.../deployments?environment=Production` |
| Merged since 2026-11-13 | #377, #378, #379, #380 (small UI/a11y fixes, 2026-11-19), #394 (privacy paragraph, 2026-11-20), then the audit doc `0ea1566`. Every feature built since then is in a draft | git log |

**The audit is right about `main`.** `main` does **not** contain:

- the Agent G execution engine (#308 → #309 → #310 → #311);
- the IPv6/DNS network guard for the cloud browser (#399, #400, #408);
- the launch flag registry and `/api/admin/launch-flags` (#396).

All of these exist, with tests, in draft PRs. Section 4 lists where. They reach `main` only through the GREEN-day merge sequence in `docs/launch/LAUNCH_COMMANDS.md` Step 6. That file is on #373, not yet on `main`.

## 3. The blocker: the Supabase invoice

- The production Supabase project `zwksnayknzggdcenqqxy` was paused on 2026-11-12 at 09:33 UTC over an unpaid invoice.
- Since then, signed-in visitors get the #294 "temporarily unavailable" page (503) instead of a 504.
- GG reports the invoice is still being settled. This repository cannot see the invoice. This container cannot reach `supabase.co` either (the outbound network is closed), so the state on 2026-11-27 is **as reported by GG, not verified here**.
- **Why it blocks merging, not just launching.** Several PRs need SQL, or a paid check on the live database, before or right after they merge (runbook Step 3c and Step 7). Merging them while the database is down would put code in production that nobody can verify.
- **What unblocks it:** GG pays the invoice. Then runbook Step 1 (health 6/6, Auth answers 200, the #294 page is gone), then Step 1d (live checks), then GG replies GREEN.

## 4. The open PRs

**106 open PRs, 104 of them drafts.** 35 are stacked on another PR's branch rather than on `main`.

| Group | Count | PRs | Plan |
|---|---|---|---|
| Launch PRs in the runbook's merge order | 96 | Step 6 items 1 to 26, including billing #353 and #354 | GREEN-day merge sequence, one card each |
| Phase 8.20 fixes | 3 | #406 (Agent G Georgian failure text), #407 (`LEDGER_FAIL_CLOSED`), #408 (login browser behind the net guard) | Step 6 item 26 |
| Throwaway CI run | 1 | #409 `[DO NOT MERGE]` | Close unmerged. Its CI is 18/18 green |
| Docs | 1 | #373 (master summary + runbook copy) | Merge with the docs, any time after GREEN |
| Older work | 5 | #190 (on hold), #216, #256, #264, #273 (rebased in the 2026-11-19 clean-up) | `CLEANUP.md` on #373. Each needs GG's approval |
| **This PR** | +1 | docs/agent-g-superapp canonical docs | docs only |

Two PRs are marked ready rather than draft: #264 and #274.

**The combined proof.** The Phase 8.20 throwaway branch was built as `main` `0ea1566` plus all 96 launch heads in runbook order, plus the 8.20 fixes (#409):

- 21 merge conflicts, each resolved and written down (runbook item 27);
- `tsc --noEmit` 0 errors, `next lint` clean;
- full Jest: **1,290 suites, 18,784 tests passed, 1 failed**. The one failure was a real bug, and #408 fixes it. After the fix, the 218 affected suites (2,112 tests) pass;
- GitHub CI on #409: **18 of 18 checks green** (verify, every E2E job, billing on real Postgres, the BOG sandbox).

**Known red CI on the single PRs.** Since 2026-11-22, `verify` fails on `main` and on every PR in exactly one test: `lib/capabilities/lifecycle.test.ts`. It is a date guard. The Live model `gemini-2.5-flash-native-audio-latest` retires on 2026-12-13, inside its 21-day window. #292 (Live 3.8) fixes it, and it is the **first** merge on GREEN day. The test passes in the combined stack. Checked on #399 and #396 today: that test is their only failure.

## 5. Work in progress elsewhere

- **Phase 8.21 (spend caps and chaos testing)** is running in another thread right now. Its results are not in these documents. They will add rows to `EVIDENCE_LEDGER.md` when they land.

## 6. Rules that stay in force

- No merge without GG's card for that PR. No flag goes on as part of a merge; turning one on is a separate decision.
- BOG and live billing code: read, never changed, outside the pricing thread's checklist.
- Vertex only. Paid checks only within budgets GG has approved, and only on Production (Previews refuse paid writes).
- Visible AI labels stay off on myavatar.ge (GG 2026-11-27). Compliance is invisible: SynthID plus #403 metadata.

---

## 7. Technical note: the workspace cross-instance write race

**Where:** `lib/agent/workspace/store.ts`, on `main` since #277.

**What the code does today.** A workspace is a set of files in the user's private Supabase Storage bucket, plus one manifest per workspace (`{uid}/{ws}/.ws/manifest.json`). Every write runs: read the manifest, write the new file version to `{uid}/{ws}/f/{key(path)}@{v}`, then write the manifest back. `serial()` queues writes to the same workspace **inside one serverless instance** only. It is an in-memory promise chain.

**The gap, stated exactly.** Two Vercel instances can write to the same workspace in the same moment. Both read manifest N, and both write their own manifest N+1. The last writer wins. There are two outcomes:

| Case | What is lost |
|---|---|
| Two writes to **different** files | The bytes of both files are in storage, but the manifest the first writer wrote is overwritten, so its file disappears from the listing. It is recoverable by hand. |
| Two writes to the **same** file | Both compute the same next version number `v`. The blob is uploaded with `upsert: true` (`lib/agent/workspace/live.ts`), so the second upload **replaces the first one's bytes** at `@v`. One version's content is lost, not just its listing. |

The comment in `store.ts` on `main` names the first case but not the second. The fix PR #414 rewrites that comment along with the code.

**Why it is accepted for now.** Writes come from one chat step at a time, and one user's Agent G run executes its steps in order. Two instances writing to the same workspace at once needs two tabs or two runs acting on the same workspace in the same second. None has been reported. It becomes a real risk when the engine runs steps **in parallel** (#310 `AGENT_ENGINE_MEDIA`, and work-mode lease jobs in #311), so the fix belongs before work-mode is wired (3.5c).

**The plan, in order:**

1. **Make byte loss impossible (small, first).** Upload version blobs with `upsert: false`. A second writer that computed the same `v` then gets "already exists". It re-reads the manifest and retries with the next `v`, three tries at most, then `storage_failed`. Versions are never overwritten after this, which is what the file header already promises.
2. **One writer per workspace across instances: a lease row in Postgres.** A table `workspace_locks (user_id, workspace_id, holder, expires_at)`, primary key `(user_id, workspace_id)`, plus an RPC that takes the lease atomically: `insert … on conflict do update … where expires_at < now()`, with a TTL of about 30 s. `serial()` stays as the in-instance queue. Each write takes the lease, runs, and releases it. A crashed instance's lease ends with its TTL.
   - **Why not a plain Postgres advisory lock.** `pg_advisory_xact_lock` is held only for the transaction of one RPC call. The storage writes happen outside that transaction, in the function, so the lock is already released when they run. Session-level `pg_advisory_lock` is unsafe behind the Supabase pooler, because the next call may run on another connection, which leaves the lock stuck or held by nobody. A lease row with an expiry gives the same "one writer" guarantee and survives the pooler.
3. **If contention ever becomes normal** (many agents on one workspace): move the manifest itself into a Postgres row with a `version` column and write it with compare-and-set (`update … where version = $read_version`), keeping only the file bytes in Storage. Or route workspace writes through the existing `agent-work` lease-job queue from #311, so that one worker owns a workspace at a time.

**Status (Phase 8.23, 2026-11-27):** steps 1 and 2 are built in draft **#414**, each behind its own switch, both off: `WORKSPACE_CREATE_ONLY=1` (step 1; on a clash after three tries it answers `busy`, HTTP 409) and `WORKSPACE_LOCKS=1` (step 2, needs SQL `20261127a_workspace_locks.sql`, not applied). If the lock cannot be reached, a write goes ahead as it does today. The migration was tested on a local PostgreSQL 16, not on Supabase. Each switch is its own card after #414 merges.
