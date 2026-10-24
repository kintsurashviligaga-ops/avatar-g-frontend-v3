# Speech contract (read-aloud)

MASTER TASK v3.1 §5, Phase 4 (PRs #175 to #182). This is the one contract between the browser's readers and the
read-aloud route. The code is the source of truth: `lib/speech/*` and `app/api/tts/gemini/route.ts`. This page says
what they promise and where each promise is tested.

## Who reads aloud

There is one player per page: `speechPlayer()` in `lib/speech/player.ts`. It owns one `<audio>` element. All four
readers use it:

| Reader | Owner name | Where |
|---|---|---|
| Studio chat speaker button (the one Production shows) | `omni:<chat id>:<message index>` | `components/studio/OmniStudio.tsx` `speakMsg` |
| Older chat screens | `premium` | `lib/audio/premium-tts.ts` |
| Research report | `research` | `components/studio/research/speech.ts` |
| Read-aloud controls (behind `NEXT_PUBLIC_VOICE_EXPERIENCE_V2`, unset in Production) | `controls:<id>` | `lib/voice/experience/readAloud.ts` |

`play` stops whatever is being read, whoever started it. A speaker button's tap toggles: the same owner's tap stops its
read, a failed read is tried again, and anything else starts a new read.

The two voice calls are not readers. They have the speakers while they are on:

- **Gemini Live** takes the microphone when it starts (`requestMicRelease('live')`), which stops the read. It sets
  `<html data-live-call>`, and no read starts while that is set.
- **The turn-by-turn voice call** (`components/voice/VoiceConversation.tsx`, used when Live is unavailable) calls
  `claimSpeakersForCall()` while it is open. That stops the read and sets `<html data-voice-call>`. It plays its own
  replies through Web Audio and asks for them through `speechResult` (below).

## The request

`POST /api/tts/gemini`, JSON `{ text, locale }`, with the session cookie (`lib/speech/request.ts`).

- `locale` is `ka`, `en` or `ru`.
- `text` is one chunk. The browser cuts a message with `chunkSpeech(text, { leadSentence: true })`
  (`lib/speech/chunk.ts`):
  - every character is in exactly one chunk, in order;
  - a chunk is whole sentences, at most 600 characters;
  - the first sentence is a chunk of its own when it is short, so speech starts sooner;
  - a sentence longer than the limit is cut at a clause mark, else at a space;
  - Georgian, English and Russian abbreviations and decimals do not end a sentence.
- The route refuses text over `SPEECH_MAX_CHARS` (2,000) with 413 `text_too_long` before any provider call. It never
  cuts text silently.
- At most `SPEECH_AHEAD` (2) chunk requests are in flight at once.
- The browser waits `SPEECH_CLIENT_DEADLINE_MS` (28 s) and never retries a chunk itself.
- The caller's stop (another message, another chat, a call, unmount, sign-out) aborts the request, so the route stops
  too.

## The route's time and attempts

`lib/speech/deadline.ts`:

- one deadline of `SPEECH_DEADLINE_MS` (25 s) from when the request arrived, inside the 30 s function limit;
- at most `SPEECH_MAX_ATTEMPTS` (2) Gemini calls. The second call happens only for a failure that can pass (network,
  408, 429, 5xx, the answer-mode 400) and only with at least 5 s left;
- the browser closing the request ends it with 499 `client_closed`; the deadline passing is 504 `tts_timeout`.

The route is Vertex only (`googleModelFetch`). It is signed-in only (401) and rate limited (`RATE_LIMITS.TTS`, 60 a
minute). It checks the platform budget before any provider call (503 `budget_exhausted`). There is no fallback to
another provider or another billing path.

## The answer

On success: 200, `Content-Type: audio/wav`, and one WAV that passes `inspectWav` (`lib/speech/wav.ts`).

The WAV must be RIFF/WAVE, PCM, 16 bit, 1 or 2 channels, with a sample rate from 8,000 to 96,000 Hz stated in its header. The data
must be whole frames and match the stated size. It must not be wrapped twice.

The route reads every inline audio part of the Gemini answer, in order (`lib/speech/geminiAudio.ts`). It checks the
stated MIME type against the bytes and wraps raw PCM once.

Headers:

| Header | Meaning |
|---|---|
| `X-Speech-Contract` | `SPEECH_CONTRACT_VERSION` (1) |
| `X-Speech-Sample-Rate`, `X-Speech-Channels`, `X-Speech-Frames` | The WAV's layout; duration = frames / rate |
| `X-Speech-Model` | The TTS model that answered |
| `X-Voice-Name` | The voice |
| `X-Speech-Pacing` | `SPEECH_PACING_VERSION;lang=<language code sent>` (`auto` when none was sent) |
| `Cache-Control` | `no-store`: replay is the browser's job (below), not an HTTP cache |

The `Read aloud verbatim:` directive stays in the prompt (GG's decision 2, 2026-10-24). It is not spoken. Without it,
question text gets HTTP 400 "Model tried to generate text".

Errors are JSON `{ error }`: 400 `text is required`, 401, 413 `text_too_long`, 429, 499 `client_closed`, 502
`tts_failed` / `tts_empty` / `tts_bad_audio`, 503 `budget_exhausted` / `gemini_key_missing`, 504 `tts_timeout`.
`speechResult` hands the status and the error code to a caller that needs them. The voice call uses it to stop on
the AI limit with its own message.

## Playback

- A chunk that fails is never skipped. "Failed" means no audio, bytes that fail the WAV check, an element error, a
  stall, or the browser refusing to play. The read stops there as `failed`, at that chunk's offset.
- "Try again" reads on from that chunk. Audio already fetched for later chunks is kept.
- "Done" comes only after the last chunk has ended.
- One object URL exists at a time, and it is revoked when its chunk ends or the read stops.
- The element is unlocked inside the tap (iOS/Safari) and reused for every chunk.
- `playbackRate` is 1 unless the read asks for another speed. A speed never corrects audio; the WAV states its rate.

## Replay

`lib/speech/cache.ts`, `lib/speech/store.ts`. GG's decision 3: browser only, no shared database change.

- Each chunk's audio is kept in tab memory (24 MB) and in this browser's IndexedDB `myavatar-speech` (50 MB). The
  least recently used audio goes first. Hearing a reply again sends no request, after a reload too.
- The key is SHA-256 of [contract version, account, locale, profile, chunk text]. The profile is built from the
  headers above (`speechProfile`). An edited message is new text; a new model, voice or pacing is a new profile, and
  the old audio for that locale is dropped.
- ⚠️ The profile is learned from answers. Until a browser gets one fresh answer after such a change, text it already
  heard replays as it sounded then.
- Nothing is kept for a guest. Audio is kept only after it passes the WAV check, and is checked again when read back.
- Signing out stops the read and clears both copies. An IndexedDB read that takes over 300 ms gives up the device copy
  for the page.

## Where it is tested

- Jest, no network: `lib/speech/*.test.ts`, `app/api/tts/gemini/route.test.ts`,
  `components/voice/VoiceConversation.test.tsx`, `components/studio/research/speech.test.ts`,
  `lib/voice/experience/readAloud.test.ts`, `lib/audio/premium-tts.test.ts`.
- Browser: `tests/speech-readaloud.spec.ts` (`playwright.speech.config.ts`). It runs on the studio's speaker button,
  against a mocked chat and a mocked route serving code-generated WAVs. CI runs it in Chromium, Firefox and WebKit
  (`.github/workflows/speech-acceptance.yml`). It checks:
  - every chunk is asked for once, in order, and played;
  - a replay sends 0 requests, also after a reload;
  - a failed chunk stops the read and "Try again" reads on from it;
  - a chat switch plays nothing late;
  - a Live call stops the read.
- Timings: `perf/readaloud.pw.ts` (`npm run perf:browser`) times the tap to the first chunk's `playing`, for a reply never
  read, the same reply again and the same reply after a reload, with the request count of each. The numbers are in
  `PERFORMANCE_BASELINE.md` and `PHASE4_EVIDENCE.md`.
- What these do not show: how a voice sounds. Pacing and naturalness for ka/en/ru need the owner's authorised listening
  samples (Phase 4 decision 1). The browser timings are app overhead with an instant fake provider, not provider
  latency (§4.1).
