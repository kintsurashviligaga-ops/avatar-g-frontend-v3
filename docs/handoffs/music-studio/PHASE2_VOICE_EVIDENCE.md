# Music Studio v1 — Phase 2 · Agent G Live Voice evidence

## What was built (reusing the existing Live architecture)
| Layer | File | Change |
|---|---|---|
| Declaration + validator | `lib/voice/liveTools.ts` | New tool `music_studio`, actions `plan · edit · join · status · cancel · download · save`. Strict validator: prompt required for plan; genre/mood cleaned to the contract alphabet; bpm 40–220; lyrics / lyricsLanguage / voice only with `mode: song`; a lyrics language without lyrics is dropped; join count 2–6, crossfade 0–10, mp3/wav/m4a. **No `start`, no `confirmed` field.** `LIVE_ACTIONS_RULE` tells the model it can never start or charge. |
| Browser executor | `components/voice/live/liveActions.ts` | `music_studio` → the studio event; no countdown, no `run`, no approval record (nothing to approve: voice cannot start). |
| Studio listener | `components/studio/OmniStudio.tsx` | `music_studio` → `handleMusicVoice`; plan adds the plan card to the thread. Refused when the client flag is off or (for plan) signed out. |
| Bridge | `components/studio/music/musicVoiceBridge.ts` | Registry of mounted cards; plan dedupe (same request within 20 s → no second card); status (phase, price, stage, refusal, tracks); cancel only a running job; edit newest track (same parser as the typed box); join newest N tracks; download newest track; save → "already in the Library". |
| Card | `components/studio/music/MusicStudioCard.tsx` | Registers; Create carries `data-live-guard="spend"` (the call's `click` tool refuses it); sends `[App] Music Studio: …` notes (priced, refused, ready, failed, cancelled, edit made). Synchronous busy guard. |
| Notes to the model | `components/voice/GeminiLiveConversation.tsx` | New `music` note kind. |

## Money rule (Speech never authorizes spending)
Voice can only put a **priced plan card** on screen. The single way a Music Studio job starts is the card's **Create** button, pressed by the signed-in user (an authenticated `POST /api/music/studio/jobs` with `confirmed: true` + the HMAC quote). The call's own `click` hand refuses it (`data-live-guard="spend"`). Asserted by unit tests (declaration has no start/confirm field; executor returns no `run`) and by the browser spec (balance unchanged after plan + status; Create carries the guard).

## Commands → evidence
| Command | Unit | Browser (tool-dispatch, local stack) |
|---|---|---|
| Create instrumental | validator + bridge | plan → card quoted, 5 credits, nothing charged |
| Lyrics / vocal song | stays `song`; refusal is said, never swapped | card `refused` with `songRefused` copy (KA "ნამღერი ვოკალი … ინსტრუმენტულად არ შეცვლილა", EN "Sung vocals are not verified … not turned into an instrumental"), server `400 unsupported` on /quote, no Create button, no charge |
| Genre / mood / tempo change | a change = a new plan (new quote) | genre/mood chips shown on the card |
| Trim / volume / fade | edit words → same parser as typed box | `trim from 0 to 12 seconds`, `fade in 2 seconds` → new versions |
| Join | newest N, crossfade | join 2 with 2 s crossfade → new version (> 21 s) |
| Save to Library | "already saved" | answer checked |
| Download | newest track | browser download event, file name checked |
| Cancel job | only a running card | `[e2e:slow]` job cancelled → ledger `-5, +5` exactly once |
| Check progress | status | phase starting/running/completed read during the job |
| Duplicate prevention | dedupe + busy | second identical plan → no second card; second edit in the same tick → `busy` |
| KA / EN / RU | copy parity | ka and ru cards: `შექმნა · 5 კრედიტი`, `Создать · 5 кредитов` |
| Error feedback | refusals carry the server sentence | no track / nothing running / busy answered `ok:false` |

Unit counts: liveTools 88, liveActions 72 (incl. new music test), bridge 7 + download-link test.
Browser results: see PHASE2_E2E_MATRIX.md (both voice specs PASS desktop + phone on runs 38554579460 and later).

**Spec readiness (2026-10-14):** a call dispatched right after `data-authed` can reach the page before OmniStudio's listener mounts and is silently not taken (run 38550746462, RU plan: `took:false`). Specs wait for `studioReady()` (a read-only `status` probe is taken + `data-uid` set). In real use the Live call UI lives inside the mounted studio, so this gap is a test-harness race.

## What is NOT proven
- **Real microphone E2E: NOT_TESTED.** No audio input was captured; no speech recognition and no Gemini Live session were exercised. The browser spec dispatches the validated tool call at the executor→studio boundary.
- **Model tool selection / multi-turn behaviour of Gemini Live: NOT_TESTED** (needs a live session with a Gemini key; the declarations and rule text are pinned by unit tests).
- **Connection recovery**: a reload lands on a fresh chat (product rule); reopening the thread from History returns the card to the same job (PROVEN_ISOLATED desktop on run 38557521565; final status in the matrix). The Live session's own reconnect is the existing hook's, unchanged.
