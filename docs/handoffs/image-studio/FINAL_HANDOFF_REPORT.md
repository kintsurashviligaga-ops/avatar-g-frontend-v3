# Image Studio v1.0 — final continuation handoff

Date: 2026-10-13. **Preserved and locally verified; Phase 6 real acceptance remains BLOCKED.**

## Saved state and ownership

- Actual implementation worktree: `/Users/giorgikintsurashvili/.codex/worktrees/image-studio-v1/beautiful-moser-50e6af`.
- Branch: `codex/image-studio-v1`; baseline: `30be5a2d96495f67134cad34796ce724a744bd28`.
- Recovery checkpoint: **`ed0dd85339b710219ca62eccad2b14dcdc3a4293`**. All 109 recovered regular files were checked against the existing 110-entry backup manifest; the remaining entry is the local `node_modules` symlink, deliberately excluded from Git.
- Final engineering commit: **`a7b34014961ce8a46ff1ed2a500c92a3babd4142`**. Timer cleanup, ImageWorkspace URL disposal and gated Phase 6 harness; no Video Core implementation changes.
- The similarly named checkout at `/Users/giorgikintsurashvili/avatar-g-frontend-v3/.claude/worktrees/beautiful-moser-50e6af` is detached. It was not used for implementation edits. Its existing dependencies are the symlink target.
- Original 88-file archive, subsequent recovery archives, raw logs and manifests remain available. No source was restarted or rewritten wholesale. No reset, discard, force push, merge, deployment, production migration or paid provider call occurred.

## Old chats

Both remain **active / waitingOnApproval**, not confirmed stopped:

| Exact title | Chat ID |
|---|---|
| `გააგრძელე წინა ჩათი` | `01a13101-529c-70a1-8197-5817e6322111` |
| `continue` | `01a12e74-3f68-7e31-900e-dff1459d9742` |

The user reports that Stop is not visible. No supported cross-chat interrupt tool is available; computer use of Codex was denied. The shared app server was not killed. Final checks show no concurrent old Jest/Git command; repeated file hashes remained stable before checkpoint and later writes. This is observed quiescence while approvals are pending, not proof of lifecycle cancellation.

**Owner action:** do not approve the old requests or resume work in those two chats. If their pending approval cards can be opened, reject/cancel those requests. Continue only in this recovery chat; recheck state/hashes before any future write. No additional agent was spawned.

## Fixes and diagnosis

1. `lib/api/rate-limit.ts` created a permanent five-minute interval at import. Removed that background resource; expired fallback buckets are swept at most every five minutes of request/refund activity. Existing limits, Redis behavior and refunds are preserved. The test-only fake-clock import workaround is gone. 28 limiter tests pass, including idle-window behavior and no scheduled housekeeping timer; all 172 API suites / 1,604 tests exit naturally.
2. `uploadBufferAndSign` in the shared Storage adapter left each 90-second race timeout alive after upload success or rejection. Each attempt now clears its timeout in `finally`; existing retry count, deadline and bucket behavior are unchanged. Eight focused tests pass, including stalled upload, rejection and success cleanup. The affected 125-suite library group fell from ~98 seconds to ~8 seconds. A detected native `CustomGC` handle from resvg also appeared in isolation, but that isolated process exited naturally; it was not evidence of a permanent leak.
3. ImageWorkspace now captures and drains its owned preview URL list on cleanup, eliminating the stale-ref cleanup warning. Its seven integration tests pass.
4. Added `scripts/image-studio/live-e2e.mjs` and five offline harness tests. Configuration mode makes zero requests; preflight is GET-only; paid mode requires separate explicit approval, a credit cap and a new persistent report file. Paid mode was not run against a real service.

## Final results

**884 suite files: 13,346 passed, 18 failed, 25 pending/blocked.** Counts replace earlier failed/sandboxed or skipped runs with their final selected results; reruns are not double counted. Every selected final Jest invocation omits `--forceExit` and exits within its process-group deadline.

- 18 final failures exactly match a fresh export of clean baseline `30be5a2d`: same files and test names.
- Previously skipped: all three longform FFmpeg tests and both audio internet tests pass. The audio test downloads the public MDN flower fixture, renders locally, and uses test storage; no paid service is involved.
- Remaining 25: six run-isolation, seven lease-isolation, four outbox and eight ledger tests require local PostgreSQL/PostgREST. Docker, Podman, PostgreSQL server tools, PostgREST and Supabase CLI were unavailable. They are **BLOCKED**, not silently accepted.
- Typecheck passes. Lint passes with existing unrelated warnings; the new test import lint error was corrected and rerun. Local production build passes (~78 seconds), using dummy credentials and a source-equivalent temporary snapshot, with no deployment.
- Five final Chromium scenarios pass (~54 seconds) with PR #58 source present in a disposable snapshot: EN/KA/RU quote→confirm→refresh→cancel, four sequential variants, and mobile Library→preview→owned edit/version comparison with keyboard confirmation. Screenshots were saved; mobile preview was inspected.
- Five additional Node harness safety tests pass offline. Real Phase 6 configuration reports BLOCKED before network access because the isolated credentials/environment are absent.

