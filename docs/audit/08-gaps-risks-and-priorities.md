# 08 — Gaps, risks and priorities (v5.1 Phase 0)

Ranked by impact × urgency. Dates are 2026 unless stated. Blockers are in `docs/execution/BLOCKERS.md`.

## P0 — this week

| # | Risk / gap | Why now | Evidence |
|---|---|---|---|
| 1 | Read-aloud default TTS model `gemini-2.5-flash-preview-tts` fails (500 ×2), is not on the Vertex endpoint table, and its Developer-API id shuts down **2026-11-17** | user-facing; 5 days | `04` §4, #269 |
| 2 | Browser snapshot `BROWSER_SNAPSHOT_ID` expires ~**2026-11-13** → admin browser agent stops | 1 day | project record, `scripts/agent-browser-snapshot.sh` |
| 3 | Allowlists still name Live/TTS ids that shut down 2026-11-17 (`gemini-3.1-flash-live-preview`, `gemini-2.5-flash-native-audio-preview-12-2025`, `gemini-3.1-flash-tts-preview`) | owner trial switches could pick a dead id | `lib/ai/google/models.ts:94-108` |

## P1 — before any new paid feature

| # | Risk / gap | Evidence |
|---|---|---|
| 4 | Two credit ledgers: 8 entries still use legacy `public.credits` / `deduct_credits_transaction` | `06` §1 |
| 5 | Google promo prices end: Argon 2026-11-30 (→ ×2), Gemini 3.8/3.6 Flash and 3.8 TTS 2026-12-31 (→ ×2). Credit prices built on promo rates lose margin | Vertex pricing |
| 6 | Timeout ≠ zero cost for Gemini 4 long decodes (from 2026-11-13); refund-on-miss loses money | `04` §6 |
| 7 | No reconciliation with Google billing | `06` §3 |
| 8 | Interactions API stores by default (55 days paid); private Omni prompts/media may be retained | `04` §7 |
| 9 | Omni runs on a Vertex Preview id; 1.2 Flash GA (15 s, cheaper per Google) | `04` §9 |
| 10 | `gemini-3.1-flash-image` deprecated on Dev API, replacement Nano Banana 2.1 (cheaper on Vertex: $0.034 vs $0.067 per 1K) | `04` §4 |
| 11 | BOG never sandbox-certified | `06` §4 |

## P2 — hygiene and readiness

12. Dead model paths (Imagen 4/3, Gemini 2.0, Veo `-preview`, Veo 3.2 without source, `gemini-*-latest` aliases on Vertex).
13. ~60 routes import refused vendor clients; non-Google SDKs (`openai`, `@anthropic-ai/sdk`, `@ai-sdk/anthropic`) still in `package.json`.
14. Preview deployments share the production DB (reads not isolated).
15. Browser policy is a deny-list, not a domain allow-list; no safety identifiers; no AI-content disclosure label.
16. No Georgian QC corpus; Agent G browser/site/Work Mode lack production E2E records.
17. Catalog still shows some refused services as live/beta.
18. `iad1` functions ↔ `ap-southeast-1` database latency.

## Existing functionality to preserve (do not rewrite)

Vertex-only transport and fail-closed refusal; canonical ledger with ref-idempotent debits/refunds; quote → approve →
reserve → refund-on-miss; BOG RSA signature + idempotent fulfil; Preview paid-write block; Veo 3.1 and Omni video
flows incl. „გააგრძელე" multi-turn continue; Live voice + talking avatar via EU relay; Chirp 3 mic; Georgian PDF;
Library; code-run sandbox with $20 cap; workspace versions; SSE timeline; Drive `drive.file` connector; ADK pilot isolation.

## Complexity estimates (assumptions: one engineer-agent, CI green, owner available for cards)

| Item | Size | Assumption |
|---|---|---|
| TTS default → `gemini-3.8-flash-tts` (+ verbatim mode already coded) | S (≤1 day) + 1 paid probe (~$0.05) | 3.8 TTS GA on Vertex global; Georgian quality must be owner-checked |
| Snapshot remake | XS | script exists; needs owner OK (Vercel write) |
| Prune dead ids from allowlists/catalog | S | no behaviour change for default paths |
| Legacy ledger retirement | M–L (3–5 days) | needs owner-run read-only SQL first (`docs/ledger-unification/01_introspect.sql`) |
| Versioned pricing + promo end dates | M | pricing source is `lib/billing/pricingConfig*` |
| Timeout-cost + reconciliation (Cloud Billing export) | L | needs BigQuery billing export enabled (owner) |
| Omni 1.2 migration | M + paid test (~$2) | Interactions-only API like 1.1 |
| Nano Banana 2.1 migration | S–M + paid test | — |
| BOG sandbox certification | M | BOG sandbox credentials from owner |
| Gemini 4 Argon/Carbon for Agent G planning | M | Carbon Vertex price unknown; sampling params ignored |
