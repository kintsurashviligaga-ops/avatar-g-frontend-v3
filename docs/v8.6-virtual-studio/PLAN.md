# Phase 8.6 — Virtual Studio (script → scenes → presenter → one presentation)

Flag: `AVATAR_STUDIO_V2` = `off` (default) | `admin` | `everyone`. Full plan and gap analysis: https://claude.ai/artifact/BFp9S3HygrbpsbHTq7exWf

## What Vertex allows (checked 2026-11-15)
- **Gemini Omni 1.2 Flash** (image-to-video): any built-in face as the first frame, Georgian speech in its own voice, 3–10 s a call, extends to 40 s. No audio input ("Uploading audio references is unsupported"), no voice control ("Voice editing is not supported"). Tone and gestures are prompt words only.
- **gemini-3.8-live Live Avatar**: prebuilt Kira, Ben, Leo open on our project; named voice (`speechConfig`, Algieba/Kore/…); native lip sync; 704×1280 portrait. Custom faces are allowlist-only.
- No engine has rate, pitch or gesture parameters.

## Two engines
| | Live presenter (default) | Omni "Cinematic" |
|---|---|---|
| Faces | Kira, Ben, Leo | the Avatar panel's built-in faces |
| Voice | named voice, real lip sync | Omni's own voice; a named voice = labelled dub (lips approximate) |
| 30 s scene (v8) | ✦27 | 720p ✦250, 1080p ✦367 (+✦2 dub) |
| Karaoke | Live transcript timing (free) | Chirp 3 word offsets (+✦1) |

## PRs
- **A (this)**: pure `lib/avatar/studio` — catalog, scene splitter, Omni turns, karaoke timing + SRT + verbatim check, prices (65 % floor tested), prompts, stitch input + 16:9 compose argv, plan builder. Mocked tests. Nothing wired.
- **B**: routes `/api/avatar/studio/{plan,approve,scene,stitch}`, Studio panel, storyboard, Presenter Card, relay `/render` (code only; deploy needs GG's OK).
- **C**: Agent G "presentation from script", Use in Video (Director's Workflow), Library, SRT download, Change voice.

## Open decisions (D1–D6 in the plan doc)
D1 Live default · D2 prices · D3 Algieba-on-Omni as labelled dub · D4 ~$1 paid probe after GREEN · D5 relay `/render` deploy · D6 pace chips everywhere, speed/pitch sliders only on the dub.

## GG decisions (2026-11-15 11:07Z)
- D1 Live presenter (Kira, Ben, Leo) is the default; Omni is the premium "Cinematic" option.
- D2 Prices approved: Live ✦27 / 30 s, Cinematic 720p ✦250, 1080p ✦367, Algieba dub +✦2, background ✦8.
- D3 Algieba (any named voice) on Omni is offered as "Studio voice (lips approximate)".
- D4 ~$1 paid probe (Live renders, Omni green-screen test, Chirp timings) only after Supabase is back online.
- D5 Approved a relay /render endpoint at 0 % traffic. PR B records Live takes from the server as a relay client, so no
  relay change is needed; /render is added only if GG still wants it.
- D6 Pace chips everywhere; exact speed/pitch sliders only on the dubbed Studio voice.

## PR C (Agent G + Use in Video + Library + Studio voice) — built
- Studio voice (D3/D6): Omni + a named voice → after the last turn the named Gemini-TTS voice reads the scene
  (`synthesizeGoogleTts` `geminiVoice`), speed 0.8–1.25 and pitch −4…+4 semitones are applied with ffmpeg
  (`voiceAdjust.ts`), and the line is laid on the mouth with `speechMatch.planDub`. No retake for a dubbed scene (it
  reads every word); words timed by Chirp on the dubbed clip. A dub miss keeps the scene in Omni's voice, warns
  `dub_failed`, and refunds only the dub's credits (ref `:dub-refund`).
- Agent G (`agent.ts`): "Make a presentation from this script: …" in ka / en / ru, with presenter / voice / format hints
  → the chat shows the Studio as a card (OmniStudio, behind `NEXT_PUBLIC_AVATAR_STUDIO_V2`); nothing is charged until Make.
- Use in Video: Montage (in production, via `lib/studio/pendingEdit` or the chat's own Montage) or a ready scene for the
  Director's Workflow (`videoHandoff.ts`, read by #355 once merged). Free.
- Library: the joined presentation is filed as an avatar video `vstudio_<projectId>` (a re-join replaces it).
