# Image Studio v1.0 — Recovery Handoff Report

Date: 2026-10-13 (Asia/Tbilisi)
Branch: `codex/image-studio-v1`
Unchanged HEAD: `30be5a2d96495f67134cad34796ce724a744bd28`

## Outcome

The saved Phase 4/5 implementation was recovered and verified without rewriting Image Studio application code. All 101 regular files present in the recovery snapshot remain byte-identical, including all existing uncommitted code. The original 88-file backup was independently verified against all 88 SHA-256 hashes. One previously clean legacy UI test was updated to recognize the already-implemented ImageWorkspace gating. No reset, discard, force push, merge, deploy, production migration, or paid provider call was performed. No commit or branch switch was performed.

Local Image Studio verification is complete at the scope described below. **Production readiness is NOT certified.** Existing FFmpeg failures, skipped real-database tests, and live provider/storage/billing evidence remain separate gates.

## Worktree and preservation

Actual worktree: `/Users/giorgikintsurashvili/.codex/worktrees/image-studio-v1/beautiful-moser-50e6af`.

The chat's default cwd is a different, detached checkout at `/Users/giorgikintsurashvili/avatar-g-frontend-v3/.claude/worktrees/beautiful-moser-50e6af`. All branch checks and the test correction targeted the actual Image Studio worktree explicitly. Do not switch the detached checkout onto a branch already checked out elsewhere.

Recovery directory: `/Users/giorgikintsurashvili/.codex/visualizations/2026/10/12/01a131c4-82f0-7be2-b199-280ae93072e5/recovery-20261013`.

- `uncommitted-snapshot.tar.gz` + `manifest.json`: 101 current regular files and the `node_modules` symlink; 8 tracked modifications at entry.
- `original-88-snapshot.tar.gz` + `original-88-manifest.json`: independently verified copy of the original backup, including two old failed-browser artifacts no longer present in the current evidence folder. No source file was missing.
- `unstaged.patch`, `staged.patch`, `git-status.txt`: entry Git state. The index was not changed.
- `snapshot-equivalence.json`: all **3,738** tracked/nonignored regular files matched the tested validation snapshot, including the final wiring correction, before adding these reports.
- `verification-summary.json`: exact stage results, preserved-file drift (empty), unique-suite totals, and the remaining failed test names.

Archives preserve work; they are not instructions to overwrite newer work. To recover an individual file later, first compare its current hash and diff with the archive, then restore only the reviewed file. Never reset or bulk-extract over this dirty worktree.

## Why execution appeared stalled

Two separate causes were established:

1. **Approval-layer waits.** Both older chats still report `waitingOnApproval`. Their last unresolved functions calls requested compatibility-check/evidence commands through `require_escalated`; the continuation's full Jest command was sequenced after that request and had not started. The prior Phase 5 browser run had already passed 5/5. Historical auto-review output explicitly records an account usage-limit review failure, not a user refusal or a finding that the command was unsafe. The same failure occurred once in this recovery, then an official retry succeeded after account usage again reported allowed. Current waiting flags alone do not prove the present reason is still a usage limit.
2. **A real Jest teardown hang.** The API suite passed 1,604 tests in 6.545 seconds, saved results, and remained alive. `--detectOpenHandles` traced four timer handles to `lib/api/rate-limit.ts:62`: a module-level five-minute cleanup interval. Only this recovery-owned Jest process group was stopped with SIGTERM; no source was removed. The successful diagnostic rerun is recorded separately.

Initial inspection found no old Jest/Playwright/Next/TypeScript process to terminate. The final process audit also found **zero remaining test/build processes**. Shared Codex/MCP services were not killed.

Detailed evidence: `SESSION_DIAGNOSIS.md`, `regression-api.log`, `regression-api-handles.log`, `process-audit-final.txt` in the recovery directory.

## Session ownership and outstanding approvals

- `continue`: `01a12e74-3f68-7e31-900e-dff1459d9742`.
- `გააგრძელე წინა ჩათი`: `01a13101-529c-70a1-8197-5817e6322111`.

Both remain active at the approval stage; their cancellation is **not confirmed**. The toolset exposes no dedicated cross-chat interrupt, and the computer-use tool refused Codex UI access. No alternate private API or UI workaround was used. The owner should Stop these old chats before approving or resuming their stale requests.

No concurrent file write was observed: all preserved hashes remained unchanged throughout recovery. The only applied test correction targets a previously clean file absent from both pending write sets, and was guarded by branch/HEAD, clean-file status and SHA-256 checks. New reports have unique filenames. This bounded work does not imply the older sessions were cancelled.

## Recovery change

