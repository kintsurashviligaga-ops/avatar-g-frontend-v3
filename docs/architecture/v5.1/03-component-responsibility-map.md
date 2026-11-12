# 03 — Component responsibility map

One owner per responsibility. "Existing" = where it lives today; "Target" = where it should live after the migration.
Nothing is moved in Phase 1.

| Component | Owns | Must not | Existing code | Target |
|---|---|---|---|---|
| API edge | auth, rate limit, request id, typed error envelope, preview isolation | call providers, write ledger | per-route (`lib/api/rate-limit`, `lib/supabase/server`, `lib/env/previewIsolation`) | shared wrapper `lib/api/edge.ts` used by every paid route |
| Capability registry | which capabilities exist, their models, surface, region, lifecycle, entitlement, price version, audience flag, proof status | execute anything | `lib/agent/capabilities.ts`, `lib/models/catalog.ts`, `lib/catalog/services.ts` | `lib/capabilities/registry.ts` + `capability_state` table (`04`) |
| Model router | pick the model for a capability and tier; step down on retire/404/429 | hard-code ids | `lib/ai/google/models.ts` chains, `chatModelChain`, `sttModel`, `ttsModel` | `lib/capabilities/router.ts` reading the registry; `models.ts` becomes seed data |
| Google adapters | wire format per surface, auth (WIF), retries allowed by the contract, usage extraction | decide price or approval | `lib/ai/google/{transport,provider}`, `lib/veo`, `lib/video/omniClip`, `lib/ai/lyriaMusic`, `app/api/tts/gemini`, `lib/voice-v2v/*` | same files behind one `GoogleAdapter` interface with a typed `ProviderResult {usage, billedOnFailure}` |
| Agent G planner | intent → plan (DAG of steps with tools, inputs, estimated cost) | spend, call tools | `lib/agent/intent`, `taskGraph.ts`, `task/autoTask`, `react/*` | `lib/agent/engine/planner.ts` |
| Agent G engine | run DAG, parallel workers, checkpoints, pause/resume/cancel, bounded recovery, timeline events | approve on the user's behalf | `lib/agent/run/*`, `taskGraphStore`, durable runs (`runIsolation`) | `lib/agent/engine/{executor,checkpoint}.ts` + `runs`, `run_steps` tables |
| Approval service | record one yes per scope; bind quote ↔ approval ↔ reservation; expiry; revoke | price anything | `lib/agent/approval.ts`, `app/api/agent/approvals`, quote tokens (`lib/agent/media/quoteToken.ts`) | `approvals` table + `/api/approvals` + Approval center UI |
| Ledger service | quote, reserve, settle, refund, reconcile; price versions | call providers | `lib/orchestrator/ledger.ts` (canonical), `lib/billing/enforce.ts` (legacy), `sandbox_spend` | `lib/ledger/*` only; legacy retired (B-02) |
| Tool workers | sandboxed execution (code, browser), workspace files, Library delivery, Drive | hold secrets or user tokens beyond the task | `lib/agent/sandbox`, `lib/agent/browser`, `lib/agent/workspace`, `lib/agent/site`, Drive connector | same, each with a declared scope (`07`) |
| Live relay | WebSocket bridge browser ⇄ Vertex Live, session caps | bill (the app books) | `services/live-relay` (Cloud Run EU) | same; model from registry (3.8 Live after 2.5 retires) |
| BOG integration | checkout, callback verification, order fulfilment, reconciliation cron | grant credits outside `bog_fulfill_order` | `app/api/billing/bog/*`, `20261002a_bog_billing.sql` | same; sandbox-certified in Phase 5 |
| Observability | traces, cost labels on every Google call, alerts on spend, error rates, retirement alarms | contain personal data | Sentry, `lib/observability/agentTrace.ts`, Server-Timing for trials | + Vertex request labels `ma_feature`, `ma_run`; spend alarms |
| Scheduled jobs | lifecycle sync, entitlement probe, reconciliation, retention purge, snapshot refresh | change prices automatically | 10 Vercel crons | + 5 jobs, each idempotent and read-mostly |
| Library / artifacts | final files, signed links, history | — | `generation_jobs`, `renders` bucket, workspace bucket | + artifact manifest per run |
