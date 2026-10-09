# Supabase Auth, Admin Access and Security review — 2026-10-09

Supabase Production project `zwksnayknzggdcenqqxy` (Postgres 17, ap-southeast-1). Production serves 29e7d67 (PR #49).
Requested by GG 2026-10-09 11:50Z. Branch `claude/supabase-auth-security-lzgqlz`, stacked on `claude/launch-certification-wmvitt`.

Labels: PROVEN (checked live today), BUILT_NOT_PROVEN, PARTIAL, MISSING, BLOCKED_OWNER. Nothing here is called Production Ready.

## How it was checked (what this session can reach)

| Route | Reach |
|---|---|
| Supabase connector: SQL, advisors, logs | Works on Production (read-only queries; role probes inside a transaction). |
| GoTrue public `GET /auth/v1/settings` (publishable key) | Works from GG's Mac (the cloud sandbox proxy blocks `*.supabase.co`). |
| Supabase Management API (`/v1/projects/{ref}/config/auth`) | **Not reachable**: the `SUPABASE_ACCESS_TOKEN` kept in the Mac checkout's `.env.local` and `.vercel/.env.production.local` answers 401 „Invalid access token" (checked 12:47Z, value never printed); no Supabase CLI login. Site URL, Redirect URLs, SMTP, OTP length/expiry, leaked-password toggle cannot be read or changed by Claude. |
| Vercel CLI on GG's Mac | Works for `vercel dns ls/add`, and `vercel logs --environment production` reads runtime logs. `vercel env run -e production` hands `RESEND_API_KEY` over **empty** (protected value), so the Resend API cannot be called from here. |
| Chrome on GG's Mac | **Read-only** (computer use grants browsers screenshot access only; no clicks or typing, no Claude-in-Chrome in this thread). |
| `myavatar.ge` HTTP | Works from GG's Mac (sandbox blocked). |

No Production configuration, user, row, table or policy was changed. No secret was printed.

## Results

### 1. Auth configuration

| Item | Status | Evidence |
|---|---|---|
| Confirm email | **PROVEN ON** | `/auth/v1/settings` → `"mailer_autoconfirm": false` (11:5xZ). Nothing to change. |
| Sign-ups open | PROVEN | `"disable_signup": false`. |
| Email provider | PROVEN on | `external.email: true`. |
| Google OAuth | **PROVEN working** | `external.google: true`; auth logs 2026-10-08: 8× `/authorize` 302 → 8× `/callback` 302, `Login` events; 8 Google identities. |
| GitHub OAuth | PROVEN **enabled, unused** | `external.github: true`, 0 GitHub identities. The sign-in screen shows a GitHub button because it reads this flag. Recommendation below (owner, optional). |
| Anonymous sign-ins | PROVEN off | `anonymous_users: false`. |
| Email OTP code generation | **PROVEN working** | auth logs: 14× `/admin/generate_link` 200 (last 2026-10-08 14:42Z). AUTH-1 (6-digit check) is fixed and live since 9f1bff6. |
| Email OTP delivery | **BLOCKED_OWNER** | see §6. |
| Site URL | **PROVEN** `https://myavatar.ge` | GG's dashboard photo, 2026-10-09 12:43Z. |
| Redirect URLs | **PARTIAL** | Photo: `https://myavatar.ge/**`, `http://localhost:3000/**`, the PR #43 Preview alias `…-git-22ebb4-…/**`. No bare `*`. **Missing:** the cert Preview alias `https://avatar-g-frontend-v3-git-ef1fad-kintsurashviligaga-ops-projects.vercel.app/**` (Google sign-in on that Preview falls back to the Site URL). Additive fix, owner action 3. |
| Custom SMTP | BLOCKED_OWNER (cannot read) | The app sends its own codes through Resend; Supabase's mailer is used only by the admin sign-in screen's "forgot password" (`components/auth/AuthScreen.tsx` → `resetPasswordForEmail`) and Supabase system mails. |
| Users | PROVEN (read-only counts) | 22 users: 16 email+password, 6 Google; 4 unconfirmed, none newer than 7 days, none ever signed in; 0 banned, 0 anonymous, 0 MFA. |

**Confirm email impact check (done before any change; no change needed):** the setting is already ON. Code paths agree with it:
`register` creates an UNCONFIRMED account and mails a code (`lib/auth/otpEmail.ts`), `verifyOtp` confirms it; Google sign-ins are confirmed by Google; the admin rule only matches a confirmed email (`verifiedEmail()` in `lib/auth/adminGuard.ts`). The 4 unconfirmed accounts cannot sign in with a password and cannot match the admin list.

### 2. Security Advisor (11:52Z)

0 errors. 2 warnings, 23 info.

| Finding | Decision |
|---|---|
| WARN Leaked password protection disabled | **BLOCKED_OWNER**: dashboard-only toggle (Claude has no Management API token and read-only browser access). Supabase offers it on Pro and above; GG's dashboard shows the organization on **Pro**, so it should switch on without an upgrade. Never upgrade for it. Steps below. |
| WARN `vector` extension in `public` | **No change (accepted)**. One column and one function use it; moving it is a DB migration that can break that function's type lookup, and the RAG path it serves is off. Not worth the risk now; revisit with the RAG work. |
| INFO 23× RLS enabled, no policy | **Intended**: service-role-only tables (admin_emails, director_runs, voice_calls, …). Anon and a signed-in stranger read 0 rows from them (§5). |

### 3. Leaked password protection — impact and rollback

- Effect: new passwords and password changes that appear in HaveIBeenPwned are rejected. Existing sessions and Google sign-ins are unaffected.
- Rollback: the same toggle off.
- Could not be applied by Claude (no Management API token, dashboard only, browser read-only).

### 4. Admin access (one rule)

| Check | Status | Evidence |
|---|---|---|
| One rule for page + APIs | PROVEN in code, live since PR #45 (9f1bff6) | `isAdminIdentity()`: `app_metadata` role, or a **confirmed** email on code ∪ `ADMIN_EMAILS` ∪ panel-granted list (fails closed). `user_metadata` never counts. |
| Admin accounts | PROVEN (read-only) | 2 accounts match: the founder address (confirmed, signed in 2026-10-08) and 1 panel-granted address (confirmed). 0 `app_metadata` roles. The second built-in address has no account (cannot be claimed without its inbox, since Confirm email is ON). |
| Anonymous caller is refused | **PROVEN live** (from GG's Mac, 11:5xZ) | `/api/admin/users` 403, `/stats` 401, `/admins` 403, `/financials` 401, `/payments` 401, `/flags` 403, `/credits` 404; `run-migration` GET and POST with a wrong key 404; forged auth cookie on `/users` 403; `/ka/admin` renders the login screen. |
| Signed-in non-admin is refused | BUILT_NOT_PROVEN live (unit-proven) | `lib/admin/adminGate.test.ts`, admin route tests. A live probe needs a normal test account (best on the cert Preview). |
| Admin can sign in | PROVEN | founder account last sign-in 2026-10-08; refresh tokens rotate hourly in the audit log. |

### 5. RLS, Storage, sessions, service role

| Check | Status | Evidence |
|---|---|---|
| Table RLS | **PROVEN (re-run)** | 52/52 public tables RLS on. As `anon`: 0 rows visible across all 52. As a signed-in stranger (`authenticated`, random uid): 0 rows across all 52. |
| SECURITY DEFINER functions | PROVEN | 31 functions; none executable by `anon` or `authenticated`; all have a fixed `search_path`. |
| Storage | PROVEN | Policies: public read only on `music`; service-role insert/update on `music`. Buckets public: `avatars`, `music`; private: `renders` (since 20261009b), `uploads`, `studio`, `twins`, `fonts`. |
| Auth sessions | PROVEN (read-only) | 44 sessions, 38 idle > 30 days, no timebox or inactivity timeout set. Refresh-token failures in logs are ordinary `refresh_token_not_found`. Optional owner setting below. |
| Service role in browser code | PROVEN (static) | New guard `lib/security/serverAuthBoundary.test.ts`: no `SUPABASE_SERVICE_ROLE_KEY` / `createServiceRoleClient` in `components/`, `hooks/` or any `'use client'` file; no `NEXT_PUBLIC_*SECRET*`/`*SERVICE_ROLE*`; `lib/supabase/server.ts` is `server-only`. |
| Server identity check | **FIXED (BUILT_NOT_PROVEN until deploy)** | `app/api/avatar/generate` decided the caller with `auth.getSession()` (cookie only, not validated). Now `auth.getUser()`. Low impact before the fix (its writes go through RLS with the user's JWT), but it was the only route doing this. Guard test blocks it from coming back. |

### 6. Why Production Email OTP does not arrive

**PROVEN root cause: `myavatar.ge` has no mail DNS records at all, so Resend has never verified the domain.**

- Resend (GG's photo, 12:43Z): `myavatar.ge` is added, status **Not Started**.
- Production has a Resend key: a 12:48Z probe reached Resend (Vercel log: `[email-otp/send] resend 422`, Resend refusing an `example.com` recipient), not the route's `503 mail_not_configured`.

- DNS for `myavatar.ge` is served by Vercel (`ns1/ns2.vercel-dns.com`).
- `vercel dns ls myavatar.ge` (11:5xZ): only CAA records and two ALIAS records for the website. No TXT, no MX.
- `dig`: no MX or TXT on `myavatar.ge`, nothing on `send.myavatar.ge`, no `resend._domainkey.myavatar.ge`, no `_dmarc`.
- The app sends from `MyAvatar <info@myavatar.ge>` (`MAIL_FROM` default, `app/api/auth/email-otp/send/route.ts:23`). Resend refuses a sender whose domain is not verified → 403 → the route answers 502 → no code reaches the person. Supabase itself generates the code fine (§1).

The DKIM key is unique to the domain and only Resend shows it. Claude cannot read it (no Resend login, browser read-only, key not retrievable), so GG opens the domain page and pastes the DKIM value; Claude adds all records with the Vercel CLI (additive only, website records untouched) and checks propagation; GG presses Verify.

### 7. Log-in by code created accounts for unknown addresses (found and fixed 2026-10-09)

- **Found live:** the 12:48Z probe asked `/api/auth/email-otp/send` for a **sign-in** code for an address with no account. The code comment and the unit test assumed GoTrue answers „user not found"; GoTrue instead turns a magiclink for an unknown address into a sign-up and **created an unconfirmed user** (plus its `profiles` row from the signup trigger). No mail went out.
- **Impact before the fix:** the sign-in sheet asks `/api/auth/lookup` first, so people were sent to sign-up; but any direct call (or a lookup answering `unknown`) left an unconfirmed account behind and never answered `no_account`.
- **Fix (PR #51, BUILT_NOT_PROVEN until deploy):** for `signin` the route asks `public.auth_account_status` first (`accountExists()` in `lib/auth/accountStatus.ts`) and answers `404 no_account` without calling Supabase Auth. If the database cannot answer it falls through as before. Tests: `app/api/auth/email-otp/send/route.test.ts`, `lib/auth/accountStatus.test.ts`.
- **The probe account:** GG chose „delete" on the card at 12:54:05Z. Deleted ~12:55Z with one guarded statement (that id, that address, unconfirmed, never signed in, created 12:48Z): 1 `auth.users` row + 1 `profiles` row. Users back to 22. Nothing else touched.

## Owner actions (exact)

1. **Resend domain (launch blocker AUTH-2).** The domain is already added (status Not Started).
   Open it in Resend (https://resend.com/domains → `myavatar.ge`) and paste the DKIM value (`resend._domainkey` row) in the thread.
   Claude adds the MX + SPF TXT on `send` and the DKIM TXT with `vercel dns add` (additive only) and checks propagation.
   Then press **Verify** in Resend. Expected: "Verified". Then a code sign-in on https://myavatar.ge/ka delivers mail.
   Rollback: `vercel dns rm` those record ids (they do not touch the website records).
2. **Leaked password protection.** Supabase dashboard → project → **Authentication → Attack Protection** (sidebar; the direct
   `/auth/attack-protection` URL given earlier answers 404) → "Prevent use of leaked passwords" → ON → Save.
   If it is locked or asks for an upgrade, skip it and say so: never upgrade for it.
3. **Redirect URL (additive):** Authentication → URL Configuration → Add URL →
   `https://avatar-g-frontend-v3-git-ef1fad-kintsurashviligaga-ops-projects.vercel.app/**` → Save. Site URL stays `https://myavatar.ge`.
4. **Optional:** turn GitHub sign-in off (0 users use it): https://supabase.com/dashboard/project/zwksnayknzggdcenqqxy/auth/providers → GitHub → off. Effect: the GitHub button disappears; rollback: on.
5. **Optional, after step 1:** Supabase custom SMTP through Resend (Authentication → Emails → SMTP Settings: host `smtp.resend.com`, port 465, user `resend`, password = a Resend API key, sender `info@myavatar.ge`), so the admin "forgot password" mail is not limited by Supabase's default mailer.

## Tests run

- `npx jest` full: 713/713 suites, 10,942 tests passed (3 skipped) on 40992a8; after the log-in fix and the cert-branch merge (ecfd611): **718/718 suites, 11,020 passed** (3 skipped).
- `npx tsc --noEmit`: clean. eslint on changed files: clean. `next build` (CI dummy env): passes, 207/207 pages.
- Playwright, full suite on the local production build (ecfd611): 238 passed, 10 skipped, 7 failed. None is from this branch:
  5× `live-voice-e2e` (the runner had no `PLAYWRIGHT_SUPABASE_URL`, so the fixture's session cookie named another project), `swarm-pipelines` produce-route check (expects the `next dev` bypass on a local URL), `ui-image` phone thumbnail (passes on `next dev`).
  Re-run on `next dev` with the matching env: `swarm-pipelines` + `ui-image` 18/18; `live-voice-e2e` 4/5, the fifth passed 3/3 alone (`--repeat-each 3`) and on the cert branch: a load flake, not a regression.
- Focused: auth, admin and security suites 19/19 (305 tests).
- Live probes listed in §4 (anonymous) and §5 (role probes). Production logs read: Supabase auth and audit logs (last 24 h). Vercel runtime logs not read (connector 403; CLI not needed for this finding).

## Lines for PROJECT_MASTER.md and the launch certification

See the coordinator message sent with this report (Master Task thread owns those files).
