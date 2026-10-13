# Video Core v1.0 — isolated Supabase test environment (CI E2E)

Status 2026-10-12 19:40Z. GG chose "CI ლოკალური" (19:01Z) and then asked for an owner-hands-off build (19:07Z). It is
built without anything from GG: **no Production schema dump and no `E2E_SCHEMA_KEY` secret are needed**. Production
(`zwksnayknzggdcenqqxy`) is not read, written or connected to by any part of it.

## მოკლედ (GG-სთვის)

- **რა არის:** GitHub Actions-ის workflow `.github/workflows/video-core-e2e-local.yml`. PR #58-ის ყოველ push-ზე runner-ზე
  ეშვება ერთჯერადი ლოკალური Supabase (Postgres 17, Auth, REST, Storage), მასზე ეწყობა სატესტო სქემა რეპოდან, ეშვება
  ამ ბრენჩის აპი (`next start`) და Playwright გადის რეალურ სცენარებს კომპიუტერის და iPhone 13-ის ეკრანზე.
- **შენგან არაფერია საჭირო.** სქემის dump და GitHub Secret აღარ მჭირდება: სქემა აწყობილია რეპოში უკვე არსებული,
  2026-10-10-ს Production-იდან მხოლოდ კითხვით აღებული სტრუქტურიდან (`scripts/lease-isolation/schema.sql`) და რეპოს
  მიგრაციებიდან.
- **საიდუმლოები:** ყველა გასაღები job-ის შიგნით იქმნება (`supabase start` თავის ლოკალურ გასაღებებს ქმნის, დანარჩენს
  `openssl rand`) და ლოგში დამალულია (`::add-mask::`). ისინი მხოლოდ იმ runner-ზე მუშაობს და job-თან ერთად ქრება.
- **Production-ის დაცვა (fail-closed):** ორჯერ მოწმდება — shell ნაბიჯში და `tests/video-core-live/guard.ts`-ში. თუ რომელიმე
  ბაზის მისამართი Production-ის პროექტს, `*.supabase.co`-ს ან სხვა მანქანას ასახელებს, job ჩერდება.
- **ფასიანი გამოძახება შეუძლებელია:** job-ში არცერთი AI პროვაიდერის გასაღები არ არსებობს. მონტაჟი FFmpeg-ია.

## How it works

| Step | What runs | Where |
|---|---|---|
| 1 | `supabase start --workdir e2e/video-core-live` (studio, realtime, edge runtime, analytics, mail off) | runner only |
| 2 | Keys from `supabase status -o env` + `openssl rand` quote/cron secrets → masked → `$GITHUB_ENV` | runner only |
| 3 | `supabase.video-core-e2e.test` → `1.2.3.4` in `/etc/hosts`; `1.2.3.4/32` added to the runner's `lo` | runner only |
| 4 | Fail-closed guard (shell) | runner only |
| 5 | `e2e/video-core-live/baseline/apply.sh` — Test Schema Baseline + `900_verify.sql` | local Postgres 17 |
| 6 | `scripts/check-db-exposure.mjs` with the local anon key | local stack |
| 7 | `npm run build`, `next start -p 3000` with `AGENT_G_MEDIA_EXEC=admin` | runner only |
| 8 | `npx playwright test -c playwright.video-core-live.config.ts` (global setup re-runs the guard in TypeScript) | runner only |
| 9 | Artifact `video-core-live-e2e` (results JSON, HTML report, evidence, decoded-frame data, server log; never the sign-in state) | GitHub |

A second job, `billing on real Postgres`, runs `scripts/lease-isolation/run.sh` (Postgres 16 + PostgREST): lease queue
crash recovery, retry exhaustion and refunds; the ledger's replay refusal before and after `20261002d`; multi-step runs
on real ffmpeg; the delivery outbox.

**Why the `.test` host.** The server's fetch of user media (`lib/web/publicFetch.ts`) refuses loopback and private
addresses, and that rule is not weakened for tests. The reserved `.test` name (RFC 6761) resolves to an address that
sits on the runner's own loopback device, so every connection stays on the runner while the shipped SSRF rule is
exercised as is.

