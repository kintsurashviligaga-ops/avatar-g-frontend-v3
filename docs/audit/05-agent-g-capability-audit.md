# 05 — Agent G capability audit (v5.1 Phase 0)

Base `main` @ `4c502c7`. Classes: UI-only · mocked · partial · backend-implemented · locally tested · staging-verified ·
production-proven. "Locally tested" here means Jest/CI tests exist and CI is green on `970ca60` (2026-11-07); no test was
run in this session. A request path was traced in code only (no paid call).

| Capability | Class | Evidence |
|---|---|---|
| Georgian / English / Russian conversation | production-proven | chat + Live in daily owner use; `messages/{ka,en,ru}.json`; reply-language fixes #205/#217 |
| Intent classification | backend-implemented, locally tested | `lib/agentg/intent-parser.ts` (Gemini Flash), `lib/agent/browser/openSiteAsk`, OmniStudio siteAsk routing (#285) |
| Planning / task decomposition | backend-implemented, locally tested | `lib/agent/taskGraph.ts` (172 lines) + `taskGraphStore.ts`, `lib/agent/task/autoTask` (plan → run → observe, 5 rounds / 10 min) |
| Capability lookup | backend-implemented | `lib/agent/capabilities.ts`, `lib/catalog/services.ts` |
| Model / tool selection | backend-implemented | `lib/agent/tools/registry.ts` (effects incl. `versioned`), `lib/ai/google/models.ts` chains |
| Permission validation | backend-implemented, locally tested | flags `AGENT_G_SANDBOX=admin`, `BROWSER_ENABLED`, `CONNECTORS_DRIVE=admin`; site agent Allow/No dialog for ✦/delete/send |
| Multi-step execution | partial (production for admins, not proven end-to-end) | autoTask loop; Work Mode test `lib/agent/workMode.test.ts` is offline |
| Parallel execution | MISSING (no evidence of concurrent step execution in the task graph) | `taskGraph.ts` |
| Checkpoints | partial | task graph JSON in workspace (`tasks/<id>.json`); durable runs with leases/CAS (`runIsolation.pg.test.ts`) |
| Pause / resume | partial | durable run resume (isolation test); no user-facing pause for browser tasks |
| Cancellation | partial | durable run cancel; browser task bounded by time/rounds |
| Retry / bounded recovery | partial | bounded rounds; upload 429 retry (#262) |
| Quote generation | production-proven (code run, Live picture) | `lib/agent/sandbox/codeQuote.ts`, `lib/agent/browser/quote.ts`; CODE-01, Live „კი" 5 credits |
| Approval enforcement | production-proven for code run / Live; implemented for site agent | quote → Start; Allow dialog |
| Credit reservation | production-proven (media), implemented (sandbox $20 cap) | `lib/orchestrator/ledger.ts`, `reserve_sandbox_spend` |
| Settlement | partial | `settle_sandbox_spend`, refund on miss; no provider-side reconciliation (no billing export read) |
| Browser execution | backend-implemented, in prod for admins, not proven | `lib/agent/browser/*`, Vercel Sandbox Chromium snapshot; policy denies private/metadata subnets |
| Python execution | production-proven (admins) | CODE-01 |
| Node.js execution | backend-implemented (same runner) | `lib/agent/sandbox/runner.ts` |
| MCP integrations | partial — client with **empty allowlist** | `lib/agent/mcp/client.ts` (#279); MyAvatar MCP server `apps/myavatar-mcp-server` not deployed; draft #257 not merged |
| Artifact storage | production-proven | Library (PDF, media), workspace bucket with 10 versions (`lib/agent/workspace/store.ts`) |
| Quality control | partial | vision quality gate for video; no Georgian QC corpus |
| Final delivery | production-proven for PDF/media | Library |
| Observability / user progress | backend-implemented | SSE `/api/tasks/stream` (#272), step card (#275), AutoTaskCard clock/✓, AgentScreenPanel (#284) |

## Traced request path (code only)

Chat „გახსენი youtube" → `OmniStudio` open-site routing (#280) → `POST /api/agent/run` → plan with `quote_browser_task`
→ `lib/agent/browser/quote.ts` (credits 0 → auto-start, #282) → `POST /api/agent/browser/run {stream:true}` →
`lib/agent/browser/runner.ts` reserves on the $20 `sandbox_spend` ledger → Vercel Sandbox from `BROWSER_SNAPSHOT_ID` →
`playwright-core` driver writes `live.jpg` + results to workspace `browser/<task>/` → NDJSON stream to AutoTaskCard →
settle. Google is used only for planning/reporting text (Gemini Flash); **Google Computer Use is not used**.

## Gaps against v5.1 §11 lifecycle (REQUEST → … → DELIVER)

Present: understand, plan, quote, approve, reserve, execute, deliver. Weak/missing: VALIDATE (no capability-vs-entitlement
check against Google lifecycle), parallel DAG, reconciled actual cost, persistent server-side approval center, Georgian QC.
