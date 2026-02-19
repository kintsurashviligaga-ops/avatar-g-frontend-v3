# Avatar G Deploy & Verification Runbook (2026-02-16)

## Scope of this rollout
This runbook validates the latest workspace/app-shell + unified jobs/outputs implementation.

### Key delta artifacts
- `supabase/migrations/20260216_auth_profiles.sql`
- `supabase/migrations/20260216_service_jobs_outputs.sql`
- `app/workspace/workspace-client.tsx`
- `app/(app)/services/page.tsx`
- `app/(app)/shop/page.tsx`
- `app/(app)/billing/page.tsx`
- `app/api/app/**`

---

## 1) Supabase migration apply order
Apply only the missing delta migrations below (in this order):

1. `supabase/migrations/20260216_auth_profiles.sql`
2. `supabase/migrations/20260216_service_jobs_outputs.sql`

### SQL preflight (run once before #2)
`20260216_service_jobs_outputs.sql` uses `public.update_updated_at_column()`.
If your DB does not already have it, create it first:

```sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### SQL post-checks
```sql
-- tables
select to_regclass('public.service_jobs') as service_jobs,
       to_regclass('public.service_outputs') as service_outputs,
       to_regclass('public.profiles') as profiles;

-- policies
select schemaname, tablename, policyname
from pg_policies
where tablename in ('service_jobs', 'service_outputs', 'profiles')
order by tablename, policyname;

-- storage bucket
select id, name, public
from storage.buckets
where id = 'avatar-g-outputs';
```

---

## 2) Required env vars (Vercel + local)
Minimum required for this rollout to work safely:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_AUTH_REDIRECT_URL`
- `NEXT_PUBLIC_APP_URL`
- `WORKER_INTERNAL_TOKEN` (required by `/api/app/worker/tick`)

If Stripe flows are enabled in this environment:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_BASE_URL`

---

## 3) Supabase Auth settings
In Supabase Dashboard:

- Enable providers used in app auth UI:
  - GitHub OAuth
  - Email
  - Phone (optional toggle via `NEXT_PUBLIC_SUPABASE_PHONE_AUTH_ENABLED`)
- Add redirect URL(s):
  - `<SITE_URL>/auth/callback`
- Ensure site URL matches your deployment URL.

---

## 4) 5-minute smoke test

### A. Auth + protected routing
1. Open `/auth`.
2. Sign in.
3. Verify redirect reaches `/workspace`.
4. Confirm unauthenticated access to `/workspace` redirects to `/auth`.

### B. Unified jobs flow
1. Open `/services` then a service detail page (e.g. `/services/avatar-builder`).
2. Submit a prompt.
3. Verify:
   - job appears in `/jobs`
   - output appears in `/library`
   - `/workspace` recent activity/outputs populate

### C. Reliability endpoint
Use `POST /api/app/worker/tick` with header `x-internal-worker-token: <WORKER_INTERNAL_TOKEN>`.
Expected: JSON with `ok`, `scanned`, `recycled`, `dead_lettered`.

### D. Shop/Billing integration
- `/shop`: confirms orders, affiliate profile, and connect status load from live APIs.
- `/billing`: confirms current plan badge and checkout session creation path.

---

## 5) Current known blocker (outside this rollout scope)
Project-wide `npm run typecheck` still fails due pre-existing strict typing debt (`TS7006`, `TS18046`) in legacy admin/affiliate/finance API routes.

Examples:
- `app/api/admin/affiliates/route.ts`
- `app/api/admin/analytics/route.ts`
- `app/api/admin/payouts/eligible/route.ts`
- `app/api/affiliate/*`

This rollout’s touched files compile cleanly via scoped diagnostics.

---

## 6) Rollback plan
If rollout must be rolled back quickly:

1. Revert app-shell route changes in `app/(app)/*` and `app/workspace/workspace-client.tsx`.
2. Keep migrations in DB (safe additive schema), but disable usage by restoring previous routes.
3. Re-deploy previous stable commit.
