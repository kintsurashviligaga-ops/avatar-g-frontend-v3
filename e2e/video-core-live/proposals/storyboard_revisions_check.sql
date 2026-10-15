-- B3 — the storyboard revision tables PROPOSAL (docs/handoffs/video-core/proposals/20261012a_storyboard_revisions.sql),
-- applied to the throwaway CI database ONLY, after the E2E has run on the Production-shaped baseline, and checked:
-- valid DDL on Supabase's Postgres, the constraints hold, the owner reads only their own rows, another user and anon read
-- nothing, and no client can write. This is not a migration of any shared database; the proposal stays a proposal.
--   psql "$E2E_DB_URL" -v owner=<uuid> -v other=<uuid> -f e2e/video-core-live/proposals/storyboard_revisions_check.sql
\set ON_ERROR_STOP 1
\i docs/handoffs/video-core/proposals/20261012a_storyboard_revisions.sql

select set_config('b3.owner', :'owner', false), set_config('b3.other', :'other', false);

do $$
declare
  a uuid := current_setting('b3.owner')::uuid;
  b uuid := current_setting('b3.other')::uuid;
  board uuid := gen_random_uuid();
  n int;
begin
  -- The server's writes (service_role in the app; the table owner here): two revisions of one board, one approval.
  insert into public.storyboard_revisions (user_id, board_id, revision, parent_revision, origin, fingerprint, seed, clip_sec, scene_count, native_sec, scenes)
  values (a, board, 1, null, 'plan', '0123456789abcdef', 7, 8, 3, 24, '[]'::jsonb),
         (a, board, 2, 1, 'reorder', 'fedcba9876543210', 7, 8, 3, 24, '[]'::jsonb);
  insert into public.storyboard_approvals (user_id, board_id, revision, fingerprint) values (a, board, 2, 'fedcba9876543210');

  -- Constraints.
  begin
    insert into public.storyboard_revisions (user_id, board_id, revision, origin, fingerprint, seed, clip_sec, scene_count, native_sec, scenes)
    values (a, board, 3, 'edit_caption', '0123456789abcdef', 7, 8, 3, 25, '[]'::jsonb);
    raise exception 'B3: native_sec <> scene_count * clip_sec was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.storyboard_revisions (user_id, board_id, revision, origin, fingerprint, seed, clip_sec, scene_count, native_sec, scenes)
    values (a, board, 3, 'edit_caption', 'NOT-A-FINGERPRINT', 7, 8, 3, 24, '[]'::jsonb);
    raise exception 'B3: a malformed fingerprint was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.storyboard_revisions (user_id, board_id, revision, origin, fingerprint, seed, clip_sec, scene_count, native_sec, scenes)
    values (a, board, 2, 'edit_caption', '0123456789abcdef', 7, 8, 3, 24, '[]'::jsonb);
    raise exception 'B3: a second revision 2 of the same board was accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.storyboard_approvals (user_id, board_id, revision, fingerprint) values (a, board, 9, '0123456789abcdef');
    raise exception 'B3: an approval of a revision that does not exist was accepted';
  exception when foreign_key_violation then null;
  end;

  -- The owner, signed in: reads their two revisions and the approval; cannot write.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.storyboard_revisions where board_id = board;
  if n <> 2 then raise exception 'B3: the owner sees % revisions, expected 2', n; end if;
  select count(*) into n from public.storyboard_approvals where board_id = board;
  if n <> 1 then raise exception 'B3: the owner sees % approvals, expected 1', n; end if;
  begin
    insert into public.storyboard_revisions (user_id, board_id, revision, origin, fingerprint, seed, clip_sec, scene_count, native_sec, scenes)
    values (a, board, 3, 'edit_caption', '0123456789abcdef', 7, 8, 3, 24, '[]'::jsonb);
    raise exception 'B3: a client insert was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.storyboard_approvals set fingerprint = '0123456789abcdef' where board_id = board;
    raise exception 'B3: a client update of an approval was accepted';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- Another user sees nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.storyboard_revisions where board_id = board;
  if n <> 0 then raise exception 'B3: another user sees % revisions', n; end if;
  select count(*) into n from public.storyboard_approvals where board_id = board;
  if n <> 0 then raise exception 'B3: another user sees % approvals', n; end if;
  reset role;

  -- Anonymous: no access at all.
  set local role anon;
  begin
    select count(*) into n from public.storyboard_revisions;
    raise exception 'B3: anon could read storyboard_revisions';
  exception when insufficient_privilege then null;
  end;
  reset role;

  delete from public.storyboard_revisions where board_id = board; -- cascades to the approval
  raise notice 'B3 storyboard revisions proposal: applied and verified on the throwaway database';
end $$;
