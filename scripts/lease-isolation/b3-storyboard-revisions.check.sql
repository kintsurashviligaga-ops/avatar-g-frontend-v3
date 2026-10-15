-- B3 preflight (Video Core final hardening, Phase 3): docs/handoffs/video-core/proposals/20261012a_storyboard_revisions.sql
-- on a REAL Postgres 16 with the harness's Production shape (./schema.sql). Run by ./run.sh after the proposal is applied
-- (twice: it must be re-runnable). Every check raises on failure; psql runs with ON_ERROR_STOP, so a failure fails run.sh.
-- Throwaway database only: nothing here is ever pointed at Production.

-- auth.uid() comes from ./schema.sql, as Supabase defines it.

insert into auth.users (id) values ('0e000000-0000-4000-8000-0000000b3001'), ('0e000000-0000-4000-8000-0000000b3002')
  on conflict do nothing;
delete from public.storyboard_revisions where user_id in ('0e000000-0000-4000-8000-0000000b3001', '0e000000-0000-4000-8000-0000000b3002');

-- The writer (service_role in the app; the superuser here, which bypasses RLS the same way).
insert into public.storyboard_revisions (user_id, board_id, revision, parent_revision, origin, fingerprint, seed, clip_sec, scene_count, native_sec, scenes)
values
  ('0e000000-0000-4000-8000-0000000b3001', '0b000000-0000-4000-8000-0000000000b1', 1, null, 'plan',         'aaaaaaaaaaaaaaaa', 7, 8, 3, 24, '[]'),
  ('0e000000-0000-4000-8000-0000000b3001', '0b000000-0000-4000-8000-0000000000b1', 2, 1,    'edit_caption', 'bbbbbbbbbbbbbbbb', 7, 8, 3, 24, '[]');

