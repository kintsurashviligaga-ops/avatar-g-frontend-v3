# Super App — Phases 2–4 execution plan (2026-10-01)

Built from a read-only mapping of eight verticals (templates, thumbnails, Digital Twin, photography, long-form video, music, 3D, Live/artifacts/MCP) against main, then ordered so every step ships on its own and is verifiable without paid calls. Status of each wave lives in `docs/SUPER_CHATBOX_STATUS.md`.

**Owner decisions (batch A, 2026-10-01):**
- Template cards **may** add a server-resolved style context, shown on the card as „Adds: …". Avatar templates add nothing yet.
- 3D model: **5 credits** (0.5 ₾).
- Music „Variety" is **merged into Weirdness** (no separate slider). Vocal gender: Auto / Female / Male / Duet.
- Product / Poster / Wallpaper image templates default to **high**, not 4K.

---

# Phase 2–4 execution plan

I checked the maps against commit 3afb192 (branch fix/phase1-hotfixes) and confirmed these points in the code:
- **Avatar lip-sync:** `app/api/video/lipsync/route.ts` has no `mustSignInToGenerate`. Its balance gate covers signed-in users only and lets requests through when the balance check errors (:167-176). The charge only happens on a successful GET poll (:113). The job id comes from the provider (:225/:231), after the paid text-to-speech step (:206).
- **HeyGen presenter:** `app/api/heygen/presenter/route.ts` has the same shape: rate limit AI at :65, a let-through gate at :73-79, and the charge on the poll at :165-169.
- **Voice training:** `app/api/voice/train/route.ts:38` falls back to `DEMO_VOICE_USER_ID` on POST.
- **Voice cloning:** `app/api/voice/clone/route.ts:62-80` requires sign-in but has no rate limit.
- **Thumbnail runner:** `scripts/hf-art-pack.ts:240` creates only `raw/`. The write at :248 is swallowed by `catch {}` at :249.
- **3D create:** `app/api/v2/model3d/create/route.ts` signs the user in (:40) and calls `guardedCall` (:123), but never touches the user's credits.
- **Image style:** `STYLE_SUFFIXES[label] ?? label` at `app/api/nanobanana/image/route.ts:189-190`.
- **Avatar enrol:** writes to the public bucket via `getPublicUrl` (`lib/avatar/enroll.ts:60,98`).
- **Private uploads bucket:** `uploads` already exists and is private (`app/api/upload/sign/route.ts:22`). The twin work can use it, so no bucket has to be created by hand.

**Ground rules for every step:**
- One branch and one PR per item, cut from main.
- Before merging: `npm run typecheck` plus the jest suites named for that item (merge with `--no-ff`, never force).
- No verification makes a provider call. Vercel branch previews run with real prod keys, even for anonymous visitors, so every Playwright run must intercept `/api/nanobanana/image`, `/api/ai/music`, `/api/film/storyboard`, `/api/chat/orchestrate`, `/api/video/lipsync` and `/api/v2/model3d/*` with `page.route(...).fulfill(...)`.
- Any new paid path ships behind a flag that is off by default, or as prepare-only.
- `components/studio/OmniStudio.tsx` (about 9,100 lines) is touched in Waves 2–4. Keep its diffs to wiring lines, put new UI in its own files, and land OmniStudio PRs one at a time.

## Wave 1 — Close leaks and fix shipped bugs (about 3 days, no owner input needed)

1. **Avatar billing leak.** Without this, the presenter template cards bring in unpaid renders.
   - **1a (half a day).**
     - Add `if (mustSignInToGenerate(user?.id)) return 401` (from `lib/auth/generationGate.ts:28`) at the top of POST in `app/api/video/lipsync/route.ts:158` and `app/api/heygen/presenter/route.ts:65`. This runs before text-to-speech or any provider work.
     - Make the balance gate refuse when the check fails: the `catch` at :176 / :79 should return 503 instead of falling through.
   - **1b (1 day).** Reserve credits at POST under a server UUID reference, before text-to-speech.
     - Return a signed charge token alongside `jobId`, using the same pattern as the film `film:` token.
     - The GET poll then skips its own deduct when a token is present.
     - Refund through `refundDebitByRef` (`lib/orchestrator/ledger.ts:199`) when text-to-speech or the provider fails, or when the poll reports a terminal failure.
   - **Verify:** new `app/api/video/lipsync/route.test.ts` and `app/api/heygen/presenter/route.test.ts`, with the ledger and providers mocked:
     - anonymous → 401 and the provider is never called;
     - zero balance → 402;
     - a ledger error → 503;
     - success → exactly one deduct;
     - provider failure → one refund.

