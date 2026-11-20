# 02 — Architecture and dependencies (v5.1 Phase 0)

Base `main` @ `4c502c7`. Describes the system as it is; no change proposed here (target architecture = Phase 1).

## Current architecture (as built)

```
Browser / iOS (Capacitor)
  └─ Next.js 14 on Vercel (iad1)  ── app/[locale] pages, OmniStudio one-window composer (components/studio/OmniStudio.tsx)
       ├─ app/api/* (513 routes, Node runtime)
       │    ├─ chat: /api/chat/gemini (Vertex Gemini 3.8/3.6/3.1 chains)
       │    ├─ Agent G: /api/agent/run, /api/agent/browser/run, /api/agent/sandbox/run, /api/agent/workspace,
       │    │           /api/agent/site/step, /api/tasks/stream (SSE timeline)
       │    ├─ media: Veo (lib/veo), Omni (lib/video/omniClip), image (lib/ai/geminiImage), Lyria (lib/ai/lyriaMusic),
       │    │         TTS/STT, montage /api/video/assemble
       │    ├─ billing: credits RPCs, BOG checkout/webhook/cron, (legacy Stripe routes still present)
       │    └─ crons (10)
       ├─ Supabase (prod zwksnayknzggdcenqqxy, ap-southeast-1): Postgres + Auth + Storage
       ├─ Google Vertex AI / Agent Platform (WIF OIDC from Vercel preview/production only)
       ├─ GCS (Veo output)
       ├─ Vercel Sandbox (code runs, Chromium browser from snapshot)  – $20 lifetime cap (sandbox_spend)
       └─ Cloud Run live-relay (EU) ⇄ Vertex Live (gemini-live-2.5-flash-native-audio, gemini-3.8-live us-central1)
```

Cross-region note: functions run in `iad1` while the database is in `ap-southeast-1`, so each DB round trip crosses
the Pacific (recorded in the read-aloud work, project memory 2026-11-06).

## Dependencies of note

| Dependency | Version | Note |
|---|---|---|
| `next` / `react` | ^14.2.35 / ^18.3.1 | no upgrade proposed |
| `ai` (Vercel AI SDK) + `@ai-sdk/google` | ^6.0.172 / ^3.0.70 | |
| `@ai-sdk/anthropic`, `@anthropic-ai/sdk`, `openai` | present in `package.json` | non-Google inference SDKs remain installed; runtime refuses them (policy) — removal is a later, approved change |
| `@google-cloud/storage` | ^7.22.0 | GCS |
| `@supabase/ssr`, `@supabase/supabase-js` | ^0.8.0 / ^2.94.1 | |
| `@sentry/nextjs` | ^10.53.1 | |
| `zod` | ^3.22.4 | contracts |
| `@playwright/test` | ^1.58.2 | e2e + in-sandbox driver (`playwright-core`) |
| `jest` | ^30.2.0 | |

No dependency was installed or upgraded. `node_modules` is absent in this container, so no local build/test was run
(installing is forbidden in Phase 0).

## Google dependency boundary

Vertex only (`GEMINI_TRANSPORT` unset/`vertex`). Developer-API-only features (Gemini Decision, `gemini-flash-latest`
aliases, some managed agents) are therefore **not reachable** under today's policy.

## Third-party runtime dependencies

Vercel (hosting, Sandbox), Supabase, Google Cloud, Bank of Georgia, Sentry, Pexels (montage stock footage, #265), Google
Drive OAuth/Picker. Legacy vendors (Replicate, ElevenLabs, HeyGen, Udio, Kling, Runway, LTX, OpenAI) are code-refused;
their keys were cleared in Vercel on 2026-11-06 (names may remain).
