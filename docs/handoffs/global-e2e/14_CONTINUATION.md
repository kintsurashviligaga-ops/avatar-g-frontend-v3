# 14 — Continuation

## Second run (2026-10-14) — see 15 and 16

Code fixes pushed (e8c7cbe1, 025e65ce): provider boundary fail-closed, dubbing/deck credits, Preview debit guard,
truthful catalogue. Next: owner approves prices + boundary + Preview DB; then merge order in 12. Throwaway integration
worktree `/tmp/global-int2` (never pushed) is safe to delete; `/tmp/global-int` holds the node_modules this worktree links to.

## Next exact actions (first run)

1. DONE: CI green on #67 95c3ee7a and #65 9d25c7a4 (11); 95c3ee7a Preview build log shows only `[gcp-auth-check]` (no paid step).
2. Rebase nothing: #67 is docs + an unhooked script + a skipped-by-default test.
3. Owner: GCP billing check for 2026-10-14 vs 09; decide 10 (isolation), 08 S2 (pricing), 01 §B (copy), provider boundary.
4. After isolation exists: run the deployed E2E per studio (video director, image job, music job with the real Lyria worker), admin-only.
5. Hand the uid-race proposal to the shared-chat owner; Astra to push their branch.

## Rules carried forward

- No paid call without a new approval. Any paid build step must carry `notAfter` and be unhooked in the next commit.
- Do not merge to main / deploy Production under GG-20261014-GLOBAL-E2E-EXTRA-USD5 (expired with this task).
- Re-running the real-Veo montage replay needs the clips: download from the 95432a2b Preview `/preview-checks/global/` (while that
  deployment exists) and run `VEO_REPLAY_DIR=<dir> npx jest lib/agent/media/montageVeoReplay.ffmpeg.test.ts`; verify against `evidence/SHA256SUMS.txt`.
- Local worktrees: `/tmp/global-int` = throwaway integration candidate (31206e48, never pushed); safe to delete.
