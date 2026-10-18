# Image Studio — Phase 4 handoff
Date: 2026-10-13 (Asia/Tbilisi)
Branch: codex/image-studio-v1
Base HEAD: 30be5a2d96495f67134cad34796ce724a744bd28

## Scope and status
Local Phase 4 integration checks PASS. No live provider or database claim.
The existing One Window shell mounts the image-owned workspace; legacy image tools remain selectable.
KA/EN/RU quote/confirm, real-status cards, cancellation, refresh recovery and four sequential variations are implemented.
Agent G uses the registered quote_image tool through /api/image/commands, with the trusted draft and explicit human confirmation. This proves the workspace command lane; free-form general-chat LLM routing is not claimed.

## Preservation and session safety
All 88 original regular files (8 tracked modifications and 80 untracked files) were present on resume. The dependency symlink was preserved.
Verified backup: /Users/giorgikintsurashvili/.codex/visualizations/2026/10/12/01a13101-529c-70a1-8197-5817e6322111/image-studio-backup/
Hashes are in evidence/continuation-20261012/preserved-manifest.json.
The old chat 01a12e74-3f68-7e31-900e-dff1459d9742 remains waitingOnApproval, not executing its pending command. It was sent a superseding instruction not to resume writes. No official cancellation confirmation is available; do not approve its pending request while this continuation owns the worktree.
File timestamps and hashes were unchanged across the takeover checks, except for the two explicitly saved Phase 4 fixes.

## Review failure, not user refusal
The rejected command was Node 24 running Jest --runInBand for components/studio/image, lib/image/studio, lib/agent/tools, bindLiveAgent, capabilities, api-lockdown and media/sweep, with JSON/text output under evidence/continuation-20261012/phase4-focused.
Automatic approval review could not finish because account usage was exhausted. Its response explicitly said this was not a determination that the action was unsafe. The command was NOT executed then.
On 2026-10-13 get_usage_limits reported ordinaryUsageAllowed=true. The same command was resubmitted through require_escalated and ran successfully. No permission or sandbox workaround was used.
The Shared Interface Proposal remains approved. No new merge, deploy, migration or paid-call permission was requested or used.

## Fixes and evidence
- Wait for the asynchronous rendered job status in the UI test.
- Give select controls and zoom stable localized accessible names.
- Focused Jest: 20 suites, 179 tests passed (Node 24).
- Browser: 4/4 passed: EN desktop; KA/RU 390×844; quote before confirm; no replay on refresh; cancellation; four distinct sequential jobs.
- Evidence: evidence/continuation-20261012/phase4-focused.{json,txt}, phase4-browser.txt; original browser-results.json and locale screenshots were refreshed and their previous contents remain in the verified backup.
Browser API responses were intercepted. These are local/mock integration checks, not real Google/Storage/Database E2E.

## Next
Phase 5: Library/edit/reference integration, recovery hardening, complete regression and latest Video Core compatibility checks.
Real Google, Storage, Database, RLS and ledger concurrency remain UNVERIFIED. Production readiness remains NO.
