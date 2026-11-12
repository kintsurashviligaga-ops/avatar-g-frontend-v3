# 11 — Truth matrix (v5.1 Phase 0, 2026-11-12)

Base `main` @ `4c502c7`; production READY `970ca60`. Statuses: MISSING · PARTIAL · IMPLEMENTED_UNVERIFIED ·
VERIFIED_STAGING · PROVEN_PRODUCTION · BLOCKED · NOT_APPLICABLE · UNKNOWN. Confidence HIGH = repo + executed
test/runtime evidence; MEDIUM = repo only; LOW = partial; UNKNOWN = none.

Note on PROVEN_PRODUCTION: v5.1 asks for "authorized evidence". The rows marked so rest on recorded owner actions on
myavatar.ge (production-truth matrix 2026-11-06 and later project records), not on a test run in this session. No status
was upgraded today. VERIFIED_STAGING is used nowhere: there is no separate staging environment (Previews share the
production DB).

| Capability | Status | Confidence | Evidence | Test | Limitation | Next action |
|---|---|---|---|---|---|---|
| Production deploy + health | PROVEN_PRODUCTION | HIGH | Vercel `dpl_2vFRByjE` READY `970ca60` | CI green `970ca60` | `4c502c7` was still building | none |
| Vertex-only transport, fail-closed | IMPLEMENTED_UNVERIFIED | HIGH | `lib/ai/google/transport.ts:7,46` | provider-boundary tests in CI | runtime env not read today | keep |
| Chat (Gemini 3.8/3.6 Flash, 3.1 Pro) | PROVEN_PRODUCTION | HIGH | daily owner use; `lib/models/catalog.ts` | CI | 3.5/3.7 Flash in chains deprecated upstream (Dev API) | replace in Phase 2 |
| Gemini 4 Carbon | MISSING | HIGH | 0 repo refs; GA 2026-11-10 (Vertex docs) | N/A | Vertex price not published | founder decision D-06 |
| Gemini 4 Argon | MISSING | HIGH | 0 repo refs; GA 2026-10-13 | N/A | price doubles 2026-12-01; timeout still billed >32K | D-06 |
| Gemini Decision | MISSING | HIGH | 0 refs; Developer API v1beta only | N/A | not on our Vertex transport | D-05 |
| Interactions API use | PARTIAL | MEDIUM | Omni continuation `lib/video/omniClip.ts:169-177` | unit tests | `store` / retention NOT VERIFIED | D-04 |
| Image (gemini-3.1-flash-image) | IMPLEMENTED_UNVERIFIED | MEDIUM | contract PASS #269 | paid contract 2026-11-06 | deprecated on Dev API → Nano Banana 2.1 | plan migration |
| Imagen 4 path | BLOCKED | HIGH | shut down 2026-08-17; 404 on Vertex | — | dead code | remove (approved PR) |
| Veo 3.1 Fast/Standard | PROVEN_PRODUCTION | HIGH | owner E2E 2026-10-26; #269 | paid contract | us-central1 only | none |
| Veo 3.2 ids | UNKNOWN | MEDIUM | `lib/veo/capabilities.ts:198` refs; no official source | N/A | must not be enabled | keep disabled |
| Omni video (Georgian speaking) | PROVEN_PRODUCTION | HIGH | owner scenario 3 + continue 2026-10-26 | unit tests | runs on Vertex **Preview** `gemini-omni-1.1-flash-preview`; 1.2 GA not wired | D-07 |
| Music Lyria 3 (vocals) | IMPLEMENTED_UNVERIFIED | MEDIUM | flag on; no owner listening check | #269 Pro PASS | Lyria 3.5 not wired | owner check |
| Live voice | PROVEN_PRODUCTION | HIGH | owner E2E; relay `gemini-live-2.5-flash-native-audio` | — | allowlist holds ids that shut down 2026-11-17 | clean list |
| Live talking avatar (gemini-3.8-live) | PROVEN_PRODUCTION | HIGH | owner E2E 2026-10-26 14:08Z | — | 1×5 min/day non-admin | none |
| Custom avatar / lip-sync own audio | BLOCKED | HIGH | Google allowlist | — | external | wait on Google |
| Read-aloud TTS | BLOCKED | HIGH | default `gemini-2.5-flash-preview-tts`: 500 ×2 (#269); Dev API shutdown 2026-11-17; not on Vertex endpoint table | paid contract FAIL | user-facing feature degraded | **B-01**, D-02 |
| Mic STT (Chirp 3) | PROVEN_PRODUCTION | HIGH | owner ka/ru/en 2026-11-01 | — | multi-language request 400; Cloud Speech docs not fetched | none |
| Georgian PDF | PROVEN_PRODUCTION | HIGH | DOC-01 2026-10-31 | — | DOCX/XLSX/PPTX missing | backlog |
| Code run (admins) | PROVEN_PRODUCTION | HIGH | CODE-01 2026-11-01 | — | admins only | D-08 |
| Workspace (versioned files) | IMPLEMENTED_UNVERIFIED | MEDIUM | #277 | unit tests | no owner E2E | owner check |
| Browser agent (admins) | IMPLEMENTED_UNVERIFIED | MEDIUM | #278–#286 in prod for admins | unit tests (fake host) | snapshot expiry ~2026-11-13 | **B-04** |
| Agent G on myavatar.ge (site agent) | IMPLEMENTED_UNVERIFIED | MEDIUM | #284/#285 | unit tests | no E2E | owner check |
| Task graph / Work Mode | PARTIAL | MEDIUM | `lib/agent/taskGraph.ts`, offline `workMode.test.ts` | unit | no parallel steps; no prod E2E | Phase 3 |
| Durable runs (lease/CAS/cancel/resume) | IMPLEMENTED_UNVERIFIED | HIGH | `runIsolation.pg.test.ts` | real Postgres CI | — | keep |
| Live timeline (SSE) | IMPLEMENTED_UNVERIFIED | MEDIUM | #272/#275 | tests | owner check pending | owner check |
| MCP client | PARTIAL | HIGH | empty allowlist `lib/agent/mcp/client.ts` | unit | no server allowed | Phase 4 |
| Google Drive connector | PARTIAL | HIGH | link/pick proven desktop; DRIVE-01 not run | — | iPhone Safari 2nd open fails | owner DRIVE-01 |
| Gmail / Calendar | MISSING | HIGH | "soon" in menu | N/A | Google verification | Phase 4 |
| Google Computer Use | MISSING | HIGH | no refs | N/A | separate approval | D-09 |
| Credits ledger (canonical) | PROVEN_PRODUCTION | HIGH | `credit_ledger` present (owner SQL 2026-11-06); reserve/refund in video + Live E2E | SQL + Jest | — | none |
| Legacy credits ledger callers | UNKNOWN | MEDIUM | `lib/billing/enforce.ts:133` + 8 callers | — | whether `public.credits` is live is unknown | **B-02** |
| Debit idempotency / race | IMPLEMENTED_UNVERIFIED | HIGH | `20261002d` unique partial index + catch | SQL tests | — | none |
| Provider cost reconciliation | MISSING | HIGH | estimates only (`costModel.ts`, `unitEconomics.ts`) | N/A | — | Phase 5 |
| Timeout-not-zero-cost handling | MISSING | HIGH | refund-on-miss everywhere | N/A | Vertex bills Argon >32K on timeout from 2026-11-13 | Phase 5 |
| BOG payment | BLOCKED | MEDIUM | routes + `bog_fulfill_order`; signature RSA; idempotent on `bog:<shop_order_id>` | SQL scenarios; sandbox job skips | never run against BOG sandbox | **B-03** |
| Stripe / IAP paths | UNKNOWN | LOW | routes present | — | live status unknown | owner confirm |
| Preview isolation (no paid writes) | IMPLEMENTED_UNVERIFIED | HIGH | `lib/env/previewIsolation` | tests | Previews still read the prod DB | Phase 6 |
| No secrets committed in repo | IMPLEMENTED_UNVERIFIED | MEDIUM | pattern scan 2026-11-12 found only fake PEM fixtures in 3 tests | grep (not a full scanner, history not scanned) | shallow clone | run GitHub secret scanning in Phase 6 |
| Safety identifiers | MISSING | HIGH | 0 refs | N/A | — | Phase 6 |
| Georgian QC corpus (≥20 prompts) | MISSING | HIGH | none found | N/A | — | Phase 7 |
| Antigravity CLI | NOT_APPLICABLE (optional, not installed) | HIGH | `which` empty, no `~/.antigravity` | N/A | — | only on founder OK |
| agy-bridge | NOT_APPLICABLE (not installed) | HIGH | 0 refs | N/A | third-party, untrusted | only on founder OK |
