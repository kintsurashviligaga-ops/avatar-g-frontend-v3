# Video Core v1.0 — round 3 (T2) · real-browser Playwright evidence

Branch `claude/video-core-v1-6gh97e` (HEAD fc1971b), Playwright 1.58.2, bundled Chromium (`/opt/pw-browsers/chromium`), the already-running `next dev -p 3000` (dummy Supabase env), every server route mocked at the page. Two projects: **desktop** (Desktop Chrome) and **mobile** (iPhone 13 descriptor, run in Chromium — WebKit is not installed here).

Command (the config carries the `list` + `json` reporters; a `--reporter=list` on the command line would REPLACE both and the JSON would not be written):

```
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test -c playwright.video-core.config.ts
```

Totals of this run (14.8 min): **desktop 35 tests → 33 PASS (7 of them `test.fail()` failing as declared), 0 FAIL, 2 SKIP · mobile 35 tests → 33 PASS (6 `test.fail()` as declared), 2 FAIL, 0 SKIP.** `npx tsc --noEmit -p tsconfig.json` → exit 0.

## Per spec × project

| Spec | Project | Tests | PASS | FAIL | SKIP | expected-FAIL (test.fail) |
|---|---|---|---|---|---|---|
| agent-g-intents.spec.ts | desktop | 16 | 11 | 0 | 0 | 5 |
| agent-g-intents.spec.ts | mobile | 16 | 11 | 0 | 0 | 5 |
| cards.spec.ts | desktop | 8 | 6 | 0 | 0 | 2 |
| cards.spec.ts | mobile | 8 | 5 | 2 | 0 | 1 |
| editing.spec.ts | desktop | 4 | 2 | 0 | 2 | 0 |
| editing.spec.ts | mobile | 4 | 4 | 0 | 0 | 0 |
| navigation.spec.ts | desktop | 5 | 5 | 0 | 0 | 0 |
| navigation.spec.ts | mobile | 5 | 5 | 0 | 0 | 0 |
| storyboard.spec.ts | desktop | 2 | 2 | 0 | 0 | 0 |
| storyboard.spec.ts | mobile | 2 | 2 | 0 | 0 | 0 |

- **desktop**: 33 passed as expected (incl. test.fail() tests that failed as declared), 0 unexpected, 2 skipped, 0 flaky
- **mobile**: 33 passed as expected (incl. test.fail() tests that failed as declared), 2 unexpected, 0 skipped, 0 flaky

### Every test, with its outcome

