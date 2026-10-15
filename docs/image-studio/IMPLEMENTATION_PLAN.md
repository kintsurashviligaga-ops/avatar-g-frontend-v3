# Image Studio implementation plan

Approved integration: SHARED_INTERFACE_PROPOSAL.md; owner explicitly approved Phase 1 and Phase 2 implementation on 2026-10-12. No deployment, merge, pricing change, production DB write or paid verification is included.

## Phase gates and work packages

| Phase | Files / contract | Meaningful verification | Acceptance |
|---|---|---|---|
| 0 audit | IMAGE_STUDIO_AUDIT.md; phase-0 handoff; baseline evidence | Real repository and remote PR inspection, tsc/Jest/lint/build; classify pre-existing failures | Safe isolated checkout; known capability truth |
| 1 request/capabilities | lib/image/studio/contracts.ts, capabilities.ts, prompt.ts | Strict unknown-key rejection; unchanged Unicode/whitespace; model disabled/unverified/unsupported; all ten roles preserve order; no hidden defaults/fallback | AC-02–05, 12, 14 |
| 1 architecture | docs/image-studio/ARCHITECTURE.md; phase-1 handoff | Trace quote→reserve→dispatch→QC→save; immutable fingerprints; integration approval recorded | No unresolved critical shared-interface decision |
| 2 Google adapter | lib/image/studio/provider.ts, errors.ts | Injected fixed Google transport; exact payload; blocked/missing image; 429, timeout, malformed/large body; no model switch/retry | AC-01, 02, 07, 14 |
| 2 private media/QC | lib/image/studio/assets.ts, quality.ts | Real sharp decoder fixtures, orientation/EXIF stripped, malformed/decompression bomb/format mismatch, ownership failures, save fail closed | AC-01, 02, 10 |
| 2 quote/service | lib/image/studio/service.ts, live.ts | Reuse signQuote, quoteCredits and central debit/refund; tampered/expired/cross-user quote; no reserve before explicit confirmation | AC-06, 07, 15 |
| 2 worker/recovery | lib/image/studio/worker.ts; additive taskLive + sweep registration | Existing LeaseStore CAS; duplicate starts; lease loss; dispatch ambiguity; save recovery; cancellation refund outbox; actual failure stays failed | AC-07–09, 15 |
| 2 API | app/api/image/{models,capabilities,operations/validate,jobs/quote,jobs,jobs/[id],jobs/[id]/cancel}/route.ts | Existing auth guards; server-only costs/model permissions; other user's job 404; unknown/unsupported input before reserve | AC-06, 08, 10, 14 |
| 3 refs/versioning | lib/image/studio/references.ts, versions.ts; app/api/image/assets/[id]/versions/route.ts | Owned upload IDs, roles fixed, parent owned/completed; source never overwritten; lineage reused after reload | AC-02–05, 13 |
| 4 workspace | components/studio/image/ImageWorkspace.tsx, ImageQuote.tsx, ImageResult.tsx, strings.ts; minimal OmniStudio seam | Render requests inline; visible exact effective instructions; localized labels; no fabricated percent; keyboard/mobile screenshots | AC-01–06, 08, 09, 11, 13 |
| 4 Agent G | image-owned tool contract; additive registry/declarations/handler integration | Quote-only preparation; human start required; KA commands preserve original text/references; no billing in agent | AC-12 |
| 5 hardening | adjacent .test.ts and tests/image-studio.spec.ts | Cross-user refs/jobs, concurrent confirm/cancel, charge/refund ambiguity, strict provider boundary, accessible responsive controls | All critical behavior |
| 6 report | phase-6 handoff, capability truth matrix, rollback | Real approved Google + isolated DB/storage evidence; regression comparison and clean build | No production-ready claim without proof |

Filenames are intended ownership boundaries; reuse a proven existing API instead of adding an alias if equivalent. No fake mask UI, deterministic upscale claim or 100% face identity promise. Generic natural-language edits remain explicitly generative. Advanced category H is assessed separately, not silently part of MVP.

## Acceptance test matrix (IDs mirror the user's 15 scenarios)

| ID | Scenario | Automated proof required | Additional real evidence |
|---|---|---|---|
| AC-01 | Text → preview → save | Quote/confirm/API/worker/QC/Library, actual decodable fixture | Approved live Google result and private saved asset |
| AC-02 | Upload → edit | Owned source + unchanged edit instruction + preview | Human check requested change and source preservation |
| AC-03 | Reference → variation | Stable reference identity/role/order through payload | Visual reference adherence |
| AC-04 | Character → outfit | Subject vs clothing roles not swapped | Honest visual identity/outfit review |
| AC-05 | Product → new background | Product ref preserved and edit scoped in visible plan | Check packaging; exact overlay route where required |
| AC-06 | Quote → confirm → charge | No charge on quote; tamper rejected; one confirmed charge | Isolated real DB credit delta |
| AC-07 | Provider failure → settlement | Durable failure + refund debt; exactly once net settlement | Isolated real DB and injected failure |
| AC-08 | Cancel | Owner-only terminal transition; late result fenced; honest provider cancellation semantics | Worker lifecycle observation |
| AC-09 | Refresh | Same durable job followed/recovered; no new inference | Browser reload and lost-worker experiment |
| AC-10 | Unauthorized | 401 unauthenticated; 404 another user's job/assets; zero byte fetch | Real isolated RLS/auth proof |
| AC-11 | Mobile | 390×844; 44px targets; 16px inputs; focus; no horizontal overflow | Screenshots and keyboard flow |
| AC-12 | Georgian Agent G | Original Georgian text and selected refs→quote-only tool→human start | Approved end-to-end command |
| AC-13 | Versions → reuse | Parent linkage, source immutable, owned result reusable after reload | Saved Library/version inspection |
| AC-14 | Unsupported | Model/operation/control rejected before charge and provider | Live capability availability audit |
| AC-15 | Concurrent starts | Same signed job id: one insert/debit/provider call; cross-user isolation | Parallel real isolated database requests |

Mock/local success is labelled BUILT with its exact scope. It does not certify real provider availability. Any paid verification requires a separate explicit budget/authorization. A no-credit or unavailable environment is reported as BLOCKED/UNVERIFIED, not simulated success.

## Regression and rollback
Run focused tests with each coherent slice; typecheck and changed-file lint; final full Jest/build once, comparing against recorded pre-existing failures. Real FFmpeg tests remain owned by the Video/media work; do not weaken them to get green. Re-read active PR #58 file overlaps before touching shared files. Rollback is revert of Image Studio commits and removal of its additive registrations; no database migration or central price changes required.