2. **Voice training and cloning.**
   - In `app/api/voice/train/route.ts:35-38`, POST must require a signed-in user plus `mustSignInToGenerate`. Remove the demo fallback for POST; GET can keep it.
   - In `app/api/voice/clone/route.ts`:
     - add `RATE_LIMITS.EXPENSIVE`;
     - allow only `audio/*` and cap uploads at 10 MB (return 413 above that);
     - make DELETE (:220-251) call ElevenLabs `DELETE /v1/voices/{voice_id}` before removing the row.
   - **Verify:** route tests with `fetch` mocked:
     - anonymous training → 401 and Replicate is never called;
     - an oversize upload → 413;
     - DELETE calls the provider's delete URL.

3. **Stop new public biometric writes.**
   - In `lib/avatar/enroll.ts:39-65`, write the voice sample to the private `uploads` bucket at `twins/<uid>/voice.<ext>`. Its only reference is `liveAvatarVoicePath`, which nothing reads.
   - The poster stays public until Wave 3, because the Live orb reads it.
   - Add `scripts/avatar/migrate-live-avatar-voice.mjs`:
     - by default it only lists `live-avatars/*/voice.*`;
     - with `--yes` it copies each file to the private bucket and deletes the public one (the owner runs this; see blocker 2).
   - `lib/avatar/handoff.ts:17-21` should log loudly when `AVATAR_HANDOFF_SECRET` is unset.
   - **Verify:** an enrol unit test with storage mocked, asserting bucket `uploads` and that `getPublicUrl` is never called for voice.

4. **Uncapped `style` field.** This is the client-text path into provider and director prompts that already exists.
   - New `lib/studio/style.ts`, with a test file: `sanitizeStyle()` caps at 80 characters and strips control and bidi characters.
   - Apply it at:
     - `app/api/nanobanana/image/route.ts:189`, which should also forward only known `STYLE_SUFFIXES` keys to the provider's `style` field;
     - `app/api/film/storyboard/route.ts:332`;
     - `app/api/ai/music/route.ts:282`.
   - **Verify:** `npx jest lib/studio`.

5. **3D billing and bugs.**
   - **Charge for 3D.** Reserve `creditCostFor('model3d')` before `guardedCall` (`create/route.ts:123`). Refund when the submit fails and when the status poll reports a terminal failure. Add `model3d` to `lib/credits/pricing.ts` at 5 credits (0.5 ₾, the price `docs/COMPETITIVE_ADVANTAGE.md:41` already advertises); the owner can change the constant.
   - **Stop duplicate re-hosting.** `app/api/v2/model3d/status/route.ts:80-92`: when the job row already has a result, return it instead of downloading and uploading again.
   - **Prefill bug.** `components/studio/ServiceParamsPanel.tsx:354-363`: call `setPrompt3d(prefill.topic)` when the service is `model3d`.
   - **Missing thumbnail.** Pass `referenceUrl` in `onDelivered` (:424).
   - **Dashboard crash.** Wrap `GlbViewer` (:870-876) in `components/ErrorBoundary.tsx`, so an expired GLB no longer replaces the whole dashboard.
   - **Verify:** model3d route tests (ledger and Replicate mocked); a `ServiceParamsPanel` prefill test.

6. **Thumbnail runner (no spend).**
   - In `scripts/hf-art-pack.ts`:
     - call `mkdirSync(dirname(join(OUT,file)),{recursive:true})` before :248;
     - make `--dry` add up a projected total and apply the STOP check to it (:203-207);
     - skip shots with a completed but unselected attempt unless `--retry` is passed (:183).
   - Move `manifest.json` and `raw/` out of `public/` (to `scripts/templates/`), so prompts, prices and request ids are not deployed publicly.
   - Correct the run commands in `scripts/templates/thumbs.md:11-12` and `docs/SUPER_CHATBOX_STATUS.md:17`.
   - Add `tsx` as a devDependency and an `art:templates` npm script.
   - **Verify:** `npx jest scripts/hf-art-pack.test.ts` with new cases:
     - `thumbs.md` matches the 20 cards whose `thumb` is null, and every prompt contains "no text";
     - the templates pack has a $5 cap and a $4.50 stop line;
     - with `fetch` mocked, the slash-id file is written.

