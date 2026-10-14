# 14 — Continuation

## Next exact actions

1. Watch CI on this branch's head and on #65 9d25c7a4 (`gh pr checks 65`; the Draft PR of this branch). If a Linux ffmpeg job fails on the
   limiter test, look at `lib/music/studio/audio.ffmpeg.test.ts` "stacked +12 dB boosts never clip" first.
2. Confirm the a31b7205 Preview build log shows no `[media-check]` line (`vercel inspect <url> --logs | grep media-check` → nothing).
3. Owner: GCP billing check for 2026-10-14 vs 09; decide 10 (isolation), 08 S2 (pricing), 01 §B (copy), provider boundary.
4. After isolation exists: run the deployed E2E per studio (video director, image job, music job with the real Lyria worker), admin-only.
5. Hand the uid-race proposal to the shared-chat owner; Astra to push their branch.

## Rules carried forward

- No paid call without a new approval. Any paid build step must carry `notAfter` and be unhooked in the next commit.
- Do not merge to main / deploy Production under GG-20261014-GLOBAL-E2E-EXTRA-USD5 (expired with this task).
- Re-running the real-Veo montage replay needs the clips: download from the 95432a2b Preview `/preview-checks/global/` (while that
  deployment exists) and run `VEO_REPLAY_DIR=<dir> npx jest lib/agent/media/montageVeoReplay.ffmpeg.test.ts`; verify against `evidence/SHA256SUMS.txt`.
- Local worktrees: `/tmp/global-int` = throwaway integration candidate (31206e48, never pushed); safe to delete.
