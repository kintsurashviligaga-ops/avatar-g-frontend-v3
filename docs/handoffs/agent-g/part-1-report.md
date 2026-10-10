# Agent G Autonomous Execution — PART 1: one agent architecture

The owner asked for this on 2026-10-10 at 05:49Z, with the Gemini supplement at 06:00Z (Master Task thread). It continues
from PART 0 (`95a5e015`, `docs/handoffs/agent-g/part-0-report.md`) on branch `claude/launch-certification-wmvitt`, draft
PR #50. Nothing was merged, deployed, migrated or paid for. No Gemini call was made, and Production was not touched.

## 1. What PART 1 set out to do, and what it did

| Gap (PART 0 §6) | What changed | Label |
|---|---|---|
| A1: no shared contract | `lib/agent/contracts.ts`: AgentRequest, AgentIntent, IntentParams, AgentToolSpec, AgentQuote, AgentApproval, AgentAction, AgentPlan, AgentStep, AgentRun, AgentArtifact, AgentExecutionResult, one RunStatus set with a transition table | BUILT, TESTED |
| A1 / A3 / A5: one reader for KA / EN / RU | `lib/agent/intent.ts` classifies a message as control / talk / question / feedback / act / unavailable / chat. It calls the existing detectors (focus gate, studio intent, catalog router, montage and MP3 detectors) and keeps no second word list | BUILT, TESTED |
| A2: Product / Swap / Remix start a paid job on any Enter | Run in those tools first asks whether the words are talk, a question or feedback; if so, the message goes to the chat and nothing is charged | BUILT, TESTED (browser test pending, §8) |
| A2: „არ მომწონს" in Image mode became a priced card | The focus gate has a `feedback` reason: a complaint with no change named is answered in words. A complaint that names the change („არ მომწონს, ფერები გაათბე") stays a prompt | BUILT, TESTED |
| A3: stop / where are you / continue | Typed controls in the chat. "Stop" stops exactly what runs (plan cards, the browser queue, cancellable server jobs, the reply being written) and says what it stopped. "Where are you" lists the work with its stage and percent. "Continue" resumes a cut-off reply, points to a plan waiting for Start, or retries the last failed card | BUILT, TESTED |
| A4: edits of the previous result | Answered honestly: Agent G says this edit cannot run on a result yet, instead of drawing a new picture or starting a new film. The real edit is PART 3 | PARTIAL (honest refusal; edit in PART 3) |
| A5: montage words | „მუსიკა 5 წამიდან დაიწყე", "20-second", „20-წამიანი", "16:9" reach the montage quote. A change typed under a plan card re-quotes the same files, and the old card says it was replaced. The music start lands on the first beat at or after the asked second | BUILT, TESTED |
| A7: 14 dead stacks | A ratchet test pins their 19 importers; the list may only shrink. Removal waits for the owner's word | BUILT, TESTED |
| R1: no typed capability record | `lib/agent/capabilities.ts`: 25 records (22 catalog services + Agent G montage, MP3 extraction and media edit) with routes, timeout, price key, charge, approval step, retry, idempotency, cancel, QC, artifact, library and proof label. A test pins every field it can to the code | BUILT, TESTED |
| R2: music.remix, code.terminal | Recorded as MISSING with the reason; no door offers them | DONE (as records) |
| G0: Gemini capability matrix | §7 below | WRITTEN; the proven columns are filled in PART 7 |
| G2: native function calling from the registry | `lib/agent/tools/declarations.ts` turns the registry's zod schemas into Gemini declarations and answers a model's calls through `bindTools`. A labelled corpus of 49 messages fixes the comparison set. The live comparison needs paid calls | BUILT, TESTED offline; live comparison BLOCKED_OWNER |

## 2. Contracts (`lib/agent/contracts.ts`)

One vocabulary every door can speak: the chat, Live Voice, the panel buttons, the ReAct agent and the Task API. These
types are the shared words only; the working parts still do the work. The rules the types carry:

- **An approval comes only from a person.** `AgentApproval.channel` is a tap, a panel's own button, or (PART 4) a
  voice transcript the server recorded. A model's output cannot make one.
- **A question is never an act.** `AgentIntent` keeps talk, question and feedback apart from act, and
  `intentCanSpend()` is true only for an act with nothing missing.
- **A run moves only forward.** `RUN_TRANSITIONS` allows no move out of a finished run and no completion after a
  cancel. `runStatusOfTask()` maps the Task API's five statuses onto it. PART 2 puts the multi-step runs on it.

## 3. The intent reader (`lib/agent/intent.ts`)

`classifyAgentIntent({ text, attachments, mode, previous, pending })` returns one of:

- **control**: stop / status / continue. Only short messages with filler around the phrase count. A file plus „stop"
  is not a control.
- **talk / question / feedback**: never spends.
- **act**: names the capability, its parameters (aspect, length, music start, language, edit op, the source), its
  target (attachment / link / previous result / plan on screen / new) and what is missing.
- **unavailable**: a coming-soon service says so.
- **chat**: anything else goes to the plain chat, as today.

Languages are read from the script. Georgian and Cyrillic never use `\b` (it does not see those letters): word edges
are `(?<![\p{L}\p{N}])` with the `u` flag throughout.

Four detectors were made to read real words while doing this:

- the studio router's length miner now reads „20-წამიანი" and "20-second" (the hyphen used to stop it)
- «переведи это видео в 9:16» is no longer read as dubbing: `переведи` means both translate and convert
- `mineMusicStart` reads where the music should start, and `minePlanParams` reads a plan change with "the later line
  wins" across lines
- the focus gate shares its talk detector (`talkReason`) and its question detector instead of the reader keeping a
  copy

### The owner's 13 sentences

What the chat does with each one today, with Agent G media on (Preview admins; off in Production):

| # | Sentence | Reading | What happens |
|---|---|---|---|
| 1 | „ამ სამი ვიდეოდან მუსიკალური კლიპი გამიკეთე." | act agent.montage | clips + track: the plan card with price and Start. Clips only: Agent G asks for the track and keeps the files in the composer. Nothing runs |
| 2 | „ამ ვიდეოდან ამოიღე ხმა MP3-ად." | act agent.audio-extract | with the file or link: the MP3 card. With nothing: Agent G asks for the source |
| 3 | „მუსიკა 5 წამიდან დაიწყე." | act agent.montage, target = plan on screen | the plan is re-quoted with the same files and the music from the first beat at or after 5 s. The old card says "Plan changed" |
| 4 | „ვიდეო 9:16-ზე გადაიყვანე." | act media.edit | Agent G says it cannot change a video's frame on its own yet, and no other service is started. («Переведи это видео в 9:16» used to open dubbing.) The edit is PART 3 |
| 5 | „გააკეთე 20-წამიანი რეკლამა." | act video.product-ad, 20 s, needs the product photo | the chat opens the Product ad tool with the words as its prompt, as before; the photo is picked in the panel and nothing runs from words. Handing the 20 s to the tool is PART 3 |
| 6 | „ეს ფოტო გააცოცხლე." | act video.generate from the image | with the photo: the existing image-to-video path. Without: Agent G asks for the photo |
| 7 | „სუბტიტრები დაამატე." | act video.remix, captions | with a video: the remix card. Without: Agent G asks for the video |
| 8 | „ეს ვიდეო რუსულად გაახმოვანე." | act voice.dubbing, ru | the dubbing tool opens, as before, with Russian read as the target; it runs only from its own button with the price |
| 9 | „წინა შედეგს ფერები შეუცვალე." | act video.remix, target = previous result | Agent G says an edit of a result is not possible yet. It used to draw a new picture. PART 3 |
| 10 | „იგივე პერსონაჟით შემდეგი სცენა გააკეთე." | act video.generate, same character, previous | the same honest answer. It used to start a fresh storyboard. PART 3 |
| 11 | „სამუშაო შეწყვიტე." | control stop | stops what runs and says what. With nothing running it says so and sends nothing |
| 12 | „სადამდე მიხვედი?" | control status | lists the work with stage and percent, or says nothing is running |
| 13 | „შენი წინა ნაბიჯიდან გააგრძელე." | control continue | resumes a cut-off reply, points at the plan waiting for Start, or retries the last failed card. Otherwise it says there is nothing to continue |

All 13 have regression tests in KA, plus the EN and RU equivalents (`lib/agent/intent.test.ts`, 73 tests).

## 4. The chat's own turn (`lib/agent/chatTurn.ts`, `components/studio/OmniStudio.tsx`)

`planChatTurn(text, snapshot)` is a pure decision: the chat's state in, one step out (pass, say, stop, continue the
stream, redo, re-quote). OmniStudio builds the snapshot from what is on screen (cards, the tray, durable server jobs,
the reply being written) and carries the step out. It runs first in `send()`, before the old chain, and only when the
words were typed (a card's own Start or a voice tool's explicit call skips it). When it passes, the old chain runs
unchanged.

Three rules it keeps:

- **Stop never claims more than it stopped.** A server job that cannot be cancelled (a studio render) is not listed as
  stopped.
- **A question or a missing file never spends.** "Ask" keeps the text and the files in the composer, so the user only
  adds the missing piece.
- **A plan change re-quotes; it never runs.** Only Start runs a plan.

