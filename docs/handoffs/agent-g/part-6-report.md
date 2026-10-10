# Agent G Autonomous Execution — PART 6: one-window UX

The owner asked for this on 2026-10-10 at 05:49Z (Master Task thread), with the Gemini supplement at 06:00Z. At 12:42Z
and 12:44Z the owner set the order: finish PART 6, then PART 7's checks, then the pricing audit; at 13:10Z the
Omnichannel + Mobile UX task was queued after those. PART 6 continues from PART 5
(`docs/handoffs/agent-g/part-5-report.md`) on branch `claude/launch-certification-wmvitt`, draft PR #50.

| Commit | What |
|---|---|
| `c51959fc` | Two-step runs from the chat, the pure half: chain detection (KA/EN/RU), the run card model, the run client |
| `7050d91b` | The run card in the chat: Start / Cancel, the step's own yes, Stop, Retry; „continue" resumes the same card |
| `863ed698` | Every one-job card (montage, MP3, edit): the credits line, Retry, and the reason a step failed |
| `73c7acfe` | „What is in my video?" → Agent G's whole-file analysis card, behind `AGENT_G_FILE_ANALYSIS` |
| `d926cc62` | Browser checks (390 / 820 / 1280 px, light / dark, KA / EN / RU); phone header squeeze and ↻ fixes |
| this commit | This report, PROJECT_MASTER |

Nothing was merged or deployed. No migration, no environment variable, no flag, no price and no paid call changed.
`AGENT_G_MEDIA_EXEC` stays as it was (Production off, Preview admin); `AGENT_G_FILE_ANALYSIS` stays off everywhere.

## 1. The §10 list, item by item