| Spec | Project | Test | Outcome |
|---|---|---|---|
| agent-g-intents.spec.ts | desktop | [ka] the five sentences alone: which open the Video tool with the plan said, which are chat | PASS |
| agent-g-intents.spec.ts | desktop | [ka] with two clips and a track the words are the montage lane: one quote with the files and the words; a change re-quotes | PASS |
| agent-g-intents.spec.ts | desktop | [ka] with clips and a track „make a 24-second music video" is a montage quote, not the Video tool | PASS |
| agent-g-intents.spec.ts | desktop | [en] the five sentences alone: which open the Video tool with the plan said, which are chat | PASS |
| agent-g-intents.spec.ts | desktop | [en] with two clips and a track the words are the montage lane: one quote with the files and the words; a change re-quotes | PASS |
| agent-g-intents.spec.ts | desktop | [en] with clips and a track „make a 24-second music video" is a montage quote, not the Video tool | PASS |
| agent-g-intents.spec.ts | desktop | [ru] the five sentences alone: which open the Video tool with the plan said, which are chat | PASS |
| agent-g-intents.spec.ts | desktop | [ru] with two clips and a track the words are the montage lane: one quote with the files and the words; a change re-quotes | PASS |
| agent-g-intents.spec.ts | desktop | [ru] with clips and a track „make a 24-second music video" is a montage quote, not the Video tool | PASS |
| agent-g-intents.spec.ts | desktop | [en] the brief's "start the music at second 58" gets the same Agent G note as KA/RU | FAIL as declared (test.fail) — lib/agent/params.ts START_PATTERNS mine "at 58 seconds" / "from the 58th second" but not "at second 58": the EN sentence falls through to the chat model while KA/RU get Agent G's note (lib/agent/intentReply.ts:158). |
| agent-g-intents.spec.ts | desktop | [ka] the brief's bare "exactly 29.7 seconds" sentence opens the Video tool with the 891-frame plan | FAIL as declared (test.fail) — "ვიდეო ზუსტად 29.7 წამი უნდა იყოს." has no make-verb, so lib/agent/intent.ts leaves it to the chat model in every language; only "გააკეთე 29.7-წამიანი ვიდეო." opens the tool (that path passes above). |
| agent-g-intents.spec.ts | desktop | [en] the brief's bare "exactly 29.7 seconds" sentence opens the Video tool with the 891-frame plan | FAIL as declared (test.fail) — "The video must be exactly 29.7 seconds." has no make-verb, so lib/agent/intent.ts leaves it to the chat model in every language; only "Make a 29.7-second video." opens the tool (that path passes above). |
| agent-g-intents.spec.ts | desktop | [ru] the brief's bare "exactly 29.7 seconds" sentence opens the Video tool with the 891-frame plan | FAIL as declared (test.fail) — "Видео должно быть ровно 29.7 секунды." has no make-verb, so lib/agent/intent.ts leaves it to the chat model in every language; only "Сделай 29.7-секундное видео." opens the tool (that path passes above). |
| agent-g-intents.spec.ts | desktop | [ka] the 24-second music-video sentence plans its storyboard in music-video mode | FAIL as declared (test.fail) — components/studio/OmniStudio.tsx open step: setVideoMode(musicvideo) and createStoryboard() run in the same tick, and createStoryboard (line ~4647) reads videoMode from the render closure — the plan POST carries musicVideoMode=false for a music-video sentence. |
| agent-g-intents.spec.ts | desktop | [ka] AC-23 — a music delay this version cannot honour is said on the quote card in a note starting „ამ ვერსიაში არ არის მხარდაჭერილი" | PASS |
| agent-g-intents.spec.ts | desktop | [ka] AC-23 — „add these two" after a delivered montage is refused in words: zero new quotes, nothing sent, words and files stay | PASS |
| agent-g-intents.spec.ts | mobile | [ka] the five sentences alone: which open the Video tool with the plan said, which are chat | PASS |
| agent-g-intents.spec.ts | mobile | [ka] with two clips and a track the words are the montage lane: one quote with the files and the words; a change re-quotes | PASS |
| agent-g-intents.spec.ts | mobile | [ka] with clips and a track „make a 24-second music video" is a montage quote, not the Video tool | PASS |
| agent-g-intents.spec.ts | mobile | [en] the five sentences alone: which open the Video tool with the plan said, which are chat | PASS |
| agent-g-intents.spec.ts | mobile | [en] with two clips and a track the words are the montage lane: one quote with the files and the words; a change re-quotes | PASS |
| agent-g-intents.spec.ts | mobile | [en] with clips and a track „make a 24-second music video" is a montage quote, not the Video tool | PASS |
| agent-g-intents.spec.ts | mobile | [ru] the five sentences alone: which open the Video tool with the plan said, which are chat | PASS |
| agent-g-intents.spec.ts | mobile | [ru] with two clips and a track the words are the montage lane: one quote with the files and the words; a change re-quotes | PASS |
| agent-g-intents.spec.ts | mobile | [ru] with clips and a track „make a 24-second music video" is a montage quote, not the Video tool | PASS |
| agent-g-intents.spec.ts | mobile | [en] the brief's "start the music at second 58" gets the same Agent G note as KA/RU | FAIL as declared (test.fail) — lib/agent/params.ts START_PATTERNS mine "at 58 seconds" / "from the 58th second" but not "at second 58": the EN sentence falls through to the chat model while KA/RU get Agent G's note (lib/agent/intentReply.ts:158). |
| agent-g-intents.spec.ts | mobile | [ka] the brief's bare "exactly 29.7 seconds" sentence opens the Video tool with the 891-frame plan | FAIL as declared (test.fail) — "ვიდეო ზუსტად 29.7 წამი უნდა იყოს." has no make-verb, so lib/agent/intent.ts leaves it to the chat model in every language; only "გააკეთე 29.7-წამიანი ვიდეო." opens the tool (that path passes above). |
| agent-g-intents.spec.ts | mobile | [en] the brief's bare "exactly 29.7 seconds" sentence opens the Video tool with the 891-frame plan | FAIL as declared (test.fail) — "The video must be exactly 29.7 seconds." has no make-verb, so lib/agent/intent.ts leaves it to the chat model in every language; only "Make a 29.7-second video." opens the tool (that path passes above). |
| agent-g-intents.spec.ts | mobile | [ru] the brief's bare "exactly 29.7 seconds" sentence opens the Video tool with the 891-frame plan | FAIL as declared (test.fail) — "Видео должно быть ровно 29.7 секунды." has no make-verb, so lib/agent/intent.ts leaves it to the chat model in every language; only "Сделай 29.7-секундное видео." opens the tool (that path passes above). |
| agent-g-intents.spec.ts | mobile | [ka] the 24-second music-video sentence plans its storyboard in music-video mode | FAIL as declared (test.fail) — components/studio/OmniStudio.tsx open step: setVideoMode(musicvideo) and createStoryboard() run in the same tick, and createStoryboard (line ~4647) reads videoMode from the render closure — the plan POST carries musicVideoMode=false for a music-video sentence. |
| agent-g-intents.spec.ts | mobile | [ka] AC-23 — a music delay this version cannot honour is said on the quote card in a note starting „ამ ვერსიაში არ არის მხარდაჭერილი" | PASS |
| agent-g-intents.spec.ts | mobile | [ka] AC-23 — „add these two" after a delivered montage is refused in words: zero new quotes, nothing sent, words and files stay | PASS |
| cards.spec.ts | desktop | a running montage shows its stage and no "%" when the server sends no percent; Stop is offered | PASS |
| cards.spec.ts | desktop | after a reload the running job is in the tray exactly once (live), no card in the fresh chat | PASS |
| cards.spec.ts | desktop | the tray row prints no "%" for a job whose server sends no percent | FAIL as declared (test.fail) — components/studio/JobTray.tsx:106 passes no pct for a job with pct null, and components/studio/ui/GenerationProgress.tsx:193-204 + 241-243 then prints a time-eased ESTIMATE as "<n>%" — a percent the server never sent. |
| cards.spec.ts | desktop | a montage whose result failed its check says so, shows nothing, and Retry re-quotes exactly once | PASS |
| cards.spec.ts | desktop | film: /api/video/assemble 502 qc_rejected → the reason on an error card; Try again plans again (no re-send); Dismiss removes it | PASS |
| cards.spec.ts | desktop | film: /api/video/assemble 422 music_unreadable → the reason on an error card, nothing delivered | PASS |
| cards.spec.ts | desktop | film: the server's reason for a refused assemble is readable ON the error card, not only in its tooltip | FAIL as declared (test.fail) — components/studio/ui/ResultCard.tsx:111+192 — oneLineError is "<generic videoFailed sentence> — <server message>" clamped to two lines (line-clamp-2), so the server reason (qc_rejected / music_unreadable message) is cut off on screen and survives only in the <p title> tooltip. |
| cards.spec.ts | desktop | a finished 9:16 montage is shown in a vertical frame | PASS |
| cards.spec.ts | mobile | a running montage shows its stage and no "%" when the server sends no percent; Stop is offered | PASS |
| cards.spec.ts | mobile | after a reload the running job is in the tray exactly once (live), no card in the fresh chat | FAIL |
| cards.spec.ts | mobile | the tray row prints no "%" for a job whose server sends no percent | FAIL — components/studio/JobTray.tsx:106 passes no pct for a job with pct null, and components/studio/ui/GenerationProgress.tsx:193-204 + 241-243 then prints a time-eased ESTIMATE as "<n>%" — a percent the server never sent. |
| cards.spec.ts | mobile | a montage whose result failed its check says so, shows nothing, and Retry re-quotes exactly once | PASS |
| cards.spec.ts | mobile | film: /api/video/assemble 502 qc_rejected → the reason on an error card; Try again plans again (no re-send); Dismiss removes it | PASS |
| cards.spec.ts | mobile | film: /api/video/assemble 422 music_unreadable → the reason on an error card, nothing delivered | PASS |
| cards.spec.ts | mobile | film: the server's reason for a refused assemble is readable ON the error card, not only in its tooltip | FAIL as declared (test.fail) — components/studio/ui/ResultCard.tsx:111+192 — oneLineError is "<generic videoFailed sentence> — <server message>" clamped to two lines (line-clamp-2), so the server reason (qc_rejected / music_unreadable message) is cut off on screen and survives only in the <p title> tooltip. |
| cards.spec.ts | mobile | a finished 9:16 montage is shown in a vertical frame | PASS |
| editing.spec.ts | desktop | an attached video + „Convert this video to 9:16." → plan card → Start → the edit under the card | PASS |
| editing.spec.ts | desktop | with the edit lane closed the ask is answered in words and nothing is quoted | PASS |
| editing.spec.ts | desktop | [ka · phone] AC-23 — the unsupported music delay is said on the quote card | SKIP — the desktop pass lives in agent-g-intents.spec.ts |
| editing.spec.ts | desktop | [ka · phone] AC-23 — „add these two" after a delivered montage: refused in words, zero new quote calls | SKIP — the desktop pass lives in agent-g-intents.spec.ts |
| editing.spec.ts | mobile | an attached video + „Convert this video to 9:16." → plan card → Start → the edit under the card | PASS |
| editing.spec.ts | mobile | with the edit lane closed the ask is answered in words and nothing is quoted | PASS |
| editing.spec.ts | mobile | [ka · phone] AC-23 — the unsupported music delay is said on the quote card | PASS |
| editing.spec.ts | mobile | [ka · phone] AC-23 — „add these two" after a delivered montage: refused in words, zero new quote calls | PASS |
| navigation.spec.ts | desktop | the dashboard loads at /en, /ka and /ru with the composer ready | PASS |
| navigation.spec.ts | desktop | chat → Video through the sidebar row; the mode switch holds across a chat round-trip; a reload resets it | PASS |
| navigation.spec.ts | desktop | a ?tool=video link opens the Video tool; the param is taken off the URL, so Back/Forward carry no tool | PASS |
| navigation.spec.ts | desktop | a reload opens a fresh chat; the conversation is in History and reopens from there | PASS |
| navigation.spec.ts | desktop | switching conversations in the sidebar keeps results scoped: a new session shows none, reopening shows them again | PASS |
| navigation.spec.ts | mobile | the dashboard loads at /en, /ka and /ru with the composer ready | PASS |
| navigation.spec.ts | mobile | chat → Video through the sidebar row; the mode switch holds across a chat round-trip; a reload resets it | PASS |
| navigation.spec.ts | mobile | a ?tool=video link opens the Video tool; the param is taken off the URL, so Back/Forward carry no tool | PASS |
| navigation.spec.ts | mobile | a reload opens a fresh chat; the conversation is in History and reopens from there | PASS |
| navigation.spec.ts | mobile | switching conversations in the sidebar keeps results scoped: a new session shows none, reopening shows them again | PASS |
| storyboard.spec.ts | desktop | Generate sends the approval of the board on screen (fingerprint recomputed here); a revision_mismatch is refused with Retry and nothing runs after it | PASS |
| storyboard.spec.ts | desktop | the director path posts the same approval; its revision_mismatch is shown with the message and Edit storyboard, nothing is dispatched | PASS |
| storyboard.spec.ts | mobile | Generate sends the approval of the board on screen (fingerprint recomputed here); a revision_mismatch is refused with Retry and nothing runs after it | PASS |
| storyboard.spec.ts | mobile | the director path posts the same approval; its revision_mismatch is shown with the message and Edit storyboard, nothing is dispatched | PASS |

