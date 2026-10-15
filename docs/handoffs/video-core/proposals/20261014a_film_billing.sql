-- 20261014a_film_billing.sql — PROPOSAL. NOT applied anywhere but throwaway test databases; waits for GG's separate word.
--
-- Video Core v1.0 final hardening, Phase 1 (financial safety): the film's paid status in DURABLE storage.
--
-- A film is charged once, when it starts (lib/chat/filmComposite), and /api/video/assemble must then stitch it WITHOUT a
-- second charge. Until now the evidence of that payment and the single-use "stitch waiver" lived only in Redis (6 h TTL)
-- with a per-instance memory fallback: Redis down, expired or on another instance meant the stitch was billed again
-- (defect 44), and a waiver spent by a stitch that then crashed was never handed back.
--
-- The PAYMENT itself is already durable: the film's debit is taken under a ref derived from the film's status token
-- (`filmpay:<token>`, lib/chat/filmBilling.ts), so the ledger alone says whether the film was paid and how much of it is
-- still held. This table holds what the ledger cannot: how many stitches the payment still covers, and which in-flight
-- stitch is using one right now.
--
--   kind 'paid' → 2 waivers (the stitch + one lip-sync / composite re-stitch, as before); kind 'free' → 1 waiver.
--   lease_film_waiver  — one statement: hands a waiver to ONE in-flight stitch for p_lease_sec (> the route's 600 s
--                        maxDuration). A concurrent stitch of the same film gets 'busy'; a crashed one's lease expires and
--                        the waiver can be leased again — nothing is ever spent by a stitch that did not deliver.
--   settle_film_waiver — spends the leased waiver when the master was delivered, hands it back otherwise; only the
--                        holder of the lease can settle it.
--   record_film_billing — written by the film start; a 'paid' row must match a debit in the ledger under its ref.
--
-- R3-A (added 2026-10-15 on the owner's word, decision card 10:16Z "კი, დაუბრუნე"): a scene Google ACCEPTED and then
-- failed (a safety refusal, an error, a finished operation with no video) is given back, once, on the server's own word.
--   film_scenes          — written by the film start: each queued Veo scene's operation name and its share of the price
--                          (floor(quote / scenes), the dispatch refund's share). Never taken from the client's token.
--   record_film_scenes   — only for a recorded PAID film; the shares together never exceed what the film still holds.
--   pending_film_scenes  — the scenes nobody has settled yet (the server re-asks Google about exactly these).
--   settle_film_scene    — 'failed' (Google's terminal verdict, checked by the server) gives the share back under
--                          `filmpay:<token>:refund:scene:<n>`, capped by the film's net debit; anything else keeps it.
--                          Each scene settles once; a film's settlements serialise on its billing row.
-- Delivered scenes, failed stitches and QC failures are unchanged (docs/handoffs/video-core/R3_REFUND_MATRIX.md).
--
-- Written and read ONLY by service_role (RLS on, no policies, no grants to anon/authenticated). Additive only: two tables,
-- six functions. Nothing existing is altered. Verified on a throwaway Postgres 16 + PostgREST
-- (scripts/lease-isolation/run.sh → lib/chat/filmBilling.pg.test.ts, lib/chat/filmSceneRefund.pg.test.ts).
--
-- Rollback (the code then falls back to the ledger + Redis cache and STOPS SAFELY, never bills twice; a failed scene is
-- then simply not given back, as before R3-A):
--   drop function public.settle_film_scene(uuid, text, integer, boolean);
--   drop function public.pending_film_scenes(uuid, text);
--   drop function public.record_film_scenes(uuid, text, jsonb);
--   drop table public.film_scenes;
--   drop function public.settle_film_waiver(uuid, text, text, boolean);
--   drop function public.lease_film_waiver(uuid, text, text, integer);
--   drop function public.record_film_billing(uuid, text, text, integer, text);
--   drop table public.film_billing;

begin;

create table if not exists public.film_billing (
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- lib/chat/filmStatusStore deriveFilmTokenId: 'f' + 16 hex.
  token_id      text not null check (token_id ~ '^f[0-9a-f]{16}$'),
  kind          text not null check (kind in ('paid', 'free')),
  credits       integer not null default 0 check (credits >= 0),
  charge_ref    text check (charge_ref is null or char_length(charge_ref) between 1 and 200),
  waivers_total smallint not null check (waivers_total between 1 and 2),
  waivers_used  smallint not null default 0 check (waivers_used >= 0 and waivers_used <= waivers_total),
  lease_id      text check (lease_id is null or char_length(lease_id) between 1 and 64),
  lease_until   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, token_id)
);

alter table public.film_billing enable row level security;
revoke all on table public.film_billing from public, anon, authenticated;
grant select, insert, update, delete on table public.film_billing to service_role;

-- true = recorded now; false = this film was already recorded (a replay — the first record stands, unchanged).
create or replace function public.record_film_billing(p_user uuid, p_token text, p_kind text, p_credits integer, p_ref text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted boolean;
begin
  if p_user is null or p_token is null or p_token !~ '^f[0-9a-f]{16}$' then
    raise exception 'invalid_film_token' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('paid', 'free') then
    raise exception 'invalid_film_kind' using errcode = '22023';
  end if;
  if p_credits is null or p_credits < 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  -- A paid film is the ledger's word, not the caller's: its debit must exist under its ref.
  if p_kind = 'paid' and (p_ref is null or not exists (
    select 1 from public.credit_ledger where user_id = p_user and metadata->>'ref' = p_ref and delta < 0
  )) then
    raise exception 'film_charge_not_found' using errcode = 'P0001';
  end if;

  insert into public.film_billing (user_id, token_id, kind, credits, charge_ref, waivers_total)
  values (p_user, p_token, p_kind, p_credits, p_ref, case when p_kind = 'paid' then 2 else 1 end)
  on conflict (user_id, token_id) do nothing
  returning true into inserted;
  return coalesce(inserted, false);
end;
$$;

-- 'leased:paid' / 'leased:free' — this stitch holds a waiver until it settles or the lease expires;
-- 'busy'  — another stitch of this film holds the only free waiver right now;
-- 'spent' — every waiver this film's payment covers has been delivered;
-- 'none'  — no record for this (user, film).
create or replace function public.lease_film_waiver(p_user uuid, p_token text, p_lease_id text, p_lease_sec integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.film_billing%rowtype;
begin
  if p_user is null or p_token is null or p_token !~ '^f[0-9a-f]{16}$' then
    raise exception 'invalid_film_token' using errcode = '22023';
  end if;
  if p_lease_id is null or char_length(p_lease_id) not between 1 and 64 then
    raise exception 'invalid_lease' using errcode = '22023';
  end if;
  if p_lease_sec is null or p_lease_sec not between 60 and 3600 then
    raise exception 'invalid_lease_window' using errcode = '22023';
  end if;

  -- One statement: two concurrent stitches serialise on the row lock, and the loser re-reads a live lease and updates
  -- nothing (READ COMMITTED re-checks the WHERE on the new row version).
  update public.film_billing f
     set lease_id = p_lease_id, lease_until = now() + make_interval(secs => p_lease_sec), updated_at = now()
   where f.user_id = p_user and f.token_id = p_token
     and f.waivers_used < f.waivers_total
     and (f.lease_until is null or f.lease_until <= now())
  returning * into r;
  if found then
    return 'leased:' || r.kind;
  end if;

  select * into r from public.film_billing where user_id = p_user and token_id = p_token;
  if not found then
    return 'none';
  end if;
  if r.waivers_used >= r.waivers_total then
    return 'spent';
  end if;
  return 'busy';
end;
$$;

-- true = settled (spent on delivery, handed back otherwise); false = the caller does not hold this lease any more.
create or replace function public.settle_film_waiver(p_user uuid, p_token text, p_lease_id text, p_delivered boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  done boolean;
begin
  update public.film_billing f
     set waivers_used = case when p_delivered is true then least(f.waivers_used + 1, f.waivers_total) else f.waivers_used end,
         lease_id = null, lease_until = null, updated_at = now()
   where f.user_id = p_user and f.token_id = p_token and f.lease_id = p_lease_id
  returning true into done;
  return coalesce(done, false);
end;
$$;

revoke execute on function public.record_film_billing(uuid, text, text, integer, text) from public, anon, authenticated;
revoke execute on function public.lease_film_waiver(uuid, text, text, integer) from public, anon, authenticated;
revoke execute on function public.settle_film_waiver(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_film_billing(uuid, text, text, integer, text) to service_role;
grant execute on function public.lease_film_waiver(uuid, text, text, integer) to service_role;
grant execute on function public.settle_film_waiver(uuid, text, text, boolean) to service_role;

-- ── R3-A: a scene Google failed, given back on the server's word ─────────────────────────────────────────────────────

create table if not exists public.film_scenes (
  user_id    uuid not null,
  token_id   text not null,
  ordinal    smallint not null check (ordinal between 0 and 63),
  -- The Veo operation the start dispatched (Vertex `projects/…` or Gemini `models/…`): the only thing the server re-asks.
  operation  text not null check (char_length(operation) between 1 and 512),
  credits    integer not null check (credits >= 0),
  state      text not null default 'queued' check (state in ('queued', 'kept', 'refunded')),
  refunded   integer not null default 0 check (refunded >= 0 and refunded <= credits),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, token_id, ordinal),
  constraint film_scenes_film_fkey foreign key (user_id, token_id)
    references public.film_billing (user_id, token_id) on delete cascade
);

alter table public.film_scenes enable row level security;
revoke all on table public.film_scenes from public, anon, authenticated;
grant select, insert, update, delete on table public.film_scenes to service_role;

-- The number of scenes recorded now (a replay records nothing; the first record stands).
create or replace function public.record_film_scenes(p_user uuid, p_token text, p_scenes jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.film_billing%rowtype;
  s jsonb;
  n integer := 0;
begin
  if p_user is null or p_token is null or p_token !~ '^f[0-9a-f]{16}$' then
    raise exception 'invalid_film_token' using errcode = '22023';
  end if;
  if p_scenes is null or jsonb_typeof(p_scenes) <> 'array' or jsonb_array_length(p_scenes) not between 1 and 64 then
    raise exception 'invalid_scenes' using errcode = '22023';
  end if;
  select * into f from public.film_billing where user_id = p_user and token_id = p_token for update;
  if not found or f.kind <> 'paid' or f.charge_ref is null then
    raise exception 'film_not_paid' using errcode = 'P0001';
  end if;

  for s in select value from jsonb_array_elements(p_scenes) loop
    if jsonb_typeof(s -> 'ordinal') <> 'number' or jsonb_typeof(s -> 'credits') <> 'number'
       or jsonb_typeof(s -> 'operation') <> 'string' then
      raise exception 'invalid_scenes' using errcode = '22023';
    end if;
    insert into public.film_scenes (user_id, token_id, ordinal, operation, credits)
    values (p_user, p_token, (s ->> 'ordinal')::smallint, s ->> 'operation', (s ->> 'credits')::integer)
    on conflict (user_id, token_id, ordinal) do nothing;
    if found then
      n := n + 1;
    end if;
  end loop;

  -- The shares can never give back more than the film still holds after its dispatch refund.
  if (select coalesce(sum(credits), 0) from public.film_scenes where user_id = p_user and token_id = p_token) > f.credits then
    raise exception 'scene_credits_exceed_film' using errcode = 'P0001';
  end if;
  return n;
end;
$$;

-- [{ordinal, operation}] of the scenes not settled yet, in order; [] when there are none (or no such film).
create or replace function public.pending_film_scenes(p_user uuid, p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('ordinal', s.ordinal, 'operation', s.operation) order by s.ordinal), '[]'::jsonb)
    from public.film_scenes s
   where s.user_id = p_user and s.token_id = p_token and s.state = 'queued';
$$;

-- The credits given back now: the scene's share (capped by what the film's charge still holds) when p_failed, else 0.
-- 0 too when the scene is unknown or already settled — a scene settles exactly once.
create or replace function public.settle_film_scene(p_user uuid, p_token text, p_ordinal integer, p_failed boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.film_billing%rowtype;
  sc public.film_scenes%rowtype;
  held integer;
  amount integer := 0;
begin
  if p_user is null or p_token is null or p_ordinal is null or p_failed is null then
    raise exception 'invalid_scene' using errcode = '22023';
  end if;
  -- Every settlement of one film serialises here, so two shares can never both read the same remaining balance.
  select * into f from public.film_billing where user_id = p_user and token_id = p_token for update;
  if not found or f.kind <> 'paid' or f.charge_ref is null then
    return 0;
  end if;
  select * into sc from public.film_scenes
   where user_id = p_user and token_id = p_token and ordinal = p_ordinal for update;
  if not found or sc.state <> 'queued' then
    return 0;
  end if;

  if p_failed then
    -- What the film's charge still holds: its debit minus every credit-back taken under it (`<ref>:…`).
    select coalesce(sum(-l.delta) filter (where l.delta < 0 and l.metadata ->> 'ref' = f.charge_ref), 0)
         - coalesce(sum(l.delta) filter (where l.delta > 0
                                           and left(l.metadata ->> 'ref', char_length(f.charge_ref) + 1) = f.charge_ref || ':'), 0)
      into held
      from public.credit_ledger l
     where l.user_id = p_user
       and (l.metadata ->> 'ref' = f.charge_ref or left(l.metadata ->> 'ref', char_length(f.charge_ref) + 1) = f.charge_ref || ':');
    amount := greatest(0, least(sc.credits, coalesce(held, 0)));
    if amount > 0 then
      perform public.refund_credits(p_user, amount, f.charge_ref || ':refund:scene:' || p_ordinal);
    end if;
  end if;

  update public.film_scenes
     set state = case when p_failed then 'refunded' else 'kept' end, refunded = amount, settled_at = now()
   where user_id = p_user and token_id = p_token and ordinal = p_ordinal;
  return amount;
end;
$$;

revoke execute on function public.record_film_scenes(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.pending_film_scenes(uuid, text) from public, anon, authenticated;
revoke execute on function public.settle_film_scene(uuid, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.record_film_scenes(uuid, text, jsonb) to service_role;
grant execute on function public.pending_film_scenes(uuid, text) to service_role;
grant execute on function public.settle_film_scene(uuid, text, integer, boolean) to service_role;

commit;
