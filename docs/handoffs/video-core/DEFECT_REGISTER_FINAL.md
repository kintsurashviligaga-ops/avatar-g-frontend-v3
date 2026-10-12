# Video Core v1.0 — defect register, final state (round 3)

The full register with the BEFORE column, root causes and file lines is `defect-register.md` (rows 1–22). This file is the
state of every row on the release-candidate head, in the owner's vocabulary: **PROVEN** (fixed, regression test green,
measured where a measurement exists) · **DOES NOT REPRODUCE** (pinned so it cannot return) · **OPEN — GG** (the fix is a
decision or a resource only the owner can give) · **UNSUPPORTED, SAID** (this version cannot do it and tells the user so).
Tiers: T1 mocked · T2 local browser · T3 real ffmpeg · T4 Preview · T5 paid provider · T6 Production.

| # | Trigger (GG's register / found in this task) | Final state | Fix (commit) | Regression test | Highest tier measured | Remaining limitation |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | „29.7 წამი“ / „29,7 წამი“ → 7 s | DOES NOT REPRODUCE on 30be5a2; the chain is pinned 29.7 → 891 frames | — (kept) | `durationWords.test`, `durationContract.test`, `ffmpeg-assembly.ffmpeg.test` | T3 | — |
| 2 | „ერთწუთიანი“ / „ოთხწუთიანი“ / "one-minute" / «одноминутное» not recognised | PROVEN | `lib/video/durationWords.ts` (f2f3dae) | `intent.videoCore.test` 30/30 (before: 19 failed) | T1 (+T3 for 60 s = 1800) | — |
| 3 | 60 → 64, 29.7 → 32, 70 → 72 silent snap | PROVEN: Requested · Native · Final said, final trimmed exactly | `lib/video/durationContract.ts`, OmniStudio (8a04807, 2a2f8b7) | `durationContract.test`, `VideoCreatePanel.test` (`video-duration-plan`), T3 `t3-film-frame-counts.json` | T3 | T4 (a deployed browser) not run — B2 |
| 4 | 240 s → 96 s silent cut | PROVEN on the closed path: `longform_closed` refusal before the board; the open path (7200 frames) needs B4 + B1 | 5434df7 | `durationContract.test`, `longform/route.test` | T1 | OPEN — GG: `LONGFORM_ORDER_WIRED` + a Veo budget |
| 5 | storyboard plan miss / timeout / malformed → no card, or an auto-render | PROVEN: error card with Retry / Dismiss, nothing rendered | df5c8e9 | `OmniStudio` storyboard tests, `videoCoreWiring.test` | T1 | T2 Retry card asserted locally only (`evidence/t2-round3`) |
| 6 | a new project inherits the last project's length | PROVEN | 5434df7 | `videoCoreWiring.test` | T1 | project switching on a deployed build: B2 |
| 7 | music source offset drifts | DOES NOT REPRODUCE; pinned exact (`musicStartSec = musicFromSec`) | — (kept) | `beatPlan.test`, T3 AC-06 chain (0:59 marker on the first frame) | T3 | — |
| 8 | „მარტო ბოლო ხუთი“ of 7 uses all 7 | DOES NOT REPRODUCE; excluded clips contribute 0 frames in `qc.sources` | — (kept) | `sourceSelect.test`, T3 E2E-22 | T3 | — |
| 9 | a source shorter than asked is padded with a frozen tail | PROVEN: under a contract the pad is off; longer-than-master is **refused** | 2a2f8b7 | `ffmpeg-assembly.ffmpeg.test` c_refusal (`longer_than_master`) | T3 | legacy pad without a contract stays (D6, OPEN — GG) |
| 10 | double click / concurrent retry / late callback / crash | DOES NOT REPRODUCE: one job per token, terminal rows never move, refund once | — (kept) | `montageExec.test:158/:287`, `jobs.test`, `jobLease.test`, `assembleQcGate.test` | T1 | — |
| 11 | result lost in chat / Library, wrong revision rendered | PROVEN at code level: fingerprint + approval at the tap, server re-check (`400 revision_mismatch`) on the film path and (round 3) the director path | df5c8e9, 2923fa0, 31d0260 | `revision.test`, `storyboardApproval.test`, `director/routes.test`, `fromStudio.test` | T1 | the revision **table** is a proposal (B3, OPEN — GG); artifact ↔ revision on a DB row needs it |
| 12 | 29+ assets | OPEN — GG (B5): refused by count, never dropped silently | — | `montageChat.test` (13-file quote cap) | T1 | segmented ingestion + a worker host beyond 600 s |
| 13 | montage of mixed 24/25/30 fps sources ±1 frame | PROVEN: 300 of 300 (was 301) | 2a2f8b7 | `montageExec.ffmpeg.test` (T3), `t3-montage-exec-e2e.json` | T3 | — |
| 14 | photos (Ken Burns) + narration: audio shorter than its window | PROVEN | 2a2f8b7 | `soundMontage.ffmpeg.test` S5 | T3 | — |
| 15 | (process) the first fix of #13 was wrong | documented; the measured chain stayed | — | `phase3-measurements.md` | — | — |
| 16 | film QA passed a master with the wrong frame count | PROVEN: `frame_count_mismatch` critical, master withheld, refunded once | 4812b0a, 71a6ec7 | `masterQa.test`, `assembleQcGate.test`, T3 `e_withheld`, round-3 `qcRejectThenRetry` | T3 | — |
| 17 | single-clip cut that misses the count | PROVEN: `FinalCutRejected` → `502 qc_rejected` | 71a6ec7 | `finalCut.test`, `assembleQcGate.test`, T3 `f_single_cut_gate` | T3 | — |
| 18 | `assemble_failed` (500) vs `assembly_failed` (502) spelling | named in `VIDEO_REFUSALS`; unification is a wire change | — | `contracts.test` | T1 | D5, OPEN — GG |
| 19 | **round 3 P0**: frames could NOT be counted → previously a warning, master delivered and settled | PROVEN: `frame_count_unverified` critical under a contract; QC problem `picture frames not counted` on the montage lane; no settlement | 2361153 | `masterQa.test`, `finalCut` via `assembleQcGate.test`, `montageAsk.test` qcAvSync, `montageWorker.test` | T1 (the real-ffmpeg harness forces counts, it cannot break the counter) | — |
| 20 | **round 3 P1**: a director run from the studio board was not checked against the approval | PROVEN: `checkStoryboardApproval` before `freeze`, `400 revision_mismatch`, nothing stored / charged | 31d0260, 7078648 (test) | `fromStudio.test`, `director/routes.test`, `videoCoreWiring.test`, `DirectorRunOverlay.test` | T1 | a run with **no** approval is still accepted (D8, OPEN — GG: make it mandatory?) |
| 21 | **round 3 P1**: a soundtrack / narration / sfx file with no readable audio stream crashed the encode as a generic `assembly_failed` | PROVEN: probed after download, before the encode; `422 music_unreadable` with the lane; refunded once; measured BEFORE (88 ms crash) and AFTER (46 ms refusal, 0 encodes) | 35380ae | `assembleQcGate.test`, `videoCoreRound3.ffmpeg.test` case 6 | T3 | — |
| 22 | **round 3 P1 (AC-23)**: a later music start on the timeline was read as a track offset; add-clips / replace-music follow-ups became a silent new quote | UNSUPPORTED, SAID: quote `unsupported: ['music_delay']` + card note; follow-up answered as unsupported before any quote; nothing charged | 261a261 | `montageAsk.test:382`, `montageExec.test:431`, `montageChat.test:221`, `videoCoreWiring.test:186` | T1 (+T2 note rendering, `evidence/t2-round3`) | the contract fields (timeline start ≠ 0, add-to-manifest, swap-in-place) are GG's shared-contract decision (`blockers-and-deferred.md` item 5) |
| 23 | **round 3 (CI)**: `DirectorRunOverlay.test` expected the pre-round-3 body → CI red on fc1971b | PROVEN: test pinned to the new body (locale; approval beside the storyboard) | 7078648 | `DirectorRunOverlay.test` (7/7) | T1 | — |

## Round-3 browser findings (T2, local Playwright, mocked server)

Filled from `evidence/t2-round3/summary.md` once that run is in (desktop + iPhone 13 projects). A behaviour the specs found
not persisted or not supported is listed there as a finding with its file:line, never as a passing test.

## What is not in this register on purpose

- Owner decisions D1–D8 (`consolidation-plan.md` §5, `blockers-and-deferred.md`): not defects, choices.
- Blockers B1–B8: resources or permissions, each with its cost and next action in `RELEASE_READINESS_CHECKLIST.md`.
- Anything in Image Studio or Payments: out of this task's ownership (not touched: `git diff 30be5a2..HEAD -- lib/billing lib/credits` is empty; no `components/studio/create/Image*` change).
