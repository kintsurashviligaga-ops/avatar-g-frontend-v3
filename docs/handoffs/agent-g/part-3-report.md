# Agent G Autonomous Execution — PART 3: media execution coverage

The owner asked for this on 2026-10-10 at 05:49Z, with the Gemini supplement at 06:00Z (Master Task thread). It continues
from PART 2 (`438cc918`, `docs/handoffs/agent-g/part-2-report.md`) on branch `claude/launch-certification-wmvitt`, draft
PR #50. Two commits: `60d1cfdd` (the edit action itself) and the commit that carries this report (the chat side and
"analyze my file").

Nothing was merged, deployed, migrated or paid for. No Gemini call was made and Production was not touched. The edit
sits behind the same switch as before, `AGENT_G_MEDIA_EXEC` (off in Production, admins only on a Preview). File
analysis has its own switch, `AGENT_G_FILE_ANALYSIS`, which is **off everywhere, a Preview included**, because every
analysis is a paid model call.

## 1. What PART 3 set out to do, and what it did

| Gap (PART 0 §6) | What changed | Label |
|---|---|---|
| M1: the FFmpeg edits exist only in the editor and the chat remix | One typed edit action of the user's video, queued on the lease queue: trim, speed, frame shape (crop or pad), colour look, fades, volume or mute, a caption, a still as a thumbnail. Quote → Start → status → cancel → QC → Library. Also a run step and a quote-only tool for the agent | BUILT, TESTED (real FFmpeg locally); live run BUILT_NOT_PROVEN. Split, join and mix as single edits: MISSING (join and mix are the montage today) |
| M2: no music offset from words | "Start the music from 5 s" re-plans the montage on screen (PART 1) and now also the montage Agent G just delivered: a new plan card from the same files, Start again | BUILT, TESTED (jest + browser) |
| A4: no reuse of the previous result | "Make the last video black and white" edits Agent G's own last video by its link: no upload, no new video. An attached video plus "convert this to 9:16" gets the edit card instead of "I cannot yet" | BUILT, TESTED (jest + browser); live BUILT_NOT_PROVEN. "Next scene, same character" is a Veo generation, not an edit: still answered in words, MISSING |
| G1: Gemini never sees the whole file | "Analyze my file": Gemini reads one of the user's files (video, sound, PDF, picture) or a public YouTube video **by reference**, and answers in one typed shape (summary, scenes, moments, transcript with speakers, objects, an answer to the question). Every time is checked against the file's real length. FFmpeg still decides every cut | BUILT, TESTED offline. Live run BLOCKED_OWNER (spend + switch) |

## 2. The edit action (M1, `60d1cfdd`)

**What it does.** One request, any combination of: trim (from, to), speed (0.25–4×), frame shape (9:16, 16:9, 1:1;
crop to fill or pad), a colour look (cinematic, vintage, neon, dramatic, black and white), fade in and out, volume
in dB or mute, one caption line, or a still frame as a JPG. The words are read by `lib/agent/media/editWords.ts`
(KA/EN/RU); what it cannot do is said back, never guessed.

**How it runs.** The same shape as the montage and the MP3:

1. **Quote** (`/api/agent/media/edit`, `action: 'quote'`): the file is resolved as the caller's own
   (`lib/security/callerMedia`; another user's or another host's file is refused), probed with ffprobe, and the plan
   is built (`editPlan.ts`: frame, codecs, length, sound). The plan is signed for that user, 30 minutes, with a fixed
   job id. Nothing is decoded.
