# Music Studio v1 — Phase 2 · Security and billing evidence

Environment for every PROVEN_ISOLATED row: GitHub Actions `music-studio-e2e-local.yml` — Supabase CLI local stack
(GoTrue, PostgREST, Storage, Postgres 17) with the Test Schema Baseline, `next start` of the branch, real ffmpeg,
the stand-in provider (`lib/music/studio/e2eProvider.ts`, never Lyria). Spec: `tests/music-studio-live/api.spec.ts`
and the journey/voice specs. Real Postgres 16 + PostgREST suite from Phase 1 (`musicIsolation.pg.test.ts`) is still green in CI ("billing on real Postgres").

| Check | Result | Class |
|---|---|---|
| Anonymous: quote, start, status, cancel, edit → 401; sweep without/with wrong secret → 403 | pass | PROVEN_ISOLATED |
| Cross-user: status / cancel / edit of another user's job → 404; their PostgREST rows (jobs, ledger) → []; anon → none | pass | PROVEN_ISOLATED |
| Client cannot write a `generation_jobs` row | refused | PROVEN_ISOLATED |
| Direct Storage: anon GET, `/object/public/`, other user's token, other user's folder list → all denied / empty | pass | PROVEN_ISOLATED |
| Signed URL expiry: 2 s link works, then refused; the app's link lifetime ≤ 3600 s | pass | PROVEN_ISOLATED |
| Quote tampering (prompt, billed length, token bytes), missing `confirmed`, another user replaying the quote → 4xx before money | pass, balance unchanged | PROVEN_ISOLATED |
| 4 concurrent confirms of one quote → one job, ONE debit (losers 200 same job or 409 `quote_used`); replay → same job | pass | PROVEN_ISOLATED |
| Insufficient credits → 402, no ledger row | pass | PROVEN_ISOLATED |
| SSRF: edit sources must be Library ids; metadata-service URL, localhost URL, the signed URL itself → 400; unknown fields → 400 (strict schema) | pass | PROVEN_ISOLATED |
| Secrets: no stack key / provider key names in any answer | pass | PROVEN_ISOLATED |
| Provider failure / QC failure (silent track) → no track, refund exactly once; sweep ×2 changes nothing | journey spec | see E2E matrix |
| Cancel mid-render → `-5, +5` once | voice spec (desktop) PASS; journey spec see matrix | PROVEN_ISOLATED (voice) |
| Worker crash/restart, sweep idempotency at DB level, ambiguous reservation, budget guard fail-closed, Redis outage | unit + real-Postgres suite (Phase 1) | PROVEN_ISOLATED (pg) / BUILT (unit) |
| No duplicate paid provider calls | worker-killed-after-dispatch never re-sends (unit + pg) | PROVEN_ISOLATED (pg) |
| Malicious file upload | Music Studio accepts no uploads (sources are ids) | N/A |
| Paid Google calls | none | $0.00 |

## Defects found by these runs and fixed (each re-run)
1. **Rate limit keyed by IP, shared by paid starts and free edits** (5/min): everyone behind one NAT shared it; six quick edits → 429. Now: auth first, per-user keys on every studio route; edits own bucket (20/min).
2. **Worker never ran off Vercel**: `runAfterResponse` returns false without `waitUntil`; the routes ignored it → only the cron sweep worked jobs. Now the in-process fallback, as Agent G media routes.
3. **Duplicate edit in the same tick**: busy read from React state → two edits. Now a synchronous ref guard (+ join guard).
4. **Download navigated away**: cross-origin signed link ignores `download`; now `download=<name>` → attachment.
5. Phase-1 commit tracked the worktree's `node_modules` symlink — untracked; `/node_modules` ignored.

## Not proven
- Preview / Production Storage, ledger and RLS: BLOCKED (Preview uses the Production Supabase project).
- Redis-backed limiter (no Upstash in the job → in-memory limiter exercised).

## Final session (2026-10-14) additions
4. **Stand-in provider gate tightened**: `e2eFakeLyriaEnabled` now requires EVERY configured Supabase address (`SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_URL`) to be localhost / 127.0.0.1 / `*.test`, besides `MUSIC_STUDIO_E2E_FAKE_PROVIDER=1` and no `VERCEL`/`VERCEL_ENV`.
   Before, one local address was enough, so a mixed config could bill a hosted project for a synthetic track. Unit test covers both mixes.
   On Vercel (Preview or Production) the stand-in can never answer → `not_configured`, nothing charged. Class: BUILT + unit; PROVEN_ISOLATED
   that CI (both URLs on the `.test` host) still enables it.
- **Preview configuration (read-only `vercel env ls preview`)**: `NEXT_PUBLIC_SUPABASE_URL`, anon and service-role keys are single rows for
  Production + Preview + Development → Preview writes to the Production database. No `MUSIC_*` / fake-provider variables on Preview.
  Preview mutation tests (Library, credits, refunds, RLS on live data): **BLOCKED**. Nothing was written to Production.
- RLS, private Storage, signed-URL expiry, session ownership, ledger exactly-once, refund idempotency (sweep ×2), cancel refund, 402,
  SSRF, rate limits per user: re-proven on the final run (PHASE2_E2E_MATRIX.md). Worker restart / ambiguous dispatch / budget guard:
  real-Postgres suite + unit (unchanged, green in CI "billing on real Postgres").
- Spend this session: **$0.00** (no Google call of any kind).
