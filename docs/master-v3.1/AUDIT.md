# MASTER TASK v3.1 — Phase 0 audit

Audited 22 October 2026 (Asia/Tbilisi) against `MYAVATAR_FINAL_CLAUDE_CODE_MASTER_TASK_v3.1.pdf`.
Read-only: no production code changed, no live or billable call made, no shared database touched.

Companion documents in this folder:

- [CAPABILITY_MATRIX.md](CAPABILITY_MATRIX.md): per-model verified / unsupported / unverified / lifecycle-blocked status.
- [GOOGLE_WORKFLOW_PARITY.md](GOOGLE_WORKFLOW_PARITY.md): Section 2.1.1 parity matrix for Video, Music, Photo/Image, Avatar.
- [BILLABLE_ENTRYPOINTS.md](BILLABLE_ENTRYPOINTS.md): every API route that can reach provider code, plus speech entry points.
- [PERFORMANCE_BASELINE.md](PERFORMANCE_BASELINE.md): what was and was not measured, and the trace plan.
- [PHASE_1_PLAN.md](PHASE_1_PLAN.md): proposed Phase 1 PR sequence.

## 1. Baseline

| Item | Observed now | Matches v3 snapshot? |
|---|---|---|
| Repository | `kintsurashviligaga-ops/avatar-g-frontend-v3` | yes |
| Remote `main` | `16e6af56c009d61c2796fa05f95fb670efee5993` (2026-10-21 23:12 +04) | yes, unchanged |
| Candidate | `b1f0778ce7a93c31d45107114928210466c5165e`, branch `codex/director-attempt-journal`, PR #113 (Draft, open, `mergeable_state: blocked`) | yes |
| Candidate vs main | 26 commits ahead, 0 behind; 90 files, +2,576 / −618 | yes |
| Audit checkout | fresh clone at `b1f0778c` (blobless, full history), local branch `audit/phase0`; working tree clean | n/a |
| Remote branches | 105 refs; most recent ten listed below | — |

The hydrated checkout `/private/tmp/myavatar-contract-20261019` and local branch `codex/montage-routing-safety` named in v3 live on another machine. They are not visible from this audit, so any uncommitted work there is **unverified** and must not be assumed lost or merged.

Recent remote branches (newest first): `codex/director-attempt-journal` (b1f0778c, 10-22), `main` (16e6af56, 10-21), `codex/director-rejected-operation` (04642153), `codex/run-approval-lease-safety` (df4d02e0), `codex/unified-audit-candidate` (51199dfc), `codex/contracted-assembly-no-salvage` (116fb357), `codex/vertex-controlled-certification` (7c557e82), `codex/live-require-setup-lock` (8de79fdc), `codex/read-only-provider-health` (4406a973), `claude/production-launch-certification-u2s9hy` (fdf912d7). Older branches are historical pointers; none should be replayed blindly.

