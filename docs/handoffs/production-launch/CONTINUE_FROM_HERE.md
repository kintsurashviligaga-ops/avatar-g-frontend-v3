# Production launch certification: continue from here

Updated 2026-10-16 ~09:00Z by the certification thread ("Production E2E და გაშვების სერტიფიკაცია").

| Field | Value |
|---|---|
| Current phase | PHASE 1 (signed-in part pending), PHASE 3 fixes in progress, GG's reports (image, avatar, music, tray) fixed on the branch; Veo avatar build next |
| Branch | `claude/production-launch-certification-u2s9hy` (draft PR #80) |
| Main SHA | `ffde345c` (PR #74 merge) |
| Production SHA | `ffde345c`, `dpl_Jn9ucwhB5ND6STFgo1CPPVeswtLD`; rollback target `369acfc` `dpl_9Ux1s4yZLBiE1nC5GK7wi7SjHspp` |
| Last successful test | Jest: studio, jobs, studio-lib, chat, voice, avatar, api/voice, api/ai suites green (3824 tests); `tsc --noEmit` clean (7af9186) |

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
| 59aa187 | vercel.json: this branch builds no Vercel Preview (4 Previews had been built before this; unused) | `vercel.json` |
| f08b667 | Avatar: only the spoken words reach TTS (direction shown apart); a refused start (google_only) shows its reason, no 3x retry; own-photo card; My audio upload + record; Live fills avatar format/voice | `lib/avatar/scriptSplit.test.ts`, `lib/avatar/renderAttempts.test.ts`, `components/studio/avatarSend.wiring.test.ts` |
| 7af9186 | Music: a dropped phone request waits for the job row; a stored non-Lyria engine pick is sent as Auto (the route refused every track from such a device); `unsupported` no longer reads as "try MP3 or WAV"; render tray close button | `lib/jobs/awaitDroppedJob.test.ts`, `components/studio/musicDrop.wiring.test.ts`, `components/studio/JobTray.test.tsx`, `lib/studio/musicEngines.test.ts` |

## Open defects

- D-C2: light/time-of-day jump between scenes (each scene's start frame is drawn separately).
- Four leading black frames in a stitched film.
- Georgian speech accuracy unverified (GG asked to listen to the ad film).
- Avatar engine: paused in Production by the Google-only boundary (HeyGen). GG chose (09:13Z card) a Veo-based avatar; build it, then a paid test and price need GG's word.
- Music is live for every signed-in user in Production (POST /api/ai/music, Google Lyria, credits charged, no admin gate); "Music off" only means the v1 plan card. Not a flag breach, but the memory note was wrong.
- Music chat "MP3/WAV" message: root cause found in the error mapping; confirm with GG's next try.
- Anonymous load: 401 console noise, Sentry envelopes.

## Release state (2026-10-16)

- PR #80 merged 09:54Z (54b5225) after GG's verified "გაშვება+ტესტი" tap; Production dpl_5RhwPKevnXdGiVN4Kz62SKBZBXFM.
  Rollback target ffde345c (dpl_Jn9ucwhB5ND6STFgo1CPPVeswtLD). Veo avatar live for admins; GG makes the one ~$1 test clip.
- PR #81 (draft, this branch restarted from main): GG's 09:38Z/09:54Z music-video and studio report.
  | Commit | Change | Test |
  |---|---|---|
  | ef1e6f3 | One song: Veo clip audio dropped when a music video has its song (`keepsOnlySong`); Georgian/genre detection in the song prompt; natural colour (no night-neon from "dark", natural grade in prompts); stale typed line cleared after dispatch; render tray top right on desktop and foldable; VFX result shown once (in chat), VFX settings in a collapsible group | `lib/elevenlabs/musicPrompt.test.ts`, `lib/chat/musicVideoContinuity.test.ts`, `components/studio/JobTray.test.tsx`, `GenjutsuPanel.test.tsx`, `components/studio/filmTypedLine.wiring.test.ts` |
  | b03af32 | Music video: performer keeps one outfit in every storyboard frame (`MUSIC_VIDEO_PERSON_CLAUSE`), waist-up anchor with full outfit | `app/api/film/storyboard/selfie.test.ts` |
- Song order: a Georgian music video already builds its song BEFORE the scenes (`/api/audio/georgian-song`, OmniStudio send); a
  non-Georgian one gets one ElevenLabs song in parallel; either way one track is the only bed. Real lip-sync to the song is
  impossible with Google-only (HeyGen refused): decision card posted to GG (one song, lips not synced / add lip-sync provider).

## Pending PRs

- #81 (this branch, draft). Merge, deploy and any paid music-video test need GG's word and a cost card (Veo + song, within $10/day).
- Docs PR #79 belongs to the Final Integration thread.

## Owner-gated decisions

- Lip-sync provider for music videos (card posted).
- Merge and Production deploy of #81.
- Any paid provider run (Veo, image, avatar), real BOG payment, migration, public flag, price change.
- Close public Lyria music or keep it; Veo avatar public price.

## Exact next action

Drive PR #81 CI green; after GG's avatar test, check its output and logs; then a priced card for one paid music-video test.