### The two mobile FAILs (not dressed up)

`cards.spec.ts` › "after a reload the running job is in the tray exactly once (live)…" and "the tray row prints no "%"…" both hit the 90 s test timeout on `locator.click` on the **mobile** project only (desktop passed the first and failed-as-declared the second). The failure snapshot shows the tray row `Agent G · montage · Joining the shots` present, so the tray itself appears on the phone; what timed out is a click in the test's own flow on the iPhone viewport (the composer/sheet layering after `reload`). Not re-run within the time box — treat both mobile rows as **not verified**, not as a product failure.

## What each spec asserts

- **navigation.spec.ts** — /en /ka /ru load with the composer; chat → Video through the sidebar row (`[data-tour="tool-video"]`), the mode switch (`video-mode-musicvideo` aria-checked) holds across a chat round-trip; `?tool=video` opens the tool; reload / Back-Forward / sidebar switching are OBSERVED and written to findings (see below); a montage result stays scoped to its conversation (new session shows none, reopening shows it once, zero re-runs).
- **agent-g-intents.spec.ts** — the five brief sentences in KA/EN/RU, alone and with two clips + a track: `open` steps assert the `🎬` route note + the duration contract line in the chat AND `video-duration-plan[data-final/native/frames]` on the panel (24 s → no deviation line; 1:00 → 1:04 / 1800 frames; 29.7 s → 32 s / 891 frames), the planOnly POST's `sceneCount` (3 / 8 / 4); chat passes are counted on the mocked model route; montage-lane sentences assert the quote body `{action:'quote', files[3], names, prompt}` and the re-quote prompt `"<card words>\n<change>"` with the first card `dismissed`; AC-23: `unsupported:['music_delay']` → a line starting „ამ ვერსიაში არ არის მხარდაჭერილი: მუსიკის მოგვიანებით ჩართვა ტაიმლაინზე.“; „ეს ორიც დაამატე“ after a delivered montage → `followUpUnsupportedText('add_clips','ka')` notice, quote calls stay 1, composer keeps the words and both files.
- **storyboard.spec.ts** — Generate → the dispatch's `storyboardApproval.fingerprint` is 16-hex and equals `fingerprintBoard(approval.board)` recomputed from the posted board (lib/video/storyboard/revision), the edited scene 2 is in it (`edited:true`), `sceneScripts` === `renderScriptsFor(board)`, `sceneCount` 3; mocked 400 `revision_mismatch` → error card with the message and **Try again**, assemble 0, director runs 0, status reads 0; Try again plans a NEW storyboard (planOnly +1) and never re-sends the dispatch. Director path: the same approval on `/api/video/director/runs`, refusal shown with the message + **Edit storyboard** (no Retry there — finding), board comes back with the edit, no orchestrate/assemble.
- **cards.spec.ts** — running montage with `pct:null`: active step `li[aria-current=step][data-step=stitch]` ("Join the shots"), no `%` in the card, `composer-stop-job[data-kind=montage]`; task `failed/qc_failed` → "The result failed its check…", no result, `agent-montage-retry` re-quotes exactly once (run stays 1); film `/api/video/assemble` 502 `qc_rejected` and 422 `music_unreadable` → `result-card[data-state=error]` carrying the server message, Try again → planOnly +1 (orchestrate stays 1), Dismiss → 0 cards; 9:16 result → `agent-montage-result [class*="aspect-[9/16]"]`.
- **editing.spec.ts** — attached video + „Convert this video to 9:16.“ → `{action:'quote', file:'omni-uploads/u/file-1', edits:[{op:'aspect',to:'9:16',fit:'crop'}], name}`, "Plan: frame 9:16, cropped to fill.", Start → running → result video; lane closed → words only, no quote; the two AC-23 checks again on the phone (skipped on desktop, where agent-g-intents covers them).