## FFmpeg classification — Video Core unchanged

| Failures | Verified cause | Classification / follow-up |
|---:|---|---|
| 16, `composition.ffmpeg.test.ts` | Shared `beforeAll` fixture uses `gradients ... speed=0`; bundled FFmpeg 6 rejects it, system FFmpeg 8.1 accepts it | Baseline fixture/binary incompatibility. These assertions never reached composition behavior, so that behavior is not certified by these tests |
| 1, `effects.ffmpeg.test.ts` F10 | `loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000` fails channel-layout negotiation on bundled FFmpeg 6; the same synthetic reproduction succeeds on FFmpeg 8.1 | Existing real runtime defect on this binary, not an Image Studio regression. Video owner must fix/verify its supported binary/filter contract |
| 1, `ffmpegExec.test.ts` playlist guard | Actual rejection is `Format not on whitelist ... Invalid argument`; test expects `Invalid data found` | Baseline diagnostic-text portability issue; tested guard still refuses the playlist |

Permission-limited exploratory runs additionally stalled the native audio fixture's local listener and failed montage encoder detection (`pgrep`). The same montage failure reproduced on clean baseline in the sandbox. With the required permissions, audio passed 14/14 and montage passed 5/5; no source changes were used to hide failures. A combined native run exceeded its 180-second deadline and was safely terminated; final evidence comes from independently bounded suite runs. Logs of all failed attempts remain preserved.

## PR #58 compatibility and PR status

Current inspected PR: https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/pull/58, open, head **`c09dbe48fa743295ecdb6a7b9ceb2e2d95d2e5fc`**, base `30be5a2d`, 179 changed files. The old `ebc3444` source-only check is superseded.

95 non-document source patches applied cleanly only to `/private/tmp/image-studio-pr58-runtime-20261013`; the branch did not receive Video Core patches. Final mocked browser runtime coexistence passes. This excludes PR CI/e2e infrastructure and does **not** prove real shared Google/Storage/Database lifecycle compatibility. Recheck the PR head before future integration.

The separate PR description is prepared in `PR_DRAFT.md`. No remote PR was created and no branch was pushed: the user's conditional requirement for completed safe acceptance is not met while real Phase 6 is blocked. There is no merge/deploy authorization.

## Acceptance and next actions

`FINAL_ACCEPTANCE_MATRIX.md` maps all 15 scenarios to concrete local evidence and missing live gates. `PHASE_6_RUNBOOK.md` provides the runnable isolated preflight and separately gated two-job generation/edit harness.

1. Keep the two old approvals inactive; use this preserved branch exclusively.
2. Supply/provision the isolated PostgreSQL/PostgREST environment and execute the 25 pending tests individually, including ledger before/after states. Do not use production as a substitute.
3. Supply the isolated app/Supabase/Redis environment and two user tokens; run configuration and GET-only preflight. Configure Google credentials on the app server, not in reports.
4. Obtain separate owner approval and budget before the two paid jobs. Inspect actual output visually; record private artifacts, provider-call count, actual costs and ledger/Storage evidence.
5. Complete the additional real failure/refund, worker restart, cancellation, RLS and PR #58 lifecycle experiments in the runbook. These are not replaced by the prepared happy-path harness.
6. Resolve the baseline FFmpeg issues in the owning Video workstream. Once acceptance gates are satisfied, open a separate Image Studio PR from the existing branch; no merge or deploy.

## Evidence and backup

Persistent evidence root:

`/Users/giorgikintsurashvili/.codex/visualizations/2026/10/12/01a131c4-82f0-7be2-b199-280ae93072e5/final-continuation-20261013`

It contains per-stage `.log`, `.result.json` (command, start/end, PID, timeout and exit), Jest JSON, bounded runners, fresh PR metadata/source patch, browser screenshots, native reproduction logs, final aggregate JSON, checkpoint/code commit manifests and final backup/checksum files. Compact evidence is copied into `docs/handoffs/image-studio/evidence/final-continuation-20261013/`. Historical recovery evidence remains in the adjacent `recovery-20261013` directory. Only the local `node_modules` symlink remains outside Git; it is not application source.
