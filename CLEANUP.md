# Open PR clean-up list (for GG's review)

**Prepared:** 2026-11-19
**Status:** a proposal only. No PR has been closed, and none will be until GG approves.

This file covers the 24 open PRs that sit outside every current plan: they are not in `LAUNCH_COMMANDS.md`, not in Phases 8.2 to 8.9, and not in the pricing checklist. The data comes from `gh api` on 2026-11-19 (mergeable state, check runs, changed files).

Two PRs GG mentioned are **not** on this list, because they belong to a plan:

- **#274** (read-aloud server speed) is runbook step 9. It now has main merged in, its conflict is fixed, and it is waiting for CI.
- **#103** is on this list, as GG wrote.

## What the columns mean

- **State.** GitHub's mergeable state:
  - `dirty` means a merge conflict with its base.
  - `blocked` means no conflict and green CI; it is a draft that only lacks a review.
  - `clean` means the PR is stacked on an old branch that has no conflict.
- **Why it is here.** A failing check, a conflict, an old agent's work, or work that was superseded.
- **Proposal.**
  - **Close** means the work is superseded or abandoned. The branch stays on GitHub, so nothing is lost.
  - **Rebase & Fix** means the change is still wanted. Bring it up to date with main, rerun CI, then put it in front of GG for a merge decision.
  - **Hold** means keep it open, untouched, until an outside event happens.

All 24 are authored by GG's GitHub account. "Other agent" means the branch was made by a different agent (`codex/*`, `feat/*`, `fix/*`, `feature/*`) and not by a thread in this project.

## Proposed: Close (16)

| PR | Opened | State / CI | What it is | Why close |
|---|---|---|---|---|
| #43 | 10-08 | dirty, stacked on `claude/launch-certification-wmvitt` | GCP Part 0: Vercel OIDC → WIF setup + report | WIF has been live in production since Phase 1 (every Vertex call uses it). The report is history. |
| #44 | 10-08 | clean, stacked on `codex/vertex-ai-migration` (other agent) | Vertex migration WIP | Superseded by the Phase 1 Vertex-only merges (#115 to #149). Its base branch was never merged. |
| #51 | 10-09 | clean, stacked on `claude/launch-certification-wmvitt` | Supabase auth: getUser() guard; log-in no longer creates accounts | Main already creates accounts only on register (`AuthModal.tsx`: `shouldCreateUser: kind === 'register'`). The auth-timeout guard shipped in #294. **Please confirm**: the email-OTP route change in this PR was not separately checked against main. |
| #64 | 10-13 | dirty | Video Core v1.0 final engineering | Superseded by the Veo/Omni video rework (#209, #221, #223, #258, #295). |
| #66 | 10-14 | dirty, **not a draft**, **Vercel status failing** (other agent) | Phone Agent G connection onboarding (SIP bridge) | No plan includes phone/SIP, and it conflicts in 23 files. **Product decision for GG**: if phone is wanted, it needs a new plan, not this branch. |
| #79 | 10-16 | blocked, green | Docs: release record for #74 | A stale release note from October. |
| #103 | 10-18 | dirty, **CI failing** (Music Studio live E2E), 101 files | Studio PRD part 2 | Superseded: retired tools are out (#296, #305), and the composer, loading card and Live logo were all reworked later. A 101-file rebase would redo work that has already shipped. |
| #105 | 10-19 | dirty (other agent) | Unsafe video edit commands; assembly media validation | Its files are all in #109, which bundles #105 to #107. Decide once, on #109. |
| #106 | 10-19 | dirty (other agent) | Provider diagnostics read-only | Also in #109. |
| #107 | 10-19 | dirty (other agent) | Refuse Live tokens without the setup lock | Also in #109. |
| #108 | 10-19 | clean, stacked on #105's branch (other agent) | Keep exact film contracts when scenes are missing | It depends on #105, and #109 carries the same assembly files. |
| #114 | 10-22 | dirty | docs: Master v3.1 Phase 0 audit | History. The copies in `/mnt/project-files/master-v3.1/` stay. MASTER_PROJECT_SUMMARY.md replaces it as the current record. |
| #116 | 10-22 | dirty (other agent) | Read-aloud word boundaries, stop incomplete playback | Read-aloud chunking and playback were reworked in #270 and #271, and next in #274/#322. **Please confirm** no case from its test (`chat-read-aloud-failure.spec.ts`) is lost. |
| #234 | 10-30 | blocked, green | docs: engineering registry | Replaced by MASTER_PROJECT_SUMMARY.md (#373). |
| #237 | 10-30 | blocked, green | docs: Agent G Phase 0 truth matrix | History. The Phase 1 to 3 reports in `/mnt/project-files/agent-g-superapp/` are the current record. |
| #257 | 11-02 | dirty, 85 files (other agent) | Gemini MCP prototype with gated delegated access | A prototype outside every plan. It conflicts, and Agent G connectors went the Drive `drive.file` route instead. |

## Proposed: Rebase & Fix (7)

| PR | Opened | State / CI | What it is | Why keep | Work needed |
|---|---|---|---|---|---|
| #109 | 10-19 | dirty (other agent) | Safe media contracts and Google provider boundaries (bundles #105 to #107) | Its changes guard money and safety: edit commands, assembly inputs, read-only provider probe, the Live token lock | Review each fix against main first. Keep only what main still lacks, merge main in, rerun CI. It may shrink to a few files or to nothing. |
| #110 | 10-20 | blocked, green (other agent) | Bind Agent G replays to approval; fence step quoting | A small money-safety fix in `runExec` | Check it against the engine stack (#308 → #311 adds quote-bound approvals). If the engine already covers it, move this PR to Close. Otherwise merge it before #309. |
| #112 | 10-20 | blocked, green (other agent) | Keep accepted Veo operations when the Director refuses their contract | It protects already-paid Veo work on the older film path, which still serves users | No conflict, green. Needs only GG's review. |
| #216 | 10-26 | blocked, green (other agent) | Bind spoken "yes" consent to the prepared quote | A Live voice money-safety fix (2 files) | Check it overlaps #218 (in production), then review. No conflict. |
| #256 | 11-01 | blocked, green (other agent) | Fix Google Drive file selection on mobile | Drive is live for admins, and the iPhone picker issue is known | Review the OAuth changes carefully, since it touches the callback and connect routes. No conflict. |
| #264 | 11-05 | dirty, **not a draft**, CI green | Drive questions in the chat and the Live call go to Agent G | Connectors work GG approved | Merge main in (conflicts in `OmniStudio.tsx` and `liveActions.ts`), rerun CI. |
| #273 | 11-06 | dirty | Composer: Gemini's one-row prompt bar | GG asked for this design on 2026-11-06 and said „კი გააგრძელე“ | Merge main in (OmniStudio, ToolSheet, rollback-table row), rerun CI and the Playwright landing tests. |

## Proposed: Hold (1)

| PR | Opened | State | What it is | Hold until |
|---|---|---|---|---|
| #190 | 10-24 | dirty | Live Avatar: private own photo with a stable id | Google allowlists MyAvatar for custom avatars (request sent 2026-10-27). Then rebase. Until then the app can't use it. |

**Totals:** 16 Close + 7 Rebase & Fix + 1 Hold = 24.

## How closing will work, once GG approves

- One list from GG ("close these numbers") covers the batch. Each PR gets a short comment naming this file, then it is closed with `state=closed`.
- No branch is deleted, so any PR can be reopened.
- Rebase & Fix PRs go into the launch queue only after their CI is green on current main, with one decision card each.