7. **Make voice-to-action honest, and add a probe.**
   - `components/chat/artifacts/ArtifactCanvas.tsx:321-328`: call `preventDefault()` only after `openArtifact` returns a non-null value.
   - `components/voice/live/liveActions.ts:139-150`: respect that receipt. If it fails, answer `{ok:false, error:'canvas_unavailable'}`. If it succeeds, say the code is saved in the canvas instead of "is on the user's screen".
   - `lib/voice/liveTools.ts:42-45,259`: add `svg` as its own language and drop the svg→xml alias.
   - `app/api/voice/live/route.ts:28-31`: make the comment agree with :191-192.
   - New `scripts/probe-live-actions.mjs`:
     - by default it only mints a token and opens the setup, testing the full, actions-dropped and no-tools variants;
     - `--turn` opts in to one spoken turn;
     - it never prints the key.
   - **Verify:** `npx jest lib/voice/liveTools.test.ts components/voice/live/liveActions.test.tsx components/chat/artifacts app/api/voice/live/route.test.ts` (114 tests pass today; add the receipt and svg cases).

8. **Music re-roll bug and stale contracts.**
   - The music re-roll currently falls back to 30 s and loses the vocal choice. Extend `MusicRegenSpec` (`OmniStudio.tsx:855`) and the regenerate body (:4034-4050) with `durationSec`, `tempo` and `voiceType`.
   - Correct `lib/ai/lyriaMusic.test.ts:11-14`: Lyria is on by default when a key is mocked.
   - Fix the stale comments at `OmniStudio.tsx:2062-2064` and :4335-4339, and `app/api/ai/music/route.ts:113`.
   - **Verify:** `npx jest lib/ai lib/studio`.

**Left dark after Wave 1:** nothing new is turned on. The probe script is not run until Gemini is funded.

## Wave 2 — Templates that actually shape output, honest music controls, a thumbnail pipeline (about 7 days; needs decision batch A)

**2a. Server-resolved template context (3 days).** This lands before 2b, because both change the same files: `musicBrief.ts`, the music route's idempotency hash, and the regen specs.

- **Server module.**
  - New `lib/studio/templateContext.ts` (starts with `import 'server-only'`) and its test.
  - `resolveTemplateContext` accepts only ids matching `/^[a-z0-9-]{1,40}$/` that exist for the tool. Image and music also require `match*Template(values) === id`; video matches on style plus `musicVideoMode`.
  - Length caps: image suffix 200, music descriptor 160, video look 160, director note 400.
- **Image.**
  - Pull lines :189-213 of the image route out into a pure `lib/studio/composeImagePrompt.ts`, with a test.
  - Add the template id to the idempotency key hash (:166).
- **Music.** Add `templateDescriptor` to `lib/ai/musicBrief.ts:31-41,66-70` and pass it from the music route (:456, :513).
- **Video.**
  - Add `look` to `lib/chat/filmPipeline.ts`. It replaces `${style} aesthetic` at :312 and :342 and is passed to `normalizeNegativePrompt` (:859).
  - Storyboard route: parse `templateId` (:381, :603).
  - Orchestrate: add the zod field `templateId` (:112) and thread it through metadata (:267, :294) into `lib/chat/filmComposite.ts:504`.
- **Client.** Send `templateId` from:
  - `OmniStudio.tsx:4146` and :4233, plus :4044 via `ImageRegenSpec` (:854);
  - :4366 via `MusicRegenSpec`;
  - the 6 storyboard calls (:3203, 3738, 3808, 3854, 3883, 3945);
  - :3047 into `lib/chat/filmStudioClient.ts:250` and :781.
- **Contract and disclosure.**
  - Rewrite the contract in `lib/studio/templates.ts:7-12` and `docs/SUPER_CHATBOX_STATUS.md` §3.4.
  - Add a one-line "Adds: …" note in ka/en/ru to the card meta in `components/studio/ui/TemplateGallery.tsx`.
  - Avatar templates get no context (decision A-f).
- **Verify:**
  - `npx jest lib/studio lib/ai/musicBrief lib/chat/filmPipeline lib/chat/promptAgent`:
    - an unknown, tampered or mismatched id (for example `anime` with style `Photorealistic`) resolves to null;
    - the caps hold;
    - the Georgian Folk brief contains the descriptor and still keeps the user's prompt;
    - the Noir look survives `FILM_DRIFT_NEGATIVE`;
    - storyboard and render resolve the same look.
  - Playwright on a preview with the endpoints intercepted: the request body carries `templateId`, and so does a re-roll.
