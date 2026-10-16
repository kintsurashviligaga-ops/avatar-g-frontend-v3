# 02 — Cross-studio integration (2026-10-14)

Throwaway worktree `/tmp/global-int` (detached, never pushed). Base `origin/main` **fef867a6**. All PR branches already contain
main (0 commits behind).

| Step | Head | Result |
|---|---|---|
| + Video Core #64 `claude/video-core-final-20261013-234606` | bcb724a1 | clean merge |
| + Image Studio #60 `codex/image-studio-v1` | be9edee3 | clean merge |
| + Music Studio #65 `claude/music-studio-v1-20261014` | 54532ff8 | clean merge → candidate **a7f470d7** (289 files, +23 961 / −1 119) |
| + uid-race proposal `claude/shared-chat-uid-race-proposal-20261014` | 7fe06fb5 | clean merge (OmniStudio auto-merged) |
| + Astra `astra/agent-g-voice-experience-v2-20261014` (local only, not pushed by Astra) | 01457c3c | clean merge → **31206e48** |

## Files touched by more than one PR (semantic check)

| File | PRs | Finding |
|---|---|---|
| `lib/api/rate-limit.ts` | #60 (lazy cleanup, no `setInterval`) + #65 (`MUSIC_EDIT` bucket `rl:mus-ed`) | independent hunks; new prefix does not collide with any existing `keyPrefix` |
| `components/studio/OmniStudio.tsx` | #60 + #65 (+ uid-race) | auto-merged; tsc clean; chat / music / image suites green |
| `scripts/lease-isolation/run.sh` | #64 (film-waiver before/after, runIsolation moved last) + #65 (musicIsolation) | order is consistent: music test runs on the migrated ledger before the waiver proposal is applied; runIsolation last |
| `vercel.json` | #65 only (Lyria hook) | hook removed on #65 in 97f64337 (see 09) |

Astra's 12 files (`lib/voice/experience/*`, `lib/audio/premium-tts.ts`, `lib/voice/livePrime.ts`, `ReadAloudControls.tsx`,
handoff docs) do **not** overlap OmniStudio / ChatChrome / historyKeys / any studio file → no contested file today; nothing of
Astra's was edited.

## Shared concerns

| Concern | Status | Evidence |
|---|---|---|
| Credit ledger | each studio uses its own idempotent ref (`image:` / `music-studio:` / `${tokenId}:charge`), refunds `${ref}:refund` | per-PR isolated pg suites (CI); not re-run here (no Docker locally) |
| Quote / Confirm | Image + Music: signed quote + `confirmed:true`; film: storyboard approval | unit suites green on candidate |
| Storage | private `renders` bucket, per-studio prefixes `image-studio/`, `music-studio/<uid>/` | unit suites; no prefix overlap |
| Library | all via `generation_jobs.service_type` | `/api/studio/library` |
| Feature flags | Image `AGENT_G_MEDIA_EXEC`, Music `MUSIC_STUDIO_ENABLED`, Video `VIDEO_GOOGLE_ONLY` — independent | 01 |
| KA/EN/RU | each studio ships ka/en/ru strings | unit suites |

## Regression on the candidate (local macOS, Node 24)

| Check | a7f470d7 (3 PRs) | 31206e48 (+uid-race +Astra) |
|---|---|---|
| `tsc --noEmit` | exit 0 | exit 0 |
| `npm run lint` | exit 0 (warnings only) | — |
| Jest full | 914 passed / **5 failed** / 10 skipped suites; 14 012 / 20 failed tests | voice/audio/agent/ai/components subset: 274 passed / 4 failed (same ffmpeg suites) |
| Jest `lib/chat` (uid-race) | — | 77 passed, 1 skipped; 1 494 tests |

The 5 failing suites (`lib/agent/media/{composition,effects,montageExec,videoCoreAc06}.ffmpeg.test.ts`, `lib/video/ffmpegExec.test.ts`)
fail **identically on clean main fef867a6** (5/5 suites, 20/48 tests) → macOS FFmpeg baseline, not a regression. They pass in
Linux CI per the PR runs.

**Verdict:** no merge or semantic conflict between #64, #60, #65, the uid-race proposal and Astra's current voice branch.
Recommended merge order in 12.
