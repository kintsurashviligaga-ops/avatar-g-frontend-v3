# MyAvatar.ge — Film Service Status Report
Generated: 2026-06-02

## Overall Verdict

**READY (code) / PROVISION-GATED (live)** — the 30-second film service is fully
implemented, type-safe, and unit-tested across all seven stages, and it is
**already merged to `origin/main`** (HEAD `7803925` == `origin/main`). All three
gates pass in this environment. It will serve real traffic the moment the
required Vercel env vars (LTX key + Supabase Storage) are provisioned; every
optional leg degrades gracefully when its key is absent.

> Audit method: every file below was read in full and cross-checked against the
> live wiring — not inferred. Where this report contradicts an earlier draft
> (e.g. "not merged", "tests can't run"), the draft described a different
> sandbox; the facts here were verified in this repo.

---

## Gate Results

| Gate | Result |
|------|--------|
| `tsc --noEmit` | **PASS** — 0 errors |
| `npm test` (`jest`) | **PASS** — 498 passed, 0 failed (50 suites). 88 of those are film-specific (4 suites: filmPipeline, filmTaskRef, filmStatusStore, filmReadiness) |
| `npm run build` | **PASS** — Compiled successfully; 349/349 static pages; `/api/system/film-readiness` + `/api/video/*` in the route manifest; exit 0 |

All three ran cleanly on this machine (macOS/Node 20). No code changes were
needed to make them pass.

---

## Pipeline Health

The brief's logical 7-stage arc maps onto the serverless implementation as
follows. (Stages are realized as a **pure planner → server fan-out → Union Poll
token → saga-guarded assembler → status-store**, not a long-running worker.)

| Stage | Code status | Test coverage | Where / notes |
|-------|-------------|---------------|---------------|
| `queued` (dispatch + wallet gate) | IMPLEMENTED | PARTIAL | `lib/chat/filmComposite.ts` → `handleFilmComposite`. Wallet pre-flight (`readWalletBalanceGel`), idempotent per-clip `deductRef`, anonymous users pass to the downstream gate. |
| `director` (storyboard) | IMPLEMENTED | YES | `lib/chat/filmPipeline.ts` → `planFilmScenes`. Deterministic FNV-1a seed, 5-beat cinematic arc, env-free pure planner. |
| `identity` / `style_images` (continuity lock) | IMPLEMENTED | YES | `buildCharacterAnchor`, `buildStyleGuide`, `normalizeReferenceImages` (1–3 imgs, deduped/capped), `buildFilmClipRequest`. Reference images thread from the composer → orchestrate schema → `metadata.referenceImages`. |
| `video_scenes` (5 clips) | IMPLEMENTED | PARTIAL | `renderClip` × 5 via `Promise.all`. Shared seed, 2-attempt isolated retry per leg (siblings untouched), ordinal stagger (400 ms × ordinal) to avoid bursting Replicate's rate limit on failover. |
| `music` (score) | IMPLEMENTED | PARTIAL | Udio `startUdioGeneration` when keyed; **MusicGen (Replicate) silent-film rescue** in the assemble route so a 30s master is never mute. |
| `editing` (stitch) | IMPLEMENTED | YES | `app/api/video/assemble/route.ts` saga (reserve → dispatch → commit, full compensation). GPU RunPod when configured, else bundled `ffmpeg-static` CPU path — no 503 either way. Idempotency hash, signed-URL re-signing, master stamped to status store. Covered by `saga`, `runpod-adapter`, `ffmpeg-filtergraph` tests. |
| `done` (delivery + recovery) | IMPLEMENTED | YES | `app/api/video/status/[tokenId]/route.ts` + `lib/chat/filmStatusStore.ts`. Phase walks `rendering → ready → assembling → assembled` (`/failed`/`unknown`). Upstash Redis durable + in-process Map fallback; 1-hour TTL; any reload/2nd device recovers the master URL. |

**Readiness reporting** (`lib/chat/filmReadiness.ts` + `app/api/system/film-readiness`):
now covers the **editor/delivery leg** in addition to the four generation
agents, so the report can no longer say "READY" while the master can't be
hosted. 16 dedicated unit tests; verdict is whole-chain (generate → stitch →
deliver).

---

## Frontend Components

| Component | Status | Location |
|-----------|--------|----------|
| Film trigger (`isThirtySecondFilm`) | PRESENT | `lib/chat/filmPipeline.ts`, wired in `lib/chat/providerRouter.ts`; "Produce Film" prompt + button in `MyAvatarChatV2.tsx` |
| Polling loop (handles `film:` union token) | PRESENT (inline) | `MyAvatarChatV2.tsx` ~L1462 — `MAX_POLLS=90` × `2500ms` (~225s window) |
| Progress stepper (`FilmStoryboardSkeleton`) | PRESENT | `MyAvatarChatV2.tsx` L4530 — per-clip preview thumbnails, live % bar, agent dialogue |
| Pipeline telemetry strip (`PipelineTelemetry`) | PRESENT | `MyAvatarChatV2.tsx` L4856 — per-clip state dots with inline `<video>` preview |
| Stitch dispatch + recovery (`assembleFilm`, `fetchAssembledMaster`) | PRESENT | `MyAvatarChatV2.tsx` L823 / L857 — recovers an already-assembled master *before* paying to re-stitch |
| Final player | PRESENT (native) | `<video>` in the Preview Workspace; auto-mounts the master on success |
| `useFilmStream` standalone hook | NOT A SEPARATE FILE | Polling is inlined in `MyAvatarChatV2.tsx`. Functionally complete; extracting to a hook would only improve testability (see Gaps). |
| `FilmProgress.tsx` / `FilmVideoPlayer.tsx` standalone files | NOT SEPARATE FILES | Functionality exists inline (skeleton + telemetry + native player). **No functional gap.** |

