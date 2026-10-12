# Video Core v1.0 — Preview evidence (round 3, PHASE 1 / PHASE 7)

Branch `claude/video-core-v1-6gh97e` · draft PR #58 → main (30be5a2). Owner's round-3 authorization (2026-10-12 10:17Z):
"You are authorized to create or enable an isolated Preview deployment for testing", under the safeguards quoted in §3.

## 1. What exists

| Item | State | Evidence |
| --- | --- | --- |
| Vercel Preview build for the branch | **ENABLED** again in `dac6106` (`vercel.json` `git.deploymentEnabled` no longer `false` for this branch; rounds 1–2 had it off on GG's "Push Preview-ს გარეშე") | commit `dac6106`; PR #58 commit status `Vercel: Deployment has completed` on `dac6106` and on `fc1971b` (13:46:26Z) |
| Preview URL | `https://avatar-g-frontend-v3-git-450092-kintsurashviligaga-ops-projects.vercel.app` (Vercel bot comment on PR #58, "Ready", deployment `C1u4cLfJWsJeCbaWf4ReE4WkV9DJ`) | PR #58 → first comment by `vercel[bot]` |
| GitHub Actions on the pushed heads | `CI` (ci.yml) and `E2E - Preview Contract` (e2e.yml, `playwright test tests/preview-e2e.spec.ts` against a local `next dev`) green on 71a6ec7, 3f083ea, dac6106; on fc1971b `E2E - Preview Contract` green, `CI` in progress at the time of writing (updated in `RELEASE_READINESS_CHECKLIST.md`) | https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions?query=branch%3Aclaude%2Fvideo-core-v1-6gh97e |
| Reaching the Preview from this sandbox | **not possible** (`curl … .vercel.app` → no connection, HTTP 000; the sandbox egress does not reach `*.vercel.app`) | measured 2026-10-12 ~13:50Z |
| Vercel API / connector from this session | **403** for team `team_YGQHjuCUs0f7tKoLtrCgSIFG` (memory: Vercel connector 403s) | — |

## 2. Isolation — the blocker (B2), stated exactly

**Technical cause.** The Vercel project `avatar-g-frontend-v3` has one set of Preview environment variables, and they point
at the **Production Supabase project** (`zwksnayknzggdcenqqxy`): `NEXT_PUBLIC_SUPABASE_URL`, the anon key and the
service-role key are the Production ones on every Preview deployment (memory: "Previews share the Production Supabase
project"). A Preview build of this branch therefore reads and writes the same `profiles`, `credit_ledger`, `jobs`,
`agent_media_jobs`, storage buckets and auth users as myavatar.ge. There is no Supabase branch, no second project and no
per-branch env override for this branch. The Supabase connector available to this session sees a **different**
organization (not `zwksnayknzggdcenqqxy`), so it cannot create a branch or a project in the right place either.

**Impact.** Every mutation E2E on the Preview (sign-up, upload, quote → Start, assemble, director run, any refund path)
would create rows, storage objects and ledger movements in Production, under a real or a test user — exactly what the task
forbids ("Do not connect destructive tests to production databases", "never sign in to Production auth, mint sessions or
write test rows there"). So on the Preview only **read-only** checks are allowed: page loads, locale switch, the signed-out
shell, `/api/video/capabilities`, `/api/health`-class routes, flag-closed routes answering 404 before auth. Anything with a
session or a write stays local (T2, mocked server routes) — see `evidence/t2-round3/summary.md`.

**Proposed solution (two shapes, GG picks one).**
1. *Supabase branch / second project* for the Preview: a Supabase **Branch** off `zwksnayknzggdcenqqxy` (or a free second
   project) seeded with the schema snapshot (`__tests__/schema-drift.snapshot.json`) and the applied migrations; a Vercel
   **custom environment** or branch-scoped env vars (`NEXT_PUBLIC_SUPABASE_URL`, anon, service-role, `GEMINI_TRANSPORT`,
   flags) pointing at it for `claude/video-core-v1-6gh97e` only. Then the Preview is an isolated test database and the
   mutation E2E (PHASE 2 §C–E) can run there as T4.
2. *Local isolated stack*: `supabase start` (Docker) in a CI job with the same migrations, `next build && next start`
   against it, Playwright on it. No Vercel involvement; proves the same contracts at T3/T4-equivalent without a public URL.

**Required approval.** GG's word on: creating a Supabase branch or project (paid infra if Branching is on a paid plan;
a second free project is $0), adding Preview env vars on Vercel (owner-only: the dashboard is GG's), and which flags the
isolated Preview opens (`AGENT_G_MEDIA_EXEC=admin`, `VIDEO_DIRECTOR_RUNS=admin`). Memory rule: paid infra, secrets and
flags are GG's decisions; this session must not create or expose secrets.

**Estimated cost.** Supabase Branching: included on Pro (≈ $0.32/day per branch at list price) or a second free project
at $0; Vercel env edits $0; CI minutes for option 2 ≈ 10–15 min per run on the free runner. No Veo cost (the Preview
E2E stays provider-mocked or flag-closed).

**Next action.** GG: choose 1 or 2; for 1, create the branch/project and paste the non-secret URL + confirm the env vars
are set for this branch (never paste a key in chat); for 2, say "local stack ok" and the thread adds the CI job. Until
then: read-only Preview checks only (§3), everything else at T1–T3.

## 3. Safeguards honoured on the Preview

Owner's text, verbatim, and what was done:

| Safeguard | How it was kept |
| --- | --- |
| "Do not deploy to Production. Do not merge into main." | main untouched (30be5a2); PR #58 stays a draft |
| "Do not change production environment variables." | no env change anywhere; the session cannot reach Vercel settings (403) |
| "Do not expose secrets." | no secret quoted in chat, commits, or docs; `__tests__/api-lockdown.test.ts` green |
| "Do not connect destructive tests to production databases. Do not execute production migrations." | no Preview mutation test was run; `proposals/20261012a_storyboard_revisions.sql` stays a proposal (B3) |
| "Do not trigger paid AI calls." | no Veo / Gemini / ElevenLabs call; `VERTEX_LIVE_TEST_PLAN.md` costs each level |
| "Do not bypass authentication or security controls." | local E2E pins a fake session **in the browser only** (`data-authed`), against mocked routes; no server bypass exists |
| "Before running any database-writing E2E test, prove that the test environment uses an isolated test database." | not provable → not run (§2) |
| "If Preview uses Production Supabase, run only non-destructive read-only checks there." | the sandbox cannot reach the Preview at all (HTTP 000); the read-only checks are listed for GG in §4 |
| "If safe Preview isolation cannot be established, report the exact blocker and continue with local browser E2E tests." | §2, and `evidence/t2-round3/` |

## 4. Read-only Preview checks for GG (owner-run, nothing written)

Open in a **signed-out** browser (private window), on the URL in §1; each line is PASS when it reads as described:

1. `/ka`, `/en`, `/ru` — the landing renders in the chosen language, no console error banner.
2. `/en/dashboard?tool=chat` signed out — the shell shows the sign-in affordance; no composer that can send (signed-out).
3. `/api/video/capabilities` — JSON with the Google-only engines; no Replicate/HeyGen ids in the video lanes.
4. `/api/video/director/runs` (GET or an empty POST) — `404` while `VIDEO_DIRECTOR_RUNS` is unset on the Preview; `401` if it is `admin` and you are signed out.
5. `/api/agent/media/montage` (GET) — `404` while `AGENT_G_MEDIA_EXEC` is unset; `401` signed out if it is `admin`.
6. `/api/video/assemble` (GET) — `405`/`404`, never a 200.
7. Do **not** sign in on the Preview and do not press Start/Generate anywhere: it is Production data.

Send a phone photo or the status codes; they go into the AC matrix as T4 read-only evidence with the time.