## Defects found (product code NOT modified; each kept as a `test.fail()` test so the run stays truthful)

1. **Storyboard planned with the mode from BEFORE the sentence.** Repro: KA page, type „შექმენი 24-წამიანი მუსიკალური კლიპი.“ → the Video panel shows Music video, but the `POST /api/film/storyboard` planOnly body carries `musicVideoMode:false` (same for EN/RU). Suspect: `components/studio/OmniStudio.tsx` `open` case (~8990–8999) calls `createStoryboard(text, refs, orientation, { nativeSec })` in the same tick as `setVideoMode(step.videoMode)`, and `createStoryboard` (~4614, body at 4647 `musicVideoMode: videoMode === 'musicvideo'`) reads `videoMode` from the render closure. Test: agent-g-intents "[ka] the 24-second music-video sentence plans its storyboard in music-video mode" (test.fail, both projects).
2. **Job tray prints an estimated percent the server never sent.** Repro: a running montage whose task view has `pct:null`, reload → the tray row shows "<n>%". Suspect: `components/studio/JobTray.tsx:106` passes no `pct`, and `components/studio/ui/GenerationProgress.tsx:193-204` falls back to a time-eased estimate that `:241-243` prints as `{shownPct}%`. Test: cards "the tray row prints no "%"…" (test.fail; desktop failed as declared, mobile timed out — see above). The chat CARD is honest (no %; progressbar aria-valuenow 0 seeded by confirmAgentMontage).
3. **The server's reason is clipped off the error card.** Repro: film assemble 502 `qc_rejected` (or 422) → the card shows only "Video generation failed — the service may be busy. Please try again in a few…"; the reason survives only in the `<p title>` tooltip (see qc-rejected-card.jpg). Suspect: `components/studio/ui/ResultCard.tsx:111` builds `oneLineError` as `<generic videoFailed> — <server message>` (lib/ui/opFailure.ts describeOpFailure) and `:192` renders it `line-clamp-2`. Test: cards "film: the server's reason… readable ON the error card" (test.fail, both projects).
4. **EN „Start the music at second 58.“ is not understood** (KA/RU are). Repro: EN page, nothing attached → the model answers; over a waiting montage plan → no re-quote (KA/RU re-quote with the start). Suspect: `lib/agent/params.ts` START_PATTERNS ("at 58 seconds" / "from the 58th second" mine, "at second N" does not). Test: agent-g-intents "[en] the brief's "start the music at second 58" gets the same Agent G note as KA/RU" (test.fail).
5. **Spec gap (judgement for the owner):** the bare „ვიდეო ზუსტად 29.7 წამი უნდა იყოს.“ / "The video must be exactly 29.7 seconds." / «Видео должно быть ровно 29.7 секунды.» is a chat message in all three languages (no Video tool, no plan): `lib/agent/intent.ts` requires a make-verb before a length opens the tool. „გააკეთე 29.7-წამიანი ვიდეო.“ does open it with the 29.7 → 32 → 29.7 / 891-frame plan (PASS). Tests: agent-g-intents "[xx] the brief's bare "exactly 29.7 seconds" sentence opens the Video tool…" (test.fail ×3).
6. **Composer attachments are not scoped per conversation** (the brief expects attachments and results scoped on sidebar switching): a clip attached in a new session is still in the box when the earlier conversation is reopened (results ARE scoped). Suspect: `components/studio/OmniStudio.tsx` keeps `attachments` in one state; the History pick (currentConversationId / OMNI_RESUME_KEY, ~1440-1455) swaps the thread only. Recorded as finding `nav-attachments-on-switch` (navigation.spec.ts); no test.fail() test in this run (time box).

