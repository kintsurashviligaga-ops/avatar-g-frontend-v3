# Video Core v1.0 — handoff (final, release candidate)

For whoever picks Video Core up next: what is built, where it lives, how to re-run every check, and what is still open.
Branch `claude/video-core-v1-6gh97e` from main 30be5a2, draft PR #58 → main. Nothing here is merged or deployed.
Status of each acceptance criterion: `FINAL_ACCEPTANCE_MATRIX.md`. Gates, blockers and owner decisions:
`RELEASE_READINESS_CHECKLIST.md`. Georgian summary for GG: `FINAL_E2E_REPORT_KA.md`.

## 1. What Video Core v1.0 changes (by area)

| Area | What it does now | Main files |
| --- | --- | --- |
| Words → length | one reader for lengths in words, clocks and compounds in KA/EN/RU („ერთწუთიანი", "29.7 s", «полторы минуты») | `lib/video/durationWords.ts`, `lib/agent/params.ts` |
| Words → job | a sentence becomes the right job: music video, montage of attached clips, selection („მარტო ბოლო ხუთი"), edit | `lib/agent/intent.ts`, `lib/agent/intentCorpus.ts` |
| Duration contract | Requested · Native · Final said on the plan; the master is cut to Final, frame-exact at 30 fps; > 96 s refused by name (`longform_closed`) | `lib/video/durationContract.ts`, `components/studio/OmniStudio.tsx` |
| Storyboard | a plan miss is an error card with Retry, never an auto-render; every board change is a numbered revision; Generate approves the revision on screen; the server re-fingerprints and refuses anything else (`400 revision_mismatch`) on the film and director paths | `lib/video/storyboard/revision.ts`, `app/api/chat/orchestrate`, `lib/video/director/fromStudio.ts` |
| QC | decoded-frame count against `round(final × 30)`; a miss, or a count that could not be taken, withholds the master (`qc_rejected` / `frame_count_unverified`) and refunds once; an unreadable soundtrack is `422 music_unreadable` before any encode | `lib/orchestrator/masterQa.ts`, `lib/video/finalCut.ts`, `app/api/video/assemble` |
| Montage | frame-exact lane, music from a given second of the track, selection, own sound / silent export; what it cannot do (music delay on the timeline, add clips / replace music after delivery) is said on the quote, never applied as something else | `lib/agent/media/montage*.ts`, `lib/services/montage/beatPlan.ts` |
| Edits | speed changes land on the 30 fps grid with sound in sync (round 3) | `lib/agent/media/editPlan.ts` |
| One window | chat → Video tool with the plan said; progress cards show only measured progress; error cards carry the route's own reason; attachments stay with their conversation | `OmniStudio.tsx`, `JobTray.tsx`, `ui/GenerationProgress.tsx`, `ui/ResultCard.tsx` |
| Contracts registry | every video refusal and lane in one place (`VIDEO_REFUSALS`), pinned by tests | `lib/video/contracts.ts` |
| Real-backend E2E | a throwaway Supabase in GitHub Actions with a Production-shaped Test Schema Baseline, a fail-closed Production guard, and Playwright on desktop + iPhone 13 against `next start` of the branch (no secret, no dump, no paid call) | `.github/workflows/video-core-e2e-local.yml`, `e2e/video-core-live/`, `tests/video-core-live/` |

## 2. How to re-run every check

```bash
# types, unit + integration (≈ 12 min on 2 workers), lint
npx tsc --noEmit -p tsconfig.json
npx jest --silent --maxWorkers=2
npx next lint

# real ffmpeg (opt-in, slow)
VIDEO_CORE_FFMPEG_IT=1 npx jest lib/orchestrator/videoCoreRound3.ffmpeg.test.ts lib/orchestrator/ffmpeg-assembly.ffmpeg.test.ts
npx jest lib/agent/media/videoCoreAc06.ffmpeg.test.ts lib/agent/media/videoCoreSpeedSync.ffmpeg.test.ts

# billing / leases / runs on a throwaway Postgres + PostgREST (never Production)
POSTGREST_BIN=/path/to/postgrest bash scripts/lease-isolation/run.sh

# browser, desktop Chrome + iPhone 13 viewport, every server route mocked at the page
npx next dev -p 3000 &   # with dummy NEXT_PUBLIC_SUPABASE_URL / ANON_KEY
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium npx playwright test -c playwright.video-core.config.ts

# Veo / Vertex / director without paid calls
npx jest lib/veo lib/video/director app/api/video/director
```

**The real-backend E2E runs by itself in GitHub Actions** on every push to a PR into main
(`.github/workflows/video-core-e2e-local.yml`, "Video Core E2E (isolated local Supabase)"; also `workflow_dispatch`).
It needs no secret and no file from GG: `supabase start` makes a throwaway stack on the runner, the Test Schema Baseline
(`e2e/video-core-live/baseline`) builds the Production-shaped schema from repo files, `next start` serves this branch,
and Playwright (`tests/video-core-live`, `playwright.video-core-live.config.ts`) drives a desktop and an iPhone-13
viewport as synthetic users. How it works, what the baseline covers and why it is not the repo's migrations:
`SUPABASE_TEST_ENV.md`. Evidence of each run is printed to the job log as redacted `[evidence] …` lines and uploaded as
the artifact `video-core-live-e2e`; the runs this release candidate rests on are summarised in `evidence/ci-e2e/`.
To run it locally you need Docker and the Supabase CLI (`supabase start --workdir e2e/video-core-live`), then the same
steps as the workflow; the guard (`tests/video-core-live/guard.ts`) refuses any hosted or Production URL.

The live suite paces itself under the shipped limiter (5 quote/run calls a minute per user), so a run takes ~10–15 min
of Playwright; do not "speed it up" by switching the limiter off.

Evidence lands in `docs/handoffs/video-core/evidence/` (`round3-final/`, `t2-round3-final/`, older rounds beside them).

## 3. What is open, and who owns it

- **GG's decisions D1–D12** and **blockers B1–B8**: `RELEASE_READINESS_CHECKLIST.md` §2–§3. B2 (an isolated Supabase
  for a full-backend browser E2E) is closed: it runs in CI without anything from GG. The one that unlocks the most
  evidence now is B1 (live Veo L1–L3), then a Vercel runtime check (a new Preview needs GG's word).
- **Migrations do not rebuild the schema** on a fresh database (35 / 114 fail; `evidence/round3-final/migration-replay-fresh-db.tsv`).
  The CI baseline works around it for what Video Core touches; a full fix (a squashed baseline + forward-only
  migrations) rewrites shared history and is a proposal for GG (`SUPABASE_TEST_ENV.md`). Outside Video Core.
- **Deferred engineering** (no decision needed, just time): run the opt-in film ffmpeg suites on a CI schedule; the 60 s and
  240 s encodes on a deployed function once B1/B4 allow; the montage lane's unreadable-soundtrack wording (`music_unreadable`
  instead of the generic QC sentence); a Retry next to "Edit storyboard" on a director `revision_mismatch`.

## 4. Rules this work kept (keep them)

No merge, no deploy, no new Preview without GG's word; Production Supabase is never a test database; no shared-DB migration;
no paid provider call without a per-test approval; no secret in chat, commits or docs; Image Studio and BOG Payments (PR #59)
are other threads' files; never force-push; a mocked test is never reported as a live one.
