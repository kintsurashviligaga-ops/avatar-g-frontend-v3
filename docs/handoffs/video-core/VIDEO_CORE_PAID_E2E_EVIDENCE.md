# Video Core v1.0: the one paid Production E2E (Phase 5)

Run 2026-10-15 12:08–12:15 UTC on **myavatar.ge**, deployment `dpl_6AaKtWBNgxyvjZSv4eF48DdSdTE7` (main **b46bb44**, PR #69).
Brief: GG 2026-10-13 17:34:41Z, Phase 5 ("LIMITED REAL PRODUCTION TESTING": ≤ $5 Vertex, ≤ 50 own credits, no new
payment, no retry). Account: the admin (decision card 2026-10-15 10:22Z "ადმინით"), so the film is never billed in credits.

Labels: **VERIFIED FACT** (run, with the evidence named) · **INFERENCE** (read from code or prices, not measured) ·
**NOT TESTED** · **BLOCKED** · **OWNER ACTION REQUIRED**.

## Result

**PASS: one press, one Vertex operation, one delivered 4 s film with Veo's own sound, 0 credits, ≈ $0.40.**
No retry, no second paid call, no 5xx, no page error. The free Volume check (defect 43) passed on the same film.

| Limit | Allowed | Used | Label |
|---|---|---|---|
| Vertex / Veo spend | ≤ $5 | one Veo 3.1 Fast 720p clip, 4 s, with audio ≈ **$0.40** (list price $0.10 a second) | INFERENCE (price), VERIFIED FACT (one operation, 4 s) |
| Own credits | ≤ 50 | **0** (balance 892 → 892; quote shown 13) | VERIFIED FACT |
| Paid presses | one | **one** (`out/PAID_CLICKED` gate; one dispatch, 8 polls) | VERIFIED FACT |
| BOG / Stripe payment, subscription, refund, top-up | none | none | VERIFIED FACT |

## How it was run

A Playwright script (`runner5.cjs`, kept on the owner's Mac, sha256 prefix d4322d63) in a **separate Playwright
Chromium window with a throwaway profile**, not the owner's Chrome. The owner signed in there with the email code; the
script never saw or typed a credential, and deleted the profile (the session) at the end (12:15:19Z). The paid button was
pressed only after Claude reviewed the free part and wrote `GO` to a gate file; a second gate file made a second press
impossible. Evidence (redacted JSON log, screenshots, both MP4s) stays on the owner's Mac in
`~/Movies/myavatar-e2e-20261015/out/`; nothing with a token, a user id or a signed URL is in this repository.

## The chain

| # | Step | What was observed | Label |
|---|---|---|---|
| 1 | Auth | sign-in by the owner 12:09:38Z; `/api/auth/whoami` → signed in, founder | VERIFIED FACT |
| 2 | Preflight (free GETs) | `/api/health` commit b46bb44, database + redis connected; `/api/video/engine` → `transport: vertex`, `audioToggle: true`, `googleOnly: true`; `/api/video/director` → `enabled: false`; credits 892; free films left 0 | VERIFIED FACT |
| 3 | Prompt + settings | "A red paper boat drifts slowly across a calm pond at sunrise, soft ripples on the water, birds singing nearby"; length 4 s (`0:04`), **VEO 3.1 FAST**, Veo sound on, music off, narration off, no lip-sync add-on, 9:16 | VERIFIED FACT (P3 screenshot) |
| 4 | Storyboard (free) | `POST /api/film/storyboard` plan (1 scene) → scripts → anchor → frame 1, all 200 in 34 s; 0 orchestrate, 0 assemble before the press | VERIFIED FACT |
| 5 | Quote | the board's Generate shows **13** credits (= `videoCredits` for 4 s Fast); the length sheet shows the same | VERIFIED FACT |
| 6 | Confirm | one press of the board's Generate at 12:13:28.969Z | VERIFIED FACT |
| 7 | Deduction | admin → `founderBypass`, nothing debited: balance 892 before and after, free films 0 before and after | VERIFIED FACT |
| 8 | Dispatch | `POST /api/chat/orchestrate` 200 at 12:13:36Z: "Film pipeline started (1 × 4s Veo scenes)"; body `sceneCount 1`, `clipSec 4`, `veo {tier fast, format 9:16, referenceMode first_frame, generateAudio true, seedLock true, enhancePrompt false}`, `storyboardApproval {revision 3, fingerprint bc6eee4e062169dc}` | VERIFIED FACT |
| 9 | Vertex operation | the clip's task reference: provider `gemini-veo`, operation `…/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/8c513ad5-9574-4509-8ef9-881bb8a7c1cc` (a Vertex AI long-running operation name; the Gemini API names operations differently) | VERIFIED FACT |
| 10 | Render | 8 polls; `succeeded` at 12:14:22Z, 46 s after the dispatch | VERIFIED FACT |
| 11 | MP4 + storage | the clip copied to Supabase storage `renders/veo/…` (signed URL) | VERIFIED FACT |
| 12 | FFmpeg / assembly | `POST /api/video/assemble` 200: `single: true` (one clip, no re-encode), `noMusic: true`, `finalDurationSec 4`, `freeFilm: false` | VERIFIED FACT |
| 13 | QC | the delivered MP4 decoded with ffprobe/ffmpeg: **4.01 s, 96 frames at 24 fps, 720×1280, H.264 High, AAC 48 kHz stereo, 1,391,764 bytes, 0 decode errors**, loudness mean −43.7 dB / max −19.9 dB. The server's film QA is `qa: null` for a single clip (by design; no stitch to check) | VERIFIED FACT |
| 14 | Preview | the result bubble plays it: `canPlayType` probably, `readyState 4`, duration 4.01 s, 720×1280, no media error | VERIFIED FACT |
| 15 | Download | the Download button saves `myavatar-video-….mp4`, **byte-identical** to the delivered file (same sha256 `2d86b945…`) | VERIFIED FACT |
| 16 | Library | "Save to library" → `POST /api/studio/library` 200 (kind film); `GET /api/studio/library?kind=film` lists it; the Library page shows it | VERIFIED FACT |
| 17 | History | `/api/video/status/<token>` → phase `assembled`, `durable: true`, error none; `/api/tasks` → render · film · **completed** at 12:13:31Z | VERIFIED FACT |
| 18 | Reconciliation | credits 892 → 892; free films 0 → 0; one dispatch, one operation, one delivered file; engine still `vertex` after the run | VERIFIED FACT |
| 19 | Volume check (defect 43, free) | `POST /api/agent/media/edit` quote `volume +6 dB` → **0 credits** → run → job completed: 4.02 s, 96 frames (same frame count), mean −43.7 → **−37.7 dB (+6.0 dB)**, max −19.9 → −14.1 dB | VERIFIED FACT |

Vercel runtime logs for the run window (12:09–12:16Z) show no error from these routes; the only `error`-level lines are
the known `/api/app/worker/tick` service_jobs message (since 2026-10-02) and a Node `DEP0169` deprecation notice that the
orchestrate function writes to stderr (VERIFIED FACT).

## Findings

| # | Finding | Effect | State |
|---|---|---|---|
| F1 | The storyboard's scene tile ("⏳8s") and the "Scenes & camera" drawer ("1 × 8s") showed 8 s for a 4 s film; the board header, the quote and the render were 4 s | display only: price, dispatch and file were 4 s | **FIXED** in 66fdc696 (both read the real clip length); Jest + browser regression tests, both fail on the old code |
| F2 | The storyboard response's `scriptModel` named a Claude model. Nothing used it as a model: the director goes through `llmText`, which is Gemini only, and with Google-only on (`/api/video/engine` → `googleOnly: true`, the same `isGoogleOnly()` the storyboard reads) the frames come from Gemini's image model (`generateGeminiImage`); no photo was attached, so no vision call | a wrong label only; the storyboard made no non-Google call | VERIFIED FACT (the label, the flag), INFERENCE (script and frame providers, read from code: the run did not record `frameSources`); label **FIXED** in 54fb0f7 (`promptAgentModel()` names the Gemini model the director uses), Jest test |
| F3 | The film dispatch still carries legacy fields (`videoModel: "runway"`, `voiceLanguage`, `voicePersona`, `narratorGender`) | none here: the operation is Veo on Vertex | INFERENCE (harmless); clean-up candidate |
| F4 | Veo drew a hand at the boat's edge that the prompt did not ask for | content, not a defect; a single clip has no automatic content QC (`qa: null`) | observation |
| F5 | Veo's sound is quiet (mean −43.7 dB); a single native clip is delivered as is (D7: no conform, no normalisation) | the Volume tool fixes it for free (+6.0 dB measured) | observation |

## Not proven by this run

A multi-scene film (8 s and longer: stitch, joins, music bed, film QA) on Production; a paying non-admin user (the debit,
the `filmpay:` ledger row and a refund on Production); a Veo failure and its scene refund (R3-A) on Production; the
director path (off in Production). These stay at the CI tiers (`FINAL_ACCEPTANCE_MATRIX.md`) and are listed in
`NEXT_PHASE_HANDOFF.md`.