Minor, recorded as findings rather than defects: the director path's revision_mismatch offers "Edit storyboard" + Close instead of Retry; the montage lane has no `music_unreadable` wording (a worker error of that name would read as `render_failed`).

## Findings (test.info().annotations type `finding` + findings.json, 38 rows)

## What was mocked (every spec, tests/video-core/_shared.ts `openStudio`)

| Route | Answer |
|---|---|
| `POST /api/upload/sign`, `PUT <signed>`, `POST /api/upload/verify` | tests/fixtures `mockStoredUpload` → `omni-uploads/u/file-N` |
| `https://e2e-media.supabase.co/**` | `tests/fixtures/clip.webm` bytes (clips, masters, edits) |
| `POST /api/chat/gemini` | SSE with one canned reply (`reply`, default „Noted — the chat model answered this one.“); every call counted |
| `POST /api/chat/title`, `GET /api/studio/library` | trivial OK |
| `GET /api/video/capabilities` | `{ longform:false, maxSeconds:96 }` (caps closed) |
| `GET /api/video/director` | `{ enabled }` (`director` option, default false → film path) |
| `POST /api/video/director/runs` | `directorRuns` (default 400 `revision_mismatch` + `problems`) |
| `GET /api/agent/media/{montage,edit,audio}` | the lane flags (`montage` on, `edit`/`audio` off unless set) |
| `POST /api/agent/media/montage` | `action:'quote'` → `quote` (object or `(body, n)` fn, default `QUOTE` 16:9) + signed token; `action:'run'` → job id |
| `POST /api/agent/media/edit` | `EDIT_QUOTE` (aspect 9:16 crop) / `EDIT_JOB` |
| `GET /api/tasks?id=` | one `taskView` per read from `taskViews` (default running stitch 55 % → completed 16:9); `?active=1` → the first view while `live` |
| `POST /api/tasks` (cancel) | OK, counted |
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
- **Real uploads / storage** — the signed-upload round trip is the fixture's.
- **WebKit / Safari** — only the bundled Chromium exists here; the `mobile` project is the iPhone 13 descriptor run in Chromium (`browserName: 'chromium'`).
- **`video-duration-readout`** — no element carries that test id in the panel; the plan line is `video-duration-plan` (data-final / data-native / data-frames) and the chat notice, both asserted.
- **A montage-lane `music_unreadable`** — the lane has no such code (lib/agent/media/montageChat `ERR`); it is exercised on the film path (`/api/video/assemble` 422) as the brief lists it.
- **Back/Forward restoring a tool** — there is nothing to restore (the `?tool=` param is stripped on open); recorded as a finding, not asserted as a pass.
- **A director run in progress** — only the refusal (400) is mocked; shot progress needs the worker.
- The two mobile-only AC-23 tests in editing.spec.ts are `test.skip` on desktop (their desktop pass is in agent-g-intents.spec.ts); the inverse holds for nothing.

