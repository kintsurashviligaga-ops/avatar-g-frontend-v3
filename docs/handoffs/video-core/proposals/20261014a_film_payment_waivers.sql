-- 20261014a_film_payment_waivers.sql — PROPOSAL ONLY. NOT a migration, NOT applied, NOT in supabase/migrations.
-- Applying it to Production needs GG's explicit word (Video Core final run, 2026-10-14; defect 44 / R2 follow-up).
--
-- WHY. A film is paid for when it STARTS (the chat route: a credit_ledger debit, or one free-video slot) and
-- /api/video/assemble, another Vercel function, must know it so it does not charge the stitch a second time. That knowledge
-- lived only in Redis (+ a process-local Map). With Redis unreachable (Production's old Upstash host does not resolve) a
-- paying user's film was charged twice. This table is the durable home every instance already shares.
--
-- LEDGER-BACKED. A 'paid' waiver cannot be recorded unless credit_ledger holds a debit of that user under that exact ref
-- (record_film_waiver checks), and it is honoured only while the NET debit under the ref (debits minus the `:…` refunds)
-- is still positive — a film that was refunded in full has no waiver left. The ledger stays the only place money is
-- written; this table only says "that debit covers the stitch of token T, once".
--
-- EXACTLY ONCE. consume_film_waiver is ONE UPDATE … WHERE consumed_at IS NULL: of N concurrent assembles of the same
-- token exactly one gets 'paid'/'free'; the others get 'spent'. restore_film_waiver hands it back when the stitch that
-- spent it failed, so a retry is not charged for the outage. A waiver belongs to one user: another user's call finds
-- nothing.
--
-- Service role only (no policy, no grants for anon / authenticated): a waiver is a statement about money, and the lessons
-- of 20260929a / 20261001f are why owner writes are not granted.
--
-- Additive only: one table, three functions. Nothing existing is altered.
-- Rollback (the code then falls back to Redis + the ledger read, as before):
--   drop function public.record_film_waiver(text, uuid, text, integer, text);
--   drop function public.consume_film_waiver(text, uuid);
--   drop function public.restore_film_waiver(text, uuid);
--   drop table public.film_payment_waivers;

begin;

create table if not exists public.film_payment_waivers (
  -- lib/chat/filmStatusStore deriveFilmTokenId: 'f' + 16 hex. Bounded: a caller cannot store payloads here.
  token_id     text primary key check (char_length(token_id) between 1 and 64),
  user_id      uuid not null,
  -- 'paid' = the whole price was taken up front (a ledger debit); 'free' = the free-video slot covered it.
  kind         text not null check (kind in ('paid', 'free')),
  credits      integer not null default 0 check (credits >= 0),
  -- The ledger ref of the up-front debit (paid only).
  ref          text check (ref is null or char_length(ref) between 1 and 200),
  consumed_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint film_payment_waivers_kind_shape check (
    (kind = 'paid' and credits > 0 and ref is not null) or (kind = 'free' and credits = 0)
  )
);

create index if not exists film_payment_waivers_user_idx on public.film_payment_waivers (user_id, created_at desc);

alter table public.film_payment_waivers enable row level security;
revoke all on table public.film_payment_waivers from public, anon, authenticated;
grant select, insert, update, delete on table public.film_payment_waivers to service_role;

-- Credits taken under `p_ref` and not yet given back: |debits with exactly this ref| − credit-backs whose ref starts with
-- `p_ref || ':'` (compared with left(), never LIKE: refs contain '_' and '%' would widen a LIKE). Same arithmetic as
-- lib/orchestrator/ledger.ts netDebitedForRef.
create or replace function public.film_net_debit(p_user uuid, p_ref text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0,
    coalesce((select sum(-delta) from public.credit_ledger
               where user_id = p_user and delta < 0 and metadata ->> 'ref' = p_ref), 0)
    - coalesce((select sum(delta) from public.credit_ledger
                 where user_id = p_user and delta > 0 and left(metadata ->> 'ref', char_length(p_ref) + 1) = p_ref || ':'), 0)
  )::integer;
$$;

-- true  = recorded now; false = this token already had a waiver (first one wins, a replay changes nothing).
create or replace function public.record_film_waiver(p_token text, p_user uuid, p_kind text, p_credits integer, p_ref text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted boolean;
begin
  if p_token is null or p_user is null or p_kind not in ('paid', 'free') then
    raise exception 'invalid_film_waiver' using errcode = '22023';
  end if;
  if p_kind = 'paid' then
    if p_credits is null or p_credits <= 0 or p_ref is null then
      raise exception 'invalid_film_waiver' using errcode = '22023';
    end if;
    -- LEDGER-BACKED: no debit of this user under this ref, no waiver.
    if public.film_net_debit(p_user, p_ref) <= 0 then
      raise exception 'no_ledger_debit' using errcode = '22023';
    end if;
  end if;
  insert into public.film_payment_waivers (token_id, user_id, kind, credits, ref)
  values (p_token, p_user, p_kind, case when p_kind = 'paid' then p_credits else 0 end, case when p_kind = 'paid' then p_ref else null end)
  on conflict (token_id) do nothing
  returning true into inserted;
  return coalesce(inserted, false);
end;
$$;

-- 'paid' | 'free' = this call spent the waiver (go: do not charge the stitch);
-- 'spent'         = the user's waiver for this token exists and was already used (charge normally);
-- 'void'          = a paid waiver whose debit has since been refunded in full (charge normally);
-- 'none'          = no waiver of this user for this token.
create or replace function public.consume_film_waiver(p_token text, p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.film_payment_waivers%rowtype;
begin
  select * into w from public.film_payment_waivers where token_id = p_token and user_id = p_user for update;
  if not found then return 'none'; end if;
  if w.consumed_at is not null then return 'spent'; end if;
  if w.kind = 'paid' and public.film_net_debit(p_user, w.ref) <= 0 then return 'void'; end if;
  update public.film_payment_waivers set consumed_at = now() where token_id = p_token and consumed_at is null;
  return w.kind;
end;
$$;

-- Hands a spent waiver back (the stitch that spent it failed). false = there was nothing spent to hand back.
create or replace function public.restore_film_waiver(p_token text, p_user uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with r as (
    update public.film_payment_waivers set consumed_at = null
     where token_id = p_token and user_id = p_user and consumed_at is not null
    returning 1
  )
  select exists (select 1 from r);
$$;

revoke all on function public.film_net_debit(uuid, text) from public, anon, authenticated;
revoke all on function public.record_film_waiver(text, uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.consume_film_waiver(text, uuid) from public, anon, authenticated;
revoke all on function public.restore_film_waiver(text, uuid) from public, anon, authenticated;
grant execute on function public.film_net_debit(uuid, text) to service_role;
grant execute on function public.record_film_waiver(text, uuid, text, integer, text) to service_role;
grant execute on function public.consume_film_waiver(text, uuid) to service_role;
grant execute on function public.restore_film_waiver(text, uuid) to service_role;

commit;
