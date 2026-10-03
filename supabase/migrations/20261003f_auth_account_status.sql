-- 20261003f_auth_account_status.sql — does an email or a phone number already have an account? (server only)
--
-- WHY: the sign-in sheet has separate „Log in" and „Sign up" now (owner, 2026-10-03), and an address that is already
-- registered must not register again — sign-up says „already registered — log in", and log-in says „no account —
-- create one" instead of asking for a password that does not exist. The auth admin API cannot look a user up by
-- email or phone without side effects (generateLink mints a fresh code, which would invalidate the one in the inbox),
-- so /api/auth/lookup asks this function. It READS auth.users and returns three facts, nothing else:
--   exists     — an account holds this address
--   confirmed  — the address was proved (an unconfirmed row is a sign-up nobody finished: treated as no account)
--   password   — true / false when the sheet set `user_metadata.password_set`; null for accounts made before it
--                (they may or may not have a password: the sheet offers both the password and a code)
--
-- ⚠️ SERVICE ROLE ONLY. A function in `public` is reachable through PostgREST by every role holding EXECUTE, and new
-- functions grant it to PUBLIC by default — that is how the anon key once minted credits (2026-09). EXECUTE is revoked
-- from public, anon and authenticated, and granted to service_role alone. The route that calls it is rate-limited per
-- IP and per address (lib/api/rate-limit AUTH_IP / OTP_ADDRESS).
--
-- APPLIED to production 2026-10-03 with the owner's OK (verified: anon / authenticated cannot execute, service_role
-- can; all 21 accounts resolve). On a database without it /api/auth/lookup answers `unknown` and the sheet degrades
-- by itself: log-in offers the password AND a code; sign-up is still refused for a registered address, because
-- /api/auth/email-otp/send (purpose `register`) gets `email_exists` from Supabase itself.
-- After applying: `node scripts/check-db-exposure.mjs`.

begin;

create or replace function public.auth_account_status(p_email text default null, p_phone text default null)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  -- GoTrue stores phone numbers in E.164 WITHOUT the leading „+".
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  u record;
begin
  if v_email is null and v_phone is null then
    return jsonb_build_object('exists', false, 'confirmed', false, 'password', null);
  end if;

  if v_email is not null then
    -- GoTrue keeps emails lower-cased, so the equality uses its unique index.
    select au.email_confirmed_at, au.phone_confirmed_at, au.raw_user_meta_data
      into u
      from auth.users au
     where au.email = v_email
       and au.deleted_at is null
     limit 1;
  else
    select au.email_confirmed_at, au.phone_confirmed_at, au.raw_user_meta_data
      into u
      from auth.users au
     where au.phone = v_phone
       and au.deleted_at is null
     limit 1;
  end if;

  if not found then
    return jsonb_build_object('exists', false, 'confirmed', false, 'password', null);
  end if;

  return jsonb_build_object(
    'exists', true,
    'confirmed', (u.email_confirmed_at is not null or u.phone_confirmed_at is not null),
    'password', case
      when u.raw_user_meta_data ? 'password_set' then (u.raw_user_meta_data ->> 'password_set') = 'true'
      else null
    end
  );
end;
$$;

revoke all on function public.auth_account_status(text, text) from public, anon, authenticated;
grant execute on function public.auth_account_status(text, text) to service_role;

comment on function public.auth_account_status(text, text) is
  'Server-only (service_role): does an email / phone have an account, is it confirmed, has the person set a password. Used by /api/auth/lookup.';

commit;

-- VERIFY (as the MCP / service role):
--   select public.auth_account_status('someone@example.com', null);        -- {"exists": false, …}
--   select has_function_privilege('anon', 'public.auth_account_status(text, text)', 'execute');           -- false
--   select has_function_privilege('authenticated', 'public.auth_account_status(text, text)', 'execute');  -- false
