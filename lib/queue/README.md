# lib/queue — Async background render worker

The **Variant-1 asynchronous worker pipeline**: a decoupled `submit → poll/resolve → route` lifecycle
that lifts the **45s browser / serverless-request ceiling** for multi-minute provider renders
(MusicGen, ElevenLabs/TTS, Kling/Hailuo). Additive — no application component imports or mutates.

## Modules
| File | Role | Purity |
|---|---|---|
| `asyncRenderQueue.ts` | The lifecycle **state machine** — job transitions, timeout/retry, `nextAction` scheduler | **Pure** (`now` injected; no I/O) → fully unit-tested |
| `renderProviders.ts` | Provider **adapters** (real Replicate + a deterministic `mockAdapter`) + `verifyReplicateWebhook` (HMAC-signed) | Impure (fetch) |
| `runRenderQueue.ts` | The **worker loop** — drives the state machine against the adapters until terminal or wall-clock budget | Impure; `now`/`sleep` injected |
| `runCommercialRender.ts` | **Integration** — builds the commercial's paid jobs from the blueprint params + routes each delivered asset into its `commercial/` slot | `buildCommercialJobs` pure; runner impure |

## Why a worker loop, not a held-open request
A serverless function can't block for minutes (`maxDuration`). Two correct ways to run this loop:
1. **Vercel cron** — each tick loads the DB-persisted jobs, advances each ONE step (submit or poll),
   persists, returns fast. Jobs complete across many cron ticks. (State-persistence layer TBD — the
   pure core is DB-agnostic; wire `onUpdate` to an upsert.)
2. **A standalone node worker / CI job** — a single long-lived process runs `runRenderQueue` to
   completion. Not subject to serverless limits.

## Webhooks (the safe path)
`verifyReplicateWebhook` HMAC-verifies the svix-style signature **before** trusting a payload, so a
webhook receiver (if mounted) can't be spoofed into ingesting a forged asset. Polling is the default
(no public URL needed); webhooks are an optional acceleration.

## Running the real render
```ts
import { runCommercialRender } from '@/lib/queue/runCommercialRender';
import { writeFile, mkdir } from 'node:fs/promises';
// From a TS-compiling server context (Next route / cron / worker):
await runCommercialRender({
  now: () => Date.now(), sleep: (ms) => new Promise(r => setTimeout(r, ms)),
  route: { fetch, writeFile, mkdir },
});
// → submits music + VO + the 3 AI-GEN video shots, polls to completion, writes assets into slots.
```
**Boundaries (honest):** actually producing assets needs (a) **credits** — the video engine is
credit-gated (402 at 0₾); (b) valid provider **keys** (`REPLICATE_API_TOKEN`, model envs); (c) a
runner context that survives minutes (cron/worker, not a request). The mechanism itself is proven
end-to-end by the jest suite using `mockAdapter` (submit → many polls → asset routed).
