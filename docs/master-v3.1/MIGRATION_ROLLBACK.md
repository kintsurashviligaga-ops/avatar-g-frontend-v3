# Phase 1 migration and rollback notes (MASTER TASK v3.1)

These notes cover the Phase 1 pull requests, from #115 to #133. They say what each one changes for users, what has to be true in production before it merges, how to check it after deploy without spending money, and how to undo it.

`main` deploys to production on every merge. No Phase 1 PR merges without GG's go-ahead, and a green Preview is not that go-ahead.

## At a glance

- **No database migration.** No PR adds, alters or drops a table, column, policy or function. Nothing in the shared database needs a migration forward or back.
- **No new environment variable.** Every variable the stack reads already existed. Several stop having any effect (listed below).
- **No feature flag is switched on.** `AVATAR_VEO_PUBLIC`, `LYRIA_ENABLED`, `MUSIC_LYRIA_PRO_VERIFIED`, `MUSIC_LYRIA_VOCALS_VERIFIED` and `GEMINI_IMAGEN_ENABLED` keep whatever value production has.
- **No live or billed call was made** to build or test any PR. Every provider contract is pinned by mocks or a synthetic fixture.
- **Historical jobs stay readable.** Poll and status routes for jobs started before the deploy are kept, and operation ids are not rewritten.

## Merge order

The PRs are stacked: each one contains every PR above it in this table, so they merge in this order, and each squash merge is one production deploy.

| Order | PR | Branch | What it does |
|---|---|---|---|
| 1 | #115 | `claude/p1-01-provider-reachability` | Test-only ratchets: provider allowlist and per-route reachability baseline |
| 2 | #117 | `claude/p1-02a-strict-vertex-transport` | Every Google model call on Vertex AI; unset `GEMINI_TRANSPORT` no longer selects the Developer API |
| 3 | #118 | `claude/p1-02b-veo-vertex-only` | Veo on Vertex only; Developer API Veo client deleted |
| 4 | #119 | `claude/p1-02c-developer-api-callers` | Live voice, WhatsApp live and Deep Research fail closed; health reports Vertex readiness |
| 5 | #120 | `claude/p1-02d-key-gates` | Gates that asked for an AI Studio key ask whether Vertex can serve |
| 6 | #121 | `claude/p1-03-fail-closed-budget` | Budget guard fails closed; refused bookings kept and written back |
| 7 | #122 | `claude/p1-04-quote-token-v2` | Quote token v2 binds engine, model, transport, project and price book |
| 8 | #123 | `claude/p1-05-no-outside-engines` | Chat, voice and agents Google-only, whatever `AI_GOOGLE_ONLY` says |
| 9 | #124 | `claude/p1-05b-video-google-only` | Video Google-only, whatever `VIDEO_GOOGLE_ONLY` says |
| 10 | #125 | `claude/p1-05c-media-google-only` | Media Google-only; the re-open rule is deleted |
| 11 | #126 | `claude/p1-05d-cloud-tts` | Every spoken line on Cloud TTS with the Vertex identity |
| 12 | #127 | `claude/p1-05e-elevenlabs-tools` | ElevenLabs-only tools refuse; film voice check on Gemini STT |
| 13 | #128 | `claude/p1-05f-orphan-vendor-cleanup` | 39 vendor modules with no runtime importer deleted |
| 14 | #129 | `claude/p1-06-lyria-music` | Music cancel race fixed; film, ad and song beds on Lyria |
| 15 | #130 | `claude/p1-06b-elevenlabs-probes` | Health and admin probes ask Cloud TTS; CSP drops ElevenLabs |
| 16 | #131 | `claude/p1-07-veo-variants` | Only a verified Vertex Veo row renders, in a region it lists |
| 17 | #132 | `claude/p1-08-image-lifecycle` | Imagen 3 ids answer `lifecycle_blocked`; Vertex image contract test |
| 18 | #133 | `claude/p1-09-curated-avatars` | Built-in avatars only; custom avatars answer `capability_unavailable` |
| 19 | #134 | `claude/p1-10-migration-rollback` | These notes (docs only) |
| 20 | #135 | `claude/p1-11-georgian-gemini-tts` | Georgian lines read by Gemini-TTS: Cloud TTS lists no ka-GE voice |
| 21 | #136 | `claude/p1-12-agent-g-delegate-r7` | Agent G sub-tasks: voice on Gemini only, image/music/video refuse as `google_only` |
| 22 | #137 | `claude/p1-13-music-vocals-gate` | Sung songs refused before any charge until Lyria vocals are verified; the Music panel locks Instrumental on |
| 23 | #138 | `claude/p1-14-health-vertex-only` | Operator health and the admin readiness panel report Vertex, not AI Studio or vendor keys; the avatar's stored voice says Cloud TTS |
| 24 | #139 | `claude/p1-15-no-vendor-probes` | Admin and health probes no longer call outside vendors; the HeyGen admin diagnostic is removed |
| 25 | this PR | `claude/p1-16-admin-diagnostics-google` | The admin engine diagnostics (`/api/health/providers`, `/api/admin/reliability`) name Google engines only |