- `intent-mv24-plan-mode-ka` (desktop/mobile; agent-g-intents.spec.ts): "შექმენი 24-წამიანი მუსიკალური კლიპი." opened the Video tool in music-video mode (the panel shows it), but the storyboard plan POST /api/film/storyboard carried musicVideoMode=false — the board is planned with the mode from BEFORE the sentence (components/studio/OmniStudio.tsx:4647 reads videoMode from the render closure; the open step at ~8995 calls createStoryboard right after setVideoMode).
- `intent-exact-297-ka` (desktop/mobile; agent-g-intents.spec.ts): "ვიდეო ზუსტად 29.7 წამი უნდა იყოს." alone is a chat message (the model answered; no Video tool, no plan). lib/agent/intent.ts needs a make-verb before a length opens the tool; the bare constraint sentence has none.
- `intent-exact-297-files-ka` (desktop/mobile; agent-g-intents.spec.ts): "ვიდეო ზუსტად 29.7 წამი უნდა იყოს." with two clips and a track attached: chat calls +1, quote calls +0, storyboard calls +0; cards+plans on screen: 1; composer now "".
- `intent-mv24-plan-mode-en` (desktop/mobile; agent-g-intents.spec.ts): "Make a 24-second music video." opened the Video tool in music-video mode (the panel shows it), but the storyboard plan POST /api/film/storyboard carried musicVideoMode=false — the board is planned with the mode from BEFORE the sentence (components/studio/OmniStudio.tsx:4647 reads videoMode from the render closure; the open step at ~8995 calls createStoryboard right after setVideoMode).
- `intent-en-music-58` (desktop/mobile; agent-g-intents.spec.ts): EN "Start the music at second 58." (nothing attached) is a chat message: the model answered it. KA/RU equivalents get Agent G's own note (lib/agent/intentReply.ts:158). lib/agent/params.ts START_PATTERNS mine "at 58 seconds" / "from the 58th second", not "at second 58".
- `intent-exact-297-en` (desktop/mobile; agent-g-intents.spec.ts): "The video must be exactly 29.7 seconds." alone is a chat message (the model answered; no Video tool, no plan). lib/agent/intent.ts needs a make-verb before a length opens the tool; the bare constraint sentence has none.
- `intent-en-music-58-requote` (desktop/mobile; agent-g-intents.spec.ts): EN "Start the music at second 58." said over a waiting montage plan is a chat message (model answered); KA/RU re-quote the plan with the music start. lib/agent/params.ts START_PATTERNS lack "at second N".
- `intent-exact-297-files-en` (desktop/mobile; agent-g-intents.spec.ts): "The video must be exactly 29.7 seconds." with two clips and a track attached: chat calls +1, quote calls +0, storyboard calls +0; cards+plans on screen: 1; composer now "".
- `intent-mv24-plan-mode-ru` (desktop/mobile; agent-g-intents.spec.ts): "Сделай 24-секундный музыкальный клип." opened the Video tool in music-video mode (the panel shows it), but the storyboard plan POST /api/film/storyboard carried musicVideoMode=false — the board is planned with the mode from BEFORE the sentence (components/studio/OmniStudio.tsx:4647 reads videoMode from the render closure; the open step at ~8995 calls createStoryboard right after setVideoMode).
- `intent-exact-297-ru` (desktop/mobile; agent-g-intents.spec.ts): "Видео должно быть ровно 29.7 секунды." alone is a chat message (the model answered; no Video tool, no plan). lib/agent/intent.ts needs a make-verb before a length opens the tool; the bare constraint sentence has none.
- `intent-exact-297-files-ru` (desktop/mobile; agent-g-intents.spec.ts): "Видео должно быть ровно 29.7 секунды." with two clips and a track attached: chat calls +1, quote calls +0, storyboard calls +0; cards+plans on screen: 1; composer now "".
- `card-progressbar-no-pct` (desktop/mobile; cards.spec.ts): With pct null from the server the running montage card prints no "%" (stage "Joining the shots" on the active step); its progressbar reports aria-valuenow=0 (seeded 0 by confirmAgentMontage, never advanced without a server pct).
- `nav-reload-tool` (desktop/mobile; navigation.spec.ts): After a reload the dashboard opens on the chat (the open tool is not persisted); the Video mode comes back as "documentary" (the music-video pick is NOT persisted — components/studio/OmniStudio.tsx:2584 keeps videoMode in component state only).
- `nav-tool-param-stripped` (desktop/mobile; navigation.spec.ts): ?tool=video opens the Video tool, then history.replaceState drops the param (URL now "/en/dashboard"; components/studio/OmniStudio.tsx:3549). The history entry therefore carries no tool for Back/Forward to restore.
- `nav-back-forward` (desktop; navigation.spec.ts): Back landed on "/en/dashboard" with the Video panel closed (the tool opened by ?tool=video is not restored); Forward landed on "/en/dashboard" with the Video panel closed. mobile=false.
- `nav-reload-conversation` (desktop/mobile; navigation.spec.ts): After a reload the thread is EMPTY: the studio opens a new, empty conversation on every visit by design (components/studio/OmniStudio.tsx:1440-1455 currentConversationId — only an explicit History pick, OMNI_RESUME_KEY, reopens one); the conversation is listed in History.
- `nav-attachments-on-switch` (desktop/mobile; navigation.spec.ts): A clip attached in the composer of the new session STAYS in the composer when the earlier conversation is reopened (composer attachments are not scoped per conversation). Results (the montage card and its master) are scoped to their conversation.
- `storyboard-mismatch-retry` (desktop/mobile; storyboard.spec.ts): After a revision_mismatch the error card's Retry plans a NEW storyboard (POST /api/film/storyboard planOnly) for the user to approve again; the refused dispatch is never re-sent (orchestrate stayed at 1, assemble at 0). Message shown: "the storyboard changed after it was approved (revision 2 · 0…".
- `director-mismatch-no-retry` (desktop/mobile; storyboard.spec.ts): The director path's revision_mismatch is shown with the server message and "Edit storyboard" / Close — no Retry button (components/studio/video/DirectorRunOverlay.tsx refused state); the way back is the board itself.
- `nav-back-forward` (mobile; navigation.spec.ts): Back landed on "/en/dashboard" with the Video panel closed (the tool opened by ?tool=video is not restored); Forward landed on "/en/dashboard" with the Video panel closed. mobile=true.

