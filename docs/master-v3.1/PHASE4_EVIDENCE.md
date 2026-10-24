# Phase 4 evidence: speech

MASTER TASK v3.1 §5. Eight PRs, #175 to #182, each merged on its own owner decision. This page lists what each speech
defect was, what fixed it and what proves it. The promises themselves are in `SPEECH_CONTRACT.md`.

§5's acceptance says: "Verify ka/en/ru pacing with authorized audio samples before claiming the speech defect fixed."
That listening has not been done yet (owner's decision 1, after this PR). Nothing on this page claims the voice sounds
right. It shows that every sentence is asked for, checked, played in order and played once, and how much of the wait
is the app's own.

## The defects and their fixes

| Defect (before Phase 4) | Fixed by | Proved by |
|---|---|---|
| The route kept only the first audio part of a Gemini answer, so the rest of the sentence went unread. | #176: every inline audio part is read, in order (`lib/speech/geminiAudio.ts`). | `lib/speech/geminiAudio.test.ts`, `app/api/tts/gemini/route.test.ts` (multi-part fixtures from `tests/fixtures/speechAudio.ts`). |
| A WAV part was wrapped in a second header (heard as a click); PCM with no stated rate was given a default. | #175 contract and WAV checks; #176 refuses audio it cannot prove (`502 tts_bad_audio`). | `lib/speech/wav.test.ts`, `lib/speech/contract.test.ts`, the route test. |
| Text over 2,000 characters was cut without a word; Cloud TTS read only the first 5,000. | #176: `413 text_too_long` before auth, the budget or any provider call; Cloud TTS refuses instead of cutting. | The route test; `lib/audio/google-tts.test.ts`. |
| Up to 3 calls of 25 s each inside a 30 s function; the browser's stop did not reach the route; the browser retried too. | #177: one 25 s deadline, at most 2 calls, the request's abort ends the route (`499`), no browser retry. | `lib/speech/deadline.test.ts`, `lib/speech/request.test.ts`, the route test. |
| Text was cut every 180 characters (studio), at 800 (older chat screens) or mid-word every 600 (controls). | #178: one sentence chunker; every character in exactly one chunk, in order; ka/en/ru abbreviations and decimals kept. | `lib/speech/chunk.test.ts` (400 seeded random texts). |
| Four players on one page; two could play at once; a chunk that failed was skipped, so a sentence vanished. | #179: one player. A failed chunk stops the read there, and "Try again" reads on from it. | `lib/speech/player.test.ts`; in a browser, `tests/speech-readaloud.spec.ts`. |
| Hearing a reply again paid for it again. | #180: the browser keeps each chunk's audio (tab memory and IndexedDB, at most 50 MB; owner's decision 3). | `lib/speech/cache.test.ts`, `lib/speech/signout.test.ts`; in a browser, `tests/speech-readaloud.spec.ts`. |
| The turn-by-turn voice call could talk over a read-aloud, and decoded audio it never checked. | #181: a call has the speakers (`claimSpeakersForCall`); its replies go through `speechResult` and the WAV check. | `lib/speech/calls.test.ts`, `components/voice/VoiceConversation.test.tsx`. |

## In a real browser

`tests/speech-readaloud.spec.ts` (`playwright.speech.config.ts`) runs the studio chat's speaker button, the one
Production shows. The account is signed in through a session cookie and a mocked Supabase. The chat reply comes from a
mocked `/api/chat/gemini`. Each chunk's audio comes from a mocked `/api/tts/gemini` that answers a one-second
code-generated WAV with the contract headers. Nothing reaches a provider.

| Check | What it asserts |
|---|---|
| No sentence is skipped | Every chunk is asked for exactly once, in the player's order, and each one is played. The chunks put together are the whole reply. |
| Replay | Hearing the reply again sends 0 requests, in the same page and after a reload. |
| A failed chunk | Chunk 2 answers 503: chunk 1 is heard and nothing after chunk 2 is played. "Try again" asks for chunk 2 again, plays the rest, and asks for no other chunk twice. |
| Another chat | A chunk is held back, and the user opens a new chat before it arrives. Nothing plays afterwards. |
| A Live call | The read is under way and the user starts Live. `data-live-call` is set, nothing more of the read plays, and no speaker button shows a read. |

Results:

- **Chromium (local, headless, 1280 × 800):** 5 of 5 pass, in two runs in a row.
- **Chromium, Firefox and WebKit (CI):** `.github/workflows/speech-acceptance.yml` runs the spec on every PR that touches
  speech code, one job per browser. The results for this PR are in its checks.

## Timings (mock)

`perf/readaloud.pw.ts`, the same method as Phase 3 (`PERFORMANCE_PHASE3.md`): 30 samples, nearest rank, after one
warm-up that is not counted. `next dev` on a Linux container, headless Chromium at 1280 × 800, the signed-in studio
chat. The stubbed read-aloud route answers a one-second WAV after **0 ms**, so there is no provider time in these
numbers at all. They are the app's own costs (§4.1: "Mock tests establish app overhead, not real provider performance").

Timed in the page: from the click on the speaker to the `playing` event of the first chunk's audio. Each sample's reply
is new text. Beside each time, the read-aloud requests that one read caused.

- **Before:** `d773f521`, `main` just before #175. The only files added were the benchmark's own: the benchmark, the WAV
  fixture and the two `lib/speech` modules the fixture uses, which no app code imports.
- **After:** `f68f8b9c`, the code of PR 1 to PR 7. This PR changes no app code.

| Read | Before p50 / p95 | Before, requests per read | After p50 / p95 | After, requests per read |
|---|---|---|---|---|
| A reply never read before | 77.7 / 167.6 ms | 1 | 76.8 / 127.3 ms | 1 |
| The same reply again, in the same page | 62.8 / 120.7 ms | 1 | 51.8 / 85.1 ms | **0** |
| The same reply after a reload | 197.1 / 316.4 ms | 1 | 263.4 / 388 ms | **0** |

What the numbers show:

- **A first read costs what it did.** The request, the WAV check and the element's start take about the same time.
- **Hearing a reply again is free.** Before, every replay was a new paid synthesis. After, 0 requests in 30 replays in
  the page and 0 in 30 replays after a reload.
- **After a reload, the first read is the slowest case in both columns.** After Phase 4 it is 66 ms slower at p50 than
  the before run. Before, the audio came from a loopback answer that took 0 ms. After, it is read back from IndexedDB,
  and the database is opened on that first tap. With a real provider the before case would add Gemini TTS's time, which
  this run did not measure.
- **The 300 ms limit on the device read.** A device read that takes longer than `SPEECH_STORE_TIMEOUT_MS` (300 ms) is
  given up for the page, and the audio is asked for again (paid). In these runs every device read came back in time.
  How close a slow phone comes to that limit is not measured. Opening the database before the first tap would take the
  opening out of the tap; that is not changed here.
- **The §4.1 target** (warm inline read-aloud, first audible speech, p95 ≤ 2.5 s) is not judged. It includes the
  provider's time, and the fixture's is 0 ms.

To reproduce: `npm run perf:browser`, or `npx playwright test -c playwright.perf.config.ts perf/readaloud.pw.ts`, then
`npm run perf:report`. `PERF_FIXTURE_TTS_MS` sets the route fixture's delay.

## What this does not show

- **How the voice sounds.** The audio is a code-generated tone. Pacing and naturalness in Georgian, English and Russian
  need the owner's listening of real samples on Production (decision 1).
- **Provider latency.** How soon a real voice starts depends on Gemini TTS. Only an authorised live run measures it, and
  none was made.
- **Phones.** No phone-sized browser was timed. iOS Safari's unlock of the audio element inside the tap is covered by
  `lib/speech/player.test.ts`, not by a device.

## Open

- The Agent G delegate's voice sub-task (`app/api/agent-g/delegate/route.ts`) still asks `/api/tts/gemini` for audio and
  throws the audio away. That is paid synthesis no one hears. It was reported to the owner and is not changed in Phase 4.