`components/studio/create/omniWiring.test.ts`: five assertions in three existing tests now include `imageWorkspace` in the legacy panel, desktop result, feed and jump-button exclusion conditions. The implementation already uses these conditions. This preserves the old tests' intent: do not render the legacy panel/feed alongside the new workspace. No assertion was deleted or skipped. The suite passes **18/18**, both in the validation snapshot and on the actual branch. `omni-wiring-recovery.patch` and `proposed-change.json` retain the exact patch and before/after hashes.

## Verification

| Check | Result | Scope / evidence |
|---|---|---|
| Focused Image Studio, Agent G, ownership, Library and recovery | **217 passed / 23 suites** | `focused.json`; exited naturally, no force-exit |
| Full TypeScript | **PASS**, 17.251 s | `typecheck.log`; `--noEmit --incremental false` |
| Full lint | **PASS**, warnings retained | `lint-snapshot.log`; includes the existing ImageWorkspace preview-ref cleanup warning |
| Legacy wiring correction | **18/18 PASS** | `wiring-fixed-branch.json` |
| Full regression, bounded groups | **13,336 passed; 18 failed; 30 skipped; 884 suites** | Combined unique-suite results; the changed suite was replaced by its final branch rerun, not double-counted |
| Native baseline comparison | **No new failures** | All 18 failed names exactly match the saved baseline in composition/effects/ffmpegExec; `native-baseline-comparison.json` |
| Browser | **5/5 PASS**, 52.7 s | `browser-snapshot/`; EN desktop, KA/RU mobile, quote/confirm/reload/cancel, four sequential variants, Library→owned edit, keyboard and reference preservation |
| Production build, local snapshot | **PASS**, 63.851 s | `build-snapshot.log`; dummy local DB values, no deployment |
| Video Core PR #58 source compatibility | **Dry-run PASS** | Head `ebc3444055cb01cd336764f3947f28d0a3c49c06`, base `30be5a2d...`; only Image overlap is `components/studio/OmniStudio.tsx` |

Browser APIs are intercepted and external browser requests blocked. This proves local UI behavior, not real Google, Supabase, RLS or ledger behavior. Build/browser ran in `/private/tmp/image-studio-recovery-r13oml2u`, a full source snapshot with no Git metadata or environment secrets. Its source equivalence is verified separately. The PR check was `git apply --check` only; no Video code was applied or merged. Documentation/binary PR evidence was excluded. Combined Image+Video runtime E2E remains unverified.

## Finite execution policy

`run_bounded.py` in the recovery directory starts a dedicated process group, writes unique text logs and JSON result metadata, applies a wall-clock deadline, and terminates only its own process group on expiry. Existing log names cannot be reused accidentally. Commands carry an environment allowlist, Node 24.19.0, local dummy DB keys, and no inherited provider credentials.

- Focused Jest / TypeScript / lint: 120 seconds each.
- Broad Jest: separate API, Agent, UI, five library batches, native group; 180 seconds per group. Broad groups use `--forceExit` due the diagnosed shared timer; this is not a claim that cleanup is fixed.
- Wiring regression: 60 seconds.
- Playwright: 60 seconds/test, 180-second global limit, 210-second process deadline.
- Build: 240 seconds.
- Compatibility dry-run: 30 seconds.

All final stages completed within their limits. The initial API run was deliberately terminated after successful assertions because it leaked a timer. A library run initially hit sandbox `EPERM` on a localhost socket; its official escalated rerun passed. These initial failures remain in the logs and are not hidden.

## Remaining work

1. Stop/clear both old approval-waiting chats; do not approve their stale commands in parallel with future work. Continue only on the existing `codex/image-studio-v1` worktree.
2. Separate shared-runtime fix for the rate-limiter cleanup timer (for example a Node-compatible unref/disposal lifecycle). Verify rate-limiting behavior; do not disable it to make Jest exit.
3. Resolve or accept the **18 baseline FFmpeg failures** with the media owner. Composition uses an unsupported `gradients ... speed=0` fixture; the other failures include loudness delivery and an FFmpeg stderr expectation. No Video/FFmpeg implementation or tests were weakened here.
4. Run the **30 skipped tests** with their required isolated database/integration setup. Their skipped status is retained, not counted as passing.
5. Phase 6 real evidence: separately authorized Google generation/edit/reference/resolution quality; isolated storage, auth/RLS, private signed URLs, ledger deltas, concurrent starts/cancel/refund and lost-worker recovery. Paid calls need an explicit budget; no production migration is implied.
6. Run combined Image+Video runtime checks once integration is explicitly authorized. The current source dry-run alone does not certify runtime compatibility.
7. Review the existing uncommitted implementation, test correction and reports before committing or creating a PR. Merge and deployment remain prohibited by this recovery request.

Local Phase 4/5 behavior is verified. The live acceptance gates in `docs/image-studio/IMPLEMENTATION_PLAN.md` remain explicitly unverified; do not label Image Studio production-ready based only on these local results.
