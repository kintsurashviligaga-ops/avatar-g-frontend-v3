# Production launch certification: continue from here

Updated 2026-10-17 ~05:45Z by the certification thread ("Production E2E და გაშვების სერტიფიკაცია").

| Field | Value |
|---|---|
| Current phase | Service sweep: PR #86 (film last-frame chain) live; its one paid ad ran 05:05Z; fixes for what it found are up as the next PR |
| Branch | `claude/production-launch-certification-u2s9hy` (restarted from main after #86; follow-ups + film voice/declined-scene fix) |
| Main SHA | `a71dacf5` (PR #86 squash merge) |
| Production SHA | `a71dacf`, `dpl_6sQZHjoCaeRWX4xcfkg8ihWQcFiK` (READY ~03:36Z 2026-10-17); rollback target `46caaf7` |
| Last successful test | Local jest on this branch (see the PR), `tsc` and `eslint` clean |

## The paid 32 s ad on PR #86 (05:05Z 2026-10-17, GG's "ორივე" 03:28:23Z, used once)

| Check | Result |
|---|---|
| Scenes sent one after another, each from the previous clip's last frame | PROVEN in Production |
| Join similarity (SSIM, clip k last vs k+1 first) | 0.81 (2026-10-16 side by side: 0.65 / 0.74 / 0.65) |
| Face and outfit across scenes | Same |
| Admin credits | 854 → 854 (admin is never charged) |
| Cost | ~$2.4 Vertex (3 clips; Google does not bill a declined clip) + storyboard images; ElevenLabs $0 |
| Scene 3 | DECLINED by Google's celebrity rule (support code 15236754) when started from clip 2's last frame; film 24 s from 3 clips |
| Sound | NONE: `voiceUrl` and `sfxUrl` null |
| Chat line | "ვერ აეწყო — ძალიან ცოტა კლიპი დარჩა" while the client still assembled the 3 clips (server floor 4 vs client 2) |

Root cause of the silence: Production `ELEVENLABS_API_KEY` holds the key's ID, not the `sk_` key. ElevenLabs answers
400 `invalid_api_key / api_key_id_used_as_api_key` to TTS, sound effects and Music (Vercel logs from 2026-10-16 09:26Z;
`/api/health/public` voice = down). The TTS and SFX legs swallowed it without a log line. Only GG can fix it: a new
`sk_` key from ElevenLabs into the Vercel variable (asked 05:24Z). Then redeploy the same commit and check voice = ok.

## Deployed today (Production)

| PR | Change |
|---|---|
| #80 | Device fixes; Veo avatar (admin only) |
| #81 | Music video: one song under the clip |
| #82 | Frame chaining, speech timing, colour match |
| #83 | Per-scene storyboard frames, 429 backoff, `GEMINI_IMAGE_TRANSPORT` |
| #84 | Storyboard frame 4+; an outside click keeps the board |
| #85 | A chat yes starts image, music, film (storyboard), photoshoot, interior, product ad; Image is one panel; a Georgian film is voiced off camera by one ElevenLabs voice; honest daily-limit messages; design card balance fix |
| #86 | Each film scene starts from the previous clip's real last frame (sequential chain) |

## Waiting on GG

- A new ElevenLabs `sk_` key in Vercel `ELEVENLABS_API_KEY` (Production). Until then every voice, sound effect and
  ElevenLabs song fails. GG writes "შევინახე"; the thread redeploys the same commit and checks health.
- Deploy of the next PR (below), then a new priced card for one more paid ad film to prove sound and the resend.
- The ~$1 Veo avatar test clip (GG runs it).
- Video Core public opening; public Lyria music (open to every signed-in user); dubbing and deck prices; BOG items.

## In the next PR (follow-ups built after PR #86, plus the ad's fixes)

- Chat no longer offers closed services. Under `MEDIA_GOOGLE_ONLY` the platform prompt lists the talking avatar,
  character swap, motion transfer and 3D model as not available yet and drops their prices; dubbing and decks stay closed
  until their price is approved; remix says which edits still run. The admin (or everyone with `AVATAR_VEO_PUBLIC=1`) is
  offered the Veo avatar at its Veo price. Tests: `lib/chat/platformPrompt.test.ts`, `app/api/chat/gemini/route.test.ts`.
- Montage names the platform's daily AI limit and when it lifts (04:00 Tbilisi) instead of "montage failed", in the chat
  card and the Video editing export. Tests: `lib/agent/media/montageWorker.test.ts`,
  `app/api/v2/montage/render/route.test.ts`, `components/studio/montage/MontageStudio.test.tsx`.
- A Georgian (off-camera) film makes its ElevenLabs voice BEFORE the charge and the first clip; no voice → refused with
  nothing charged or rendered. TTS and SFX log ElevenLabs' refusal code (never the key). Tests:
  `lib/chat/filmOffCameraVoice.test.ts`, `lib/chat/filmVoiceover.provider.test.ts`.
- A chained scene Google's safety filter declines after a last-frame start is sent once more from its storyboard frame
  before the next scene; its own Redis keys (`:retry:`, `:retryclaim:`); not hinted for R3-A while owed; a failed
  dispatch gives the share back once. Tests: `lib/chat/filmChain.test.ts`, `lib/chat/filmChainPoll.test.ts`.

## Open defects

- Server salvage floor (`FILM_MIN_SALVAGE_CLIPS`, default 4) and client floor (2) disagree: a 4-scene film with 3 clips is
  "failed" in the chat line but still assembled. Not changed; needs a product call on what counts as delivered.
- Closing the window mid-render loses the render (and stops a chained film's later scenes).
- A storyboard frame's outfit can drift from the reference.
- Storyboard frames 2–3 empty and Live call stopping (GG's 17:19Z screenshots) were the spent daily limit; re-check
  signed in once GG is at the Mac.

## Exact next action

Wait for GG's "შევინახე" (new ElevenLabs key saved in Vercel). Then redeploy the current Production commit, check
`/api/health/public` voice = ok and the logs for `[tts]` refusals. Drive the next PR to green; ask GG on a card before
deploying it, and before any new paid ad film.
