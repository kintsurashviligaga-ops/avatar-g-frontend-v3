# Agent G Media Studio v2.0 — 01 Canonical contracts

These are the contracts the code uses today (no second schema). Where the spec names a field the code spells
differently, the mapping is given.

## 1. The montage request (signed, immutable for the job)

`AgentMontageRequest` (`lib/agent/media/montageManifest.ts`), signed by the quote token (`quoteToken.ts`, HMAC over
the whole request incl. the manifest). The worker re-checks the signature, the manifest and coverage before rendering;
any change after the quote is refused (`montageExec.test.ts:193`, `montageWorker.test.ts:210`).

| Spec field | Code | Notes |
|---|---|---|
| `assetIds` | `manifest[].index` + the stored path in `shots[].url` | storage path, owner-checked (`lib/security/callerMedia`) |
| selected / excluded sources | `MontageQuote.selection { sent, used, excluded, excludedNames, phrase }` | numbers are files **as sent**; excluded files are not in the request at all |
| `targetDurationMs` | `timelineDuration(shots)` = quote `totalSec` | an asked length is binding (refused, never shortened) |
| `audioSourceStartMs` | `request.musicStartSec` | the user's offset, exactly |
| `audioTimelineStartMs` | always 0 | the track starts on the first frame; other values MISSING |
| `audioEndPolicy` | `stop` | never looped or extended; a track that ends early is refused at the quote |
| `sourceAudioPolicy` | `musicOnly: true → remove`; `false → preserve` | Agent G's chat always sends `remove` today |
| `replacementAudioPolicy` | `remove → replace`; `preserve → mix` (track ducked under the clips) | `montagePipeline.ts` `bed` / `under` |
| plan fingerprint | the token's `bodyFingerprint` | |
| execution job reference | `generation_jobs.id` (= quote `jobId`) | one row per quote; a second Start returns the same row |
| QC report | `generation_jobs.result.qc` | see `04-QC-PROVENANCE.md` |

## 2. Source selection in words (`lib/agent/media/sourceSelect.ts`)

- Pictures (videos and photos) are counted in send order, 1-based; the track is never counted.
- Forms: `ბოლო N` / `last N` / `последние N`; `პირველი N` / `first N`; `მარტო / მხოლოდ / only / только` + positions;
  `X-ის გარდა`, `except`, `кроме`, `без`; `X ამოიღე`, `არ გამოიყენო`, `drop`.
- A later line wins (a plan changed in the chat appends its change on a new line).
- Sentences about time („ბოლო 5 წამი", „first 3 seconds") are not selections.
- Naming a picture that is not there, or excluding all, is refused (`selection_invalid`), never trimmed to fit.
- Selecting every picture is no selection.

## 3. Chat routing

| Said | When | Step |
|---|---|---|
| clips + track + words | new | quote (`agent.montage`, attachment) |
| length / start / selection | a plan card waiting | re-quote the same files (`lib/agent/intent.ts:246`) |
| „მუსიკა 5 წამიდან", „მარტო ბოლო ხუთი" | after a delivered montage, no new files | re-plan from its own files (`intent.ts:295`, `chatTurn.ts:231`) |

Typed words go through `planChatTurn` → `classifyAgentIntent`. Live Voice reaches the same quote another way: the
Live model's `ask_agent_g` hands its goal text and the call's files to Agent G (`lib/agent/react/bindLiveAgent.ts:252`),
and `quoteMontage` reads length, start and selection from that text with the same server code. So the rules are one,
but a spoken selection works only if the Live model carries the user's words into the goal (BUILT, not run by voice).
Approval for a run comes only from the person (a tap, or the user's own transcribed words judged by
`lib/voice/spokenYes`), never from the model.

## 4. Proposed, not built: durable media project with revisions (needs GG's migration decision)

Today a re-plan is a new quote whose prompt carries the earlier words; nothing links revisions server-side. The
proposal below reuses `generation_jobs` for execution and adds one small table; it is **not applied** and would be a
migration on the shared Production database (GG's separate word).

```sql
-- PROPOSAL ONLY. Not a migration file. Owner decision required.
create table public.media_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,                 -- the first revision's id
  base_revision_id uuid references public.media_revisions(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  version int not null,                     -- 1, 2, … per project; unique with project_id (CAS)
  request jsonb not null,                   -- the signed AgentMontageRequest (sources, selection, timing)
  job_id uuid,                              -- generation_jobs row that rendered it
  created_at timestamptz not null default now(),
  unique (project_id, version)
);
alter table public.media_revisions enable row level security;
create policy media_revisions_owner on public.media_revisions for select using (auth.uid() = user_id);
```

CAS: a new revision is inserted with `version = base.version + 1`; the unique key rejects the second of two
concurrent edits of the same base (E2E-19), which is then re-planned on the newer revision with the user told.
