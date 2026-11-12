# 01 — Current architecture (as built, 2026-11-12)

Source: Phase 0 audit `docs/audit/02`, `05`, `06`, `10` on `main` @ `4c502c7`, plus the same-day P0 changes (#288, #289,
snapshot). Production READY on `970ca60` at audit time.

```mermaid
flowchart LR
  subgraph Client["Browser / iOS (Capacitor)"]
    OS["OmniStudio one-window composer\ncomponents/studio/OmniStudio.tsx"]
    TL["Live timeline card (SSE)\nAutoTaskCard · AgentScreenPanel"]
    LV["Live call UI\ncomponents/voice/live"]
  end

  subgraph Vercel["Vercel · Next.js 14 · iad1 · 513 API routes"]
    CHAT["/api/chat/gemini\nFlash · Lite · Pro chains"]
    AG["Agent G\n/api/agent/run · approvals · proposals\nlib/agent/{intent,taskGraph,task/autoTask,react}"]
    MEDIA["Media routes\nVeo · Omni · image · Lyria · montage"]
    SPEECH["Speech\n/api/tts/gemini · /api/voice/transcribe"]
    EXEC["Execution\n/api/agent/sandbox/run · /api/agent/browser/run\n/api/agent/workspace · /api/agent/site/step"]
    BILL["Billing\ncredits RPCs (canonical) · lib/billing/enforce (LEGACY)\nBOG checkout/webhook/cron · Stripe routes (status UNKNOWN)"]
    SSE["/api/tasks/stream (SSE)"]
    CRON["10 crons"]
  end

  subgraph Supabase["Supabase prod zwksnayknzggdcenqqxy · ap-southeast-1"]
    PG[("Postgres\ncredit_ledger · profiles.credits_balance\npublic.credits (legacy, live? UNKNOWN)\nrequest_idempotency · sandbox_spend\ngeneration_jobs · chat_messages · bog_*")]
    ST[("Storage\nrenders · workspace (10 versions)")]
    AU["Auth"]
  end

  subgraph Google["Google Cloud · project gen-lang-client-…"]
    VX["Vertex AI / Agent Platform\ngenerateContent · predict(LRO) · Interactions\n(WIF OIDC from Vercel preview/production only)"]
    CS["Cloud Speech (Chirp 3) · Cloud TTS"]
    GCS[("GCS: Veo output")]
    RUN["Cloud Run live-relay (EU)\nmin-instances 1"]
    VL["Vertex Live\n2.5 native-audio (retires 2026-12-13)\n3.8 Live (us-central1)"]
  end

  subgraph VSB["Vercel Sandbox (iad1)"]
    PY["Python / Node runs\n1 vCPU · deny-all · $20 lifetime cap"]
    BR["Chromium from snapshot\nsnap_8jPI… (expires 2026-12-12)\npublic hosts, private/metadata denied"]
  end

  BOG["Bank of Georgia\n(checkout admin-only, never sandbox-certified)"]
  DRV["Google Drive (drive.file picker)"]

  OS --> CHAT & AG & MEDIA & SPEECH
  TL <-- SSE
  LV <--> RUN <--> VL
  CHAT & AG & MEDIA & SPEECH --> VX
  SPEECH --> CS
  MEDIA --> GCS
  AG --> EXEC
  EXEC --> PY & BR
  AG & MEDIA & SPEECH & EXEC --> BILL
  BILL --> PG
  BILL <--> BOG
  AG --> DRV
  CHAT & AG & MEDIA --> PG & ST
  CRON --> PG
```

## What the picture means

- **One app, one database, one Google project.** Previews share the production database and wallet; paid writes are
  blocked on Previews by `lib/env/previewIsolation`. There is no staging database.
- **Model choice lives in code constants** (`lib/ai/google/models.ts`, `lib/models/catalog.ts`) plus env overrides.
  Nothing reads Google's lifecycle dates; the 3.6 Flash retirement was found by a person reading the page (`13`).
- **Two capability lists exist** and neither is fed by Google: `lib/agent/capabilities.ts` (what Agent G can do, routes,
  pricing key, approval, proof label) and `lib/models/catalog.ts` (model ids, enabled, notes).
- **Two ledgers exist.** Canonical `credit_ledger` (+ trigger to `profiles.credits_balance`, idempotent `ref`) serves
  media, Live and Agent G. Legacy `public.credits` via `lib/billing/enforce.ts` serves 8 entries (B-02, untouched until
  GG's introspection result).
- **Agent G** = intent → task graph → autoTask loop (plan → run → observe, 5 rounds / 10 min) → tool cards with quote →
  Start (approval recorded per run, `lib/agent/approval.ts`) → reserve → execute → Library. Steps run one at a time.
- **Cost truth** = our estimates (`lib/services/billing/costModel.ts`, `lib/credits/unitEconomics.ts`); no Cloud Billing
  export is read; refund-on-miss assumes a failed call costs nothing.
- **Cross-region**: functions in `iad1`, database in `ap-southeast-1`; every DB round trip crosses the Pacific.

## Status of the main parts (truth vocabulary)

| Part | Status | Evidence |
|---|---|---|
| Chat, Veo/Omni video, Live + talking avatar, Chirp mic, Georgian PDF, code run (admins) | PROVEN_PRODUCTION | `docs/audit/11` |
| Read-aloud | BLOCKED → fix in #288, Georgian probe pending (plan-3) | #269, #288 |
| Browser agent, site agent, workspace | IMPLEMENTED_UNVERIFIED (admins) | `docs/audit/05` |
| Parallel DAG, approval center, reconciliation, staging DB, Computer Use | MISSING | `docs/audit/10` |
| BOG payments | BLOCKED (B-03) | `docs/audit/06` |
