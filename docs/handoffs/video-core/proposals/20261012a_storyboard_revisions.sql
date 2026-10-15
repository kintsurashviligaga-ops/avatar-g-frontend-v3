-- 20261012a_storyboard_revisions.sql — PROPOSAL ONLY. NOT a migration, NOT applied, NOT in supabase/migrations.
--
-- Video Core v1.0 §5 (revision-aware storyboard) and §11 ("schema/infra changes → a reviewable migration + isolated tests +
-- activation/rollback plan only; no migration on the shared database"). Preview shares the Production Supabase project,
-- so this file waits for GG's separate word; until then the studio keeps the board in memory only and the pure module
-- lib/video/storyboard/revision.ts (tests: revision.test.ts) is the whole implementation.
--
-- One `storyboard_revisions` row per real change of a board (a change that changes nothing is not a revision — the module's
-- snapshotRevision returns the parent), one `storyboard_approvals` row per "Generate Video" press, naming the revision it
-- was pressed on by number AND fingerprint. The render route would refuse a render whose board fingerprint is not the
-- approved one (lib/video/storyboard/revision.ts approvalMatches) instead of rendering a board nobody saw.
--
-- ⚠️ WRITTEN ONLY BY service_role (the API route, after it recomputed the fingerprint from the board it was sent — a client
-- fingerprint is never trusted). Owners read their own rows and never write them: a board is not money, but an approval
-- is the record a charge is justified by, and 20260929a / 20261001f are the history of why owner writes are not granted.
--
-- Additive only: two tables, their indexes and policies. Nothing existing is altered.
--
-- REVISED 2026-10-15 (Video Core final hardening, Phase 3 preflight; still never applied anywhere but a throwaway database):
--   1. A board's revision numbers were unique per board_id ACROSS users, and board_id is client-minted: one user reusing
--      another's board_id could block that user's next revision (unique violation) and an approval row could point at
--      another user's revision. Every key is now scoped by user_id.
--   2. An approval could carry a fingerprint different from the revision it names. The approval now references the
--      revision by (user_id, board_id, revision, fingerprint), so an approval exists only for a board somebody actually
--      saved, as it was saved. A parent_revision must exist on the same board of the same user.
--   Checked on a real Postgres 16: scripts/lease-isolation/b3-storyboard-revisions.check.sql (run.sh).

begin;

create table if not exists public.storyboard_revisions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  -- The board: one id per createStoryboard call (client-minted uuid, echoed by the route).
  board_id         uuid not null,
  revision         integer not null check (revision >= 1),
  parent_revision  integer check (parent_revision is null or (parent_revision >= 1 and parent_revision < revision)),
  origin           text not null check (origin in ('plan', 'enrich', 'frames', 'edit_caption', 'reroll_frame', 'reorder', 'add_scene', 'delete_scene', 'base_image', 'regenerate')),
  -- lib/video/storyboard/revision.ts fingerprintBoard: 16 hex chars over the canonical board.
  fingerprint      text not null check (fingerprint ~ '^[0-9a-f]{16}$'),
  seed             bigint not null check (seed >= 0),
  clip_sec         integer not null check (clip_sec in (4, 6, 8)),
  scene_count      integer not null check (scene_count between 1 and 30),
  -- The board's native length = the grid the render is planned on (never the requested final length — that is the
  -- duration contract's, lib/video/durationContract.ts, and it travels with the render, not with the board).
  native_sec       integer not null check (native_sec = scene_count * clip_sec),
  -- RevisionScene[]: [{ordinal, beat, prompt, frameUrl, edited, anchored}] — bounded by the app; capped here too.
  scenes           jsonb not null check (jsonb_typeof(scenes) = 'array' and octet_length(scenes::text) <= 65536),
  scene_scripts    jsonb check (scene_scripts is null or (jsonb_typeof(scene_scripts) = 'array' and octet_length(scene_scripts::text) <= 65536)),
  created_at       timestamptz not null default now(),
  constraint storyboard_revisions_board_revision_key unique (user_id, board_id, revision),
  -- The approval's foreign key target: a revision as it was saved (its number AND its fingerprint).
  constraint storyboard_revisions_fingerprint_key unique (user_id, board_id, revision, fingerprint),
  constraint storyboard_revisions_parent_fkey foreign key (user_id, board_id, parent_revision)
    references public.storyboard_revisions (user_id, board_id, revision) on delete cascade
);

-- (user_id, board_id, revision) is already indexed by storyboard_revisions_board_revision_key; no second index.

create table if not exists public.storyboard_approvals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  board_id       uuid not null,
  revision       integer not null,
  fingerprint    text not null check (fingerprint ~ '^[0-9a-f]{16}$'),
  -- The film the approval started (film_tokens / renders id), set by the render route once it has one.
  film_ref       text check (film_ref is null or char_length(film_ref) between 1 and 128),
  approved_at    timestamptz not null default now(),
  constraint storyboard_approvals_revision_fkey foreign key (user_id, board_id, revision, fingerprint)
    references public.storyboard_revisions (user_id, board_id, revision, fingerprint) on delete cascade
);

create index if not exists storyboard_approvals_user_idx on public.storyboard_approvals (user_id, approved_at desc);

alter table public.storyboard_revisions enable row level security;
alter table public.storyboard_approvals enable row level security;

drop policy if exists storyboard_revisions_owner_read on public.storyboard_revisions;
create policy storyboard_revisions_owner_read on public.storyboard_revisions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists storyboard_approvals_owner_read on public.storyboard_approvals;
create policy storyboard_approvals_owner_read on public.storyboard_approvals
  for select to authenticated using (auth.uid() = user_id);

-- No insert / update / delete policy for authenticated or anon: service_role bypasses RLS and is the only writer.
revoke all on public.storyboard_revisions from public, anon, authenticated;
revoke all on public.storyboard_approvals from public, anon, authenticated;
grant select on public.storyboard_revisions to authenticated;
grant select on public.storyboard_approvals to authenticated;

commit;

-- ROLLBACK (the client works without these tables — the board stays in memory, as today):
--   drop table if exists public.storyboard_approvals;
--   drop table if exists public.storyboard_revisions;
