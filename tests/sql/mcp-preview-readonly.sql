-- Run only against the disposable local PostgreSQL cluster after fixture setup.
\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from public.generation_jobs) <> 1 or not exists (
    select 1 from public.generation_jobs where id='mcp-preview-synthetic-image' and service_type='image' and status='completed'
  ) then raise exception 'test owner cannot read synthetic work'; end if;
  begin
    insert into public.generation_jobs(id,user_id,service_type,status) values ('forged','00000000-0000-4000-8000-000000000001','image','completed');
    raise exception 'authenticated role could insert a row';
  exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000099';
do $$ begin
  if exists(select 1 from public.generation_jobs) then raise exception 'other user can read synthetic work'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from public.generation_jobs;
    raise exception 'anonymous role can read synthetic work';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
