# Phase 1 proposal: execution authority and transport

Goal (spec §7 Phase 1): close billing/approval and provider bypasses first, then move each media service onto strict-Vertex adapters over the lifecycle Music Studio v1 and Image Studio v1 already implement. All work is local code, mocks and fixtures, landing as Draft PRs. No live billable call, shared schema change, flag activation or production deploy without GG's go-ahead.

Base: `main` at `9b7fd461` (PR #113, squash-merged 2026-10-22).

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
| 8 | **Image lifecycle on `gemini-3.1-flash-image`** | Photo | `lib/image/studio/*` adapter, as the codebase already structures it | synthetic-fixture contract test on Vertex; Imagen 3 ids answer `lifecycle_blocked`, no spend |
| 9 | **Curated-avatar gate** | Avatar | avatar entry points | built-in avatars only; a custom-avatar request answers `capability_unavailable`, drafts kept |
| 10 | **Migration and rollback notes** | spec Phase 1 deliverable | `docs/master-v3.1/MIGRATION_ROLLBACK.md` | — |

PRs 1–5 are the safety core. 6–9 follow GG's decisions below.

## GG's decisions (2026-10-22)

1. Imagen 3 replacement: `gemini-3.1-flash-image`, as structured in the codebase.
2. Avatar: built-in (curated) avatars only for now.
3. Character-ID prompt: follow the tests, so the prompt does NOT describe the photo background.
4. PR #113 merged first; Phase 1 builds on main.
5. Standard server-side Cloud TTS is allowed, as outlined in v3.1.

Still open: one budgeted contract call per model to turn "unverified" rows into "verified" fixtures. The spec forbids repeated billed probes, so this would be a single listed batch for GG's approval.

## Status

| PR | Branch | State |
|---|---|---|
| 1 | `claude/p1-01-provider-reachability` | #115, draft |
| 2a | `claude/p1-02a-strict-vertex-transport` | ready locally: every Google model call on Vertex AI, unset `GEMINI_TRANSPORT` no longer selects the Developer API |
| 2b | `claude/p1-02b-veo-vertex-only` | ready locally: Veo on Vertex only, Developer API Veo client deleted |
| 2c | — | next: remaining direct Developer API callers (Live, Interactions, WhatsApp live, probes) fail closed |

## Out of scope for Phase 1

Delete-X, loaders and panels (Phase 2), library/download/chat latency (Phase 3), speech pipeline rewrite (Phase 4), ADK (Phase 5).