## Test Schema Baseline (e2e/video-core-live/baseline)

1. `scripts/lease-isolation/schema.sql` — Production's `profiles`, `generation_jobs`, `credit_ledger`,
   `agent_evolution_traces` and `deduct_credits` / `refund_credits` / `update_credits_balance`, as read SELECT-only from
   Production on 2026-10-10 (role and `auth.users` stand-ins filtered out: Supabase provides the real ones).
2. `010_supabase_contract.sql` — the remaining profile columns, the trace table's full DDL, RLS and owner policies as
   Production has them, revoked client writes, the `renders` bucket row.
3. Repo migrations applied **verbatim**, in Production's order: `20260626b` analytics events, `20261001c` starter grant
   on confirmation, `20261001f` server-only job writes, `20261002d` ledger ref race hardening (`deduct_credits_once`),
   `20261003f` auth account status, `20261008c` upload limits, `20261008d` storage read scope, `20261009b` private
   renders.
4. `020_auth_triggers.sql` — `on_auth_user_created` and `on_auth_user_starter_balance` on `auth.users`.
5. `900_verify.sql` — fails the job unless: RLS on all five tables; `generation_jobs` has exactly the owner select and
   delete policies; the four money/auth RPCs are not executable by `anon`/`authenticated` and are by `service_role`; no
   client insert/update/delete on `profiles` or `credit_ledger`; the three ledger indexes exist; the three auth triggers
   exist; `uploads` is private with the 50 MiB limit and MIME allowlist; `renders` is private; no open `storage.objects`
   SELECT policy.

It covers what Video Core touches (auth, profiles, credits, jobs, traces, analytics, uploads, renders). It is **not** a
copy of the whole Production schema (125 tables + 11 RPCs exist in Production without a repo migration, see
`docs/handoffs/2026-10-08-production-schema-drift.md`), so features outside Video Core are not tested by this job.

## Why not the repo's migrations — the 114 / 35 finding (separate issue, not fixed here)

A replay of all 114 files in `supabase/migrations` on an empty Postgres (2026-10-12, head 357926b) gives 79 ok and 35
failures (`evidence/round3-final/migration-replay-fresh-db.tsv`):

- **Order/dependency (23):** objects created by a later or a missing migration, e.g. `20260214_avatar_g_saas.sql`
  (`column "cost_credits" does not exist`), so `credit_ledger` is never created and every billing migration after it
  fails (`20260521`, `20260802`, `20260802d`, `20260929a`, `20261001a`, `20261002d`); `shop_stores`, `seller_profiles`,
  `products`, `agent_definitions`, `messages`, `agent_g_tasks` likewise.
- **Broken files (3):** `006`, `014`, `015` contain a literal `========` banner → syntax error.
- **Duplicate object (1):** `002_music_video_schema.sql` (`relation "tracks" already exists`).
- **Self-verify refusals (6):** `20260807b`, `20261002a`, `20261003b`, `20261003d`, `20261003e`, `20261009a` stop on
  their own `VERIFY FAILED` checks because the objects they expect came from failed files.
- **Environment (2):** `20260517_memories`, `20260601_rag_corpus` need `pgvector` (absent on the local test cluster).
- In addition, 14 version prefixes are shared by several files (`001` ×3, `20260802` ×8 …), so `supabase db reset`
  cannot use the folder at all.

Production was built by hand-applied SQL over time, so the folder is a history, not a reproducible schema. Fixing it
means re-baselining migrations (a squashed baseline from a schema-only Production export, then forward-only
migrations). That rewrites the shared migration history, so per GG's 19:05Z rule it is a **proposal for the owner**, not
done here.

## Still outside this environment

- Vercel runtime (functions, `after()` timing, file tracing): NOT RUN — needs a Preview, which needs GG's approval.
- Live Veo/Vertex: NOT RUN — needs GG's budget word (`VERTEX_LIVE_TEST_PLAN.md`).
- Production E2E: NOT RUN — Production is never a test database.
