# Video Core v1.0 — handoff index

Branch `claude/video-core-v1-6gh97e` from main 30be5a2, draft PR #58 → main. No merge, no deploy, no new Preview, no
shared-database migration, no paid provider call. Rounds: master task (2026-10-12 05:01Z), round 2 (09:00Z), round 3
(10:17Z), final completion + isolated CI E2E (18:17Z, 19:05Z, 19:07Z).

## Final deliverables (start here)

| File | What it is |
| --- | --- |
| `FINAL_E2E_REPORT_KA.md` | Georgian report for GG: verdict, the four layers (CI E2E / Vercel runtime / Veo live / Production), what is left (copy: `/mnt/project-files/reports/`) |
| `RELEASE_READINESS_CHECKLIST.md` | test gate on the final head, blockers B1–B8, owner decisions D1–D11, safety rules kept |
| `FINAL_ACCEPTANCE_MATRIX.md` | AC-01…AC-28: PROVEN / PARTIAL / BLOCKED, the tiers each ran at, and what is not proven |
| `DEFECT_REGISTER_FINAL.md` | every defect's final state, fix commit, regression test and highest tier measured |
| `VIDEO_CORE_HANDOFF.md` | what changed where, how to re-run every check (incl. the CI E2E), what is open |
| `SUPABASE_TEST_ENV.md` | the isolated Supabase in GitHub Actions, the Test Schema Baseline, the 114 / 35 migration finding |
| `evidence/ci-e2e/` | the GitHub Actions runs this release candidate rests on |

## Supporting documents

| File | Content |
| --- | --- |
| `FFMPEG_EVIDENCE.md`, `evidence/round3-final/`, `evidence/t3-*.json` | real-ffmpeg measurements (decoded frame counts) |
| `evidence/t2-round3-final/` | real-browser Playwright run with mocked routes (desktop + iPhone 13), `summary.md` |
| `BILLING_SECURITY_REPORT.md` | ledger, leases, refunds, RLS, access gates |
| `VERTEX_LIVE_TEST_PLAN.md` | Veo / Vertex config review and the L1–L3 paid test plan (not run) |
| `PREVIEW_EVIDENCE.md` | read-only checks on the existing Preview (round 3) |
| `report-ka.md`, `acceptance-matrix.md`, `defect-register.md`, `capability-matrix.md`, `contracts.md`, `consolidation-plan.md`, `blockers-and-deferred.md` | rounds 1–2 (history; the final files above supersede their statuses) |
| `storyboard-revisions.md`, `proposals/20261012a_storyboard_revisions.sql` | B3 migration proposal (NOT applied anywhere but the CI throwaway database) |
