# Phase 1 proposal: execution authority and transport

Goal (spec §7 Phase 1): close billing/approval and provider bypasses first, then move each media service onto strict-Vertex adapters over the lifecycle Music Studio v1 and Image Studio v1 already implement. All work is local code, mocks and fixtures, landing as Draft PRs. No live billable call, shared schema change, flag activation or production deploy without GG's go-ahead.

Base: `b1f0778c` (PR #113 head), or `main` once #113 merges.

## PR sequence (each small and independently reviewable)

| # | PR | Closes | Main files | Tests that prove it |
|---|---|---|---|---|
| 1 | **Provider reachability guard** (test only) | makes F-03/F-04 measurable | `__tests__/policy/providerReachability.test.ts` from `provider_reach.py` | fails today on the known routes; snapshot of the allowlist |
| 2 | **Strict Vertex transport** | F-03 | `lib/ai/google/transport.ts`, `lib/veo/engine.ts`, `lib/ai/lyriaMusic.ts`, `lib/ai/geminiImagen.ts`, image transport | unset / `gemini_api` / partial config → typed `NotConfiguredError`, zero fetches to `generativelanguage.googleapis.com`; historical `models/…` Veo ops still poll read-only |
| 3 | **Fail-closed budget** | F-05 | `lib/services/billing/chatBudget.ts`, `/api/tts/gemini`, chat route | guard throws → 503 before provider I/O; booking failure → reconciliation row; no `catch {}` in paid paths |
| 4 | **Quote token v2** | F-06 | `lib/agent/media/quoteToken.ts`, callers | forged / changed model / changed transport / stale pricing / replay / foreign owner all refused; v1 still verifies until expiry |
| 5 | **Remove non-Google fallbacks** | F-04 | chat Anthropic branch, ElevenLabs/HeyGen/Replicate/Higgsfield/Udio/Kling/Runway entry routes, `MEDIA_GOOGLE_ONLY`/`AI_GOOGLE_ONLY` re-open path | each route answers `capability_unavailable` (ka/en/ru) before any charge; status/poll routes stay readable for historical jobs; env flips no longer reopen anything |
| 6 | **Lyria on Vertex** | Music parity | `lib/music/studio/*` adapter | fixture tests for `lyria-3-clip-preview` and `lyria-3-pro-preview`; fix mobile cancel (F-12) first |
| 7 | **Veo variant capability rows** | Video parity | `lib/veo/*`, Director | controls rendered only from the variant's row; `-preview` / unverified `3.2` / `9` ids refused |
| 8 | **Imagen 3 boundary + lifecycle gate** | Photo | new `lib/image/studio/adapters/imagen3.ts` | synthetic-fixture contract test; quote returns `lifecycle_blocked`, no spend; live Photo stays on its current path only until GG's replacement decision |
| 9 | **Avatar capability gate** | Avatar | avatar entry points | `capability_unavailable` with the precise gap, drafts kept |
| 10 | **Migration and rollback notes** | spec Phase 1 deliverable | `docs/master-v3.1/MIGRATION_ROLLBACK.md` | — |

PRs 1–5 are the safety core and can start now. 6–9 depend on the decisions below.

## Needs GG before or during Phase 1

1. Imagen 3 replacement target (AUDIT §4.1).
2. Avatar direction (AUDIT §4.2).
3. Character-ID prompt intent (AUDIT F-13), which unblocks two failing suites.
4. Merge #113 first or build on its head.
5. Whether Cloud TTS (`texttospeech.googleapis.com`) counts as allowed "Google" or must also move to Gemini TTS on Vertex.
6. Later, one budgeted contract call per model to turn "unverified" rows into "verified" fixtures (spec forbids repeated billed probes; this would be a single listed batch for approval).

## Out of scope for Phase 1

Delete-X, loaders and panels (Phase 2), library/download/chat latency (Phase 3), speech pipeline rewrite (Phase 4), ADK (Phase 5).