do $$
begin
  -- B1 a parent that does not exist on this board → refused
  begin
    insert into public.storyboard_revisions (user_id, board_id, revision, parent_revision, origin, fingerprint, seed, clip_sec, scene_count, native_sec, scenes)
    values ('0e000000-0000-4000-8000-0000000b3001', '0b000000-0000-4000-8000-0000000000b1', 5, 4, 'reorder', 'cccccccccccccccc', 7, 8, 3, 24, '[]');
    raise exception 'B1 FAILED: a revision with a missing parent was stored';
  exception when foreign_key_violation then raise notice 'B1 ok: missing parent refused';
  end;

  -- B2 another user re-using the same (client-minted) board_id is THEIR board: stored, and user 1 is not blocked
  insert into public.storyboard_revisions (user_id, board_id, revision, parent_revision, origin, fingerprint, seed, clip_sec, scene_count, native_sec, scenes)
  values ('0e000000-0000-4000-8000-0000000b3002', '0b000000-0000-4000-8000-0000000000b1', 1, null, 'plan', 'dddddddddddddddd', 9, 8, 3, 24, '[]');
  insert into public.storyboard_revisions (user_id, board_id, revision, parent_revision, origin, fingerprint, seed, clip_sec, scene_count, native_sec, scenes)
  values ('0e000000-0000-4000-8000-0000000b3001', '0b000000-0000-4000-8000-0000000000b1', 3, 2, 'reorder', 'eeeeeeeeeeeeeeee', 7, 8, 3, 24, '[]');
  raise notice 'B2 ok: the same board_id under two users does not collide';

  -- B3 an approval naming user 1's revision under user 2 → refused (user 2 has no such revision with that fingerprint)
  begin
    insert into public.storyboard_approvals (user_id, board_id, revision, fingerprint)
    values ('0e000000-0000-4000-8000-0000000b3002', '0b000000-0000-4000-8000-0000000000b1', 1, 'aaaaaaaaaaaaaaaa');
    raise exception 'B3 FAILED: a cross-user approval was stored';
  exception when foreign_key_violation then raise notice 'B3 ok: cross-user approval refused';
  end;

  -- B4 an approval whose fingerprint is not the revision's → refused
  begin
    insert into public.storyboard_approvals (user_id, board_id, revision, fingerprint)
    values ('0e000000-0000-4000-8000-0000000b3001', '0b000000-0000-4000-8000-0000000000b1', 2, 'aaaaaaaaaaaaaaaa');
    raise exception 'B4 FAILED: an approval with another revision''s fingerprint was stored';
  exception when foreign_key_violation then raise notice 'B4 ok: mismatched fingerprint refused';
  end;

  -- B5 the matching approval is stored
  insert into public.storyboard_approvals (user_id, board_id, revision, fingerprint, film_ref)
  values ('0e000000-0000-4000-8000-0000000b3001', '0b000000-0000-4000-8000-0000000000b1', 2, 'bbbbbbbbbbbbbbbb', 'f0123456789abcdef');
  raise notice 'B5 ok: the matching approval is stored';

  -- B6 the shape checks
  begin
    insert into public.storyboard_revisions (user_id, board_id, revision, origin, fingerprint, seed, clip_sec, scene_count, native_sec, scenes)
    values ('0e000000-0000-4000-8000-0000000b3001', '0b000000-0000-4000-8000-0000000000b2', 1, 'plan', 'ffffffffffffffff', 1, 8, 3, 25, '[]');
    raise exception 'B6 FAILED: native_sec <> scene_count * clip_sec was stored';
  exception when check_violation then null;
  end;
  begin
    insert into public.storyboard_revisions (user_id, board_id, revision, origin, fingerprint, seed, clip_sec, scene_count, native_sec, scenes)
    values ('0e000000-0000-4000-8000-0000000b3001', '0b000000-0000-4000-8000-0000000000b2', 1, 'plan', 'NOT-A-FINGERPRNT', 1, 8, 3, 24, '[]');
    raise exception 'B6 FAILED: a malformed fingerprint was stored';
  exception when check_violation then null;
  end;
  begin
    insert into public.storyboard_revisions (user_id, board_id, revision, origin, fingerprint, seed, clip_sec, scene_count, native_sec, scenes)
    values ('0e000000-0000-4000-8000-0000000b3001', '0b000000-0000-4000-8000-0000000000b2', 1, 'plan', 'ffffffffffffffff', 1, 5, 3, 15, '[]');
    raise exception 'B6 FAILED: clip_sec 5 was stored';
  exception when check_violation then null;
  end;
  raise notice 'B6 ok: length, fingerprint and clip checks hold';
end $$;

-- B7 an owner reads only their own rows and writes nothing
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"0e000000-0000-4000-8000-0000000b3001"}', false);
do $$
declare n int;
begin
  select count(*) into n from public.storyboard_revisions;
  if n <> 3 then raise exception 'B7 FAILED: user 1 sees % revisions, expected their own 3', n; end if;
  select count(*) into n from public.storyboard_approvals;
  if n <> 1 then raise exception 'B7 FAILED: user 1 sees % approvals, expected 1', n; end if;
  begin
    insert into public.storyboard_approvals (user_id, board_id, revision, fingerprint)
    values ('0e000000-0000-4000-8000-0000000b3001', '0b000000-0000-4000-8000-0000000000b1', 3, 'eeeeeeeeeeeeeeee');
    raise exception 'B7 FAILED: an owner wrote their own approval';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.storyboard_revisions set fingerprint = '0000000000000000';
    raise exception 'B7 FAILED: an owner rewrote a revision';
  exception when insufficient_privilege then null;
  end;
  raise notice 'B7 ok: owner reads own rows only, writes nothing';
end $$;
select set_config('request.jwt.claims', '{"sub":"0e000000-0000-4000-8000-0000000b3002"}', false);
do $$
declare n int;
begin
  select count(*) into n from public.storyboard_revisions;
  if n <> 1 then raise exception 'B7 FAILED: user 2 sees % revisions, expected their own 1', n; end if;
end $$;
reset role;

-- B8 anon reads nothing at all
set role anon;
do $$
begin
  begin
    perform 1 from public.storyboard_revisions limit 1;
    raise exception 'B8 FAILED: anon read storyboard_revisions';
  exception when insufficient_privilege then raise notice 'B8 ok: anon refused';
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '', false);