Merging only the top PR carries the whole stack in one deploy. Merging them one at a time gives smaller steps to roll back.

## Before merging: what production must have

GG checks these in the Vercel and Google Cloud consoles. Only names are listed here; never paste a value into a PR, a chat or a log.

| Setting | Must be | From | If it is wrong |
|---|---|---|---|
| `GEMINI_TRANSPORT` | unset or `vertex` | #117 | `gemini_api` or `gemini`: every Google model call answers "not configured". Any other value throws |
| `GEMINI_IMAGE_TRANSPORT` | unset or `vertex` | #117 | Same rule for images |
| `VEO_TRANSPORT` | unset, `auto` or `vertex` | #118 | `gemini` is refused before any upload or call |
| Vertex identity: `GCP_PROJECT_ID`, `GCP_PROJECT_NUMBER`, `GCP_SERVICE_ACCOUNT_EMAIL`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | present, as today | existing | Every Google path answers "not configured", naming the missing variables |
| `GCP_VEO_BUCKET` | present (unchanged) | existing | Veo answers "not configured" |
| **`GCP_VEO_LOCATION`** | **unset or `us-central1`** | **#131** | **Any other region is refused before the journal, reserve, upload or call: video stops rendering** |
| `GCP_GEMINI_LOCATION` | unset (`global`) or a region that serves the models | existing | Model calls go to that region's host |
| `VEO_MODEL_STANDARD`, `VEO_MODEL_FAST`, `VEO_MODEL_LITE` | unset, or an id with a verified Vertex row (no `-preview`, no `veo-3.2` or `veo-9`) | #131 | That tier is disabled and labelled unavailable in the studio |
| `GEMINI_IMAGEN_MODEL`, `GEMINI_FRAME_MODEL` | unset, or not an Imagen 3 id | #132 | The Imagen leg stays off; a frame request returns no image |
| Cloud Text-to-Speech API | enabled on the service account's Google Cloud project | #126 | The first speech request gets a 403; every voice path gives its existing "no voice" result. No other vendor is asked |
| `MUSIC_LYRIA_PRO_VERIFIED`, `MUSIC_LYRIA_PRO_SECONDS`, `MUSIC_LYRIA_VOCALS_VERIFIED` | leave unset until GG's budgeted Lyria verification | #129 | Setting them before verification would ask Lyria for something never tested on this project |

## After deploy: checks that spend nothing

Each check is free: no model generates anything and nothing is charged. Do not repeat billed calls to find out whether something works.

1. **Public health** (`/api/health/public`): the voice bucket is `ok`. It reads the free Cloud TTS voices list (en-US), which shows the API is on and the service account may call it. Georgian is read by Gemini-TTS, whose voices that list does not hold, so only a billed line proves the Georgian read itself.
2. **Admin provider probe**: the `cloud-tts` row is `ok` ("Cloud TTS answers … Georgian on gemini-2.5-flash-tts"), and the Gemini row reports Vertex AI as ready (a Workload Identity token was minted; no model call). A `down` row with 401 or 403 means the Cloud Text-to-Speech API or the service account's permission is missing.
3. **Video engine** (`/api/video/engine`): each tier reads `available: true`. A tier that reads false has an unverified model id or a region its row does not list; the admin reliability page names a refused default model.
4. **Admin Pipeline card**: the film-score row names Lyria 3 on Vertex, a bed of about 30 s, and sung songs off.
5. **Image Studio**: a quote for a photo succeeds (no confirm, so nothing is reserved). A quote that names an Imagen 3 id answers 410 `lifecycle_blocked`.
6. **Talking avatar** (admin): `GET /api/avatar/veo` answers `open` with its price. Do not POST.
7. **Logs** (GG reads them; they contain user prompts): look for `NotConfiguredError`, `guard_unavailable`, `billing.booking_unrecorded` and Cloud TTS 401 or 403 lines in the first hour.

## What users will notice

