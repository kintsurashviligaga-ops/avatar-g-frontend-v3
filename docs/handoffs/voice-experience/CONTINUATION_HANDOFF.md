# Voice v2 continuation checkpoint
Independent branch astra/agent-g-voice-experience-v2-20261014; Draft PR #68. Preserve this worktree. node_modules is a local untracked symlink: never commit it.
A audit: complete. B mic/TTS: reproduced 3 regressions, fixed and committed 01457c3c. C/D preferences and model-safe expression: 141c6108, tested contracts; audible quality blocked. E native session integration: mid-call style test, existing barge/resumption reused. F shared-host integration: reviewable patch only, blocked by explicit Music65 file ownership. G local automation complete, real hardware/provider pending. H Draft PR created, evidence/docs checkpointed; see CI status evidence.
## Previous interruption
The auto-review service did not execute the bounded TypeScript command because the account usage limit prevented approval review. It was not a policy judgment that typechecking was unsafe. After the user resumed, the same authorized command completed, exit 0. No security restriction was bypassed.
## Reproduction commands
- node node_modules/typescript/bin/tsc --noEmit
- node node_modules/next/dist/bin/next lint
- node node_modules/jest/bin/jest.js --runInBand --testPathPatterns='lib/voice|lib/audio/premium-tts|components/voice|app/api/voice|components/chat/composer/useDictation'
- PLAYWRIGHT_SUPABASE_URL=https://example.supabase.co node node_modules/@playwright/test/cli.js test --config=playwright.voice-experience.config.ts
Use existing dummy Supabase settings for local build; never copy Production credentials to a test. Apply timeouts described in VOICE_PERFORMANCE_REPORT.md.
## Precise remaining actions
1. Shared-file owner reviews patches/music-65-voice-adapter.patch against pinned Music SHA; authorize its application in an integration branch. Add selection extraction scoped to the message and update legacy spoken-approval instructions. Run shared tests there.
2. Provide an isolated non-Production environment and explicit Google Live/TTS budget approval; keep media-generation spending disabled. Approve each provider scenario and record actual cost separately.
3. On actual devices: allow microphone only for the isolated HTTPS origin; test first tap, denied/revoked permission, Bluetooth switch, background/foreground, interruption, network loss, resume, reader Stop and pause. Record browser/device/build/model and redacted evidence.
4. Two Georgian listeners execute CONVERSATION_QUALITY_REPORT.md corpus. No real audio or latency certification exists yet.
5. Review current GitHub Actions on the latest code SHA and follow the release checklist. Do not merge/deploy automatically.

Final local acceptance at 044dca4e: 13/13 browser scenarios PASS. CI initially proved 1,030/1,030 Voice Jest; its one cold-dev startup failure is diagnosed in the ledger and fixed with bounded 45s startup allowance. Protected integration proposal typechecks in a disposable combined tree. The only untracked runtime item is the existing node_modules symlink.

## Resumed verification — 2026-10-15
CI on e6dfab9d is fully green: verify (900 suites / 13,888 tests PASS, 7 suites / 67 tests SKIP, build PASS); Voice acceptance (49 suites / 1,030 tests PASS and 13/13 browser PASS); isolated Video browser 35/35 PASS; preview contract 5/5 PASS; real-Postgres billing job PASS (individual counts retained in evidence/ci-e6dfab9d-green.json). Skipped cases are not certified by that run. This is a baseline before the following final correction.
Final storage-denial correction: same-account settings now send validated in-memory updates to the active call even when localStorage writes fail; other accounts do not receive them. Reset also propagates. Empty events are ignored. Two affected suites: **64/64 PASS**, TypeScript 0, scoped ESLint 0. The earlier 1,030-test CI result predates this one added regression; consult final PR checks for the new total. Evidence: storage-sync-*.log.
The prior checkpoint command was not executed when automatic approval review hit its usage limit. It was retried through the same approval mechanism after the user's continuation; no bypass was used.