2. **Start** (the user's tap): the signed plan is queued once (`agent-media-edit` on `generation_jobs`); a second tap
   replays the same job.
3. **Worker** (`editWorker.ts`): runs FFmpeg with the plan's arguments only. No text from the user reaches the command
   line: a caption is drawn as a picture by the remix's own overlay renderer and laid over the video. Stop kills FFmpeg.
4. **QC before delivery**: the planned frame and codecs, sound exactly when planned, length within 0.5 s or 3 %.
5. **Library**: the result is filed like every other Agent G result.

It is free (no charge, no price change). The remix's filter text moved to `lib/video/editFilters.ts`, so the remix and
the edit draw the same picture.

**Where else it runs.** As a run step (PART 2): a montage result can be edited next in the same run. As a quote-only
tool for the agent (`quote_media_edit`); the run itself stays the user's confirmed action (`media_edit_run`). In the
Task API and the tray, like the other two jobs.

## 3. The edit in the chat (A4, M2)

`lib/agent/chatTurn.ts` decides, the studio acts (`components/studio/OmniStudio.tsx`):

| The user says | Before | Now |
|---|---|---|
| (one video attached) "Convert this video to 9:16" | "I cannot change a video's frame shape in the chat yet" | the edit card: source, the edits in words, what comes out, **Start · free** |
| "Make the last video black and white" (after Agent G made a video) | a new video was generated, or "I cannot yet" | the edit card for **that** result, by its link (no upload) |
| "Mute it", "cut the first 3 seconds", "slower", "warmer colours" (previous video) | same | same card |
| "Start the music from 5 s" (after a delivered montage) | "I cannot yet" | a new montage plan from the same files and words, Start again |
| Subtitles, two videos attached, a charged remix op | remix / ask | unchanged: the remix keeps its own jobs and price card |
| any of the above while the edit is closed to the user | old answer | old answer (nothing asked, nothing run) |

The edit card (`components/studio/AgentEditCard.tsx`) is the same task panel as the montage and MP3 cards: Upload and
read → Plan and your go-ahead → Edit → Check → Save. The result plays under the card with Download, Share and Edit.

**A bug the browser test found, fixed in all three cards.** Start is replaced by Stop at the same place. A double tap on
Start landed its second tap on Stop and stopped the job it had just started. Stop is now disarmed for 0.7 s after a
start (`useStopArmed`, `components/studio/agentCardButtons.ts`), computed during render so there is no frame in which
it is live. Montage, MP3 and edit: 24 / 24 browser tests pass, three repeats of the double-tap test pass.

## 4. "Analyze my file" (G1)

**The call.** `lib/agent/media/analyzeExec.ts`, every effect injected; `analyzeLive.ts` wires the real ones.

- **Source.** One of the caller's own files through `lib/security/callerMedia` (a short-lived signed link, 15 minutes),
  or a public YouTube video (watch, shorts, embed, live, youtu.be) in its one canonical form. The YouTube link is for
  analysis only: nothing downloads it or takes its sound (the MP3 path keeps refusing it by name).
- **Before any model call.** The file type (video, sound, PDF, picture; anything else refused), the owner check, the
  real length by ffprobe (up to 30 minutes; a video over 5 minutes is read at low resolution), and the platform's AI
  budget gate on the call's estimated tokens.
- **The model.** One `generateContent` through the existing transport (`googleModelFetch`: `GEMINI_TRANSPORT` picks
  Vertex or the API key, never both, never another provider). The model is `gemini-3.8-flash` or
  `AGENT_G_ANALYZE_MODEL`, and only if the model catalog has it enabled, runtime-verified and on that transport;
  otherwise "not configured", never a substitute. The file goes as `fileData.fileUri`: its bytes are never read into
  the function. Structured output (`responseSchema`), temperature 0.2.
- **No silent fallback.** A 400 that names the reference is reported as `reference_refused` (422). There is no retry
  with inline bytes and no second endpoint. 429 is `rate_limited`, 401/403 `not_configured`.
- **The answer.** `analyzeSpec.ts parseAnalysis`: a time before 0 or past the end of the file is dropped (not moved) and
  counted; scenes and lines sorted; lists bounded (60 scenes, 20 moments, 400 lines); text capped; a file with no
  timeline keeps no times. The user's question goes into the prompt as a quoted string, as data.
- **What it is not.** A description. No field starts, cuts, prices or unlocks anything; every cut is still planned and
  checked by FFmpeg against the probed length.
- **Booking and audit.** The real token usage is booked after the call (`bookChatUsage`). One audit row per analysis:
  kind, source kind, focus, model, tokens, how many times were dropped. Never the file's link or token (a test checks).

**Where it is reachable.**

- `GET / POST /api/agent/media/analyze`: closed → 404 before the session is read; signed out → 401; rate-limited as an
  expensive call; each refusal keeps its status.
- The agent tool `analyze_media` (new effect `inspect`: reads one file, starts nothing, at most 2 per run), offered only
  when `AGENT_G_FILE_ANALYSIS` is open to the user. The model names a file by its number, never a path.
- Capability `media.analyze` in `lib/agent/capabilities.ts` (free for the user, `BUILT_NOT_PROVEN`).

The chat itself does not yet route "what is in my video?" straight to it; that deterministic route and the answer's
card (scenes as chips you can tap to cut) are PART 6.

**What is not known until the first paid run.** Whether Vertex and the Gemini API both open a signed HTTPS link of our
storage as `fileUri` at our file sizes, and how a long video's token count compares to the estimate. If the link is
refused, the answer says so (`reference_refused`); the fix would be a bucket Gemini reads directly, which is paid
infrastructure and the owner's call.

## 5. Tests and checks

| Check | Result |
|---|---|
| New and changed tests in PART 3 | editWords 55, editExec 27, editPlan 22, editChat 17, editLive with real FFmpeg 8, edit route 6, analyzeSpec 14, analyzeExec 14, analyze route 9, access 4, chat turn +8, intent +1, task steps +3, ReAct tools +10, run route +1, run steps, registry and declarations updated |
| Whole repo `jest` (`--maxWorkers=3`) | **772 suites passed, 2 skipped (opt-in database suites); 11,914 tests passed, 12 skipped, 0 failed** (PART 2: 11,708). The first full run had 1 failure: a test that pins the tool effects a model may have. Adding `inspect` is a review decision, so the test now names it and checks the `analyze_media` declaration |
| `tsc --noEmit` | 0 errors |
| `eslint` on the changed files | 0 errors; 13 warnings, all older hook-dependency warnings in OmniStudio |
| Playwright (local Chromium, server mocked) | `agent-g-edit.spec.ts` (new, 3 tests), `agent-g-audio.spec.ts`, `agent-g-montage.spec.ts`: **24 passed, 0 failed** |
| HawkScan | not run: `HAWK_API_KEY` is not set (certification §P) |
| Live runs | none. The edit needs the owner's admin Preview run (PART 7). File analysis needs the owner's word on the spend and the switch |

What the edit browser test proves, with the server mocked: an attached video uploads first, the plan is asked for with
exactly the edits from the words and nothing goes to the chat model, nothing runs before Start, a double tap is one
Start, the card follows the job to Ready, the video lands under the card with Download, and the next message edits that
result by its link.

## 6. What can still fail for a real user

- **No live edit yet.** FFmpeg ran the real edits locally (`editLive.ffmpeg.test.ts`), but no Preview job has run.
- **A long or large file for analysis** may be refused by the model's link reader; the answer says so, nothing else
  happens.
- **The agent's plans have no card yet.** When the agent (not the chat's own reading) quotes an edit or a montage, the
  plan comes back to the chat as data, but there is no card for it on screen (PART 4 / PART 6).
- **Split, join and mix** are not single edits (join and mix go through the montage).
- **"Next scene, same character"** is still answered in words.

## 7. Owner decisions (BLOCKED_OWNER)

- **File analysis**: the spend (each analysis is one Gemini call on the platform's account, a 30-minute video is
  roughly 180,000 input tokens at low resolution) and setting `AGENT_G_FILE_ANALYSIS` (`admin` on the Preview first).
- Still open from PART 1–2: the paid Gemini comparison, Production `GEMINI_TRANSPORT`, `MEDIA_GOOGLE_ONLY`,
  `20261002d`, the lip-sync charge, the price table, PR #50 merge and the Production deploy.

## 8. Next: PART 4

Live Voice parity: a voice "yes" becomes a server record of the approval (channel `voice-transcript`), voice can start
the montage, the MP3 and the edit with the same cards, and the agent's own quotes get a card in the chat.