- **Left dark:** the director note (a `templateNote` on `promptAgent`) is wired but has no effect until Gemini is funded. Real image and music renders wait for providers.

**2b. Granular music controls (2.5 days, after 2a).**
- **Pure helpers.** New `lib/ai/musicControls.ts` with a test: `parseMusicControls`, `promptDirectives` (the middle band adds nothing), `udioParams`, `musicgenParams`.
- **Brief.** Add directives to `lib/ai/musicBrief.ts`, trimmed before the user's own text.
- **Route.** In `app/api/ai/music/route.ts`:
  - parse the controls (:278-306);
  - add them to the idempotency hash (:399);
  - append the directives after `promptToEnglish` (:439);
  - pass the provider parameters through `composeTrackUrl` (:116-212);
  - return `controls:{engine, mode}` so the result card can say whether the control was native or prompt-steered.
- **Providers.**
  - `lib/udio/client.ts:6-18,319-364`: only behind `MUSIC_SUNO_PARAMS`, off by default.
  - `lib/ai/replicate.ts:45-50`: temperature and guidance.
- **UI.**
  - New `components/studio/ui/controls.tsx` Slider, lifted from `SurgicalEditor.tsx:1830`.
  - In OmniStudio:
    - style chips become multi-select, up to 3 (:7882-7890);
    - "Track type" becomes "Lyrics | Instrumental" (:7892-7901);
    - vocal gender gets Auto (:7925-7940);
    - Weirdness and Style influence sliders with an "approximate" hint;
    - the controls are added to `fineTuneBadge`;
    - they are threaded through :4342-4392, :4608-4611, :4918-4925, :5038-5044, and the dependency arrays at :4617 and :5454.
- **Georgian Folk.** Change the value to `'georgian folk'` at `OmniStudio.tsx:687` and `lib/studio/templates.ts:217`.
- **Variety** is left out until decision A-d.
- **Verify:**
  - `npx jest lib/ai/musicControls lib/ai/musicBrief lib/studio/templates`;
  - Playwright at 375 px and on desktop on `/ka/dashboard?tool=music`, with `/api/ai/music` intercepted: the body and the re-roll carry `styles[]`, `vocalGender`, `weirdness` and `styleInfluence`, and there is no horizontal scroll.
- **Left dark:** `MUSIC_SUNO_PARAMS=0`. Listening checks wait for Lyria funding.

**2c. Thumbnail provider seam (1.5 days, after Wave 1 item 6).**
- **Providers.** `--provider hf|replicate|imagen` in `scripts/hf-art-pack.ts`, priced from a static `PRICES_USD` table.
  - **Replicate:** flux-schnell, with no Soul-only fields, and the file is downloaded immediately.
  - **Imagen:** `x-goog-api-key` header, never `?key=`; inline base64 is written straight to disk.
- **Build step.** New `scripts/templates/build-thumbs.mjs`: a sharp cover-resize to 600×800 that also prints the `thumb:` lines to change.
- **Verify:**
  - `npx jest scripts/hf-art-pack.test.ts`: the Replicate mapping and quote, STOP refusing before the POST, an ambiguous submit being counted;
  - an offline `--provider replicate --dry` prints 20 quotes, a projected total of about $0.24, and makes no network calls;
  - `build-thumbs.mjs` run against a fixture manifest in the scratchpad.
- **Left dark:** the actual `--yes-spend` run (blocker 4).

## Wave 3 — Digital Twin v0 and the 3D scene canvas (about 8 days)

**3a. Digital Twin v0, cut from the mapped 9 days to about 5.**
- **Cut from v0:** the `digital_twins` table (the storage manifest is the source of truth, and the migration file is committed but not required), MediaPipe pose checks, any voice-clone provider, and Veo reference prefill.
- **Storage layer.** `lib/twin/{types,paths,store,resolve}.ts`, with tests, in the private `uploads` bucket under `twins/<uid>/`. Every path gets an owner-prefix check, because `lib/services/resolveUpload.ts:24` will sign any path.
- **Routes.** Each gets `RATE_LIMITS.WRITE`.
  - `app/api/twin/upload-url/route.ts`: one `createSignedUploadUrl` per slot, which removes the base64 and 4.5 MB limits.
  - `app/api/twin/commit/route.ts`: validates the objects and records consent and the digits shown.
  - `app/api/twin/route.ts`: GET returns signed URLs; DELETE removes `twins/<uid>/**` and the legacy `live-avatars/<uid>/**`.
