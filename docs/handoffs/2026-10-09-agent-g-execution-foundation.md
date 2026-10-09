# Agent G execution foundation — 2026-10-09

Owner's order: GG, 2026-10-09 11:15Z, Master Task thread ("AGENT G EXECUTION FOUNDATION", 9 items).
Branch `claude/launch-certification-wmvitt`, draft PR #50. Nothing here is deployed, migrated or switched on:
everything stays behind `AGENT_G_MEDIA_EXEC` (unset = off in Production; admin-only on a Preview).

Labels: PROVEN / BUILT_NOT_PROVEN / PARTIAL / MISSING / BLOCKED_OWNER. BUILT_NOT_PROVEN here means written, unit
tested, and (where it renders) run locally on the real bundled ffmpeg, but not yet run on a Vercel deployment.

## 1. Verdict per item

| # | GG's item | DoD | Label | Evidence |
|---|-----------|-----|-------|----------|
| 1 | Montage off the synchronous request, onto a durable worker/queue | EF-1 | BUILT_NOT_PROVEN | `lib/orchestrator/jobLease.ts`, `lib/agent/media/montageWorker.ts`, route `run` answers `queued` at once (`route.test.ts`), real-ffmpeg run through the queue (`montageExec.ffmpeg.test.ts`) |
| 2 | Replace fail-open completeJob/failJob with reliable transitions, outbox, reconciliation | EF-2 | BUILT_NOT_PROVEN | `lib/orchestrator/jobs.ts` (terminal is terminal, 6 new tests), lease CAS writes, `owe:'refund'` outbox, sweep + status-read reconciliation |
| 3 | Lease, heartbeat, stale-job recovery, retry, real FFmpeg cancellation | EF-3 | BUILT_NOT_PROVEN | `jobLease.test.ts` 20, `montageWorker.test.ts` 14, `ffmpegExec.test.ts` cancel 5 (pgrep: the encoder is gone), real cancel during the conform pass |
| 4 | Atomic credit reservation/refund, job idempotency, audit persistence | EF-4 | PARTIAL | one row per quote (insert = idempotency), billing hold, ledger-bounded refund owed in the failing write; the `deduct_credits` same-ref race needs a migration (§6). Montage is free today, so the priced path is unit-tested only |
| 5 | Typed allowlisted tool registry | EF-5 | PARTIAL | `lib/agent/tools/registry.ts` + allowlist test; the live agent's 4 tools are typed specs. Agent G drives only the montage today; the other Studio/FFmpeg operations come as slice 2 (§7) |
| 6 | Isolated Python/Node sandbox, limited, network deny by default | EF-6 | BLOCKED_OWNER | contract + refusing runner `lib/agent/sandbox/policy.ts` (6 tests). A real runner needs an isolated host = paid infrastructure (§5 B) |
| 7 | Text, Live Voice and Media Jobs in one Task API | EF-7 | MISSING | design and order in §7 step 4; nothing built yet |
| 8 | Result in the same chat: playable preview, Download, Library | EF-8 | BUILT_NOT_PROVEN | browser test `tests/agent-g-montage.spec.ts` 4/4 (routes mocked): the master plays in the thread with Download; the completed row is the Library item |
| 9 | Authorized E2E (upload → plan → confirm → queue → render → QC → delivery) + crash/retry/refund tests | EF-9 | PARTIAL | crash, retry, cancel, refund-debt and sweep tests built; local real-ffmpeg E2E through the queue passes; the authorized run on a Preview needs an admin session (§7 step 1) |

