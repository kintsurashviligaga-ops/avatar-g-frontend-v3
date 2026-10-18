# Video Core v1.0 — handoff index

**Merged and deployed 2026-10-13** (merge commit e46c35c, Production deployment `dpl_HDqsJfbyHEoEB5QM87j4UgVwLjQJ`, READY
13:25:44Z) on GG's word of 13:18:10Z; Production checks, defects 39/40 and what is still open: `PRODUCTION_DEPLOY_REPORT_KA.md`.
Video Core stays admin-only. Until that merge: branch `claude/video-core-v1-6gh97e` from main 30be5a2, PR #58 → main, no
merge, no deploy, no shared-database migration, no paid provider call. Rounds: master task (2026-10-12 05:01Z), round 2 (09:00Z), round 3 (10:17Z), final
completion + isolated CI E2E (18:17Z, 19:05Z, 19:07Z), final review + isolated Preview E2E + GO/NO-GO (2026-10-13 06:34Z,
08:52Z, 09:48Z).

## Production release 2026-10-15 (start here)

PR #69 merged as **b46bb44** and serving myavatar.ge (`dpl_6AaKtWBNgxyvjZSv4eF48DdSdTE7`); Production Veo runs on Vertex;
one paid admin film passed. Video Core's Agent G media tools stay admin-only; the public opening is GG's separate word.

| File | What it is |
| --- | --- |
| `VIDEO_CORE_FINAL_PRODUCTION_REPORT.md` | phases 0–7, gates, money, D1–D12, B1–B7, providers, the verdict and the exact permission the public opening needs |
| `VIDEO_CORE_PAID_E2E_EVIDENCE.md` | the one paid Production test, step by step, and its findings F1–F5 |
| `PRODUCTION_RELEASE_CHECKLIST.md` | every release gate with its proof |
| `FINANCIAL_INTEGRITY_REPORT.md` | the film's money path, invariants, gaps, how to reconcile the ledger |
| `ROLLBACK_AND_RECOVERY_PLAN.md` | rollback points, triggers, commands, recovery of a user's money |
| `NEXT_PHASE_HANDOFF.md` | open items in order, how to re-run the checks |
| `PRODUCTION_VEO_VERTEX_PLAN.md`, `R3_REFUND_MATRIX.md` | the Vertex switch and the refund rules behind this release |

## GG's ten deliverables (2026-10-13 08:52Z) — where each one is

| # | Deliverable | File |
| --- | --- | --- |
| 1 | Engineering Report | `GO_NO_GO_REPORT_KA.md` §2–§3 (code review, fixes) and `VIDEO_CORE_HANDOFF.md` (what changed where, how to re-run) |
| 2 | E2E Results | `evidence/ci-e2e/` (CI E2E per run) and `PREVIEW_E2E_VERIFICATION.md` (Vercel runtime) |
| 3 | Defect Register | `DEFECT_REGISTER_FINAL.md` (rows 1–42) |
| 4 | Acceptance Matrix | `FINAL_ACCEPTANCE_MATRIX.md` (AC-01…AC-28, by tier) |
| 5 | Preview Verification | `PREVIEW_E2E_VERIFICATION.md` |
| 6 | Security / Billing Verification | `BILLING_SECURITY_REPORT.md` and `GO_NO_GO_REPORT_KA.md` §2–§4 (billing and RLS live on both E2E layers) |
| 7 | Outstanding Blockers | `RELEASE_READINESS_CHECKLIST.md` §2–§3 (B1–B8, D1–D12) and `GO_NO_GO_REPORT_KA.md` §5, §8 |
| 8 | Production Deployment Plan | `GO_NO_GO_REPORT_KA.md` §6 steps 1–3 and §8 |
| 9 | Rollback Plan | `GO_NO_GO_REPORT_KA.md` §6 |
| 10 | GO / NO-GO | `GO_NO_GO_REPORT_KA.md` §1 (copy: `/mnt/project-files/reports/`) |

## Final deliverables (start here)

| File | What it is |
| --- | --- |
| `GO_NO_GO_REPORT_KA.md` | Georgian report for GG (2026-10-13): code review, E2E by layer, risks, rollback, GO/NO-GO, what is left |
| `PREVIEW_E2E_VERIFICATION.md` | the Vercel-runtime E2E (T4): isolation, runs, results test by test, findings |
| `FINAL_E2E_REPORT_KA.md` | round 4's Georgian report (2026-10-13 early morning; history) |
| `RELEASE_READINESS_CHECKLIST.md` | test gate on the final head, blockers B1–B8, owner decisions D1–D12, safety rules kept |
| `FINAL_ACCEPTANCE_MATRIX.md` | AC-01…AC-28: PROVEN / PARTIAL / BLOCKED, the tiers each ran at, and what is not proven |
| `DEFECT_REGISTER_FINAL.md` | every defect's final state, fix commit, regression test and highest tier measured |
| `VIDEO_CORE_HANDOFF.md` | what changed where, how to re-run every check (incl. the CI E2E), what is open |
| `SUPABASE_TEST_ENV.md` | the isolated Supabase in GitHub Actions, the Test Schema Baseline, the 114 / 35 migration finding |
| `evidence/ci-e2e/` | the GitHub Actions runs this release candidate rests on (latest: `live-e2e-38394813999.md`, f1e3358, 35 / 35; `live-e2e-38388562682.md`, ec7f742, 35 / 35) |

## Supporting documents

| File | Content |
| --- | --- |
| `FFMPEG_EVIDENCE.md`, `evidence/round3-final/`, `evidence/t3-*.json` | real-ffmpeg measurements (decoded frame counts) |
| `evidence/t2-round3-final/` | real-browser Playwright run with mocked routes (desktop + iPhone 13), `summary.md` |
| `BILLING_SECURITY_REPORT.md` | ledger, leases, refunds, RLS, access gates |
| `VERTEX_LIVE_TEST_PLAN.md` | Veo / Vertex config review and the L1–L3 paid test plan (not run) |
| `PREVIEW_EVIDENCE.md` | read-only checks on the shared Preview (round 3; history) |
| `report-ka.md`, `acceptance-matrix.md`, `defect-register.md`, `capability-matrix.md`, `contracts.md`, `consolidation-plan.md`, `blockers-and-deferred.md` | rounds 1–2 (history; the final files above supersede their statuses) |
| `storyboard-revisions.md`, `proposals/20261012a_storyboard_revisions.sql` | B3 migration proposal (NOT applied anywhere but the CI throwaway database) |