Messages Agent G writes this way are marked as notices, and the history sent to the model leaves them out. A „stop"
does not become context for the next answer.

## 5. The capability registry (`lib/agent/capabilities.ts`)

25 records: the 22 catalog services plus `agent.montage`, `agent.audio-extract` and `media.edit`. Each says what runs it,
how it is charged, what approval stands before the spend, how long it may run, what happens on a miss, what makes a
second press not a second job, how it is stopped, what is checked before delivery, what it delivers, where it is filed,
and its proof label.

Labels, never higher than the 22-service trace (service audit §6): 11 BUILT_NOT_PROVEN, 9 BLOCKED_OWNER (forbidden
primary engine until `MEDIA_GOOGLE_ONLY`, or an open price), 2 PARTIAL, 3 MISSING (music.remix, code.terminal,
media.edit). None is PROVEN.

`capabilities.test.ts` pins:

- one record per catalog service, with the catalog's own quote key
- every route file exists, and the timeout is the longest `maxDuration` among them (read from the files)
- a record with no route is MISSING or runs on the device
- a coming-soon service is MISSING
- every model-callable quote tool exists in the live registry and leads to a confirmed action that exists
- nothing charged runs without an approval step

It routes nothing. The intent reader decides what a message asks for, and the existing doors run it. The Live tools
(PART 4) and the certification read it.

## 6. Function calling from the registry (`lib/agent/tools/declarations.ts`)

- **One source.** Declarations are generated from the same zod schemas `bindTools` parses with, so what the model is
  told and what the server accepts cannot drift. A schema type Gemini's subset cannot express fails at load, in the
  test, not at runtime.
- **A call is a request, never an authorization.** Only the registry's read / prepare / quote tools are declared. The
  confirmed actions (montage run, MP3 run) are never declared. An unknown tool, a bad input or a call over the limit
  comes back to the model as an observation it can correct. Nothing runs from it.
- **Ids are kept.** Parallel calls are answered one to one by id (a recorded response with six calls is in the test).

**The comparison set.** `lib/agent/intentCorpus.ts` holds 49 labelled messages:

- the 13 sentences, with and without their files
- EN and RU equivalents
- the production reports' "აქ ხარ?" / „მადლობა" / price questions
- feedback, missing inputs and plain chat

The deterministic reader scores 49 / 49. A Gemini router scores against the same set, for accuracy and latency, before
it may take any lane (PART 7). That run makes paid Gemini calls, so it waits for the owner's word: **BLOCKED_OWNER**.
Deterministic routing stays wherever it is faster and as accurate, as the supplement asks.

## 7. Gemini capability matrix (G0)

Read from the code and from the recorded live checks (GCP Part 0, A2, `lib/ai/google/models.ts`). No call was made for
this table. "In use" means real Production traffic goes through it. PART 7 fills a proven column for each row.

| Capability | Used for | Gemini API key (Production) | Vertex (Preview, `GEMINI_TRANSPORT=vertex`) | Next |
|---|---|---|---|---|
| Text chat, streaming (3.8 / 3.6 / 3.5 Flash, 3.1 Pro, 3.1 / 3.5 Flash-Lite) | the chat | in use | INFERENCE VERIFIED (A2, 2026-10-08) | Production transport = BLOCKED_OWNER |
| Inline image, PDF, audio parts | the chat's attachments | in use (image / audio input answered 200, 2026-09-30) | same request body; not checked separately | PART 7 |
| Whole-video understanding of the user's own file | none: the chat sends 8 frames + 60 s of speech | not used | not used | PART 3 (G1); test spend = BLOCKED_OWNER |
| Public YouTube URL, analysis only | none | not used | not used | PART 3, analysis only, never a download; test spend = BLOCKED_OWNER |
| Native function calling | Live Voice (25 hand-written declarations) | in use (Live) | not used | registry declarations BUILT (§6); Live from the registry in PART 4 |
| Google Search grounding | the chat's `google_search` | in use, with sources | same tool in the request; not checked separately | dates and page data in PART 5 (G6) |
| URL context | the chat's `url_context` | in use | not checked | PART 5 |
| Implicit context caching | automatic on current models | not recorded (`cachedContentTokenCount` is not read) | not recorded | PART 5 records it (G3) |
| Explicit context cache | none | not used | not used | only if PART 5's numbers justify it; BLOCKED_OWNER (billed resource) |
| Live (native audio) | Live Voice | in use: `gemini-2.5-flash-native-audio-latest`, verified in Georgian 2026-09-30; `gemini-3.8-live` listed, not verified | not available: the browser token is an API-key feature; Vertex Live needs a server relay | model check PART 4; relay host = BLOCKED_OWNER |
| Text-to-speech | voice answers | in use (flash-preview TTS, verified in Georgian) | not used | none |
| Embeddings | memory search | in use (`embedContent`) | served through `predict` (transport supports it); not checked | PART 2 (G4) |
| Gemini image | image (Google path) | in use | INFERENCE VERIFIED (GCP Part 0) | `MEDIA_GOOGLE_ONLY` = BLOCKED_OWNER |
| Lyria | music | in use | INFERENCE VERIFIED (GCP Part 0) | none |
| Veo | video | not used (Vertex only) | INFERENCE VERIFIED (2026-10-08, WIF) | none |
| Imagen 4 | none | not used | 404 on Vertex | none |
| Retired 1.0 / 1.5 / 2.0 | none | refused by the catalog | refused | none |

