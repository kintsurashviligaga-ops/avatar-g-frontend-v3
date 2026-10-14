# 10 — Preview verification and isolation

## What a Preview is today

- Vertex identity: **works** (build log 2026-10-14T14:30:38Z: `[gcp-auth-check] env=preview … ok=true mode:wif token:ok bucket:ok sign:ok`).
- Database: Preview env points at the **Production Supabase project** (recorded by the Music Studio session 2026-10-14; values are
  not readable here, only names). Therefore no studio flag was enabled on any Preview and no Preview E2E touched data.

## What was done on a Preview

Only a **build-time** provider check (no runtime, no database): Preview deployment of 95432a2b — 4 live Google calls (09). The
deployed app itself was not exercised.

## Why "live Preview E2E" is NOT complete

The brief's condition — "the same deployed application uses isolated data and real provider transport" — is not met.

## Options to unblock (owner decision)

| Option | Cost | Action |
|---|---|---|
| A. Supabase **branching** / a second Supabase project for Preview | Supabase charges per project/branch (Pro plan compute add-on ≈ USD 10/month per extra project at the smallest size — verify on the owner's plan) | create project, apply migrations, set Preview-only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` rows in Vercel |
| B. Self-hosted Supabase on an existing machine reachable from Vercel | no new bill if hardware exists | tunnel + env rows; operationally fragile |
| C. Keep isolated E2E in CI (local Supabase + stand-in / replayed provider bytes) and do one owner-supervised Production canary per studio with flags limited to the admin allowlist | none | already the de-facto process |

No new billable resource was created. Recommended: **A** (cleanest), else **C** with explicit owner supervision.