- **Handoff.** Add a single-use `jti` to `lib/avatar/handoff.ts`.
- **Capture flow.** New `components/twin/TwinCapture.tsx`:
  - consent screen;
  - front, left and right with an oval guide and a 3-2-1 capture;
  - downscaling to 1024 px on the client;
  - random digits to read, a timer, a level meter, a 12 s minimum and a 30 s auto-stop.
- **Wiring.**
  - `app/[locale]/avatar/enroll` renders `TwinCapture`.
  - `components/studio/ChatChrome.tsx:1347,1473`: mount it and rename the entry.
  - `app/api/avatar/core/route.ts`: read the twin's front image first (signed URL), then the legacy poster. After that, make the poster private.
  - OmniStudio Avatar gallery (about :7121-7136): add a "My twin" card first.
  - The new entry sits behind `NEXT_PUBLIC_TWIN_ENABLED`, off by default, until legal approves the consent text.
- **Verify:**
  - `npx jest lib/twin app/api/twin` (mocking supabase in the style of `app/api/voice/transcribe/route.test.ts`): deterministic paths, MIME and size rejection, single-use token, legacy fallback, DELETE removes every path, `getPublicUrl` never called.
  - On a preview with the flag on: the desktop flow and the phone flow via QR code; objects are not reachable by public URL.
  - The "My twin" card sends the twin's face (asserted on an intercepted `/api/video/lipsync` body).
- **Left dark:**
  - checking the read digits against a transcript (Gemini speech-to-text is at 402), so `voice_verified` stays false;
  - `provider_refs` stays empty;
  - a real talking-photo render;
  - Veo reference images.

**3b. 3D scene canvas (3 days).**
- **Controller.** New `lib/studio/scene3d.ts` with a test: a reducer plus a validator that clamps positions to ±10, scale to 0.05–10, allows at most 24 objects, and accepts GLB URLs only from `https://*.supabase.co`. It also exports `myavatar:scene-action`.
- **Canvas.** New `components/studio/scene/SceneCanvas.tsx`:
  - loaded with `next/dynamic` and `ssr:false`, reusing `GlbViewer`'s loader and framing;
  - an ErrorBoundary per object, a WebGL check, and tap-to-interact on touch screens;
  - no drei Stage, useGLTF or TransformControls.
- **Wiring.**
  - Mount it next to `ArtifactCanvas` (`OmniStudio.tsx:9037`).
  - Add an "Add to scene" button in `ServiceParamsPanel`.
  - Add a `glbUrl` field to `Msg` (:909-918), `leanMessages` (:1158-1166) and `lib/chat/historySerializer.ts:63,437`.
- **Verify:**
  - `npx jest lib/studio/scene3d.test.ts components/studio`;
  - in the Browser pane on `/en/dashboard?tool=model3d`, dispatching a cube `place_object` opens the canvas; a hostile event (non-Supabase URL, NaN position, 100 objects) is ignored with a warning;
  - at 375 px the chat still scrolls.
- **Left dark:**
  - a `place_object` declaration in the Live lock, until the Wave 1 probe passes (a 400 there drops every action);
  - `generate_3d_mesh` stays prepare-only;
  - the first real TRELLIS run.

## Wave 4 — Long-form job API (dark) and a photography culling slice (about 11 days)

**4a. Long-form create, status and cancel (6 days).**
- **Schema, before the owner applies the migration.** In the same PR, edit `supabase/migrations/20261001b_longform_jobs.sql` while it is still unapplied:
  - add a `directing` status;
  - add a nullable trim column, so off-grid lengths stay possible later;
  - keep the 8 s grid in `plan.ts`.
- **Builders and limits.**
  - `lib/video/longform/rows.ts`: `jobInsertRow` and `sceneInsertRows`.
  - New `lib/video/longform/limits.ts`: answers 503 when `LONGFORM_MARGIN` is unset, so the margin stays the owner's decision.
- **Routes.**
  - `app/api/video/longform/route.ts`: 404 while the flag is off, checked before auth. The director has an overall 240 s deadline, and rows are written only after it succeeds.
  - `app/api/video/longform/[id]/route.ts`: status.
  - `app/api/video/longform/[id]/cancel/route.ts`: cancel.
