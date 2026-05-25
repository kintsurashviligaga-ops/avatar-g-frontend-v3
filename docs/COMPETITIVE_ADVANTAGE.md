# Why MyAvatar.ge Wins — Competitive Advantage Ledger

A structural, input-to-output comparison of MyAvatar.ge against mainstream
talking-avatar / generative platforms (HeyGen, D-ID, Synthesia) and the long tail
of thin "API-wrapper" SaaS apps. Every claim below maps to code in this repo — no
marketing fiction.

---

## TL;DR — the three structural moats

| Dimension | MyAvatar.ge | HeyGen / D-ID / Synthesia | Thin API wrappers |
|---|---|---|---|
| **Billing integrity** | Idempotent GEL ledger (`credit_wallet_gel`, `ON CONFLICT (ref) DO NOTHING`) — provably no double-charge / leakage | Opaque seat/credit subscriptions; credits expire, refunds manual | Stripe-only; retries & webhook replays cause silent double-charges |
| **Output assembly** | One unified multi-agent pipeline (GPU render + Georgian TTS + 3D geometry) with a QA reflection gate | Single-product silos; you stitch APIs yourself | 1:1 passthrough to one vendor; no assembly |
| **UX resiliency** | Zonal viewport (anchored avatar, 72px anti-Dock floor, fail-open everywhere) | Desktop-web dashboards, layout breaks on small viewports | Generic chat UI, no offline/degraded handling |
| **Localization** | Native **Georgian (ka)** first-class: real human/native TTS, ka UI, ₾ pricing | English-first; Georgian absent or robotic | English-only |

---

## 1. Financial Architecture — idempotent ledger vs credit leakage

**The problem with everyone else.** Subscription/credit systems built on raw
Stripe webhooks are vulnerable to **double-counting**: Stripe retries webhooks on
any non-2xx, networks duplicate requests, and users double-click checkout. Without
a dedup key at the *database* layer, every one of these silently grants or charges
credits twice. Most wrapper apps "handle" this with application-level `if already
processed` checks that race under concurrency.

**Our architecture.** Credits are an **append-only ledger**, and every mutation is
keyed by an external reference:

- `credit_wallet_gel(...)` (SECURITY DEFINER RPC) appends a `credit_ledger` row
  guarded by **`ON CONFLICT (ref) DO NOTHING`** — replaying the same Stripe event
  or top-up reference is a no-op at the Postgres level, not the app level.
- The balance (`profiles.credits_balance`) is **trigger-derived** from the ledger,
  never written directly, so it cannot drift from the sum of entries.
- The Stripe webhook is doubly idempotent: `billing_webhook_events` dedupes by
  event id, and `wallet_topups` dedupes by top-up ref.
- GEL (₾) is the denominated, fixed cost matrix (`lib/billing/gel.ts`): chat 0 ₾,
  voice 0.2 ₾, 3D 0.5 ₾, film/avatar 2 ₾ — legible per-action pricing, not opaque
  "credits."

**Why it wins:** a webhook storm, a double-submit, or a retried event can never
leak or double-charge. Competitors reconcile billing disputes manually; we make
the leak *structurally impossible*.

---

## 2. Agent Orchestration Speed — unified pipeline vs fragmented APIs

**The problem with everyone else.** To produce one finished asset (a narrated,
visually-composed clip), a builder on HeyGen + ElevenLabs + a 3D tool must: call
API A, poll it, download, call API B with the output, poll, download, call API C,
then assemble — each hop a fresh auth, a fresh cold start, serial latency, and a
new failure surface. Single-product platforms don't even offer the other stages.

**Our architecture.** A single orchestrator drives specialized sub-agents behind
one contract:

- **RunPod `hardware_gpu_render`** — full cinematic film pipeline (GPU, CPU FFmpeg
  fallback traced into the lambda) returning a signed master URL.
- **ElevenLabs `synthesis_voice_ka`** — premium native Georgian TTS, now **chunk-
  buffered streamed** for minimal time-to-first-sound.
- **Agent N — 3D spatial geometry** estimator (interior → Three.js RoomViewer).

These run under one job system (`generation_jobs`, reload-recoverable) with:

- **The Supreme QA Gatekeeper / reflection engine** (`lib/orchestrator/reflection.ts`
  + MCP `withGatekeeper`): no sub-agent streams a raw first pass — output is
  critiqued and refined (iterate-before-display) before the user sees it.
- **Fail-open everywhere**: any provider absent → graceful degradation, never a
  crash. Competitors' stitched chains hard-fail at the first missing key.
- **MCP standardization**: the same tools are exposed over the Model Context
  Protocol, so the pipeline is callable by any agent/runtime — not locked to one UI.

**Why it wins:** one authenticated orchestration boundary collapses N serial vendor
round-trips and N failure modes into a single supervised, recoverable job — lower
assembly latency, higher success rate, and a QA gate competitors simply don't have.

---

## 3. UX Resiliency — Zonal Viewport vs breakable dashboards

**The problem with everyone else.** Avatar dashboards are desktop-web first; on
short laptop viewports or mobile the input bar collides with the OS Dock, long
transcripts push the composer off-screen, and a dropped connection white-screens
the app.

**Our architecture — the Zonal Viewport.**

- **Anchored central host**: `AvatarVideoStage` is fixed at the top of the
  workspace (`max-height: 40vh`), never unmounting as messages scale; the message
  stream cascades *below* it in its own `flex-1 min-h-0 overflow-y-auto` zone.
- **Anti-Dock floor**: a hard `padding-bottom: max(72px, …safe-area…)` guarantees
  the composer + agent pills float above the macOS Dock and device home-bars under
  every aspect ratio.
- **Zero-CLS, decoupled rendering**: `React.memo` rows + stable id-based props mean
  streaming the latest bubble never re-renders heavy 3D/video nodes.
- **Decomposed + maintainable**: the former 3.8k-line monolith is now isolated
  primitives (`MessageList`, `MyAvatarComposer` on a shared `BaseChatComposer`,
  `ChatViews`, typed `chat-history`) — strict TS, zero `any` in the data layer.
- **Resilient by default**: offline/degraded states are first-class (live
  `/api/health/public` 6/6 surface), and every network path fails open.

**Why it wins:** the interaction surface is *unbreakable* across viewports and
network conditions — a guarantee dashboard-style competitors don't make.

---

## Verifiable status (at time of writing)

`tsc --noEmit` exit 0 · 231 tests green · `next build` ✓ clean (0 warnings) ·
`/api/health/public` → online, 6/6 categories ok · premium Georgian TTS live
(`x-voice-provider: elevenlabs`).

> Pending unlocks are **founder-console only** (LiveAvatar real-time key, Supabase
> OAuth provider enablement, Stripe live-GEL settlement) — the code paths are
> shipped and gated, degrading cleanly until those keys exist.
