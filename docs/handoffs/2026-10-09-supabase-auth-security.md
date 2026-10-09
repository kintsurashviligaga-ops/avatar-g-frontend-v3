# Supabase Auth, Admin Access and Security review — 2026-10-09

Supabase Production project `zwksnayknzggdcenqqxy` (Postgres 17, ap-southeast-1). Production serves 29e7d67 (PR #49).
Requested by GG 2026-10-09 11:50Z. Branch `claude/supabase-auth-security-lzgqlz`, stacked on `claude/launch-certification-wmvitt`.

Labels: PROVEN (checked live today), BUILT_NOT_PROVEN, PARTIAL, MISSING, BLOCKED_OWNER. Nothing here is called Production Ready.

## How it was checked (what this session can reach)

| Route | Reach |
|---|---|
| Supabase connector: SQL, advisors, logs | Works on Production (read-only queries; role probes inside a transaction). |
| GoTrue public `GET /auth/v1/settings` (publishable key) | Works from GG's Mac (the cloud sandbox proxy blocks `*.supabase.co`). |
| Supabase Management API (`/v1/projects/{ref}/config/auth`) | **Not reachable**: no access token exists in the sandbox or on the Mac (no Supabase CLI login). Site URL, Redirect URLs, SMTP, OTP length/expiry, leaked-password toggle cannot be read or changed by Claude. |
| Vercel CLI on GG's Mac | Works for `vercel dns ls` (read-only). |
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
| Site URL / Redirect URLs | BLOCKED_OWNER (cannot read) | Management API not reachable. Google callbacks to myavatar.ge succeed, so Production's own URL is allowed. Check list below. |
| Custom SMTP | BLOCKED_OWNER (cannot read) | The app sends its own codes through Resend; Supabase's mailer is used only by the admin sign-in screen's "forgot password" (`components/auth/AuthScreen.tsx` → `resetPasswordForEmail`) and Supabase system mails. |
| Users | PROVEN (read-only counts) | 22 users: 16 email+password, 6 Google; 4 unconfirmed, none newer than 7 days, none ever signed in; 0 banned, 0 anonymous, 0 MFA. |

**Confirm email impact check (done before any change; no change needed):** the setting is already ON. Code paths agree with it:
`register` creates an UNCONFIRMED account and mails a code (`lib/auth/otpEmail.ts`), `verifyOtp` confirms it; Google sign-ins are confirmed by Google; the admin rule only matches a confirmed email (`verifiedEmail()` in `lib/auth/adminGuard.ts`). The 4 unconfirmed accounts cannot sign in with a password and cannot match the admin list.

### 2. Security Advisor (11:52Z)

0 errors. 2 warnings, 23 info.

| Finding | Decision |
|---|---|
| WARN Leaked password protection disabled | **BLOCKED_OWNER**: dashboard-only toggle, and Supabase offers it only on the Pro plan and above (docs: auth/password-security). Steps below. |
| WARN `vector` extension in `public` | **No change (accepted)**. One column and one function use it; moving it is a DB migration that can break that function's type lookup, and the RAG path it serves is off. Not worth the risk now; revisit with the RAG work. |
| INFO 23× RLS enabled, no policy | **Intended**: service-role-only tables (admin_emails, director_runs, voice_calls, …). Anon and a signed-in stranger read 0 rows from them (§5). |

### 3. Leaked password protection — impact and rollback

- Effect: new passwords and password changes that appear in HaveIBeenPwned are rejected. Existing sessions and Google sign-ins are unaffected.
- Rollback: the same toggle off.
- Could not be applied by Claude (no Management API token, dashboard only).

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

**PROVEN root cause: `myavatar.ge` has no mail DNS records at all.**

- DNS for `myavatar.ge` is served by Vercel (`ns1/ns2.vercel-dns.com`).
- `vercel dns ls myavatar.ge` (11:5xZ): only CAA records and two ALIAS records for the website. No TXT, no MX.
- `dig`: no MX or TXT on `myavatar.ge`, nothing on `send.myavatar.ge`, no `resend._domainkey.myavatar.ge`, no `_dmarc`.
- The app sends from `MyAvatar <info@myavatar.ge>` (`MAIL_FROM` default, `app/api/auth/email-otp/send/route.ts:23`). Resend refuses a sender whose domain is not verified → 403 → the route answers 502 → no code reaches the person. Supabase itself generates the code fine (§1).

Owner action needed (Claude has no Resend account access): add the domain in Resend to get its unique DKIM key. The DNS part can then be done by Claude through the Vercel CLI on GG's Mac, if GG pastes the records Resend shows (they are public values, not secrets).

## Owner actions (exact)

1. **Resend domain (launch blocker AUTH-2).**
   Open https://resend.com/domains → **Add Domain** → `myavatar.ge` → Add.
   Resend shows 3–4 records: an MX and a TXT (SPF) on `send`, a TXT on `resend._domainkey`, optionally `_dmarc`.
   Either paste those rows in the thread (Claude adds them to Vercel DNS), or add them yourself at
   https://vercel.com/kintsurashviligaga-ops-projects/~/domains/myavatar.ge → Add Record, exactly as Resend shows.
   Then press **Verify** in Resend. Expected: status "Verified" within minutes to an hour. Then a code sign-in on https://myavatar.ge/ka delivers mail.
   Rollback: delete those DNS records (they do not touch the website records).
2. **Leaked password protection.** https://supabase.com/dashboard/project/zwksnayknzggdcenqqxy/auth/attack-protection → "Prevent use of leaked passwords" → ON → Save.
   If the toggle is locked, the project is on the Free plan; the feature needs Pro (paid). Then it is your call: upgrade, or accept the warning.
3. **URL configuration check (read and send a photo, or fix):** https://supabase.com/dashboard/project/zwksnayknzggdcenqqxy/auth/url-configuration
   Site URL `https://myavatar.ge`. Redirect URLs should contain `https://myavatar.ge/**` and, for Google sign-in on the cert Preview,
   `https://avatar-g-frontend-v3-git-ef1fad-kintsurashviligaga-ops-projects.vercel.app/**`. No bare `*` wildcard.
4. **Optional:** turn GitHub sign-in off (0 users use it): https://supabase.com/dashboard/project/zwksnayknzggdcenqqxy/auth/providers → GitHub → off. Effect: the GitHub button disappears; rollback: on.
5. **Optional, after step 1:** Supabase custom SMTP through Resend (Authentication → Emails → SMTP Settings: host `smtp.resend.com`, port 465, user `resend`, password = a Resend API key, sender `info@myavatar.ge`), so the admin "forgot password" mail is not limited by Supabase's default mailer.

## Tests run

- `npx jest` full: 713/713 suites, 10,942 tests passed (3 skipped).
- `npx tsc --noEmit`: clean. eslint on changed files: clean.
- Focused: auth, admin and security suites 26/26.
- Live probes listed in §4 (anonymous) and §5 (role probes). Production logs read: Supabase auth and audit logs (last 24 h). Vercel runtime logs not read (connector 403; CLI not needed for this finding).

## Lines for PROJECT_MASTER.md and the launch certification

See the coordinator message sent with this report (Master Task thread owns those files).
