# Production launch certification: continue from here

Updated 2026-10-16 ~09:00Z by the certification thread ("Production E2E და გაშვების სერტიფიკაცია").

| Field | Value |
|---|---|
| Current phase | PHASE 1 (signed-in part pending), PHASE 3 fixes in progress, GG's iPhone reports (image, avatar) in progress |
| Branch | `claude/production-launch-certification-u2s9hy` (draft PR #80) |
| Main SHA | `ffde345c` (PR #74 merge) |
| Production SHA | `ffde345c`, `dpl_Jn9ucwhB5ND6STFgo1CPPVeswtLD`; rollback target `369acfc` `dpl_9Ux1s4yZLBiE1nC5GK7wi7SjHspp` |
| Last successful test | Jest: chat, voice, studio, jobs and hooks suites green (3625 + 1041 tests); `tsc --noEmit` clean |

## Completed fixes (on the branch, not deployed)

| Commit | Fix | Evidence |
|---|---|---|
| 995dacd | PostHog only after "Accept all"; CSP allows the PostHog assets host | Production repro: flags call before consent; `components/analytics/PostHogProvider.consent.test.tsx` |
| 995dacd | 404 page follows the URL locale | Production repro: English 404 on `/ka/...`; `components/NotFoundView.test.tsx` |
| 995dacd | Worker tick: missing `service_jobs` table warns once instead of an error per tick | `app/api/app/worker/tick/route.test.ts` |
| 995dacd | "speaks/dialogue" in an English brief no longer routes typed lines to a narrator | `lib/chat/filmVoiceover.commentary.test.ts` |
| d31512f | D-C4: `freeFilm` only when the free slot was spent; `covered` for a stitch that needed no charge | `app/api/video/assemble/billing.test.ts` |
| d8d58d7 | Agent G no longer claims an image is "processing"; a yes to its quoted offer shows the priced card; Live fills the tool with `prepare_generation`; phone sheet hides the chat bar and stops under a docked call | `lib/chat/offeredPrompt.test.ts`, `components/studio/imageHandoff.wiring.test.ts`, prompt tests |
| d5dc748 | D-C3: a delivered film's durable row is completed at delivery, not after the lip-sync/graphics upgrades | `components/studio/filmRowSettle.wiring.test.ts` |

## Open defects

- D-C2: light/time-of-day jump between scenes (each scene's start frame is drawn separately).
- Four leading black frames in a stitched film.
- Georgian speech accuracy unverified (GG asked to listen to the ad film).
- Avatar studio (GG 08:54Z): render fails "ავატარი ვერ შეიქმნა"; speech and direction mixed; no own photo or audio upload. Investigating.
- Anonymous load: 401 console noise, Sentry envelopes.

## Pending PRs

- #80 (this branch, draft). Docs PR #79 belongs to the Final Integration thread.

## Owner-gated decisions

- Merge and Production deploy of #80 (decision card once CI is green).
- Any paid provider run (Veo, image, avatar), real BOG payment, migration, public flag, price change.
- Voice cloning for "my voice" (a new paid capability).
- The missing end of PHASE 6 and PHASE 7 of GG's brief.

## Exact next action

Read the avatar investigation, fix the root cause with isolated tests, split speech from direction, then prepare the
signed-in Mac runner (GG signs in by email code) for PHASE 1 and 2.
