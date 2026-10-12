# Video Core v1.0 — round 3 FINAL (T2) · real-browser Playwright evidence

Branch `claude/video-core-v1-6gh97e` (HEAD cc0657f (product code as of 357926b; cc0657f only changes a unit test), product fixes of a9ec305 included), Playwright 1.58.2, bundled Chromium (`/opt/pw-browsers/chromium`), the already-running `next dev -p 3000` (dummy Supabase env), every server route mocked at the page. Two projects: **desktop** (Desktop Chrome) and **mobile** (iPhone 13 descriptor, run in Chromium — WebKit is not installed here). The earlier run stays as it was in `../t2-round3/`.

Command (no `--reporter` flag — the config writes `list` + this folder's `playwright-results.json`):

```
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test -c playwright.video-core.config.ts
```

Run time 16.9 min. `npx tsc --noEmit -p tsconfig.json` → exit 0 (no errors).

## Totals

- **desktop**: 49 tests → 42 PASS, 0 FAIL, 4 SKIP, 3 declared-FAIL
- **mobile**: 49 tests → 43 PASS, 0 FAIL, 2 SKIP, 4 declared-FAIL

PASS = passed as written; declared-FAIL = a `test.fail()` that failed as declared (a known defect or owner judgement — Playwright counts it as passed); SKIP = not applicable to that project (reason in the table) ; FAIL = a real failure of this run.

## Per spec × project

| Spec | Project | Tests | PASS | FAIL | SKIP | declared-FAIL |
|---|---|---|---|---|---|---|
| agent-g-intents.spec.ts | desktop | 18 | 15 | 0 | 0 | 3 |
| agent-g-intents.spec.ts | mobile | 18 | 15 | 0 | 0 | 3 |
| cards.spec.ts | desktop | 8 | 8 | 0 | 0 | 0 |
| cards.spec.ts | mobile | 8 | 8 | 0 | 0 | 0 |
| editing.spec.ts | desktop | 4 | 2 | 0 | 2 | 0 |
| editing.spec.ts | mobile | 4 | 4 | 0 | 0 | 0 |
| flows.spec.ts | desktop | 12 | 10 | 0 | 2 | 0 |
| flows.spec.ts | mobile | 12 | 9 | 0 | 2 | 1 |
| navigation.spec.ts | desktop | 5 | 5 | 0 | 0 | 0 |
| navigation.spec.ts | mobile | 5 | 5 | 0 | 0 | 0 |
| storyboard.spec.ts | desktop | 2 | 2 | 0 | 0 | 0 |
| storyboard.spec.ts | mobile | 2 | 2 | 0 | 0 | 0 |

## Every test, per project

| Spec | Test | desktop | mobile |
|---|---|---|---|
| agent-g-intents.spec.ts | [ka] the five sentences alone: which open the Video tool with the plan said, which are chat | PASS | PASS |
| agent-g-intents.spec.ts | [ka] with two clips and a track the words are the montage lane: one quote with the files and the words; a change re-quotes | PASS | PASS |
| agent-g-intents.spec.ts | [ka] with clips and a track „make a 24-second music video" is a montage quote, not the Video tool | PASS | PASS |
| agent-g-intents.spec.ts | [en] the five sentences alone: which open the Video tool with the plan said, which are chat | PASS | PASS |
| agent-g-intents.spec.ts | [en] with two clips and a track the words are the montage lane: one quote with the files and the words; a change re-quotes | PASS | PASS |
| agent-g-intents.spec.ts | [en] with clips and a track „make a 24-second music video" is a montage quote, not the Video tool | PASS | PASS |
| agent-g-intents.spec.ts | [ru] the five sentences alone: which open the Video tool with the plan said, which are chat | PASS | PASS |
| agent-g-intents.spec.ts | [ru] with two clips and a track the words are the montage lane: one quote with the files and the words; a change re-quotes | PASS | PASS |
| agent-g-intents.spec.ts | [ru] with clips and a track „make a 24-second music video" is a montage quote, not the Video tool | PASS | PASS |
| agent-g-intents.spec.ts | [en] the brief's "start the music at second 58" gets the same Agent G note as KA/RU | PASS | PASS |
| agent-g-intents.spec.ts | [ka] the brief's bare "exactly 29.7 seconds" sentence opens the Video tool with the 891-frame plan | declared-FAIL ("ვიდეო ზუსტად 29.7 წამი უნდა იყოს." has no make-verb, so lib/agent/intent.ts leaves it to the chat model in every language; only "გააკეთე 29…) | declared-FAIL ("ვიდეო ზუსტად 29.7 წამი უნდა იყოს." has no make-verb, so lib/agent/intent.ts leaves it to the chat model in every language; only "გააკეთე 29…) |
| agent-g-intents.spec.ts | [en] the brief's bare "exactly 29.7 seconds" sentence opens the Video tool with the 891-frame plan | declared-FAIL ("The video must be exactly 29.7 seconds." has no make-verb, so lib/agent/intent.ts leaves it to the chat model in every language; only "Make…) | declared-FAIL ("The video must be exactly 29.7 seconds." has no make-verb, so lib/agent/intent.ts leaves it to the chat model in every language; only "Make…) |
| agent-g-intents.spec.ts | [ru] the brief's bare "exactly 29.7 seconds" sentence opens the Video tool with the 891-frame plan | declared-FAIL ("Видео должно быть ровно 29.7 секунды." has no make-verb, so lib/agent/intent.ts leaves it to the chat model in every language; only "Сделай…) | declared-FAIL ("Видео должно быть ровно 29.7 секунды." has no make-verb, so lib/agent/intent.ts leaves it to the chat model in every language; only "Сделай…) |
| agent-g-intents.spec.ts | [ka] the 24-second music-video sentence plans its storyboard in music-video mode | PASS | PASS |
| agent-g-intents.spec.ts | [en] the 24-second music-video sentence plans its storyboard in music-video mode | PASS | PASS |
| agent-g-intents.spec.ts | [ru] the 24-second music-video sentence plans its storyboard in music-video mode | PASS | PASS |
| agent-g-intents.spec.ts | [ka] AC-23 — a music delay this version cannot honour is said on the quote card in a note starting „ამ ვერსიაში არ არის მხარდაჭერილი" | PASS | PASS |
| agent-g-intents.spec.ts | [ka] AC-23 — „add these two" after a delivered montage is refused in words: zero new quotes, nothing sent, words and files stay | PASS | PASS |
| cards.spec.ts | a running montage shows its stage and no "%" when the server sends no percent; Stop is offered | PASS | PASS |
| cards.spec.ts | after a reload the running job is in the tray exactly once (live), no card in the fresh chat | PASS | PASS |
| cards.spec.ts | the tray row prints no "%" for a job whose server sends no percent | PASS | PASS |
| cards.spec.ts | a montage whose result failed its check says so, shows nothing, and Retry re-quotes exactly once | PASS | PASS |
| cards.spec.ts | film: /api/video/assemble 502 qc_rejected → the reason on an error card; Try again plans again (no re-send); Dismiss removes it | PASS | PASS |
| cards.spec.ts | film: /api/video/assemble 422 music_unreadable → the reason on an error card, nothing delivered | PASS | PASS |
| cards.spec.ts | film: the server's reason for a refused assemble is readable ON the error card, not only in its tooltip | PASS | PASS |
| cards.spec.ts | a finished 9:16 montage is shown in a vertical frame | PASS | PASS |
| editing.spec.ts | an attached video + „Convert this video to 9:16." → plan card → Start → the edit under the card | PASS | PASS |
| editing.spec.ts | with the edit lane closed the ask is answered in words and nothing is quoted | PASS | PASS |
| editing.spec.ts | [ka · phone] AC-23 — the unsupported music delay is said on the quote card | SKIP (the desktop pass lives in agent-g-intents.spec.ts) | PASS |
| editing.spec.ts | [ka · phone] AC-23 — „add these two" after a delivered montage: refused in words, zero new quote calls | SKIP (the desktop pass lives in agent-g-intents.spec.ts) | PASS |
| flows.spec.ts | upload: the paperclip → file chooser → sign · PUT · verify per file → chips Ready → the quote carries those paths | PASS | PASS |
| flows.spec.ts | upload: a verify that answers 422 marks the chips Failed with Retry, says why, and nothing is sent | PASS | PASS |
| flows.spec.ts | upload: a verify that answers 503 marks the chips Failed with Retry, says why, and nothing is sent | PASS | PASS |
| flows.spec.ts | stop from the card: one cancel to /api/tasks, the card ends stopped and says the credits came back, nothing re-runs | PASS | PASS |
| flows.spec.ts | stop from the composer: one cancel to /api/tasks, the card ends stopped and says the credits came back, nothing re-runs | PASS | PASS |
| flows.spec.ts | download: a finished montage's Download fetches the master and hands the browser a file | PASS | PASS |
| flows.spec.ts | download + library: the film's final video offers Download and Save to library (one POST, then Saved) | PASS | PASS |
| flows.spec.ts | library: the sidebar Library row opens /library and lists the finished montage from GET /api/studio/library | PASS | PASS |
| flows.spec.ts | [phone] Start, Stop and Retry by touch; Retry plans again exactly once and runs nothing | SKIP (touch flow: the iPhone 13 project) | PASS |
| flows.spec.ts | [phone] a job already running elsewhere (in the tray) does not cover the new card's Start | SKIP (the tray floats over the thread only on a phone-width layout) | declared-FAIL (DEFECT components/studio/JobTray.tsx:178-192 — the job tray is position:fixed z-[60] at bottom calc(var(--composer-h)+var(--kb-inset)+1.25re…) |
| flows.spec.ts | keyboard: Tab reaches the composer; Start and Stop are named buttons that work with Enter | PASS | SKIP (keyboard navigation: the desktop project) |
| flows.spec.ts | keyboard: the film error card's Try again is reachable by Tab and plans again with Enter | PASS | SKIP (keyboard navigation: the desktop project) |
| navigation.spec.ts | the dashboard loads at /en, /ka and /ru with the composer ready | PASS | PASS |
| navigation.spec.ts | chat → Video through the sidebar row; the mode switch holds across a chat round-trip; a reload resets it | PASS | PASS |
| navigation.spec.ts | a ?tool=video link opens the Video tool; the param is taken off the URL, so Back/Forward carry no tool | PASS | PASS |
| navigation.spec.ts | a reload opens a fresh chat; the conversation is in History and reopens from there | PASS | PASS |
| navigation.spec.ts | switching conversations in the sidebar keeps results scoped: a new session shows none, reopening shows them again | PASS | PASS |
| storyboard.spec.ts | Generate sends the approval of the board on screen (fingerprint recomputed here); a revision_mismatch is refused with Retry and nothing runs after it | PASS | PASS |
| storyboard.spec.ts | the director path posts the same approval; its revision_mismatch is shown with the message and Edit storyboard, nothing is dispatched | PASS | PASS |

## New in this run: tests/video-core/flows.spec.ts (12 tests × 2 projects)

Every flow is driven the way a user does it: the paperclip opens the real OS file chooser (`page.waitForEvent('filechooser')`), buttons are tapped on the phone and clicked on desktop, and keyboard tests use only Tab, Shift+Tab and Enter.

| # | Test | What it asserts |
|---|---|---|
| a1 | upload: paperclip → file chooser → sign, PUT, verify per file → chips Ready → the quote carries those paths | `POST /api/upload/sign` ×2 (`name`, `contentType`), `PUT` to the signed URL ×2, `POST /api/upload/verify` ×2 (`kind` video and audio). Both `composer-attachment[data-status=ready]` chips show. The montage quote's `files` equal exactly the verified paths, and its `names` are `['beach.webm','song.wav']`. |
| a2 | upload: a verify that answers **422** marks the chips Failed with Retry, says why, and nothing is sent | Both chips are `data-status=failed`, each with a `Retry — <name>` button and the reason „The file's contents do not match its type“. Send says „… did not upload — tap Retry on it, or remove it, then send.“ Quote, run and chat calls stay 0, and the composer keeps the words. |
| a3 | the same with **503** | Same as a2, but the error is „File could not be uploaded“. |
| b1 | stop from the **card** | Quote ✦12 → Start → running („✦ 12 held, charged only for the result“) → the card's Stop (armed after 700 ms). Exactly **one** `POST /api/tasks {action:'cancel', id:JOB_ID}`. The card ends `data-phase=cancelled` with „Edit stopped.“ and „Nothing spent: ✦ 12 paid back“. The composer Stop is gone. Run, quote and cancel counts do not move afterwards. |
| b2 | stop from the **composer** (`composer-stop-job`, aria-label „Stop the task“) | Same as b1. |
| c1 | download: a finished montage's Download fetches the master and hands the browser a file | A Playwright `download` event with `myavatar-montage-<n>.mp4/webm` and one more fetch of the master URL. There is no „Save to library“ button on the montage result, and `librarySaves` is 0 (finding `montage-no-save-to-library`, by design per the OmniStudio comment). |
| c2 | download + library: the film's final video offers Download and Save to library | Assemble returns `{url: …/final-master.mp4}` → Download gives `myavatar-video-<n>.*`. „Save to library“ sends exactly **one** `POST /api/studio/library {url, kind:'film'}`, then reads „Saved to library“ and is disabled. |
| d1 | library: the sidebar Library row opens /library and lists the finished montage | `GET /api/studio/library?kind=film,…` is read. The item (`id: JOB_ID`, `url: MASTER_URL`) renders as a `<video>` with its Download. |
| e1 | [phone] Start, Stop and Retry by touch; Retry plans again exactly once and runs nothing | Taps only: Start → running → Stop → cancelled → Retry → one new quote, run stays 1, cancel stays 1. |
| e2 | [phone] a job already running elsewhere (in the tray) does not cover the new card's Start | `GET /api/tasks?active=1` lists another running job. Quote a montage, scroll the thread to its end, then check that `elementFromPoint(centre of Start)` is the Start. **Declared failure: it hits `job-tray`** (new defect 7). |
| f1 | keyboard: Tab reaches the composer; Start and Stop are named buttons that work with Enter | Starting from the page body, Tab focuses `composer-input` within 60 presses. The quoted card's Start is a button named „Start — Free“ (free plan in the mock). Focused programmatically, Enter on it starts the run (run 1). The card's „Stop“ button and the composer's „Stop the task“ are named buttons, and Enter on the focused card Stop sends exactly one cancel and ends the card `cancelled`. |
| f2 | keyboard: the film error card's Try again is reachable by Tab and plans again with Enter | Assemble 502 → error card → Shift+Tab from the composer reaches „Try again“. Enter sends one more planOnly storyboard, and orchestrate stays 1. |

Phone-only tests (e1, e2) are `test.skip` on desktop, and keyboard tests (f1, f2) are `test.skip` on the phone, each with the reason in the table below. The **9:16 preview** on the phone is the existing `cards.spec.ts` „a finished 9:16 montage is shown in a vertical frame“, which runs on both projects.

### The two mobile tray tests that timed out after a reload in the earlier run

The cause was in the TEST's mock, not the product. `live:true` listed the job in `GET /api/tasks?active=1` from page load, before Start was posted, so on the phone the tray (fixed, z-60) sat over the card's Start and `montageRunning()` could not tap it. The mock now lists a job as live only once a run was posted and until it is cancelled, which is how the server lists it. The `page.route` mocks and their counters survive `page.reload()`, so after the reload the job is still listed. The two tests are cards.spec.ts „after a reload the running job is in the tray exactly once (live), no card in the fresh chat“ and „the tray row prints no "%" for a job whose server sends no percent“; in this run **both PASS on mobile** (and on desktop), so they are VERIFIED, no longer NOT VERIFIED. The product side of the same overlap, a job that really is running elsewhere, is defect 7 below.

## New defect (product code NOT modified; pinned with `test.fail()`)

7. **On a phone, the job tray covers the newest card's Start.**
   - **Repro:** use an iPhone-13 viewport (390×664) with some other job running, so that `GET /api/tasks?active=1` lists it and the tray shows. Attach two clips and a track, then say „cut these to the music“ to get a quoted montage card. Scroll the thread to its end. The centre of `agent-montage-start` is under `[data-testid=job-tray]` (`elementFromPoint`), so a tap lands on the tray.
   - **Suspect:** `components/studio/JobTray.tsx:178-192`. The tray is `fixed z-[60] w-[300px]` at `bottom: calc(var(--composer-h) + var(--kb-inset) + 1.25rem + env(safe-area-inset-bottom))`, which is just above the composer and over the bottom of the thread. The thread keeps no matching bottom inset (or the tray does not collapse) on narrow screens, so the last card's buttons cannot be scrolled above it.
   - **Test:** flows.spec.ts „[phone] a job already running elsewhere (in the tray) does not cover the new card's Start“ (mobile, `test.fail`).
   - **Evidence:** `phone-tray-covers-start.jpg`.
   - In the screenshot only the left edge of Start („✦ S…“) shows. The only control in the tray's area is the row's ×, and this run did not check what it does (dismiss the row or cancel the other job).
   - Desktop was not checked for this: the test is phone-only, and on desktop the tray sits at the right edge, away from the thread column.

## Earlier defects: state on this head

- Defects **1, 2, 3, 4 and 6** were fixed in a9ec305. Their tests are now plain assertions and must PASS on both projects. They are:
  - storyboard planned in music-video mode
  - no `%` in the tray for `pct:null` (GenerationProgress `measuredOnly`)
  - the server's reason readable on the film error card
  - EN „Start the music at second 58.“
  - composer attachments parked per conversation
- Defect **5**, the bare „exactly 29.7 seconds“ sentence that stays a chat message without a make-verb, is still a `test.fail()` in agent-g-intents.spec.ts (×3 locales × 2 projects). It is an owner judgement, not a code change.

## Findings (36 rows in findings.json; also on each test as annotation type `finding`)

- `intent-mv24-plan-mode-ka` [desktop] agent-g-intents.spec.ts — "შექმენი 24-წამიანი მუსიკალური კლიპი." opened the Video tool in music-video mode and the storyboard plan POST /api/film/storyboard carried musicVideoMode=true.
- `intent-exact-297-ka` [desktop] agent-g-intents.spec.ts — "ვიდეო ზუსტად 29.7 წამი უნდა იყოს." alone is a chat message (the model answered; no Video tool, no plan). lib/agent/intent.ts needs a make-verb before a length opens the tool; the bare constraint sentence has none.
- `intent-exact-297-files-ka` [desktop] agent-g-intents.spec.ts — "ვიდეო ზუსტად 29.7 წამი უნდა იყოს." with two clips and a track attached: chat calls +1, quote calls +0, storyboard calls +0; cards+plans on screen: 1; composer now "".
- `intent-mv24-plan-mode-en` [desktop] agent-g-intents.spec.ts — "Make a 24-second music video." opened the Video tool in music-video mode and the storyboard plan POST /api/film/storyboard carried musicVideoMode=true.
- `intent-exact-297-en` [desktop] agent-g-intents.spec.ts — "The video must be exactly 29.7 seconds." alone is a chat message (the model answered; no Video tool, no plan). lib/agent/intent.ts needs a make-verb before a length opens the tool; the bare constraint sentence has none.
- `intent-exact-297-files-en` [desktop] agent-g-intents.spec.ts — "The video must be exactly 29.7 seconds." with two clips and a track attached: chat calls +1, quote calls +0, storyboard calls +0; cards+plans on screen: 1; composer now "".
- `intent-mv24-plan-mode-ru` [desktop] agent-g-intents.spec.ts — "Сделай 24-секундный музыкальный клип." opened the Video tool in music-video mode and the storyboard plan POST /api/film/storyboard carried musicVideoMode=true.
- `intent-exact-297-ru` [desktop] agent-g-intents.spec.ts — "Видео должно быть ровно 29.7 секунды." alone is a chat message (the model answered; no Video tool, no plan). lib/agent/intent.ts needs a make-verb before a length opens the tool; the bare constraint sentence has none.
- `intent-exact-297-files-ru` [desktop] agent-g-intents.spec.ts — "Видео должно быть ровно 29.7 секунды." with two clips and a track attached: chat calls +1, quote calls +0, storyboard calls +0; cards+plans on screen: 1; composer now "".
- `card-progressbar-no-pct` [desktop] cards.spec.ts — With pct null from the server the running montage card prints no "%" (stage "Joining the shots" on the active step); its progressbar reports aria-valuenow=0 (seeded 0 by confirmAgentMontage, never advanced without a server pct).
- `montage-no-save-to-library` [desktop] flows.spec.ts — The montage result offers Download, Share and Edit but no "Save to library" — by design (components/studio/OmniStudio.tsx ~9686: "the montage job is already a Library item"); the client posts nothing to /api/studio/library (0 saves). The server-side filing itself cannot be seen with mocks. Download file name: myavatar-montage-1791831621978.webm.
- `nav-reload-tool` [desktop] navigation.spec.ts — After a reload the dashboard opens on the chat (the open tool is not persisted); the Video mode comes back as "documentary" (the music-video pick is NOT persisted — components/studio/OmniStudio.tsx:2584 keeps videoMode in component state only).
- `nav-tool-param-stripped` [desktop] navigation.spec.ts — ?tool=video opens the Video tool, then history.replaceState drops the param (URL now "/en/dashboard"; components/studio/OmniStudio.tsx:3549). The history entry therefore carries no tool for Back/Forward to restore.
- `nav-back-forward` [desktop] navigation.spec.ts — Back landed on "/en/dashboard" with the Video panel closed (the tool opened by ?tool=video is not restored); Forward landed on "/en/dashboard" with the Video panel closed. mobile=false.
- `nav-reload-conversation` [desktop] navigation.spec.ts — After a reload the thread is EMPTY: the studio opens a new, empty conversation on every visit by design (components/studio/OmniStudio.tsx:1440-1455 currentConversationId — only an explicit History pick, OMNI_RESUME_KEY, reopens one); the conversation is listed in History.
- `nav-attachments-on-switch` [desktop] navigation.spec.ts — A clip attached in the composer of the new session is parked with its own session when the earlier conversation is reopened (the composer is per conversation). Results (the montage card and its master) are scoped to their conversation.
- `storyboard-mismatch-retry` [desktop] storyboard.spec.ts — After a revision_mismatch the error card's Retry plans a NEW storyboard (POST /api/film/storyboard planOnly) for the user to approve again; the refused dispatch is never re-sent (orchestrate stayed at 1, assemble at 0). Message shown: "the storyboard changed after it was approved (revision 2 · 0…".
- `director-mismatch-no-retry` [desktop] storyboard.spec.ts — The director path's revision_mismatch is shown with the server message and "Edit storyboard" / Close — no Retry button (components/studio/video/DirectorRunOverlay.tsx refused state); the way back is the board itself.
- `intent-mv24-plan-mode-ka` [mobile] agent-g-intents.spec.ts — "შექმენი 24-წამიანი მუსიკალური კლიპი." opened the Video tool in music-video mode and the storyboard plan POST /api/film/storyboard carried musicVideoMode=true.
- `intent-exact-297-ka` [mobile] agent-g-intents.spec.ts — "ვიდეო ზუსტად 29.7 წამი უნდა იყოს." alone is a chat message (the model answered; no Video tool, no plan). lib/agent/intent.ts needs a make-verb before a length opens the tool; the bare constraint sentence has none.
- `intent-exact-297-files-ka` [mobile] agent-g-intents.spec.ts — "ვიდეო ზუსტად 29.7 წამი უნდა იყოს." with two clips and a track attached: chat calls +1, quote calls +0, storyboard calls +0; cards+plans on screen: 1; composer now "".
- `intent-mv24-plan-mode-en` [mobile] agent-g-intents.spec.ts — "Make a 24-second music video." opened the Video tool in music-video mode and the storyboard plan POST /api/film/storyboard carried musicVideoMode=true.
- `intent-exact-297-en` [mobile] agent-g-intents.spec.ts — "The video must be exactly 29.7 seconds." alone is a chat message (the model answered; no Video tool, no plan). lib/agent/intent.ts needs a make-verb before a length opens the tool; the bare constraint sentence has none.
- `intent-exact-297-files-en` [mobile] agent-g-intents.spec.ts — "The video must be exactly 29.7 seconds." with two clips and a track attached: chat calls +1, quote calls +0, storyboard calls +0; cards+plans on screen: 1; composer now "".
- `intent-mv24-plan-mode-ru` [mobile] agent-g-intents.spec.ts — "Сделай 24-секундный музыкальный клип." opened the Video tool in music-video mode and the storyboard plan POST /api/film/storyboard carried musicVideoMode=true.
- `intent-exact-297-ru` [mobile] agent-g-intents.spec.ts — "Видео должно быть ровно 29.7 секунды." alone is a chat message (the model answered; no Video tool, no plan). lib/agent/intent.ts needs a make-verb before a length opens the tool; the bare constraint sentence has none.
- `intent-exact-297-files-ru` [mobile] agent-g-intents.spec.ts — "Видео должно быть ровно 29.7 секунды." with two clips and a track attached: chat calls +1, quote calls +0, storyboard calls +0; cards+plans on screen: 1; composer now "".
- `card-progressbar-no-pct` [mobile] cards.spec.ts — With pct null from the server the running montage card prints no "%" (stage "Joining the shots" on the active step); its progressbar reports aria-valuenow=0 (seeded 0 by confirmAgentMontage, never advanced without a server pct).
- `montage-no-save-to-library` [mobile] flows.spec.ts — The montage result offers Download, Share and Edit but no "Save to library" — by design (components/studio/OmniStudio.tsx ~9686: "the montage job is already a Library item"); the client posts nothing to /api/studio/library (0 saves). The server-side filing itself cannot be seen with mocks. Download file name: myavatar-montage-1791832161672.webm.
- `nav-reload-tool` [mobile] navigation.spec.ts — After a reload the dashboard opens on the chat (the open tool is not persisted); the Video mode comes back as "documentary" (the music-video pick is NOT persisted — components/studio/OmniStudio.tsx:2584 keeps videoMode in component state only).
- `nav-tool-param-stripped` [mobile] navigation.spec.ts — ?tool=video opens the Video tool, then history.replaceState drops the param (URL now "/en/dashboard"; components/studio/OmniStudio.tsx:3549). The history entry therefore carries no tool for Back/Forward to restore.
- `nav-back-forward` [mobile] navigation.spec.ts — Back landed on "/en/dashboard" with the Video panel closed (the tool opened by ?tool=video is not restored); Forward landed on "/en/dashboard" with the Video panel closed. mobile=true.
- `nav-reload-conversation` [mobile] navigation.spec.ts — After a reload the thread is EMPTY: the studio opens a new, empty conversation on every visit by design (components/studio/OmniStudio.tsx:1440-1455 currentConversationId — only an explicit History pick, OMNI_RESUME_KEY, reopens one); the conversation is listed in History.
- `nav-attachments-on-switch` [mobile] navigation.spec.ts — A clip attached in the composer of the new session is parked with its own session when the earlier conversation is reopened (the composer is per conversation). Results (the montage card and its master) are scoped to their conversation.
- `storyboard-mismatch-retry` [mobile] storyboard.spec.ts — After a revision_mismatch the error card's Retry plans a NEW storyboard (POST /api/film/storyboard planOnly) for the user to approve again; the refused dispatch is never re-sent (orchestrate stayed at 1, assemble at 0). Message shown: "the storyboard changed after it was approved (revision 2 · 0…".
- `director-mismatch-no-retry` [mobile] storyboard.spec.ts — The director path's revision_mismatch is shown with the server message and "Edit storyboard" / Close — no Retry button (components/studio/video/DirectorRunOverlay.tsx refused state); the way back is the board itself.

## What was mocked (every spec, tests/video-core/_shared.ts `openStudio`)

| Route | Answer |
|---|---|
| `POST /api/upload/sign` | body recorded (`calls.sign`); answers `{bucket, path:'omni-uploads/u/file-N', token, signedUrl}` |
| `PUT <signedUrl>` (storage) | 200, every URL recorded (`calls.put`) — no byte leaves the browser |
| `POST /api/upload/verify` | body recorded (`calls.verify`); `200 {ok:true}`, or the test's `verifyFails` (422 `content` / 503 `unavailable`) |
| `https://e2e-media.supabase.co/**` | `tests/fixtures/clip.webm` bytes (clips, masters, edits, the film final); every URL recorded (`calls.media`) — Download reads these bytes |
| `POST /api/chat/gemini` | SSE with one canned reply (`reply`, default „Noted — the chat model answered this one.“); every call counted |
| `POST /api/chat/title` | trivial OK |
| `GET /api/studio/library?…` (regex, query string included) | `{items: opts.library ?? []}`, URL recorded (`calls.libraryReads`) |
| `POST /api/studio/library` | `{success:true}`, body recorded (`calls.librarySaves`) — nothing is filed anywhere |
| `GET /api/video/capabilities` | `{ longform:false, maxSeconds:96 }` (caps closed) |
| `GET /api/video/director` | `{ enabled }` (`director` option, default false → film path) |
| `POST /api/video/director/runs` | `directorRuns` (default 400 `revision_mismatch` + `problems`) |
| `GET /api/agent/media/{montage,edit,audio}` | the lane flags (`montage` on, `edit`/`audio` off unless set) |
| `POST /api/agent/media/montage` | `action:'quote'` → `quote` (object or `(body, n)` fn, default `QUOTE` 16:9) + signed token; `action:'run'` → job id |
| `POST /api/agent/media/edit` | `EDIT_QUOTE` (aspect 9:16 crop) / `EDIT_JOB` |
| `GET /api/tasks?id=` | one `taskView` per read from `taskViews` (default running stitch 55 % → completed 16:9); **after a cancel** the job reads `status:'cancelled', error:'cancelled'` (what lib/tasks/taskView.ts:156 produces for a cancelled row) |
| `GET /api/tasks?active=1` | `others` (jobs running elsewhere, listed from the start) + the job of this test **only once a run was posted and until it is cancelled** (`live`) — changed this round, see the tray note |
| `POST /api/tasks` (cancel) | OK; body recorded (`calls.cancel`); flips the job to cancelled for later reads |
| `POST /api/film/storyboard` | `planOnly` → N scenes (seed 4242, clipSec 8); `scriptsOnly`/`characterAnchor` → nothing richer; `sceneOrdinal` → a 1×1 PNG data-URL frame |
| `POST /api/chat/orchestrate` | `orchestrate(body)` (default `dispatchReady`: predictionId + film matrix `readyToStitch:true`, so the client goes straight to assemble) |
| `POST /api/video/assemble` | `assemble` (default 502 `qc_rejected`) |
| `GET /api/video/status/*` | 404 (counted) |

Auth is pinned client-side (`document.documentElement.dataset.authed='1'` + a MutationObserver) — there is no sign-in.
Routes are mocked at the page (`page.route`); the dev server's own API code is never exercised.

## What could NOT be exercised locally (SKIP, not PASS)

- **Real sign-in** (Supabase auth is dummy; the signed-in state is pinned in the DOM).
- **Preview** — no deployed preview; the `smoke-live` config stays untouched.
- **Real providers** — no Veo / ffmpeg worker / Udio / HeyGen: every job view, master, frame and quote is canned, so stage sequencing is what the mock hands out, not the worker's.
- **Real billing** — balance is null in the mocks (`insufficient` false), prices on buttons come from the mocked capabilities; no credit is debited or refunded.
- **Real uploads / storage** — sign, PUT and verify are the page mocks above: the client's order, bodies and error handling are real, the bucket, the signed URL's acceptance and the server's magic-byte check are not.
- **Server-side library filing of a montage** — the montage result has no Save button by design (the job row is the Library item); that the finished job really appears in `GET /api/studio/library` is a server fact, here it is simply what the mock lists.
- **A real file save dialog** — Download is asserted through Playwright's `download` event (file name + the media fetch), not a saved file on a disk.
- **WebKit / Safari** — only the bundled Chromium exists here; the `mobile` project is the iPhone 13 descriptor run in Chromium (`browserName: 'chromium'`).
- **`video-duration-readout`** — no element carries that test id in the panel; the plan line is `video-duration-plan` (data-final / data-native / data-frames) and the chat notice, both asserted.
- **A montage-lane `music_unreadable`** — the lane has no such code (lib/agent/media/montageChat `ERR`); it is exercised on the film path (`/api/video/assemble` 422) as the brief lists it.
- **Back/Forward restoring a tool** — there is nothing to restore (the `?tool=` param is stripped on open); recorded as a finding, not asserted as a pass.
- **A director run in progress** — only the refusal (400) is mocked; shot progress needs the worker.
- The two mobile-only AC-23 tests in editing.spec.ts are `test.skip` on desktop (their desktop pass is in agent-g-intents.spec.ts); the inverse holds for nothing.

## Screenshots (JPEG, each < 250 KB)

- `ac23-unsupported-note-mobile.jpg` — 141 KB
- `ac23-unsupported-note.jpg` — 69 KB
- `film-final-download-save.jpg` — 59 KB
- `keyboard-focus-try-again.jpg` — 52 KB
- `library-lists-montage.jpg` — 30 KB
- `music-unreadable-card.jpg` — 56 KB
- `phone-tray-covers-start.jpg` — 90 KB
- `qc-rejected-card.jpg` — 54 KB
- `revision-mismatch-refusal.jpg` — 54 KB
- `stopped-paid-back-mobile.jpg` — 76 KB
- `storyboard-approval.jpg` — 34 KB
- `success-9x16-preview.jpg` — 41 KB
- `upload-verify-failed.jpg` — 36 KB
- `video-tool-duration-plan-desktop.jpg` — 74 KB
- `video-tool-duration-plan-mobile.jpg` — 107 KB
