# 11 — CI and regression

## GitHub CI on the heads under test (all green)

| SHA | Branch | Jobs |
|---|---|---|
| fef867a6 | main | verify ✅ (38436349769), preview-e2e ✅ (38436349741), smoke ✅ (38437220247) |
| bcb724a1 | #64 Video Core | verify ✅, preview-e2e ✅, live E2E local Supabase desktop+phone ✅, billing on real Postgres ✅ (38527010610/-510/-611) |
| be9edee3 | #60 Image Studio | verify ✅, preview-e2e ✅, isolated-db ✅, image-browser ✅, live E2E ✅, billing pg ✅ (38527016338/-375/-387/-388) |
| 54532ff8 | #65 Music Studio | verify ✅, preview-e2e ✅, Music live E2E desktop+phone ✅ (38572860496), live E2E ✅, billing pg ✅ (38572860799) |

| 9d25c7a4 | #65 after limiter fix | verify ✅ (38582716876), preview-e2e ✅ (38582717019), Music live E2E desktop+phone ✅ (38582716955), live E2E ✅ + billing pg ✅ (38582716914) |
| 95c3ee7a | #67 this branch | verify ✅ (38583532761), preview-e2e ✅ (38583532824), live E2E desktop+phone ✅ + billing pg ✅ (38583532613), Vercel ✅ (build ran only the free auth check) |

URLs: `https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/<id>`. a31b7205's Vercel build failed in
`npm ci` (transient ffmpeg-static download error, before any build step — no paid call); superseded by 95c3ee7a.

## Local regression (macOS, Node 24, integration candidate)

| Check | Result |
|---|---|
| tsc (a7f470d7 and 31206e48) | 0 errors |
| ESLint (a7f470d7) | exit 0 |
| Jest full (a7f470d7) | 914 suites passed / 5 failed / 10 skipped; 14 012 tests passed / 20 failed |
| Same 5 suites on clean main fef867a6 | **5/5 fail, 20/48 tests** — identical → baseline |
| New: `scripts/global-e2e/preview-media-check.test.ts` | 5/5 |
| New: `lib/agent/media/montageVeoReplay.ffmpeg.test.ts` with real Veo bytes | 1/1 PASS (skipped without `VEO_REPLAY_DIR`) |
| #65 `lib/music/studio` after limiter fix | 61 passed / 6 skipped |
| Next.js production build | Vercel Preview build of 95432a2b (main + this branch's script) ✅ |
| Playwright desktop/mobile | CI jobs above (not re-run locally: needs local Supabase/Docker) |

## Classification of failures

| Failure | Class |
|---|---|
| 5 ffmpeg suites (`composition`, `effects`, `montageExec`, `videoCoreAc06` `.ffmpeg.test.ts`, `ffmpegExec.test.ts` — e.g. playlist-demuxer refusal expectation) | **existing macOS baseline** (pass on Linux CI) |
| Deployed isolated E2E | **owner approval / infrastructure blocker** (10) |
| Live microphone | not exercised (no claim) |

No new regression found.
