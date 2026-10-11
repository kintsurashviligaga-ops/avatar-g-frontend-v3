# Agent G repair — root-cause audit (2026-10-11)

GG's P0 task of 2026-10-11 05:19Z, "AGENT G COMPLETE REPAIR & END-TO-END CERTIFICATION". The baseline was main =
Production `2817c9b5`. Branch `claude/launch-certification-wmvitt`, draft PR #55.

Labels: PROVEN / BUILT_NOT_PROVEN / PARTIAL / BROKEN / BLOCKED / OFF. "Fixed" below means fixed in code on the branch
with unit or integration tests. Nothing here is PROVEN on Production: the branch is not merged or deployed.

## 0. What GG saw (Production, 2026-10-11 05:00Z, admin account)

GG attached 3 clips and 1 MP3 and wrote "ეს ოთხივე ფაილი გამოიყენე, ვიდეოები დაამონტაჟე, მუსიკას დაამთხვიე".

Read-only evidence from the Production database:
- Only ONE mp4 and ONE mp3 reached Storage (`uploads/omni-uploads/...`).
- A remix job `vremix:music:*` rendered `renders/remix/dub-*.mp4`. The track was laid under clip 1 with `-shortest`.
- There is no `credit_ledger` row, because admins are not charged.
- Clips 2 and 3 were dropped without a word.

## 1. Root causes

