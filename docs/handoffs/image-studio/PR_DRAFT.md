# Draft PR: Image Studio v1.0 — explicit quotes, owned edits and recoverable image jobs

Status: local PR description prepared; no GitHub PR opened or branch pushed. The owner's condition for final PR readiness is not met while real Phase 6 gates are blocked. Recheck PR #58 before opening a separate Image Studio PR; do not merge or deploy.

## Description

Adds Image Studio to the existing One Window workspace with explicit quote/confirmation, ordered owned references, generative editing, durable versions and Library reuse. Agent G can prepare a quote from the reviewed draft; only the user's confirmation starts a billed image job. The engine preserves user text and selected transport/model, fences late results and duplicate starts, and retains uncertain settlement for recovery.

Recovery preserves the existing implementation in a checkpoint and fixes two shared timer leaks: rate-limit cleanup is activity-driven, and Storage upload deadlines are cleared when their attempts settle. Image preview URLs are disposed on unmount. No Video Core implementation or production schema is changed.

## Validation

- 884 suite files: 13,346 passing assertions; 18 unchanged clean-baseline FFmpeg failures; 25 PostgreSQL/PostgREST tests blocked by missing isolated runtime. All final selected runs exit without `--forceExit`.
- Five formerly skipped native/audio assertions executed successfully; five offline Phase 6 harness tests pass.
- Typecheck, lint (existing warnings), and local production build pass.
- Five Chromium scenarios pass with PR #58 head `c09dbe48fa743295ecdb6a7b9ceb2e2d95d2e5fc` applied only to a disposable verification snapshot. Browser APIs are intercepted; this does not certify real backend coexistence.
- `FINAL_ACCEPTANCE_MATRIX.md` and `PHASE_6_RUNBOOK.md` distinguish local/injected verification from real acceptance.

## Release blockers

Real isolated Google/Storage/Database, RLS and ledger concurrency evidence; approved paid smoke budget; human visual review; real PR #58 lifecycle coexistence. Capability verification remains unset. No ready-for-production claim, production migration, merge or deployment is included.
