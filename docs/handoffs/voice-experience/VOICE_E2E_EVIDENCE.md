# Voice acceptance / evidence ledger
Code checkpoints: 01457c3c (microphone/TTS), 141c6108 (preferences/native guard), 54f570b21f687e156e092f993c7c646588ba4284 (acceptance/proposal).
Draft PR: https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/pull/68
Environment: macOS, Node 24, existing installed dependencies; Chromium with synthetic mic and mocked Google WebSocket/API; dummy Supabase fixture account. NOT real hardware, Google, Production DB or Storage.
| Scenario | Expected | Actual | Status | Evidence |
|---|---|---|---|---|
| Baseline voice regression | Existing behavior green | 39 suites / 895 tests | PASS baseline | evidence/voice-jest.log |
| Reproduce two races | Tests fail on previous implementation | 3 failures / 11 passes | REPRODUCED | evidence/defects-before.log |
| Mic/TTS fixes | No duplicate acquire or stale playback | 14/14 pass | PASS | evidence/defects-after.log |
| Expanded Voice regression | All relevant suites green | 49 suites / 1,029 pass, 0 skip | PASS | evidence/voice-final-jest.log |
| Mid-call style / voice boundary | No context reset or mid-speech update | 58/58 hook suite incl. added regression | PASS | evidence/style-session-after.log |
| Initial browser run | Ten scenarios | 7 pass, 3 locale selector failures | FAIL superseded for 3 locales | evidence/browser.log |
| Locale rerun | KA/EN/RU persist and fit mobile | 3/3 pass with accessible-role selectors | PASS | evidence/browser-locales.log |
| TypeScript | No errors | exit 0 | PASS | evidence/execution.json |
| ESLint | No errors | exit 0, repository warnings remain | PASS with warnings | evidence/lint.log |
| Build | Compile and collect routes | exit 0 after transient font retries | PASS | evidence/build.log |
| Reader full/selection/stop/pause/speed | Faithful ordered control | 9 reader tests pass | PASS unit | evidence/stage-c.log |
| Real microphone / Safari / Bluetooth | Audible stable conversation | Not run | BLOCKED | Requires device session |
| Real Georgian expression/humor | Native listener accepts delivery | Not run | BLOCKED | CONVERSATION_QUALITY_REPORT.md |
| Real Google Live/TTS | Model accepts setup; audible answer | Not run | BLOCKED | Approval + isolated credentials |
| Shared Studio runtime | Reader + all Studios combined | Patch only, not applied | BLOCKED | patches/README.md |
Raw logs retain intermediate failures. The early 149-test run had five missing jest-dom matcher failures; imports fixed and targeted suite passed. The initial style test expected the preset ID in a prompt that correctly contained its directive; corrected to assert the directive, then 58/58 passed. No assertions were removed to hide a product defect.
CI results are recorded separately in evidence/ci-status.json once retrieved. Local pass is not a claim of CI success.

## Expanded validation
- Six KA/EN/RU desktop/mobile viewport and persistence cases pass (browser-layout.log). Viewport bounds are now asserted after the slide animation settles; early screenshots were mid-animation.
- Initial GitHub Voice job: 1,030 unit tests pass, browser 9 pass / 1 cold-start timeout. Downloaded trace shows the first lazy voice JS request took 15,929 ms, while the failure snapshot already shows listening. Bounded setup allowance increased from 20 to 45 seconds; all functional assertions retained. This is dev bootstrap, not an audio-latency waiver. Targeted local rerun 1/1 pass.
- Disposable combined-tree TypeScript 0 and 1,135 Jest tests pass; 9 DB tests skipped. Adapter proposal typechecks in that temporary tree, not in a merged/deployed product.

| Additional acceptance | Current status | Unblock |
|---|---|---|
| Real permission prompt, first syllable, Bluetooth and iOS AudioContext | BLOCKED hardware | Authorized device test session |
| Fine-grained REQUESTING_PERMISSION versus CONNECTING UI | PARTIAL | Existing connecting state retained; protected host needs distinct indicator integration |
| Same facts across eight personalities | BLOCKED live semantic QA | Approved provider evaluation with paired prompts |
| No inappropriate humor or audible tags | BLOCKED listening | Serious-context corpus and native listeners |
| Follow-up/correction/language switching with real model | BLOCKED live | Isolated Google session |
| Real Auth/RLS/Storage/credits across combined Studios | BLOCKED isolated integration | Combined environment and test accounts |
| Unsupported tool / spoken financial authority | PASS simulated | Preserve server checks; live acceptance still required |

## Final local browser acceptance
Checkpoint 044dca4ec4581c89730d7e72dec72606c099c551: **13 passed / 0 failed / 0 skipped**, 1.7 minutes, after the fixture change. Includes six existing Studio interaction cases, six KA/EN/RU mobile/desktop preference cases and one explicit spoken-spending denial case. Evidence: browser-final.log, browser-final-results.json and settings-*-mobile/desktop.png. These all use synthetic audio and mocked providers.
Final CI is authoritative at [PR #68 checks](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/pull/68/checks); initial failure and corrected cold-start diagnosis are retained in this ledger. Documentation commits do not change runtime code.