## Screenshots (9 JPEG, quality 60, each < 250 KB)

- `ac23-unsupported-note-mobile.jpg` (141 KB)
- `ac23-unsupported-note.jpg` (80 KB)
- `music-unreadable-card.jpg` (51 KB)
- `qc-rejected-card.jpg` (57 KB)
- `revision-mismatch-refusal.jpg` (52 KB)
- `storyboard-approval.jpg` (34 KB)
- `success-9x16-preview.jpg` (41 KB)
- `video-tool-duration-plan-desktop.jpg` (77 KB)
- `video-tool-duration-plan-mobile.jpg` (107 KB)

## Files

- Created: `playwright.video-core.config.ts`, `tests/video-core/_shared.ts`, `tests/video-core/_global-setup.ts`, `tests/video-core/navigation.spec.ts`, `tests/video-core/agent-g-intents.spec.ts`, `tests/video-core/storyboard.spec.ts`, `tests/video-core/cards.spec.ts`, `tests/video-core/editing.spec.ts`, this folder (`playwright-results.json`, `findings.json`, `summary.md`, the JPEGs).
- Modified: `playwright.config.ts` (one line: `testIgnore` now also ignores `video-core/`, the smoke-live ignore kept).
- Not touched: components/, lib/, app/, Image Studio, Payments, package.json. No git write commands were run.