There is no silent fallback. An unconfigured or unknown `GEMINI_TRANSPORT` fails closed and names the missing
variables (`lib/ai/google/transport.ts`). Where a feature is missing on Vertex, the matrix records it as a blocker;
nothing switches to the API key.

## 8. Tests and checks

| Check | Result |
|---|---|
| New suites | intent 73, corpus 49, chatTurn 33, intentReply 21, params 19, declarations 13, capabilities 7, deadStacks 4: **219 tests, 0 failed** |
| Related suites (agent, media, focus gate, studio intent, beat plan) | 27 suites passed, 2 skipped (opt-in database suites); 701 passed, 0 failed |
| Whole repo `jest` (`--maxWorkers=3`) | 755 suites passed, 2 skipped (opt-in database suites); 11,633 tests passed, 12 skipped, **0 failed** (PART 0 baseline: 747 / 11,391) |
| `tsc --noEmit` | 0 errors |
| `eslint` on the changed files | 0 errors; 13 warnings, all already on `95a5e015` |
| Playwright (`agent-g-montage`, `agent-g-gate`, `agent-g-audio`, on `next dev`) | 35 tests. The first run passed 33. The two misses were (a) a real bug, fixed: a re-quote gave two attachments with identical bytes the same uploaded path (the upload memo now keeps one path per copy); (b) a test that asked "how far along" before the job's 55 % reached the card (it now waits for it). After the fix the montage spec passed 13 of 14. The 14th, the iPhone save test, failed before its body ran: the page did not load the composer within 45 s on a cold dev compile. A single re-run of that group passed 8 / 8. The gate and audio specs did not change after the first run (21 / 21) |
| HawkScan | not run: `HAWK_API_KEY` is not set (certification §P). PART 1 adds no route; the montage route takes one more optional number, bounded by the quote |

The four new browser tests drive the real chat with the server routes stubbed:

- a plan change re-quotes with the same files, and the old card says it was replaced
- „სამუშაო შეწყვიტე" during a run sends one cancel to the task route and says what stopped
- with nothing running, "stop" and „სადამდე მიხვედი?" say so and send nothing
- clips without a track: Agent G asks for the track, keeps the files and plans nothing

Local runs need CI's dummy Supabase settings (`NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co` and an anon key,
as in `.github/workflows/e2e.yml`) and `-c playwright.local-chromium.config.ts` for the sandbox's Chromium. Without the
settings every upload fails in the browser, and all montage tests fail.

## 9. What can still fail for a real user

- Agent G media is off in Production, and on a Preview it is open to admins only. Every montage and MP3 path in this
  part has run only in tests and on the owner's admin session.
- The reader is rules over words. A sentence outside the corpus can be read as plain chat. That is the safe side (chat
  spends nothing), but the user then has to use a tool's own panel. The corpus grows with every report.
- "Stop" cannot stop a studio render on the server (Task API 409, T3). The chat says only what it stopped; the render
  still finishes. PART 2.
- Edits of a previous result, frame changes and the next scene with the same character are refused in words until
  PART 3.
- A voice "yes" is still the model's word until PART 4. This part changes typed chat only.

## 10. Owner decisions (unchanged, BLOCKED_OWNER)

- the paid Gemini comparison over the corpus, and the paid file-analysis and Live model checks
- Production `GEMINI_TRANSPORT`, `MEDIA_GOOGLE_ONLY`, `20261002d`, the lip-sync charge, the price table
- PR #50 merge and the Production deploy
- removal of the 14 dead stacks (the ratchet only stops new use)

## 11. Next: PART 2

- one status model across `generation_jobs`, the Task API and the cards
- multi-step `agent-run` jobs on the lease queue (parent, steps, checkpoints, resume, cancel, `partially_completed`),
  with no migration
- run events for the streaming task view (G8)
- memory that every surface reads, with a cap and "delete all" (G4)