| §10 requirement | Where it is now | Label |
|---|---|---|
| Chat, Services, Active tasks, Inline progress, Artifact previews, Confirm, Download, Library, Live Voice entry in one window | Unchanged from the service simplification: one studio; the job tray for active work; each Agent G card shows its progress inline; players under the card; Start / the step's yes as Confirm; Download / Share / Edit under each result; results filed to the Library (`myavatar:library-updated`); the Live button in the composer | BUILT, TESTED (Playwright, mocked server) |
| What the agent does and its stage | Every card (montage, MP3, edit, run, analysis) is one `AgentTaskCard`: title, the live step, its stage and percent | BUILT, TESTED |
| Steps done and what it waits for | The step list ticks as it goes; a run's step waiting for the user's yes says so and carries its own price | BUILT, TESTED |
| Credits held or spent | One line under each card: „Free, nothing is charged", „✦ N held, charged only for the result", „✦ N spent", „Nothing spent: ✦ N paid back"; a run shows „✦ spent · up to ✦ plan" | BUILT, TESTED |
| The error | The step that failed carries the reason in words (no codes) | BUILT, TESTED |
| Stop / Retry where allowed | Stop while running (also from the chat „stop" and from a Live call); Retry only where asking again can succeed: a stopped card, a card that failed after it had a plan, a run that ended part-way (at the price of what is left) | BUILT, TESTED |
| Preview, Download, Library | The result's player under its card with Download / Share / Edit; the run's video and its extracted track both stay under the run card | BUILT, TESTED |
| A finished card never disappears | Cards stay ticked in the thread with no buttons (pinned by component and browser tests) | BUILT, TESTED |
| One job never shows twice | `cardJobsOf` gives each job one owner: the tray, the Live status and Live stop skip the jobs a card (or a run's steps) owns | BUILT, TESTED |
| The player never hides under the composer on an iPhone | Chromium at 390 × 844: the result's player scrolls clear of the composer, nothing spills sideways | BUILT, TESTED in Chromium; a real iPhone Safari run: BUILT_NOT_PROVEN |
| Mobile, tablet, desktop · light, dark · KA / EN / RU | `tests/agent-g-run.spec.ts`: phone KA dark, tablet RU light, desktop KA dark and EN light | BUILT, TESTED (mocked) |
| Keep the minimalist design; do not bring back the old hub, Studio Beta, the second director, Lip-Sync studio or the Plugins hub | No new surface: the run and analysis cards reuse the task card; the retirement ratchets from the service simplification still pass | VERIFIED (tests) |

## 2. What changed for the user

- **Two steps from one message.** „Take the sound of the first video and cut the other clips to it", or „cut these to
  the music, black and white", is one run card: the files upload, the steps are planned and priced (nothing runs before
  Start), Start sends the signed plan once (a double tap is one Start), and the card follows the run through the one
  task route. A step that needs the user's yes asks for it with its own price; a run that ended part-way offers Retry at
  the price of what is left, and „continue" does the same from the chat. Behind `AGENT_G_MEDIA_EXEC`, as the montage.
- **Every Agent G card tells the money and the reason.** The montage, MP3 and edit cards show what was held, spent or
  paid back, the reason a step failed, and Retry when asking again could succeed. ↻ under an edit asks Agent G again
  (it used to ask the chat model).
- **„What is in my video?"** Where `AGENT_G_FILE_ANALYSIS` opens it, a question about the one attached video or audio
  file, or about one public YouTube link, is answered by Gemini reading the whole file by reference, not a few frames:
  the answer in the bubble and, on the card, the scenes as chips, the best moments, who speaks, the folded transcript,
  and „Free for you (within a daily limit)". A YouTube link is analysis only; nothing is downloaded. ↻ and Retry ask
  the same file again. Edits, the MP3 ask, a request to make something and the focus tools never reach it. Where the
  flag is off (everywhere today) the question goes to the chat as before.

## 3. Found and fixed during the browser checks

- On a 390 px phone a long Georgian status („ველოდები შენს დასტურს") squeezed the card's step count to „3…". The status
  now shrinks first (full text in its title).
- ↻ under a run card would have sent the user's words to the chat model without their files. A run now offers no ↻: its
  own Retry and „continue" carry it on.
- The analysis card's lists took the reply's prose size; each line now carries the card's own size.

## 4. Tests

- Unit and component: `AgentRunCard.test.tsx` (4), `agentRun.wiring.test.ts` (13), `AgentAnalyzeCard.test.tsx` (3),
  `analyzeChat.test.ts` (14), `analyzeClient.test.ts` (10), `chatTurn.test.ts` (+5), `redoChat.test.ts` (+edit, card
  Retry, run and analysis ↻), `taskSteps.test.ts` (credits line, failure reason), `AgentTaskCard.test.tsx` (Retry,
  credits).
- Browser (`tests/agent-g-run.spec.ts`, local Chromium, server mocked, 7 tests): the run from plan to both results with
  one Start and one yes, Cancel, three screens × themes × languages, the analysis card open and closed.
- Full suite before the push: see the PR body (jest, `tsc`, `next lint`).

## 5. What can still fail for a real user

- **Not proven on a real device.** Every browser check ran in Chromium with the server mocked. A real iPhone Safari run
  (the keyboard, the safe area, the player under the composer) and a real run on a Preview are PART 7 work.
- **Live Voice cannot start a run.** A call can stop runs („stop everything") and hear their status, but cannot start a
  two-step run or name one by number: the Live planner has no run step and the Task API's run action has no voice
  approval yet.
- **A reload does not redraw the card.** Cards are never persisted. The run goes on server-side, and its work is read
  from the job tray and the Library (inferred from the code: the tray lists the user's server tasks); the card itself,
  with its step list and Retry, is not restored.
- **An analysis cannot be stopped mid-read.** It is one request of up to about two minutes; „stop" does not abort it.
- **The analysis is closed everywhere.** Each analysis is a paid Gemini call billed to the platform, not the user; the
  route's per-account daily ceiling (100) bounds it. Opening it is the owner's word.
- **The runs are where the montage is.** Production users see none of this until `AGENT_G_MEDIA_EXEC` opens there.

## 6. Owner decisions (BLOCKED_OWNER)

1. `AGENT_G_FILE_ANALYSIS` on a Preview for the admin, then a real paid analysis call (new paid API calls need the
   owner's word).
2. The PART 5 list stands, now folded into the pricing audit (one final price model for one approval) and PART 7.

## 7. Next

PART 7: the technical checks that need no approval, and `docs/handoffs/AGENT_G_FINAL_E2E_CERTIFICATION.md`. Then the
pricing audit (`SERVICE_UNIT_ECONOMICS.md` and one recommended price model), then the Omnichannel + Mobile UX task.