Also checked (GG's ask): the three page retirements on PR #50 match GG's tap "გაუქმება" (09:32:26Z) and the
redirect tests pass (shellRedirects 11/11). Nothing restored, nothing else deleted.

## 2. What the audit found (before this change)

- The montage rendered inside the `run` request. A locked phone, a proxy timeout or a function killed at 600 s ended
  the render; the row stayed `processing` until the drain-renders reap leg (only with `RENDER_DRAINER_ENABLED`).
- `completeJob` / `failJob` / `updateJobStage` / `recordJobSettle` wrote whatever row they were given, in any status.
  A late stage write could reopen a failed (or cancelled) job, and a late failure could overwrite a delivered one.
- Stop only took effect between steps; the running ffmpeg went on to the end.
- A refund that failed to land was simply lost (no record that it was owed).
- Agent tools took raw model input; nothing structural stopped a future tool from starting a job or spending.

## 3. What was built

### 3.1 The queue (no migration)

The job is the existing `generation_jobs` row. Its queue state lives in `params._exec`
(`kind, v, attempt, maxAttempts, owner, leaseUntil, hold?, owe?, lastError?`). Every change to it is a compare-and-set
on its version (`PATCH … WHERE params->_exec->>v = <read> AND status IN <allowed>`), so two workers, a cancel and the
sweep can race on one row and exactly one write wins.

```
enqueue ──(priced: hold='billing' → charge → release)──▶ pending
pending ──claim (lease 90 s, attempt+1)──▶ processing ──heartbeat every 15 s──▶ (renewed)
processing ──complete (fenced: owner + status)──▶ completed            [QC passed]
processing ──fail (fenced) + owe:'refund' in the same write──▶ failed  [render/QC failed: final]
processing ──lease lapsed──▶ claim again (one retry) ──or── sweep: failed + owe   [worker died]
pending|processing ──owner cancel + owe──▶ failed ──worker's next heartbeat──▶ abort → SIGKILL ffmpeg
failed with owe ──payDebt: refund what the ledger shows was debited, once──▶ owe cleared
```

Stage and percent writes do not touch `_exec`; they land only while the row is `processing` and the writer still owns
the lease. A worker that lost its lease can no longer move the row; a second worker never delivers over the first.

### 3.2 Who runs the workers

The protocol does not care where a worker runs. Today: Vercel functions.
- `run` starts one after its answer (`waitUntil`, up to the route's 600 s).
- The owner's status read (`GET /api/agent/media/montage?jobId=`, polled by the chat every 3 s) starts one when no
  worker holds the job (never taken within 15 s, or its lease lapsed).
- `/api/agent/media/sweep`, every minute on Production: fails rows whose retry also died or whose charge never
  finished (owing the refund), pays outstanding debts, and works one waiting job. It is inert while the flag is off.
- `drain-renders` leaves leased rows alone.

### 3.3 Credits, idempotency, audit

- Idempotency: the quote's job id is the row id; the insert is the check. A re-sent `run` replays the same job.
- Reservation: the row is inserted with a billing hold, then charged, then released to the workers. A refused charge
  fails the row at once; a hold left by a request that died is failed by the sweep (owing whatever was charged).
- Refund: `netDebitedForRef` + `refundCredits(<ref>:refund)` pays back only what the ledger shows was taken, once,
  whoever pays first (worker, cancel, sweep). The debt is written in the same write that fails the row.
- Audit: `analytics_events` rows `audit.agent_g.media` for quote, queue, start, retry, delivery, failure, cancel,
  refund and lost lease.

### 3.4 Real cancellation

`lib/video/ffmpegExec.ts` carries an AbortSignal (explicit, or ambient through AsyncLocalStorage, so remixOps needs
no new parameter). On abort the running ffmpeg gets SIGKILL (SIGTERM made ffmpeg flush for ~0.8 s), a download in
flight is dropped, and a later call refuses to start. The worker aborts when its heartbeat finds the row failed
(cancel, sweep) or owned by another worker. Cancel latency: up to one heartbeat (15 s), then the kill.

### 3.5 Tool allowlist

`lib/agent/tools/registry.ts`: a tool is a spec with a zod input, an effect (`read`, `prepare`, `quote`), a per-request
call limit and an `offered` gate. `defineTool` refuses any other effect, so nothing a model calls can start a job,
spend credits or change user data; a `quote` must name the confirmed action the user's press runs (`montage_run`).
`bindTools` parses every input before the tool runs; bad input, limits and throws come back as observations.
The live agent's tools are `LIVE_TOOL_SPECS` in `lib/agent/react/bindLiveAgent.ts`, pinned by `registry.test.ts`.

### 3.6 Sandbox contract

`lib/agent/sandbox/policy.ts`: python or node only; at most 2 vCPU, 2 GB, 300 s, 1 MB output, 10 × 50 MB files (a job
may ask for less, never more); network denied unless a host is on `SANDBOX_EGRESS_ALLOWLIST` (empty); no secrets in
the environment; input files only the caller's own, read-only. The only runner, `disabledSandbox`, refuses every job.
Running code would be a confirmed action, never a model tool.

### 3.7 Why the queue state cannot be forged

Client writes to `generation_jobs` were revoked (20261001f, 20261002e). The only client path,
`/api/orchestrator/jobs`, strips every `_`-prefixed param on create and, after this change, refuses update / complete /
fail on a row that carries `_exec` (as it already did for `_reserve`). Refunds never trust the row: the ledger decides.

## 4. Known limits

- Workers are Vercel functions: one attempt is capped at 600 s. A montage master is at most 300 s
  (`montagePlan` MAX_TOTAL_SEC, 12 clips); a 10 s master renders in about 10 s locally, but a long master from many
  1080p clips has not been timed on Vercel and could reach the cap (it would then retry once and fail, refunded).
  Longer jobs need a dedicated worker host (§5 C).
- Crons run only on Production. On a Preview, recovery relies on the owner's status read (the chat polls it).
- The lease writes use PostgREST JSON-path filters; their query shape is tested, not yet run against the real database.
- `deduct_credits` can still double-debit two concurrent calls with the same ref (its EXISTS check precedes the lock and
  there is no unique index). Agent G never makes such calls (one row per quote gates the charge); other lanes can.
- Merging PR #50 adds a per-minute cron invocation in Production that returns "skipped" while the flag is off.

## 5. Needs GG's separate consent (phase 2)

| | Decision | Why | Cost/risk |
|-|----------|-----|-----------|
| A | Apply the queue migration (§6) | indexed claims with `FOR UPDATE SKIP LOCKED`, a `job_events` outbox table, one debit per ref in the ledger (fixes the `deduct_credits` race for every lane) | DB migration in Production; the unique index fails if duplicate debits already exist (check first) |
| B | A sandbox host for agent-written code | isolation needs a microVM/gVisor host, never the web function | paid: Vercel Sandbox or Cloud Run (gVisor) or E2B; per-second billing |
| C | A dedicated worker host for long renders | jobs over 600 s, steady throughput | paid: Cloud Run job or similar |
| D | Turn `AGENT_G_MEDIA_EXEC` on beyond admins in Production | the feature itself | only after EF-9 passes on a Preview |
| E | Merge PR #50 / deploy | ships all of the above, still flagged off | GG's word, as always |

## 6. Migration draft — NOT APPLIED

```sql
-- 2026-10-09 DRAFT for GG's review. Not in supabase/migrations, not applied anywhere.
-- A. Lease columns, so a claim is one indexed statement (today: params._exec + compare-and-set).
ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS exec_kind    text,
  ADD COLUMN IF NOT EXISTS lease_owner  text,
  ADD COLUMN IF NOT EXISTS lease_until  timestamptz,
  ADD COLUMN IF NOT EXISTS attempt      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 2;
CREATE INDEX IF NOT EXISTS generation_jobs_claimable
  ON public.generation_jobs (exec_kind, created_at) WHERE status IN ('pending', 'processing');

CREATE OR REPLACE FUNCTION public.claim_generation_job(p_kind text, p_owner text, p_lease_seconds integer)
RETURNS SETOF public.generation_jobs
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.generation_jobs j
     SET status = 'processing', lease_owner = p_owner,
         lease_until = now() + make_interval(secs => p_lease_seconds), attempt = j.attempt + 1
   WHERE j.id = (
     SELECT id FROM public.generation_jobs
      WHERE exec_kind = p_kind AND status IN ('pending', 'processing')
        AND (lease_until IS NULL OR lease_until < now()) AND attempt < max_attempts
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1)
  RETURNING j.*;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_generation_job(text, text, integer) FROM PUBLIC, anon, authenticated;

-- B. Outbox: effects owed after a final transition (refund today; notify later). Service role only.
CREATE TABLE IF NOT EXISTS public.job_events (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id     text NOT NULL REFERENCES public.generation_jobs(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('refund', 'notify')),
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at    timestamptz
);
ALTER TABLE public.job_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_events FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS job_events_open ON public.job_events (created_at) WHERE done_at IS NULL;

-- C. One debit per ref (closes the deduct_credits same-ref race for every lane).
-- First: SELECT user_id, metadata->>'ref', count(*) FROM credit_ledger WHERE delta < 0 AND metadata ? 'ref'
--        GROUP BY 1, 2 HAVING count(*) > 1;   -- must return no rows
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_one_debit_per_ref
  ON public.credit_ledger (user_id, (metadata->>'ref')) WHERE delta < 0 AND metadata ? 'ref';
```

With A applied, `supabaseLeaseStore` switches to the columns behind the same `LeaseStore` interface; the in-memory
store and every test stay as they are.

## 7. Next implementation plan (in order)

1. **EF-9 on a Preview** (needs GG's admin session; no consent beyond that). On the cert-branch Preview, signed in:
   attach 2–3 clips and one song, write „დაამონტაჟე მუსიკაზე", press Start. Claude then reads the job row (status
   path, `_exec`, audit rows) and probes the master. Then a cancel mid-render, to see the row fail and nothing delivered.
2. **Migration A + C**, on GG's word only; then the store switches to columns (no behaviour change).
3. **Slice 2 through the registry**: trim, captions, aspect and audio mix as `quote` specs, each leading to a confirmed
   action and a worker kind on the same queue (`kind` in `_exec`), reusing `lib/video/remixOps` and `surgicalOps`.
4. **One Task API** (EF-7): a read side first. `GET /api/tasks?ref=` returns one `TaskView`
   (`queued | running | completed | failed | cancelled`, stage, pct, result, attempt) for a media job (the lease row),
   a live voice session and a text turn, each through an adapter over its existing store; then `POST /api/tasks/cancel`.
   The chat, the job tray and Agent G read only TaskViews. No new table for this step.
5. **Sandbox runner** (after B): implement `SandboxRunner` on the approved host; jobs only as confirmed actions.
6. **Dedicated worker host** (after C): the same worker code, a different trigger.

## 8. Evidence (this change)

| Suite | Tests |
|-------|-------|
| `lib/orchestrator/jobLease.test.ts` | 20 |
| `lib/orchestrator/jobs.test.ts` | 14 |
| `lib/video/ffmpegExec.test.ts` | 11 |
| `lib/agent/media/montageWorker.test.ts` | 14 |
| `lib/agent/media/montageExec.test.ts` | 19 |
| `lib/agent/media/montageExec.ffmpeg.test.ts` (real ffmpeg: E2E through the queue; cancel kills the encoder) | 2 |
| `lib/agent/media/montageClient.test.ts` | 13 |
| `lib/agent/media/montageChat.test.ts` | 23 |
| `app/api/agent/media/montage/route.test.ts` | 8 |
| `app/api/agent/media/sweep/route.test.ts` | 3 |
| `app/api/cron/drain-renders/route.test.ts` | 5 |
| `app/api/orchestrator/jobs/route.test.ts` | 13 |
| `lib/agent/tools/registry.test.ts` | 7 |
| `lib/agent/sandbox/policy.test.ts` | 6 |
| `lib/agent/react/bindLiveAgent.test.ts` | 13 |
| `tests/agent-g-montage.spec.ts` (Playwright, routes mocked) | 4 |

Full jest: 717 suites, 11 011 passed, 3 skipped. `tsc --noEmit` clean; eslint clean on every changed file.
