# Capability matrix (v2, Phase 6, 5 November 2026)

v1 (Phase 0, 22 October, draft PR #114) was written before any project call and marked every model **unverified**.
This v2 is the state on the release candidate `d8420a5d` (= Production). It separates what Google documents, what the
code does, and what was proven, and by whom.

## Status vocabulary

- **verified by owner**: a paid run on the Production Vertex project, inside a budget the owner approved, with the owner
  judging the result. Date and budget are given. This is evidence for that flow, not a contract fixture for every
  control.
- **in use, uncertified**: live in Production and used, but no budgeted contract call or fixture certifies it.
- **unverified**: documented by Google, not proven on our project.
- **unsupported**: the documented model does not offer it.
- **lifecycle-blocked**: Google has discontinued or is retiring the endpoint.
- **BLOCKED_EXTERNAL**: needs something only Google can grant (an allowlist).
- **CAPABILITY_UNAVAILABLE**: no documented Google-native route exists.

## Music: Lyria

| Model | Where | Controls offered | Status |
|---|---|---|---|
| `lyria-3-clip-preview` (30 s) | Vertex `:generateContent`, `global` | instrumental or sung, lyrics, genre/tempo/mood, length tier | **verified by owner**: sung track test on a staged Production deployment, 2026-10-26, $2 budget; then `MUSIC_LYRIA_VOCALS_VERIFIED=1` in Production on the owner's OK (#222) |
| `lyria-3-pro-preview` (up to 184 s) | same | longer tracks (`MUSIC_LYRIA_PRO_VERIFIED`) | in use, uncertified |
| Georgian / Russian sung lyrics | | | Google documents 8 vocal languages, not ka/ru. The owner chose Georgian vocals and accepted the 2026-10-26 test, so ka vocals are an **owner-accepted** behaviour outside Google's documented list |
| Covers, a sampled voice, a trained voice, Udio / MusicGen picks | | | refused before any charge (no Google engine) |
| Music Studio v1 (quote → approve → job) | `/api/music/studio/*` | | built and tested in CI; its flag `NEXT_PUBLIC_MUSIC_STUDIO_V1` is off in Production, so users reach music through the chat path `/api/ai/music` |

## Video: Veo and Gemini Omni Flash

| Model | Where | Used for | Status |
|---|---|---|---|
| `veo-3.1-fast-generate-001`, `veo-3.1-generate-001` | Vertex `:predictLongRunning`, `us-central1` | a clip with no Georgian spoken line, photo as first frame, 4–8 s | **verified by owner**: video scenarios in Production 2026-10-26, inside a $13 video budget (about $12.6 used, including a $0.60 avatar probe on 2026-10-31) |
| `gemini-omni-1.1-flash-preview` | Vertex `interactions`, `global` | a clip with a Georgian line (each character their own voice, no narrator), 4–10 s, 720p/1080p; edit and extend; "continue" (`გააგრძელე`) as a multi-turn extend | **verified by owner**: one contract probe 2026-10-25 (~$1.02), scenario tests and continue in Production 2026-10-26 (#209, #221) |
| `veo-3.2-*`, `veo-3.1-*-preview`, `veo-3.1-lite-*` ids present in code | | | unverified; not offered unless documented and verified |
| Audio input (lip-sync to a user's own audio file) | | | **unsupported** by Veo 3.1 → `CAPABILITY_UNAVAILABLE` |
| New dialogue on an uploaded speaking video | Omni | | unsupported (Omni keeps the uploaded speech); a chat-made clip can be continued instead |
| Omni edit/extend of an upload in the EEA, Switzerland, UK | Omni | | unsupported there per Google's documentation |

## Photo / Image and the Imagen lifecycle decision

| Model | Status | Evidence |
|---|---|---|
| `imagen-3.0-*` (all Imagen 3 generation and capability endpoints) | **lifecycle-blocked** | Vertex AI release notes (24 Mar 2026) list them as discontinued; v3.1 records 30 June 2026. Any Imagen 3 id that reaches the code (request body, `GEMINI_IMAGEN_MODEL`, `GEMINI_FRAME_MODEL`) is answered `lifecycle_blocked` before any quote, reserve or call (`lib/image/lifecycle.ts`) |
| `gemini-3.1-flash-image` | **in use, uncertified** | the owner's decision (2026-10-22): it replaces Imagen 3 for Photo, as the code is structured. Image Studio and the chat image path render on it through Vertex |
| `gemini-2.5-flash-image` | unverified | Google's named Imagen 3 migration target; referenced, not the default |
| `imagen-4.0-generate-001` | off in Production | an opt-in leg (`GEMINI_IMAGEN_ENABLED=1`), Vertex only; the flag is not in the Production environment listing |

**Decision recorded:** Imagen 3 stays blocked with an explicit refusal; Photo renders on `gemini-3.1-flash-image`;
existing images and drafts stay readable. Re-opening Imagen (4) needs a budgeted contract call with the owner's OK.

## Avatar and Live

| Capability | Route | Status |
|---|---|---|
| Real-time voice call with a talking avatar (Gemini 3.8 Live with Live Avatar, built-in avatars) | Vertex Live through the EU Cloud Run relay | **verified by owner**: end-to-end on myavatar.ge 2026-10-26 14:08Z; iPhone first-try connect 2026-10-31. Open to every user since 2026-10-31 (#247): non-admins get 1 avatar session of 5 minutes a day |
| Talking video of a built-in avatar (incl. the "ბლოგერი" preset, #244) | `/api/avatar/veo`, Veo | **verified by owner** for the boy preset, Veo probe 2026-10-31 ($0.60) |
| Custom Live avatar from the user's own photo | Live Avatar custom | **BLOCKED_EXTERNAL**: Google allowlist |
| A file of *my photo* speaking *my uploaded audio*, exactly synced | none | **CAPABILITY_UNAVAILABLE** (Veo 3.1 takes no audio input). HeyGen / SadTalker / Replicate paths are refused before any charge |

## Speech

| Use | Engine | Status |
|---|---|---|
| Dictation (STT) | Cloud Speech-to-Text `chirp_3`; `STT_ENGINE=gemini` rolls back to Gemini STT | **verified by owner**: Georgian, Russian and English, 2026-11-01 07:36Z (#250, #253) |
| Read-aloud (`/api/tts/gemini`) | Gemini TTS on Vertex, `ttsModel()` (default `gemini-2.5-flash-preview-tts`), no fallback to another model; admins can trial the 3.8 TTS models | in use, uncertified; contract and evidence in `SPEECH_CONTRACT.md` and `PHASE4_EVIDENCE.md`. The owner judged the Phase 4 speech "not fixed" on 2026-10-24; the later changes have not had a new owner listening |
| Telephony and video voices | server-side Google Cloud TTS (owner decision 5, 2026-10-22) | in use, uncertified |
| Film narration check | Gemini STT on Vertex | owner card 2026-10-22; film subtitles paused (no word timings) |

## Text, agent and tools

| Use | Engine | Status |
|---|---|---|
| Chat (default "3.8 Flash") | `gemini-3.8-flash` on Vertex; `gemini-3.1-pro-preview` for Pro; lite models for small tasks | in use, uncertified; live first-token benchmark open (Phase 3 decision 3) |
| Embeddings | `gemini-embedding-001`, Vertex `:predict`, 1536 dims | in use, uncertified |
| Web search | Gemini Google Search grounding | in use, uncertified |
| Agent G code-run | Vercel Sandbox microVM (1 vCPU, 60 s, no network), admins | **verified by owner** (CODE-01 passed, #249/#251) |
| Agent G Drive connector | Google Drive, picked files only (`drive.file`) | owner chose the scope; see the Agent G registry |
| Google ADK pilot | `pilots/adk`, read-only, $0 budget, no route | built and tested with fakes (#259); a live pilot needs the owner's billing OK |

## Explicitly unavailable

| Capability | Why |
|---|---|
| Lip-sync to a user's own audio file | no Google-native route (Veo 3.1: no audio input) |
| Custom Live avatar from the user's photo | Google allowlist (`BLOCKED_EXTERNAL`) |
| Deep Research | exists only as a Developer API agent, which v3.1 forbids; the client refuses before I/O |
| Voice cloning, trained or sampled singing voice | no Google engine established; refused before any charge |
| Character swap, motion transfer (Kling), 3D model (TRELLIS), dubbing (ElevenLabs Scribe) | no Google engine; refused before any charge |
| Music remix, code terminal | not built (`MISSING` in the capability registry) |
| Film subtitles | paused: Gemini STT gives no word timings (owner card 2026-10-22) |

## Where the registry and catalog disagree with this file (found in Phase 6)

The capability registry (`lib/agent/capabilities.ts`) and service catalog (`lib/catalog/services.ts`) are what the app
and the ADK pilot's `capability_lookup` read. On `d8420a5d` some of their text is out of date:

- `video.character-swap` and `voice.dubbing` are `live` in the catalog, and `design.model3d` is `beta`, although each is
  refused before any charge.
- `music.generate` says a sung song waits "until vocals are verified"; vocals have been on in Production since
  2026-10-26.
- `video.generate` says "voice is ElevenLabs until it moves to Cloud TTS"; `voice.dubbing` names ElevenLabs Scribe.
- `avatar.talking` lists only the refused HeyGen/SadTalker routes, not `/api/avatar/veo` or Live Avatar.
- `capabilityRuns` answers `true` for `BLOCKED_OWNER` capabilities whose only routes refuse.

None of these lets a refused path spend (each refusal sits in the route, before any charge). They make the app's own
description of itself wrong, which matters for the catalog UI and for any agent that reads the registry. Correcting
them is a focused follow-up PR with tests. Hiding the three refused services (as `video.motion` was hidden in Phase 2)
takes them out of menus and search, a visible change, so it is offered to the owner rather than done here.

## How a row becomes "verified" (unchanged from v1)

1. One authorised, budgeted, owner-approved contract call per model on the Production Vertex project (never repeated
   billed probes).
2. The captured request/response fixture committed under `__tests__/fixtures/vertex/<model>/`.
3. The adapter's contract test green against the fixture.
4. This row updated with the date, project, location and fixture path.
