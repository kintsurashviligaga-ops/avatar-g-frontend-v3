# Image Studio v1.0 — final acceptance matrix

Date: 2026-10-13. Branch: `codex/image-studio-v1`. Recovery checkpoint: `ed0dd85339b710219ca62eccad2b14dcdc3a4293`.

**Decision: engineering verification complete within the available environment; real Phase 6 acceptance BLOCKED. Not approved for production, merge or deployment.**

PASS below means the stated automated scope only. Injected Google responses, in-memory leases/ledger, mocked Supabase SDK calls and intercepted browser APIs are not live Google/Storage/Database evidence.

| ID | Scenario / integration | Verified evidence | Remaining gate |
|---|---|---|---|
| AC-01 | Text → quote → confirm → preview/save/Library | PASS: engine, HTTP, live-adapter contracts, real image decoder, Library tests; 5 Chromium scenarios | BLOCKED: approved live Google generation and isolated private Storage/DB lifecycle |
| AC-02 | Upload → editing | PASS: source ownership, exact instruction preservation, EXIF/orientation handling, immutable source; browser owned-result edit | BLOCKED: real upload/RLS and visual requested-edit review |
| AC-03 | References → variation | PASS: stable IDs, all role contracts, reference order/digest, changed-source refusal before inference | BLOCKED: real visual adherence |
| AC-04 | Character → outfit | PASS: character/face/subject requirement, explicit clothing roles and payload order | BLOCKED: identity/outfit visual review; no identity guarantee |
| AC-05 | Product → background | PASS: required product role, unchanged user text, parent linkage, browser product reference | BLOCKED: real packaging/background inspection |
| AC-06 | Quote/Confirm/Credits | PASS: quote spends zero; explicit confirmation; tamper/expiry/user/transport rejection; concurrent starts debit once in injected ledger | BLOCKED: real isolated ledger RPC and balance deltas |
| AC-07 | Provider failure/refund | PASS: explicit provider errors, timeout/unknown outcome, no silent retry, refund once/debt recovery, QC/save failure stays failed | BLOCKED: real DB failure/refund/outage experiment |
| AC-08 | Cancel | PASS: owner fencing, pending/in-flight cancel, late result cannot complete; browser cancellation | BLOCKED: live worker cancellation/settlement observation |
| AC-09 | Refresh/recovery | PASS: same job restored, account separation, no repeated Start; stored-output recovery without inference | BLOCKED: isolated real worker restart and persistent recovery |
| AC-10 | Authorization/privacy | PASS: HTTP 401/404, foreign job/ref/version refusal, public bucket rejection, no URL-as-ownership assumption | BLOCKED: real Auth/RLS/Storage with two users |
| AC-11 | Mobile/One Window | PASS: 390×844 Chromium EN/KA/RU flows, no workspace horizontal overflow, ≥16px controls, keyboard confirmation; screenshot inspection | Real auth-dependent browser lifecycle remains part of Phase 6; broad accessibility audit not claimed |
| AC-12 | Agent G / Georgian | PASS: exact Georgian text, trusted selected draft, registered quote-only tool, strict empty tool input, no model-supplied billing/confirmation | BLOCKED: real Agent G session with isolated backend |
| AC-13 | Versions/Library/reuse | PASS: owner-scoped Library, refreshed private links, parent/children isolation, preserved source, preview/edit/compare in One Window | BLOCKED: real saved asset history and reload against DB |
| AC-14 | Unsupported/model truth | PASS: unavailable/unverified model and unsupported controls refused; generative limitations explicit; no false operation verification | BLOCKED: actual Google capability/availability verification |
| AC-15 | Concurrent starts | PASS: eight confirms/workers lead to one job/debit/inference/save in engine tests | BLOCKED: real concurrent PostgREST CAS, hardened ledger and observed provider-call count |

## Final verification inventory

| Check | Outcome |
|---|---|
| Full Jest inventory, run in bounded groups / isolated native suites | **884 suite files; 13,346 passed, 18 failed, 25 pending** after replacing opt-in and permission-limited runs; no `--forceExit` |
| Original 18 FFmpeg failures vs fresh clean baseline `30be5a2d` | Exact file/test identity match; no new final failures |
| Previously skipped tests | 5 executed successfully: 3 longform real-FFmpeg + 2 public-MDN audio tests |
| Remaining 25 skipped tests | BLOCKED: missing local PostgreSQL/PostgREST runtime and Docker/Podman; detailed list in final evidence JSON |
| Rate limiter regression | 28 tests PASS; import/request leaves no housekeeping timer; 172 API suites / 1,604 tests exit naturally |
| Shared Storage deadline regression | 8 tests PASS; success/error/rejection/deadline all dispose timers; 125-suite library group exits in ~8s instead of ~98s |
| Phase 6 harness | 5 offline tests PASS; configuration-only execution BLOCKED before any network call |
| Typecheck | PASS, `tsc --noEmit --incremental false` |
| Lint | PASS with pre-existing repository warnings; new test import error corrected; image preview effect warning resolved |
| Build | PASS in source-equivalent temporary snapshot, ~78s; no deployment |
| PR #58 source coexistence | PASS at `c09dbe48fa743295ecdb6a7b9ceb2e2d95d2e5fc`; 95 source patches applied only to temporary snapshot |
| PR #58 runtime UI coexistence | PASS: final 5 Chromium scenarios, ~54s, intercepted APIs; not real backend E2E |
| Real Google/Storage/DB end-to-end | BLOCKED: isolated environment/credentials absent, paid approval absent |

Counts are per final selected suite result, not the sum of reruns. Five opt-in successes replace skipped assertions; the longform opt-out placeholder is removed. Harness and browser tests are reported separately. Raw failed sandbox attempts remain preserved, but successful required-permission reruns are used for final acceptance.

## Remaining isolated PostgreSQL suites

| Suite | Declared pending tests | Blocker |
|---|---:|---|
| `lib/agent/run/runIsolation.pg.test.ts` | 6 | local PostgreSQL + PostgREST |
| `lib/agent/media/leaseIsolation.pg.test.ts` | 7 | local PostgreSQL + PostgREST |
| `lib/notifications/outboxIsolation.pg.test.ts` | 4 | local PostgreSQL + PostgREST; outlets are mocked |
| `lib/orchestrator/ledgerOnce.pg.test.ts` | 8 | local PostgreSQL + PostgREST; run both before/after ledger states |

No production database was used as a substitute. See `PHASE_6_RUNBOOK.md` for the prepared real-E2E procedure and remaining experiments.