No frontend component is missing or stubbed; the "standalone file" rows are
naming/organization observations, not defects.

---

## Env Vars Required to Go Live

| Var (accepted aliases) | Role | Required? |
|------------------------|------|-----------|
| `LTX_VIDEO_API_KEY` (`LTX_API_KEY`, `LTX2_API_KEY`) | LTX director — renders the 5 continuity-locked clips | **HARD** — no clips without it |
| `NEXT_PUBLIC_SUPABASE_URL` (`SUPABASE_URL`) | Supabase project URL — master upload/signing | **HARD** — master can't be hosted without it |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role — Storage write for master upload | **HARD** — same gate |
| `REPLICATE_API_TOKEN` | LTX clip failover **+** MusicGen silent-film score rescue | Recommended |
| `UDIO_API_KEY` (`UDIO_KEY`, `UDIO_API_TOKEN`, …) | Cohesive cinematic score | Optional → MusicGen fallback |
| `ELEVENLABS_API_KEY` (`ELEVEN_API_KEY`, `XI_API_KEY`) | Voiceover / foley | Optional |
| `NANOBANANA_API_KEY` (`GEMINI_API_KEY`) | Storyboard scene enrichment | Optional → deterministic planner fallback |
| `RUNPOD_RENDER_WEBHOOK_URL` + `RUNPOD_RENDER_WEBHOOK_TOKEN` (`RUNPOD_API_TOKEN`) | GPU stitch (60fps interpolation) | Optional → CPU `ffmpeg-static` fallback always available |
| `UPSTASH_REDIS_REST_URL` + `_TOKEN` (`KV_REST_API_URL`/`_TOKEN`) | Durable cross-device film status | Optional → in-process Map fallback (single instance) |

> Hit `GET /api/system/film-readiness` on the live deployment for a per-leg,
> names-only readout of exactly which of these are provisioned.

---

## What Was Fixed This Session

**No code bugs were found, so no code was changed in this audit pass.** The
service was already complete and correct. Concretely this session:

1. Read in full and verified all 7 core/assembly files: `filmPipeline.ts`,
   `filmComposite.ts`, `filmStatusStore.ts`, `filmTaskRef.ts`, `filmReadiness.ts`,
   `orchestrate/route.ts`, `assemble/route.ts`, `assemble/callback/route.ts`,
   `status/[tokenId]/route.ts`, plus the client poll/stitch/recovery loop in
   `MyAvatarChatV2.tsx`.
2. Verified provider clients (LTX via `ServiceManager`, Replicate failover,
   Udio with configurable poll attempts, ElevenLabs, RunPod adapter) all have
   polling, timeouts, and a wired fallback chain.
3. Ran the full gate: `tsc` clean, 498/498 tests, build 349/349 pages.
4. Confirmed `origin/main` already contains the entire film service (HEAD ==
   `origin/main`) — correcting an earlier draft that claimed it was unmerged.
5. Authored this report (`FILM_SERVICE_STATUS.md`).

> The editor/delivery readiness module (`lib/chat/filmReadiness.ts` + test +
> the `film-readiness` route's `editor` section) was added in the immediately
> prior commit `7803925`, which is already on `main`. It is the only recent
> film code change and is covered by 16 passing tests.

---

## Known Remaining Gaps

Honest list — none are code defects in the merged service; they are
operational provisioning items and optional hardening:

1. **Provisioning (operational).** Live end-to-end delivery needs, at minimum,
   `LTX_VIDEO_API_KEY` + `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
   set in Vercel. Without Supabase Storage the stitch runs but the master upload
   fails; the readiness endpoint now reports this explicitly. (Provider keys
   cannot be set from here — they must be added in the Vercel dashboard.)
2. **No durable status without Redis.** With `UPSTASH_REDIS_REST_URL` unset the
   tracker uses a per-instance Map, so cross-device/reload master recovery is
   best-effort until Redis is provisioned. Render itself is unaffected.
3. **Real-time stitch progress needs a pub-sub bridge.** `assemble/callback`
   validates + records RunPod progress events but only fan-outs live if
   `PIPELINE_EVENT_BRIDGE_URL` is set (Upstash REST can't hold a SUBSCRIBE).
   Recovery is already covered by the durable status store + client poll; this
   only affects sub-second live progress dots during the GPU stitch.
4. **Test-coverage thinness on the fan-out.** `handleFilmComposite` and the
   `pollFilmTask` URL-resolution path are integration-covered but lack isolated
   unit tests (they call external services). An injected-`ServiceManager` test
   would close this. Pure planning/codec/status layers are exhaustively tested.
5. **Inline frontend film logic.** The poll/stitch loop lives inside the large
   `MyAvatarChatV2.tsx` rather than a `useFilmStream` hook. Works correctly;
   extraction would improve testability and readability only.
6. **Udio audio latency.** Udio is polled single-tick per cycle, so the audio
   leg may read `pending` for several poll cycles (~20–40s) before resolving —
   expected behavior for the serverless model, not a stall.

**Explicitly out of scope (by instruction):** the BullMQ / ioredis / Railway
worker re-architecture. The service is serverless-native on Vercel; that
rewrite would not run on the platform and would duplicate working code.