- **Config.** A `vercel.json` functions entry with `maxDuration` 300 for the create route. No cron yet.
- **Storage.** Remove per-scene clips after the stitch. File the finished film in the Library (`generation_jobs`, `service_type 'film'`) and keep its storage path, so the link does not die after 7 days.
- **Verify:**
  - route tests: flag off → 404; unauthenticated → 401; validation reasons are returned; a director failure inserts and charges nothing; on success, 1 job and N scenes with correct `depends_on` round-trip through `jobFromRow` and `sceneFromRow`;
  - one end-to-end mock using the `tick.test.ts` fakes, running until `done`, with refunds checked for a forced failure;
  - `npx jest lib/video/longform app/api/video/longform app/api/cron/longform-tick`.
- **Left dark:** `LONGFORM_VIDEO_ENABLED`, the cron, the unapplied migration, and the UI picker (still 8/24/48 at `OmniStudio.tsx:2123`).

**4b. Photography, cut to a local culling assistant (about 5 days).**
- **Metrics.** New `lib/photo/cullMetrics.ts`: tiled Laplacian blur, exposure clipping, dHash plus burst grouping, and a verdict that only flags and never auto-rejects.
- **Grading.** New `lib/photo/grade.ts`: `applyGrade`, `autoGrade`, and the presets ported from `SurgicalEditor.tsx:166-175`.
- **Worker.** New `components/studio/photo/cull.worker.ts`, a same-origin worker, so no CSP change is needed.
- **Workspace.** New `components/studio/photo/PhotoWorkspace.tsx`:
  - drop JPEG, PNG or WebP files;
  - a grid with badges, P/X/U keys, filters and a burst strip;
  - a grade panel with a live canvas preview;
  - "Export picks" builds a client-side JSZip with a size cap and per-file fallback.
- **Tool wiring.** `lib/studio/tools.ts` and `tools.test.ts`; `'photo'` added to the OmniStudio mode union and `selectTool`. The tool is labelled "photos never leave your device".
- **Verify:**
  - `npx jest lib/photo`: a checkerboard versus its 5 px blur gives a variance ratio above 10×; an all-white frame gives about 100% highlight clipping; a 1 px shift has a Hamming distance of 4 or less, against 20 or more for an unrelated image; a neutral grade is the identity;
  - `tools.test.ts`;
  - a manual 50-JPEG drop in the Browser pane with no main-thread freeze.
- **Cut (multi-week, and needs storage plus legal sign-off):**
  - the session and asset schema;
  - batch-signed uploads;
  - server-side export with sharp;
  - `/gallery/[slug]` with favourites and a PIN;
  - MediaPipe blink detection, RAW/HEIC support, and AI second opinions or style learning.

**MCP / Integrations: not built in any wave.** There are no allowlisted servers, no OAuth apps, no legal text, and no function-tool loop in `lib/ai/google/chatStream.ts:490-497`. A later Wave 5 candidate is a bounded tool loop with one internal read-only tool, which needs funded Gemini to verify.

## What each key or budget turns on (no new code waves)

| Arrives | Turns on |
|---|---|
| Gemini prepay | `node scripts/probe-live-actions.mjs`, then `--turn`; then `GEMINI_LIVE_GOOGLE_SEARCH=1`; listening A/B for Lyria templates and sliders; the director template note; Imagen text→3D reference; digit-reading check for the twin |
| Replicate credit | `art:templates --provider replicate --dry`, then `--yes-spend` (about $0.24), pick variants, `build-thumbs`, flip the 20 `thumb:` lines; the first TRELLIS run; FLUX image fallback; MusicGen parameters |
| GCP trial | one 8 s Lite Vertex clip probe; then long-form on preview only; Veo reference images from the twin's front/left/right |
| Supabase Pro or R2 | photography increment 2 (sessions and delivery galleries) |
| One Udio live probe | `MUSIC_SUNO_PARAMS=1` |

## Owner blockers, in priority order

1. **Decision batch A (about 15 minutes, free). It blocks merging Wave 2.**
   - (a) Reverse the "a card adds no hidden prompt" contract, with an on-card "Adds: …" disclosure. Recommended: yes.
   - (b) Confirm the 3D price of 5 credits (0.5 ₾).
   - (c) The product, poster and wallpaper templates default to 'ultra' (4K) at the flat 2-credit image price. Keep, or switch them to 'high'?
   - (d) What "Variety" means: drop it, show 1 or 2 takes at N× credits, or merge it into Weirdness.
   - (e) Vocal gender as a 4-stop control (Auto, Female, Male, Duet).
   - (f) Avatar templates add no instruction for now.