**Proposed base for Phase 1:** branch from `b1f0778c` (PR #113 head), since it strictly contains `main` and carries the Director attempt journal and font-test repairs. If GG prefers to merge #113 first, Phase 1 branches from the new `main` instead; the plan does not change.

## 2. Exact-head CI at `b1f0778c`

| Check | Result | Classification |
|---|---|---|
| verify (broad unit) | **fail**: 15,513 passed, 20 failed, 114 skipped; 9 of 1,041 suites failed | Inherited / policy drift, see below |
| Music Studio live E2E (local Supabase, desktop + phone) | **fail**: 21 passed, 1 failed, 5 not run (serial) | Probable real defect or race, see below |
| preview-e2e | pass | — |
| live E2E (local Supabase, desktop + phone) | pass | — |
| isolated-db | pass | — |
| billing on real Postgres | pass | — |
| image-browser | pass | — |
| simulated-browser | pass | — |
| Vercel / Vercel Preview Comments | pass | — |

For comparison, `main` (16e6af56) verify failed with **122** tests in 32 suites and preview-e2e also failed. The candidate therefore reduces the inherited failures; it does not introduce new verify failures that I could find.

Failing verify suites visible in the log tail (7 of 9 named; the other two were outside the retrieved window and are **unverified**):

| Suite | What it asserts | Likely cause | Class |
|---|---|---|---|
| `lib/studio/tools.test.ts` | interior/photographer are primary tools; VFX one level down; photo culling copy | Owner removed menu tools in `a30fc104`, `047b638d` | Inherited: spec changed, test not updated |
| `lib/video/contracts.test.ts` | every registry id is real (`motion`, `swap`) | Same menu removals | Inherited |
| `components/onboarding/tourWiring.test.ts` | ≥2 `tool-<id>` tour anchors in ChatChrome | Sidebar cleanup `a5c0fd48` removed collapsed-rail tools | Inherited |
| `components/studio/create/createPanels.test.tsx` | interior panel order | Panel consolidation | Inherited |
| `lib/studio/templates.shoot.test.ts` | photographer id is `photoshoot` | Menu removals | Inherited |
| `lib/gemini/image-analysis.test.ts` | character ID prompt must not describe background/lighting | Prompt now *requires* environment description | Inherited; **owner decision**: which behaviour is intended |
| `app/api/film/storyboard/selfie.test.ts` | photo locks face, not clothes/place | Same prompt change | Inherited; same decision |

Music E2E failure: `[mobile] Cancel mid-render returns the credits exactly once; Try again makes a NEW quote`. The card stayed `data-phase="running"` (stage `generating`) for 60 s after Cancel; desktop passed. Either cancel is not honoured while the fake provider is mid-render on the mobile project, or the UI never reflects the cancelled state. Severity **high** (stop must prevent further spend and settle once). Reproduce locally with `playwright.music-live.config.ts --project=mobile` before Phase 1 billing work.

The same Music job evidence shows `"transport":"gemini_api"` on every job (see F-03).

## 3. Findings

Severity: **P0** = can spend or route money/data outside policy; **P1** = user-visible correctness; **P2** = performance/UX.

### F-01 OmniStudio monolith — P2 (confirmed)
`components/studio/OmniStudio.tsx` is 13,066 lines. Speech (`synthTtsUrl` L269, `speakMsg` L8157), orchestration, panels and rendering share one module. A stray `OmniStudio.tsx.bak` also sits beside it.
**Fix:** extract tested seams in this order: speech controller (Phase 4), card state machine (Phase 2), service panel adapters (Phase 1). Delete the `.bak`.
**Acceptance:** each extraction lands with unit tests at the new seam and no behaviour diff in existing browser suites.

### F-02 No ADK; two unrelated registries — P2 (confirmed)
`@google/adk` is not in `package.json`. `lib/contracts/toolRegistry.ts` describes itself as a "skeleton on purpose: no executor"; `lib/tools/registry.ts` is a text-helper registry. Neither is an ADK integration.
**Fix:** Phase 5 only. Generate ADK tool definitions from `lib/contracts/toolRegistry.ts` after Phase 1 makes it the canonical capability registry.
**Acceptance:** per spec §2.4.

### F-03 Developer API is the default transport everywhere — **P0** (confirmed)
- `lib/ai/google/transport.ts` `googleTransportKind()`: unset `GEMINI_TRANSPORT` → `gemini_api` (generativelanguage.googleapis.com + API key, AI Studio prepay).
- `googleImageTransportKind()`: `GEMINI_IMAGE_TRANSPORT` can independently pin images to `gemini_api` (comment documents doing so after Vertex 429s on 2026-10-16).
- `lib/veo/engine.ts` `veoTransport()`: auto mode picks Vertex if configured, **else Gemini API** if a key exists.
- `lib/ai/lyriaMusic.ts`: default path is `POST generativelanguage.googleapis.com/v1beta/interactions`; Vertex only when `GEMINI_TRANSPORT=vertex`. CI Music jobs record `transport: gemini_api`.
- 14 source files still hard-code `generativelanguage.googleapis.com` (Live, research/interactions, WhatsApp live session, model verify, health, provider probe, Veo Gemini transport, Imagen).

**Fix (Phase 1, first PR):** make `vertex` the only accepted value for new generation; unset or `gemini_api` throws `NotConfiguredError` before I/O. Remove the `gemini_api` branch from `veoTransport()` auto mode and from Lyria/Imagen. Keep read-only polling of historical `models/…` Veo operations so accepted jobs still settle (spec §2.2 item 5) but never submit on that transport.
**Acceptance:** network-isolated tests: every adapter with env unset / `gemini_api` / partial Vertex config makes zero fetches to `generativelanguage.googleapis.com` and returns a typed capability error; historical Gemini-API operation ids still poll read-only.

### F-04 Non-Google providers are env-gated, not structurally removed — **P0** (confirmed)
Kill switches exist and default ON: `AI_GOOGLE_ONLY` (`lib/ai/google/policy.ts`), `VIDEO_GOOGLE_ONLY` (`lib/veo/policy.ts`), `MEDIA_GOOGLE_ONLY` (`lib/providers/mediaPolicy.ts`, 36 call sites). They can be re-opened by setting the flag falsy plus `OUTSIDE_ENGINES_APPROVED`. Two problems against v3.1:
1. The boundary is "Google **or ElevenLabs**". v3.1 forbids ElevenLabs as well. 32 routes reach ElevenLabs code (`/api/elevenlabs/tts`, `/api/elevenlabs/sound`, `/api/voice/clone`, `/api/voice-lab/jobs`, onboarding TTS, film voiceover…).
2. Chat keeps an Anthropic fallback (`app/api/chat/gemini/route.ts` L427–, `claude-haiku-4-5`) behind `AI_GOOGLE_ONLY=0`. 73 routes reach non-Google provider code without a route-level Google-only check (they may rely on a deeper guard; see BILLABLE_ENTRYPOINTS for the static list).
Packages still installed: `@anthropic-ai/sdk`, `openai`, `replicate`.

**Fix:** Phase 1 replaces the env switches with a compile-time provider allowlist (Vertex only) at the adapter layer, deletes the fallback branches, and turns non-Google routes into honest `capability_unavailable` refusals. Polling routes for historical jobs stay read-only.
**Acceptance:** a test that walks every `app/api/**/route.ts` import closure and fails if any reaches a non-Vertex provider client; plus env-flip tests proving `AI_GOOGLE_ONLY=0` no longer re-opens anything.

### F-05 Chat/TTS budget guard fails open — **P0** (confirmed)
`lib/services/billing/chatBudget.ts`: `chatBudgetRefusal` / `chatBudgetAllows` catch every guard error and allow the turn (L54 `catch { return null }`, documented "Fails OPEN"). `bookChatUsage` swallows booking errors (L126 "bookkeeping only"). `/api/tts/gemini` uses both, so a ledger outage means unmetered paid TTS and chat.
**Fix:** fail closed on any guard error for live paid routes; reserve before submit; turn booking failure into a durable reconciliation row instead of `catch {}`.
**Acceptance:** spec §2.3 test list (budget-store failure, settlement failure) proving zero provider calls when the guard throws.

### F-06 Quote token binds too little — **P0** (new in this audit)
`lib/agent/media/quoteToken.ts` signs only `{u, j, f, c, x}` (user, job id, request fingerprint, credits, expiry). Spec §2.3 also requires capability, model, transport, project, pricing version, currency, units, nonce and output-affecting settings. Some of these may already be folded into the fingerprint `f`; that needs to be checked per caller (`lib/orchestrator/idemRef`).
**Fix:** version the token (`v:2`) with explicit model/transport/project/pricing/currency fields; verify them at execution time against the adapter that will run. Keep `v:1` verification for in-flight quotes until they expire (30 min TTL).
**Acceptance:** forged/changed-model, changed-transport, stale-pricing and replay tests.

### F-07 Two library surfaces, inconsistent caching, silent empty on error — P1 (confirmed)
- `/[locale]/library` renders `components/library/LibraryGallery.tsx`; `components/studio/StudioLibraryGrid.tsx` is the embedded grid. Both fetch `/api/studio/library` with `cache: 'no-store'` while the route sends `Cache-Control: private, max-age=30`.
- Favorites are a `localStorage` key `myavatar:favorites` **not scoped to the account**, filtered over a fetched window (route caps `limit` at 60).
- The route's outer `catch` returns `{ items: [] }` with HTTP 200, so a server failure renders as "you have no works".
**Fix:** Phase 3 shared owner-scoped data layer; account-scoped favorites (server-side preferred); error responses carry a status the UI distinguishes.
**Acceptance:** spec §4.2 list.

### F-08 Download waits for the whole Blob — P2 (confirmed, unmeasured)
`lib/media/saveMedia.ts` L88–90: `fetch(url, { cache: 'no-store' })` then `await r.blob()` before any save action. Large videos delay initiation by the full transfer. The iOS share-to-Photos path legitimately needs full bytes.
**Fix:** Phase 3 owned-asset download route with `Content-Disposition` streaming for non-iOS; keep the Blob path for iOS share.
**Acceptance:** spec §4.3 list; report initiation time separately from transfer.

### F-09 Speech pipeline: silent skips, truncation, conflicting deadlines — P1 (confirmed)
- `OmniStudio.tsx` L8216 `if (!url) continue;`: a failed chunk is silently skipped.
- `lib/audio/premium-tts.ts` L26 slices to 800 chars; `/api/tts/gemini` L132 slices to `MAX_TEXT = 2000`.
- `/api/tts/gemini` takes only the first `inlineData` part (L213 `.find`) and always wraps it as 24 kHz mono PCM → WAV (`pcmToWav`). Model allowlist in code spans `gemini-2.5-flash-preview-tts`, `gemini-3.1-flash-tts-preview`, `gemini-3.8-flash-tts`, whose response contracts may differ (WAV vs headerless PCM). Unverified which the deployment uses.
- Deadlines: client `AbortSignal.timeout(25_000)` (L275); route up to `MAX_ATTEMPTS` × 25 s upstream with `maxDuration = 30`. A client timeout leaves server retries running.
- `lib/audio/ttsChunks.ts` hard-splits a long sentence every 600 chars regardless of word or grapheme boundaries, and its sentence regex splits on `.` inside decimals ("3.5") and abbreviations.
- Speculative first-sentence prefetch (`leadSentence`) synthesises before the reply ends, outside any explicit speech approval.
**Fix:** Phase 4 per spec §5; Phase 1 only adds the approval/budget gate to `/api/tts/gemini`.
**Acceptance:** spec §5.3 list.

### F-10 Progress bars still present — P2 (confirmed)
Bars/width animations in `components/studio/PipelineProgress.tsx` (`<Progress className="h-1.5">`), `components/services/ExecutionProgress.tsx`, `components/chat/GenerationProgress.tsx`, plus a fourth family `components/studio/ui/GenerationProgress.tsx` (used by ResultCard, JobTray, LoadingLoop, OmniStudio, SurgicalEditor). 10 caller files.
**Fix:** Phase 2 single percentage card.
**Acceptance:** spec §3.3.

### F-11 Delete-X: a concrete, unreproduced hypothesis — P1
`ChatChrome.tsx` L1231–1232: the X is `absolute top-1/2 -translate-y-1/2` with `tap-44`. `app/globals.css` L341 `button:active:not(:disabled) { transform: scale(0.97) }` has specificity (0,2,1), which beats Tailwind's single-class `-translate-y-1/2` (0,1,0). On pointer-down the button's whole `transform` is replaced, the translate is lost, and the X jumps about 14 px down. If pointer-up then lands outside the button, the click either misses or hits the row's select button. `.tap-44::before` (L4252) also enlarges the hit box and may overlap the neighbouring row.
**Status:** hypothesis only; not reproduced in a browser in this audit.
**Fix (Phase 2):** position the X with flex centering (no transform) or scope an `:active` rule that composes with translate; contain `tap-44::before` within the row.
**Acceptance:** spec §3.2 browser assertions at 390/768/1440 px.

### F-12 Music cancel on mobile does not reach `cancelled` — P1 (new, from CI)
See §2. Must be explained before any Lyria live work, because cancel/refund semantics are part of fail-closed billing.

### F-13 Character-ID prompt contradicts its tests — P1 (new, from CI)
`lib/gemini/image-analysis.ts` `characterIdPrompt()` now instructs the model to describe the photo's environment and lighting and keep it in every scene; tests require the opposite. This changes film output for every selfie-driven video. **Owner decision** needed on intended behaviour before tests or code change.

## 4. Required Phase 0 decisions (owner)

1. **Imagen 3 is lifecycle-blocked.** Google's Vertex release notes list `imagen-3.0-generate-002` as a discontinued endpoint with recommended migration `gemini-2.5-flash-image`; v3.1 records the Imagen 3 endpoints as discontinued on 30 June 2026. Status: `BLOCKED_MODEL_LIFECYCLE`. The code has no Imagen 3 id at all: today's Photo path uses `gemini-3.1-flash-image` (Gemini image), with `imagen-4.0-generate-001` present in `lib/ai/geminiImagen.ts`. Per spec I will not silently promote either. **Decision needed:** approve a migration target (Google's named `gemini-2.5-flash-image`, or the already-integrated `gemini-3.1-flash-image`, or Imagen 4) after reviewing CAPABILITY_MATRIX.
2. **Avatar has no documented file-rendering lip-sync route.** Veo 3.1 (`veo-3.1-generate-001` / `-fast-` / `-lite-`) documents "audio input: not supported". The only Google-native lip-sync is **Gemini 3.8 Live with Live Avatar** (GA 24 Sep 2026): real-time conversational video, curated avatar library, custom avatar from a reference photo + audio sample **allowlist only**, lip-sync to the model's own speech. Status: `CAPABILITY_UNAVAILABLE` for "render my photo speaking my uploaded audio to a file"; `UNVERIFIED` for a real-time curated avatar. **Decision needed:** (a) apply for the custom-avatar allowlist, (b) ship real-time curated avatars only, or (c) keep Avatar unavailable.
3. **Character-ID prompt (F-13):** describe the background or not?
4. **Merge PR #113 first, or branch Phase 1 from its head?**

## 5. What this audit did not do

- No local test run, typecheck or build (dependencies not installed in this session). CI numbers above are read from GitHub Actions for the exact head.
- No browser reproduction of the delete-X, library, download or speech defects.
- No live Vertex project or entitlement check. Model availability below is from public documentation only; project access is **unverified** for every model.
- Two of nine failing verify suites were not identified.
