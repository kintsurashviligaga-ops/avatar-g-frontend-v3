# Music Studio v1 — handoff index

Run: 2026-10-14 (Claude Opus 5.5) · Branch `claude/music-studio-v1-20261014` · Base `origin/main` fef867a
Draft PR: PR_URL_PLACEHOLDER

| # | Deliverable | File |
|---|---|---|
| 1 | Existing architecture audit | [01_ARCHITECTURE_AUDIT.md](01_ARCHITECTURE_AUDIT.md) |
| 2–4 | Implemented capabilities · remaining gaps · changelog | [02_IMPLEMENTATION_AND_CHANGELOG.md](02_IMPLEMENTATION_AND_CHANGELOG.md) |
| 5, 11 | Provider/model verification · Phase 8 plan · actual spend ($0.00) | [03_PROVIDER_VERIFICATION_AND_SPEND.md](03_PROVIDER_VERIFICATION_AND_SPEND.md) |
| 6–10 | CI/E2E · audio QC · security/RLS · credit/refund integrity · One Window acceptance | [04_TEST_EVIDENCE.md](04_TEST_EVIDENCE.md) |
| 12–14 | Branch/commits/PR · release & rollback · owner approvals | [05_RELEASE_ROLLBACK_APPROVALS.md](05_RELEASE_ROLLBACK_APPROVALS.md) |
| 15 | Georgian GO/NO-GO | [GO_NO_GO_KA.md](GO_NO_GO_KA.md) |

## Continuation instructions (next agent)
1. `git fetch && git worktree add ../music-studio-wt claude/music-studio-v1-20261014` (do not reuse the main checkout, which belongs to Video Core).
2. Code: `lib/music/studio/*`, `app/api/music/studio/*`, `components/studio/music/*`. Tests: `npx jest lib/music components/studio/music app/api/ai/music`.
3. Isolated DB suite: `PG_BIN=/opt/homebrew/bin POSTGREST_BIN=/opt/homebrew/bin/postgrest scripts/lease-isolation/run.sh` (the Music suite is `lib/music/studio/musicIsolation.pg.test.ts`). Locally on macOS the Video Core ffmpeg suites fail identically on main; Linux CI is the reference.
4. Open work, in order: Phase 8 after owner approval (`scripts/music-studio/paid-e2e.ts`) → Preview Library/ledger reconciliation → Playwright desktop/mobile spec for `MusicStudioCard` → Live Voice tool (`lib/agent/react/bindLiveAgent.ts`, coordinate with PR #60's registry edits) → vocals switch.
5. Never: merge, deploy, change Production env, run a paid call, or apply a Production migration without the owner's explicit approval.