2. **Privacy.**
   - Set `AVATAR_HANDOFF_SECRET` from `openssl rand -hex 32`, with `vercel env add AVATAR_HANDOFF_SECRET production` (and the same for preview). The implementing session can do this under the standing env permission.
   - Separately, give an explicit yes to running `scripts/avatar/migrate-live-avatar-voice.mjs --yes` against prod after reviewing its listing-only output. This moves users' public voice samples to private storage.
3. **Top up the Gemini AI Studio prepay** (or link a funded billing account to the project that owns `GEMINI_API_KEY`). This unblocks the most: Lyria, Gemini-transport Veo, the director LLM, `promptToEnglish`, Live actions and search, speech-to-text, and Imagen.
4. **Image provider: add about $10 of Replicate credit** (replicate.com → Billing). Or run `npm run hf:credentials` locally to add Higgsfield keys, and accept FLUX schnell's look against the Soul brand art.
5. **GCP $300 trial for Veo through Vertex.**
   - Create the project with billing linked.
   - Enable the Vertex AI, Cloud Storage and IAM Credentials APIs.
   - Create the bucket and service account with the roles listed in `docs/VEO_VERTEX_SETUP.md:24-45`.
   - Add `GCP_PROJECT_ID`, `GCP_VEO_BUCKET` and `GCP_SERVICE_ACCOUNT_KEY` (Sensitive) to Vercel for preview and production.
   - The trial does not unlock Lyria 3, Live or Imagen, which all run on the AI Studio key.
6. **Pricing and budget batch B (before any long-form or twin launch):**
   - `LONGFORM_MARGIN`;
   - `DAILY_COST_LIMIT` (at $10 a film is capped at 24 s Standard) and `MONTHLY_COST_LIMIT`;
   - whether to set `BILLING_GUARD_FAIL_CLOSED=1`;
   - long-form seconds and Veo tiers per plan;
   - the price of creating a twin or cloning a voice.
7. **Apply `20261001b_longform_jobs.sql`** in the SQL editor after the Wave 4a schema edit merges, then run `node scripts/check-db-exposure.mjs`. The `digital_twins` mirror table is optional.
8. **Supabase plan: Pro (~$25/month, 100 GB, image transforms, no auto-pause) or R2 credentials.** The Free org (1 GB total, 50 MB per file, pauses after 7 idle days) cannot hold delivery galleries or more than about 2 long-form films.
9. **Legal copy in `lib/legal/content.ts` (ka/en/ru):** biometric consent and retention (unlocks `NEXT_PUBLIC_TWIN_ENABLED`), hosting clients' photos (unlocks galleries), and third-party MCP (unlocks Integrations).
10. **Which engine is "my voice":** ElevenLabs instant clone (confirm the plan's clone slots), RVC on Replicate, or waiting for Vertex Chirp.
11. **Udio:** keep it or retire it. `lib/chat/mediaKeys.ts:37-41` forbids new Udio call sites. If kept, allow one live probe of `gender`, `style_weight` and `weirdness_constraint`.
12. **Which MCP servers to allow.** Can wait until after Wave 4.

## Scale

- **Total:** about 29 engineer-days across Waves 1–4, roughly 6 calendar weeks for one person. Within a wave, items are independent except that 2a must land before 2b, and all OmniStudio edits must be serialised.
- **Long-form:** after Wave 4 it is testable, not launchable. Launch needs the migration applied, funded Veo and director LLM, a margin, a budget and a storage plan.
- **Photography:** AfterShoot/Pic-Time parity (AI culling, learned grading styles, client galleries with favourites) is a 2–3 month product. Wave 4b is only a local culling assistant.
- **Digital twin:** HeyGen parity needs a HeyGen plan beyond the 3-photo cap plus a paid voice clone. v0 covers capture, private storage, and reuse in the talking-photo tool with the house voice.
- **3D:** Wave 3b is manual scene placement. A spatial agent waits on the Live probe, and text chat has no function calling.
- **Music sliders:** on Lyria and ElevenLabs they steer the prompt only, so they are approximations by design.
- **MCP:** not started. Expect 2 weeks or more once the decisions are made.