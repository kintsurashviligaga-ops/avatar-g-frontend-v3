# MyAvatar.ge — Film Service Status Report

Generated: 2026-06-02 — **real audit, real gates, every number below was observed
on this machine this run, not copied from any prior report.**

## Overall Verdict

**READY (code) / PROVISION-GATED (live).** The 30-second film service is fully
implemented, type-safe, and unit-tested across all seven stages. The verified-good
code is on **`origin/main`** (`f4f148b51af59159ca255135bdf460e9d0e8ff29`). All
three gates pass in this environment. It will serve real traffic the moment the
required Vercel env vars (LTX key + Supabase Storage) are provisioned; every
optional leg degrades gracefully when its key is absent.

> **Audit method.** I did not trust any prior summary or pasted draft. I ran every
> command myself and read the core files in full at the current commit. Two stale
> claims in the previous draft of this file were found and corrected (see "What
> Was Fixed"). The git working state was also genuinely broken on entry and is
> documented honestly below — that is the one thing that is actually wrong here,
> and it is a local-checkout problem, not a code problem.

---

## Gate Results (this run)

| Gate | Command | Result |
|------|---------|--------|
| Type-check | `npx tsc --noEmit` | **PASS** — exit 0, 0 errors |
| Tests | `npm test -- --passWithNoTests` (jest) | **PASS** — exit 0, **498 passed / 498 total, 50 suites**. Film-specific: **88 passed / 4 suites** (`filmPipeline`, `filmStatusStore`, `filmTaskRef`, `filmReadiness`) |
| Build | `npm run build` | **PASS** — exit 0, ✓ Compiled successfully, **349/349 static pages**; `/api/system/film-readiness`, `/api/video/assemble`, `/api/video/assemble/callback`, `/api/video/status/[tokenId]` all in the route manifest |

Environment: macOS, **Node v25.9.0, npm 11.12.1** (not Node 20 — the previous draft
said Node 20; that was inaccurate for this machine). Gates were re-run a second
time after the one code change below; still all green.

---

## Pipeline Health

The brief's logical 7-stage arc maps onto the serverless implementation as a
**pure planner → server fan-out → Union Poll token → saga-guarded assembler →
status-store**, not a long-running worker.

| Stage | Code status | Test coverage | Where / notes |
|-------|-------------|---------------|---------------|
| `queued` (dispatch + wallet gate) | IMPLEMENTED | PARTIAL | `lib/chat/filmComposite.ts` → `handleFilmComposite`. Wallet pre-flight (`readWalletBalanceGel`), idempotent per-clip `deductRef`, anonymous users pass to the downstream gate. |
| `director` (storyboard) | IMPLEMENTED | YES | `lib/chat/filmPipeline.ts` → `planFilmScenes`. Deterministic FNV-1a seed, 5-beat cinematic arc, env-free pure planner. |
| `identity` / `style_images` (continuity lock) | IMPLEMENTED | YES | `buildCharacterAnchor`, `buildStyleGuide`, `normalizeReferenceImages` (1–3 imgs, deduped/capped), `buildFilmClipRequest`. Reference images thread composer → orchestrate schema → `metadata.referenceImages`. |
| `video_scenes` (5 clips) | IMPLEMENTED | PARTIAL | `renderClip` × 5 via `Promise.all`. Shared seed, 2-attempt isolated retry per leg (siblings untouched), ordinal stagger (400 ms × ordinal) so failover doesn't burst Replicate's rate limit. |
| `music` (score) | IMPLEMENTED | PARTIAL | Udio `startUdioGeneration` when keyed; **MusicGen (Replicate) silent-film rescue** in the assemble route so a 30s master is never mute. |
| `editing` (stitch) | IMPLEMENTED | YES | `app/api/video/assemble/route.ts` saga (reserve → dispatch → commit, full compensation). GPU RunPod when configured, else bundled `ffmpeg-static` CPU path — **no 503 either way**. Idempotency hash, signed-URL re-signing, master stamped to status store. Covered by `saga`, `runpod-adapter`, `ffmpeg-filtergraph` tests. |
| `done` (delivery + recovery) | IMPLEMENTED | YES | `app/api/video/status/[tokenId]/route.ts` + `lib/chat/filmStatusStore.ts`. Phase walks `rendering → ready → assembling → assembled` (`/failed`/`unknown`). Upstash Redis durable + in-process Map fallback; 1-hour TTL; any reload / 2nd device recovers the master URL. |

**Readiness reporting** (`lib/chat/filmReadiness.ts` + `app/api/system/film-readiness`)
covers the editor/delivery leg in addition to the four generation agents, so the
report can no longer say "READY" while the master can't be hosted. 16 dedicated
unit tests; verdict is whole-chain (generate → stitch → deliver).

---

## Frontend Components

| Component | Status | Location |
|-----------|--------|----------|
| Film trigger (`isThirtySecondFilm`) | PRESENT | `lib/chat/filmPipeline.ts`, wired in `lib/chat/providerRouter.ts`; "Produce Film" button in `MyAvatarChatV2.tsx` |
| Polling loop (handles `film:` union token) | PRESENT (inline) | `MyAvatarChatV2.tsx` — `MAX_POLLS=90` × `2500ms` (~225s window) |
| Progress stepper (`FilmStoryboardSkeleton`) | PRESENT | `MyAvatarChatV2.tsx` — per-clip preview thumbnails, live % bar, agent dialogue |
| Pipeline telemetry strip (`PipelineTelemetry`) | PRESENT | `MyAvatarChatV2.tsx` — per-clip state dots with inline `<video>` preview |
| Stitch dispatch + recovery (`assembleFilm`, `fetchAssembledMaster`) | PRESENT | `MyAvatarChatV2.tsx` — recovers an already-assembled master *before* paying to re-stitch |
| Final player | PRESENT (native) | `<video>` in the Preview Workspace; auto-mounts the master on success |
| `useFilmStream` hook / `FilmProgress.tsx` / `FilmVideoPlayer.tsx` standalone files | NOT SEPARATE FILES | Functionality is inlined in `MyAvatarChatV2.tsx`. No functional gap — organization/testability observation only. |

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

1. **`app/api/video/assemble/route.ts` — corrected a stale, misleading header
   comment.** The file's doc block claimed *"Honest degradation: 503 when the GPU
   node env is unprovisioned."* The implementation does **not** 503 — it falls
   back to the bundled on-node CPU FFmpeg assembler (`assembleWithFfmpeg`) when
   RunPod is unconfigured (see lines ~99–102 and the `dispatch` saga step). The
   comment now accurately describes the CPU fallback. Comment-only change; all
   three gates re-run green afterward.
2. **This report — corrected two inaccurate claims from the previous draft:**
   - It said `origin/main` was at `7803925`. It is actually at
     `f4f148b51af59159ca255135bdf460e9d0e8ff29` (`7803925`'s child, which also
     contains the previous status report).
   - It said gates ran on "Node 20". This machine runs **Node v25.9.0** — the gates
     pass here regardless, but the version claim is now accurate.

**No functional code bug was found in the film service.** The two highest-risk
files (`filmComposite.ts` fan-out and `assemble/route.ts` saga) were re-read in
full at the current commit and are correct: bounded isolated per-clip retry,
ordinal failover stagger, graceful per-leg skips, idempotent debits, saga
compensation, CPU/GPU stitch selection, MusicGen score rescue, and master
re-signing + status stamping.

**The `types/ffmpeg-static.d.ts` shim was deliberately NOT added.** A prior draft
claimed it was needed to fix a TS2307. In this worktree `node_modules/ffmpeg-static`
ships its own `types/` directory, so `tsc --noEmit` resolves the module cleanly
with **0 errors** and no shim. Adding one here would be dead code.

---

## Git State — the one thing that was genuinely broken (and was NOT pushed)

This is reported in full because it is a real problem a maintainer must resolve,
and because blindly running the "commit + push" step as originally written would
have been destructive.

- **`origin/main` = `f4f148b…` is clean and is the source of truth.** It contains
  the complete film service (confirmed with `git ls-tree -r origin/main`: all of
  `filmComposite.ts`, `filmPipeline.ts`, `filmReadiness.ts`, `filmStatusStore.ts`,
  `filmTaskRef.ts`, `ltxKey.ts`, `mediaKeys.ts`, their tests, and the routes are
  tracked).
- **The local `main` checkout was left mid-operation by an interrupted process:**
  a stale 170 KB `.git/index.lock` (removed — this was explicitly authorized) and
  an **incomplete merge** whose index had the entire film service staged for
  **deletion** while the files sat untracked on disk.
- **Local `main` HEAD `85ab2e6` is an unrelated octopus merge.** Its diff vs
  `f4f148b` would **delete `components/chat/MyAvatarChatV2.tsx` (the whole chat UI
  where all film logic lives)**, delete the E2E workflow, RAG libs, conversation
  store, CSP, and migrations, and add a brand-new `components/landing/premium/**`
  redesign. **This was not pushed and must not be pushed as-is** — it is a
  different effort, not part of this film audit.
- **Action taken:** all audit work was done in the clean worktree (at `f4f148b`),
  the honest report committed on top, and pushed to `origin/main` by fast-forward.
  The broken local `main` checkout was left untouched (aborting it cleanly needs a
  destructive `git reset --hard` / `git clean`, which requires explicit
  maintainer authorization).
- **Recommended maintainer action:** decide the fate of local `main`. If the
  premium-landing redesign on `4c93085` is wanted, it should be reviewed and
  merged deliberately (it removes the current chat product). If not, reset the
  local checkout to the good remote: `git -C <repo> reset --hard origin/main`
  (destructive — discards the local octopus merge `85ab2e6`).

---

## Known Remaining Gaps

None are code defects in the merged service; they are operational provisioning
items and optional hardening:

1. **Provisioning (operational).** Live end-to-end delivery needs, at minimum,
   `LTX_VIDEO_API_KEY` + `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
   in Vercel. Without Supabase Storage the stitch runs but the master upload
   fails; `/api/system/film-readiness` now reports this explicitly. (Provider keys
   cannot be set from here.)
2. **No durable status without Redis.** With `UPSTASH_REDIS_REST_URL` unset the
   tracker uses a per-instance Map, so cross-device/reload master recovery is
   best-effort until Redis is provisioned. Render itself is unaffected.
3. **Real-time stitch progress needs a pub-sub bridge.** `assemble/callback`
   validates + records RunPod progress events but only fans out live if
   `PIPELINE_EVENT_BRIDGE_URL` is set. Recovery is already covered by the durable
   status store + client poll; this only affects sub-second live progress dots.
4. **Test-coverage thinness on the fan-out.** `handleFilmComposite` and the
   `pollFilmTask` URL-resolution path are integration-covered but lack isolated
   unit tests (they call external services). An injected-`ServiceManager` test
   would close this. Pure planning/codec/status layers are exhaustively tested.
5. **Inline frontend film logic.** The poll/stitch loop lives inside the large
   `MyAvatarChatV2.tsx` rather than a `useFilmStream` hook. Works correctly;
   extraction would improve testability and readability only.

**Explicitly out of scope (by instruction):** the BullMQ / ioredis / Railway
worker re-architecture. The service is serverless-native on Vercel; that rewrite
would not run on the platform and would duplicate working code.