Most of the stack removes paths production already had switched off. These changes are visible:

- **Voice** sounds different: every spoken line (film narration, the avatar's Georgian line, the Georgian song vocal, read-aloud, Agent G's voice replies) is Google Cloud TTS instead of ElevenLabs. Georgian lines use a Gemini-TTS prebuilt voice (`gemini-2.5-flash-tts`; ka-GE is a Preview language there), because Cloud TTS has no Georgian voice of its own. Between #126 and this PR, Georgian lines failed closed (no audio, nothing charged): the production voices list for ka-GE came back empty on 2026-10-22, which #130's health check showed as voice and avatar `degraded`.
- **Film music** is a Lyria bed of about 30 s. A film longer than that plays its last part without music. A music video with a sung song gets no music. Both last until GG's budgeted Lyria Pro and vocals verification.
- **Film subtitles** are paused: the narration check runs on Gemini on Vertex, which gives no word timings (GG, 2026-10-22).
- **Live voice and WhatsApp live calls** answer `live_transport_unavailable`, and the browser falls back to the normal voice loop. **Deep Research** is unavailable (it exists only on the Developer API).
- **Refused with the studio's `google_only` notice, before any charge**: voice cloning (deleting an old clone still works), sound effects, audio isolation, ads TTS, dubbing, the photo editor, upscale, inpaint, 3D, lip-sync, Motion transfer, Higgsfield models, the HeyGen presenter, interior redesign.
- **Custom avatars** (own photo, video, voice, the Digital Twin's face, prompt-drawn or scanned) answer `capability_unavailable` and keep the draft. Built-in avatars work as before.
- **A budget guard that cannot read the ledger** now refuses and asks the user to try again shortly, instead of letting the paid call through.
- **The Music stop button** says the job could not be stopped yet and to try again when its cancel loses a race, instead of wrongly saying the job already finished.
- **Imagen 3** requests are told that Google retired the model and that nothing was charged.

## Rolling back

### Fast path: Vercel Instant Rollback

In the Vercel project, open Deployments, pick the last production deployment before the merge, and use Instant Rollback. It takes effect in seconds, needs no build, and uses the same environment variables.

After an instant rollback, Vercel stops promoting new `main` deployments to production on its own. Promote a deployment by hand once the fix or revert is ready.

### Durable path: revert on `main`

Open a PR that reverts the squash commit, and merge it once CI is green and GG agrees. The PRs build on each other, so revert from the newest down. Reverting an older PR while a newer one stays will conflict.

### Keep the old variables

Do not delete any environment variable as part of Phase 1. Code from before the stack still reads variables the stack ignores, so a rollback needs them, and some routes the stack keeps still read vendor keys for jobs started before the deploy. Once the stack has run cleanly for two weeks, a cleanup PR can list each variable that nothing reads any more, and GG deletes those in one batch.

These stop having any effect on the new code:

- `AI_GOOGLE_ONLY`, `VIDEO_GOOGLE_ONLY`, `MEDIA_GOOGLE_ONLY` and `OUTSIDE_ENGINES_APPROVED`: the switches and the re-open rule are gone (#123–#125).
- `BILLING_GUARD_FAIL_CLOSED`: there is no fail-open setting any more (#121).
- `GOOGLE_TTS_API_KEY`: Cloud TTS reads no key (#126).
- An AI Studio key (`GEMINI_API_KEY`, `GEMINI_API_KEYS`, `GOOGLE_GENERATIVE_AI_API_KEY`) is never sent on a model call (#117–#120). A few admin and health rows still print whether one is set.

These are still read by routes the stack keeps, so they stay until jobs from before the deploy have finished:

- `HEYGEN_API_KEY`: the HeyGen avatar and presenter polls and the chat video poller.
- The LTX keys (`LTX_VIDEO_API_KEY`, `LTX_API_KEY`, `LTX2_API_KEY`) and `REPLICATE_API_TOKEN`: the pollers for clips started on those engines.
- `ELEVENLABS_API_KEY`: deleting a voice clone made earlier.

### What a rollback leaves behind

| Area | After a rollback |
|---|---|
| Database | Nothing to undo: no schema change. Ledger rows written back by #121 carry `metadata.reconciled: true` (and `folded: true` for a carried amount); older code ignores the field |
| Quote tokens (#122) | A v2 token issued before the rollback fails on older code as `invalid`; the user quotes again. Tokens live 30 minutes |
| Kept bookings (#121) | A refused booking is kept in the instance's memory (up to 500) until the next booking writes it back. A redeploy or rollback drops what an instance still holds, as any deploy does; each one was logged as `billing.booking_unrecorded` |
| Veo jobs | Jobs submitted on Vertex keep polling on either version. Historical `models/...` operations answer `failed` on the new code; older code polled them only with an AI Studio key, which production does not hold |
| Music jobs (#129) | No new state. A `busy` cancel answer simply becomes the old answer |
| Lyria beds (#129) | Stored in the same folders with the same one-week signed URL; older code reads them |
| Image jobs (#132) | An Imagen 3 job refused and refunded stays refunded |
| Avatar (#133) | `/api/avatar/veo` takes `avatar` (a preset path) instead of `photo`. A browser still running the other version's page gets a 4xx with nothing charged until it reloads. Jobs already started keep polling through `/api/genjutsu/status`, which does not depend on the face |
| CSP (#130) | Restores `api.elevenlabs.io` in connect-src; no browser code uses it either way |

## Open items GG decides

- **One budgeted contract call per model** to turn "unverified" rows into verified fixtures: `gemini-3.1-flash-image`, Lyria 3 clip and Pro (and vocals), the Veo 3.1 tiers, Cloud TTS synthesis, and one short Georgian line on Gemini-TTS. The spec forbids repeated billed probes, so this is one listed batch for GG's approval.
- **A durable outbox table** for refused bookings, so a kept booking survives an instance. It is a shared database change (#121).
- **Timed speech-to-text** (Cloud Speech-to-Text, Chirp) to bring film subtitles back, only if GG asks.
- **The Imagen 4 leg** (`GEMINI_IMAGEN_ENABLED`, opt-in): left in place by #132; it can be removed if GG wants it gone.

## Follow-ups (not in Phase 1)

- ~~`/api/health` and `/api/admin/flags` still print whether an AI Studio key is set~~ Done in row 23: both report Vertex readiness (`googleAiConfigured`, the check every route runs before a call), and `/api/health` no longer lists outside vendors' keys (Anthropic, Replicate, NanoBanana, ElevenLabs, HeyGen, xAI) as providers.
- ~~Admin probes for outside vendors (Anthropic, OpenAI, Replicate, LTX, Udio, HeyGen) still exist~~ Done in row 24: `/api/health/services` and `/api/admin/provider-probe` no longer call Anthropic, OpenAI, NanoBanana, Replicate, LTX, Udio or HeyGen, and `/api/admin/avatar-providers` (a HeyGen and LiveAvatar listing with no caller) is deleted. The vendor-reach ratchet (`__tests__/provider-boundary.allowlist.json`, `provider-reachability.baseline.json`) loses those 3 files.
- ~~`/api/ai/music` sends a sung request to Lyria without the vocals gate that `lyriaBed` applies~~ Done in row 22 (GG 2026-10-23: block until verified): the route refuses a sung song as `unsupported` before the budget, the ledger or Lyria, reading the same `lyriaVocalsVerified` gate as Music Studio and the film beds. `/api/ai/music/engines` reports `vocals`, and the Music panel locks Instrumental on with a note until it is true. Setting `MUSIC_LYRIA_VOCALS_VERIFIED=1` after the budgeted vocals check reopens songs everywhere at once.
- ~~Agent G's delegate route still has vendor branches to sweep~~ Done in row 21: a voice sub-task reads with `/api/tts/gemini` only (no Voice Lab fallback, no vendor name in the error), and image, music and video sub-tasks refuse as `google_only` before any call.
- ~~The talking avatar's stored job result still labels its voice `elevenlabs`~~ Done in row 23: `/api/genjutsu/status` stores `voice: 'google-cloud-tts'`. Rows already stored keep their old label; nothing reads the field.
- ~~`/api/health/providers` still names FLUX 1.1 Pro (or NanoBanana) as the chat image engine and lists outside vendors' keys~~ Done in row 25: its chat image line names what `ServiceManager` runs (Imagen first only when `GEMINI_IMAGEN_ENABLED` is on, then `gemini-3.1-flash-image`), and the DeepSeek, Atlas, Anthropic, Replicate, Runway, ElevenLabs, LTX and Udio rows are gone. `/api/admin/reliability` no longer names a Runway model. The reachability baseline loses both files.
- `tests/agent-g-refine-avatar.spec.ts` (not in CI) fails before it reaches the avatar, on the base as well; it needs repair.
- Dead vendor modules that route tests still mock as "never called" witnesses (Replicate, Flux, xAI, NanoBanana, World Labs, Replicate STT) wait for those tests to move onto the fetch spy.
