# Performance baseline (v1, 22 October 2026)

**No latency was measured in Phase 0.** No live provider call was authorised, no browser trace was captured, and dependencies were not installed in the audit session. Every number below is either a code constant or a target from spec §4.1. None of them is current performance.

## Targets (spec §4.1, engineering targets, not measurements)

| Interaction | Target | Measured now |
|---|---|---|
| Click / selection acknowledgement | ≤100 ms on reference desktop/phone fixtures | not measured |
| Warm cached My Works tab switch | p95 ≤150 ms, no blank screen | not measured |
| Cached item preview open | p95 ≤150 ms to visible shell | not measured |
| Download initiation | app overhead ≤250 ms; warm first byte p95 ≤1 s (separate from transfer) | not measured |
| Default text-only Flash chat | semantic TTFT p50 ≤1.5 s, p95 ≤4 s (authorised warm benchmark) | not measured |
| Warm inline read-aloud | first audible speech p95 ≤2.5 s | not measured |

## Code-level facts that will shape the numbers

| Area | Fact (file) | Expected effect, to be confirmed by trace |
|---|---|---|
| Library tab switch | Both surfaces fetch with `cache: 'no-store'`; route answers `private, max-age=30` (`StudioLibraryGrid.tsx` L468/486/514, `api/studio/library/route.ts` L199) | every tab switch is a full network round trip + re-sign |
| Library signing | `createSignedAssetUrls(bucket, list, 86_400)` batch per page; up to 60 legacy "proof" ranged GETs per page (`LEGACY_PROOFS_PER_PAGE = 60`) | legacy rows may dominate p95 |
| Library error | outer `catch` returns `{ items: [] }` 200 | failures look like empty, can't be timed as errors |
| Download | `fetch` → `await r.blob()` before save (`lib/media/saveMedia.ts` L88–90) | initiation ≈ full transfer time for large video |
| Chat route | keepalive before model output; profile/memory in parallel (`app/api/chat/gemini/route.ts`) | heartbeat is not TTFT; capability await and budget check sit before the stream |
| Read-aloud | client timeout 25 s; route up to 3 × 25 s attempts, `maxDuration = 30`; lookahead up to 3 chunks; first sentence split ≤220 chars (`ttsChunks.ts`) | first audio depends on one ~220-char synth; tail retries can run past the client |

## Trace plan (Phase 3 entry criteria)

Spans, correlated browser → server by a trace id, with no prompt text, audio or signed URLs in attributes:

`ui.click` → `auth` → `quote.reserve` → `db` → `url.sign` → `provider.start` → `provider.first_token` / `first_audio` → `media.transfer` → `ui.render`

Environments, reported separately:

1. **Mock** (local, fake provider, local Supabase): app overhead only. Free, run in CI.
2. **Preview, warm**: real network and storage, fake or already-cached provider responses. Free.
3. **Live provider**: needs GG's authorisation and a budget line. At least 30 samples per p95 (spec §4.1), or the sample count stated beside the number.

Each result records commit, environment, payload size, network profile, cold/warm, sample count, p50 and p95.

## What Phase 3 must not do

Remove spinners, fake progress or skip billing checks to make numbers look better. Spec §4.4 keeps billing fail-closed even on the chat hot path.