| # | Observed | Expected | Root cause | Module | Fix | Regression test | Env |
|---|---|---|---|---|---|---|---|
| 1 | No Agent G montage plan | Agent G cuts the 3 clips to the track | `AGENT_G_MEDIA_EXEC` is unset in Production, so the montage is off and `beatMontageAsk` is skipped silently | `lib/agent/media/access.ts` | No flag change (GG's decision). The chat now says why and opens the free Montage editor with every file (row 3) | `lib/chat/chatMediaRoute.test.ts` | Prod: OFF by design |
| 2 | "დაამონტაჟე" did not open the editor either | Montage words open the Montage editor | The montage regex in `studioIntent` had no `და-`/`გადა-`/`მი-` verb forms | `lib/chat/studioIntent.ts:117` | Regex now matches დაამონტაჟე / გადაამონტაჟე / დამიმონტაჟე / შეაერთე; questions ("მონტაჟი რა ღირს?") still open nothing | `chatMediaRoute.test.ts` "studio intent" | Fixed (branch) |
| 3 | A one-video remix ran on clip 1 and dropped clips 2 and 3 | 2+ videos never go to a one-video edit | `isVideoEditRequest` fires on "მუსიკ"; the remix took `attachments.find(video)` | `components/studio/OmniStudio.tsx` remix branch | `multiVideoRoute`: a montage ask with 2+ videos opens the editor; a one-video edit asks which video; any other text is a question about every video. The remix branch refuses 2+ videos | `chatMediaRoute.test.ts`, `chatParity.test.ts` | Fixed (branch) |
| 4 | Files held as base64 in memory, no upload state | Each file uploads on select, shows progress and Ready / Failed / Retry, and survives send and reload | `ingestFiles` read every file (videos included) with `fileToDataUrl`; uploads happened only on demand inside each flow | `OmniStudio.tsx` `ingestFiles` | Video and big audio become object URLs and upload on select (`uploadFileToStorage` with progress, Stop and verify). Tiles show poster, duration, size, % and Ready / Failed + Retry. `chatUploads` hands every flow the stored path | `useUpload.progress.test.ts` | Fixed (branch) |
| 5 | The server never saw signed-upload bytes | A Ready file is really the attached kind | `/api/upload/sign` hands out a direct PUT URL; nothing checked the bytes | `app/api/upload/verify` (new), `lib/uploads/sniff.ts` (new) | Verify reads the first 4 KB and the real size. A wrong kind or a file over 50 MB is refused and removed (no orphan). `size` is now required at sign | `verify/route.test.ts`, `sniff.test.ts`, `sign/route.test.ts` | Fixed (branch) |
| 6 | After a reload a turn said only "video, video, video, audio" | The bubble and the model keep the names | `leanMessages` saved kinds only | `lib/chat/attachedFiles.ts` (new) | Each file's name, size, length and checked storage path are persisted. The bubble lists them and the model is told "1. clipA.mp4 (video, 0:09); …" | `attachedFiles.test.ts` | Fixed (branch); cross-device needs a DB column (BLOCKED_OWNER: migration) |
| 7 | A question about 3 videos was answered from clip 1 | All videos are read | The video-question path digested `attachments.find(video)` | `OmniStudio.tsx` video understanding | Every video is digested and the budget is split per clip. An unreadable clip is named and the turn is not sent | `chatParity.test.ts` | Fixed (branch) |
| 8 | The remix price card said "Music — 15 credits" and nothing else | Engine, files and price before Confirm | `remixAskText` had the op and price only | `lib/video/remixCharge.ts` | The card names the files and the engine: FFmpeg for music (no AI), ElevenLabs + FFmpeg for voiceover, an outside service for redub / restyle / character / background | `remixCharge.test.ts` | Fixed (branch). Price itself unchanged (GG's decision, §3) |
| 9 | Live Voice could not see the user's files | Voice works on the same files as text | `liveScreenState` had results only; `montage open` read results only; `ask_agent_g` sent no files | `lib/voice/liveTools.ts`, `OmniStudio.tsx` Live executor, `components/voice/live/liveActions.ts` | Screen state lists attachments. `montage open` with `source: "attached"` opens all of them through the same `seedMontageWith` as text. `ask_agent_g` sends the stored paths | `liveTools.test.ts`, `liveActions.test.tsx` | Fixed (branch) |
| 10 | A late Agent G answer could vanish | The model always learns the result | When the connection was renewed during a pending answer, `sendToolResponse` went to the old session | `components/voice/live/useGeminiLiveSession.ts` | The answer is told to the new connection as an [App] note (queued until it is ready) | `lateToolAnswer.test.ts` | Fixed (branch) |
| 11 | Live prompt contradictions | One truthful rule set | Text-chat rules ("cannot start a render", "read attachments fully") sat above the call rules; the tool-less legacy wire still claimed Google Search | `app/api/voice/live/route.ts` | The call rule overrides hand-off, says it cannot see file content, and legacy is built without search | `voice/live/route.test.ts` | Fixed (branch) |
| 12 | "Take a screenshot of MyHome.ge" had no honest rule | Say plainly what is not possible | No browser worker exists; the prompt said nothing | `lib/chat/platformPrompt.ts` | `BROWSER: none — never claim to click, log in or screenshot a site.` | `platformPrompt.test.ts` | Fixed (branch). A real browser is paid infra (BLOCKED_OWNER) |

## 2. Still open in this round

- Montage manifest and per-clip QC (PART 2 and PART 10). Being built:
  - one immutable manifest, with the file count checked at every boundary;
  - after render, proof that each clip contributed frames, plus a soundtrack and A/V-sync check.

  Status: BUILT_NOT_PROVEN until merged and run on real FFmpeg.
- Fast Georgian dictation (PART 4): partial text and latency metrics, being built. iPhone p50/p95 can only be measured on GG's iPhone (BLOCKED_OWNER: hands).
- Authenticated Preview E2E (PART 13): the admin sign-in is GG's hands (project rule).

## 3. Decisions only GG can make (unchanged by this round)

1. **Turn `AGENT_G_MEDIA_EXEC` on publicly.** Until then, text and voice open the free Montage editor with every file, and Agent G's automatic beat cut stays OFF in Production.
2. **The price of the remix "music" op.** It is FFmpeg only, yet charged 15 credits (`CHARGED_REMIX_OPS`).
3. **A DB column for attachment refs** across devices. This is a migration.
4. **A paid browser worker** for screenshots and clicks on sites.
