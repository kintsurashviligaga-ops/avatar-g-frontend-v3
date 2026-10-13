# Image Studio — Phase 0
Date: 2026-10-12. Baseline: 30be5a2d. Branch: codex/image-studio-v1.

Audit and isolation completed. Source state is established in IMAGE_STUDIO_AUDIT.md; a detailed file/contract/test/acceptance plan is in docs/image-studio/IMPLEMENTATION_PLAN.md. Owner explicitly approved SHARED_INTERFACE_PROPOSAL.md and continuation into Phases 1 and 2.

Changes: audit, plan, proposal and baseline evidence only. Existing production source and Claude Video Core branch unchanged.

Checks:
- TypeScript: PASS exit 0 (initial Node 25.9.0).
- Full Jest: 864 passed / 3 failed / 5 skipped suites; 13,251 passed / 18 failed / 30 skipped tests. Open handle remained; after printed results the process was interrupted (exit 130).
- Node 24.19.0 recheck of all 3 failing suites: 18 failed / 21 passed; exit 1. --forceExit used.
- Lint Node 24: PASS exit 0 with existing accessibility warnings.
- Build Node 24: PASS exit 0 using only dummy local Supabase credentials; transient Google Fonts timeouts recovered. No deployment. This does not prove service availability.

The 18 pre-existing real-FFmpeg failures are catalogued in the audit. No tests were weakened and no Video Core file modified. Release regression gate stays open until resolved; the documented audit/isolation gate permits the approved image implementation.

Real model calls, database mutations, deployed storage/RLS and browser tests were not performed. No production-ready claim.

Operational interruption: approval review briefly unavailable from usage quota; after reset, usage reported allowed and the same lint action passed review. No workaround bypass used.

Handoff: Phase 1 defines strict request/quote/provider/storage/lease contracts; Phase 2 implements the isolated engine through existing Google transport, central ledger and generation_jobs. Paid verification requires explicit authorization and an isolated environment.
