# Music Studio v1 — Phase 2 · Continuation (read this first)

## Where things are
- Branch `claude/music-studio-v1-20261014`, PR #65 **Draft** (never merge / force / deploy from an agent).
- Worktree `/Users/giorgikintsurashvili/music-studio-wt` (has `node_modules`; `.env.local` not needed for unit tests).
- Final SHA, CI run ids and the E2E counts: bottom of PHASE2_E2E_MATRIX.md.
- Disposable integration tree `/private/tmp/ms-integration` (detached; `node_modules` is a symlink into the worktree — remove the
  symlink before any checkout there).

## How to re-verify
1. `npx tsc --noEmit -p tsconfig.json` · `npx eslint components/studio/music lib/music tests/music-studio-live` ·
   `npx jest components/studio/music lib/music`.
2. Music E2E only runs in CI (needs the local Supabase stack; no Docker on this Mac):
   `gh workflow run music-studio-e2e-local.yml --ref claude/music-studio-v1-20261014` or push to the PR.
   Read results: `gh run view <id> --log | grep -E "✘|passed|failed|\[evidence\]"`; artifacts: `gh run download <id> -n music-studio-live-e2e`.
3. Real-ffmpeg Jest suites fail on this Mac on clean main too (5 suites / 20 tests) — compare with `origin/main` before calling anything a regression.

## Remaining work (engineering)
- Shared-chat History uid race (PHASE2_STATE.md → OPEN DEFECT): hand the proposed patch to the chat / OmniStudio owner; do not apply it
  over Astra's work. After it lands, the `data-uid` wait in `tests/music-studio-live/_music.ts studioReady` can stay (harmless).

## Remaining work (owner)
- Paid Lyria provider run: DONE 2026-10-14 (3 calls, FINAL_REAL_LYRIA_E2E.md). Record the actual billed amount from Cloud Billing in
  FINAL_SPEND_REPORT.md. Listen to `evidence/lyria-live/B-vocal-en.mp3` and `C-vocal-ka-experimental.mp3` (singing? lyrics? Georgian
  pronunciation?) before any vocal decision.
- To run another live call: commit `scripts/music-studio/lyria-check.request.json` (approval, `capUsd`, `spentBeforeUsd` = spent so far),
  push, read `/preview-checks/lyria/result.json` on that Preview, then delete the file in the next commit. Never leave it committed.
- Isolated Preview Supabase project (or written approval to use Production data) for Preview Library/credit tests.
- Sign-off: provider boundary on merge; per-user rate limits; vocals stay off until a heard vocal.

## Rules that bit before
- Never `git stash` bare (shared stack). Never edit `lib/voice/liveTools.ts`, `components/voice/live/liveActions.ts`,
  `components/voice/GeminiLiveConversation.tsx`, `components/studio/OmniStudio.tsx` without Astra coordination.
- A spec dispatching voice calls must wait for `studioReady()` (listener + uid), or calls are silently not taken.
