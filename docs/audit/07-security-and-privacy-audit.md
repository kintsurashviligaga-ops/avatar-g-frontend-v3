# 07 — Security and privacy audit (v5.1 Phase 0)

Base `main` @ `4c502c7`. Code review only; no penetration test, no production log read. Nothing here is a claim of
legal or regulatory compliance.

| Area | Finding | Evidence | Status |
|---|---|---|---|
| Authentication | Supabase Auth; `middleware.ts`; server routes use route-handler client; service-role client only server-side | `lib/supabase/server` | IMPLEMENTED_UNVERIFIED |
| Authorization / admin | admin gates by flag (`AGENT_G_SANDBOX=admin`, `CONNECTORS_DRIVE=admin`, `BOG_CHECKOUT_MODE=admin`), `lib/security/apiGuard.ts` | files | IMPLEMENTED_UNVERIFIED |
| Tenant / workspace isolation | RLS hardening migrations (`20261008a_rls_internal_tables`, `20261008d_storage_read_scope`, `20261009a_function_hardening`, `20261009b_renders_private`); workspace keys under `{uid}/`, generic signers refuse the `workspaces` bucket; durable-run isolation tested on real Postgres in CI | migrations, `lib/agent/workspace/store.ts`, `runIsolation.pg.test.ts` | IMPLEMENTED_UNVERIFIED (no cross-user matrix run) |
| Connector tokens | `connector_accounts` has no anon/authenticated grant (owner SQL 2026-11-06); refresh tokens encrypted with `CONNECTOR_TOKEN_KEY`; Drive scope `drive.file` only | production-truth §2–3 | PROVEN_PRODUCTION (grant check) |
| Input / upload validation | upload bucket limits (`20261008c`), per-account upload rate limit (#262), `lib/security/callerMedia.ts`, `allowlistedAudioFetch.ts` | files | IMPLEMENTED_UNVERIFIED |
| SSRF / browser | `scrape_webpage` SSRF-safe fetch; browser policy refuses `*.internal`, `metadata.google.internal`, private ranges; sandbox network denies private + metadata subnets (IPv6 CIDRs refused by Vercel → IPv4 only) | `lib/agent/browser/policy.ts:16,60`, project record | IMPLEMENTED_UNVERIFIED (live block verified once 2026-11-06) |
| Prompt-injection | hidden-instruction test for the ReAct coordinator; page text treated as data | `lib/agent/react/hiddenInstruction.test.ts`, `lib/agent/react/coordinator.ts` | PARTIAL |
| Tool permissions | registry effects (read / versioned / paid), quote → approve before spend; site agent asks Allow/No before ✦ spend, delete, send | `lib/agent/tools/registry.ts`, #285 | IMPLEMENTED_UNVERIFIED |
| MCP | client with empty allowlist → no external MCP server reachable | `lib/agent/mcp/client.ts` | safe by default |
| Secret management | Vercel env; no real secret found in the repo (scan for `sk-…`, `AIza…`, PEM, long JWT: only fake PEM fixtures in 3 test files, `.env.example`); WIF OIDC for Vertex (no service-account key) | grep, `lib/veo/vertexAuth.test.ts:47` | OK in repo |
| Legacy keys | 5–9 legacy vendor values cleared 2026-11-06; names (and possible aliases among env vars beyond the 100 the tool lists) still for the owner | production-truth memory | PARTIAL |
| CSP | `lib/security/csp.js`, applied in prod (`next.config.js:302`); still lists some legacy vendor hosts (production-truth S5) | files | PARTIAL |
| Rate limits | `lib/api/rate-limit.ts` (Redis); per-minute code-run limit (#251) | files | IMPLEMENTED_UNVERIFIED |
| Logging hygiene | `report-error` + Sentry; redaction tests for auth errors (`scripts/gcp/preview-auth-check.test.ts:158`, `lib/veo/vertexAuth.test.ts:448`) | files | PARTIAL |
| Data retention / deletion | chat delete/trash exists (`007_chat_memory_and_trash.sql`); workspace keeps 10 versions; **Google Interactions API stores interactions by default for 55 days (paid)** — our Omni calls use `previous_interaction_id`; whether `store` is set and what Vertex retains is NOT VERIFIED | `04` §7 | UNKNOWN → D-04 |
| Prod → dev data boundary | Previews share the production DB + wallet (paid writes blocked, reads are not separated); development tools (Claude) have no Supabase access | `lib/env/previewIsolation`, production-truth §2 | RISK (shared DB) |
| AI content disclosure | not found as a systematic label on generated media | — | UNKNOWN |
| Safety identifiers | none found (`safety_identifier` grep = 0) | grep | MISSING |
| Computer Use confirmation / allowlist | Google Computer Use not used; our own browser has a deny-list (private ranges), not an allow-list of domains; site agent has a confirmation dialog | `policy.ts` | PARTIAL |
| Legacy non-Google code | ~60 routes still import a refused vendor client; refused at runtime before charge | `docs/master-v3.1/HANDOFF.md` §4, `lib/providers/mediaPolicy.ts` | PARTIAL |

Critical items: none found that require stopping the audit. Highest: shared Preview/production database, Interactions
default storage of private media, legacy ledger callers (financial), browser deny-list (not allow-list) on public sites.
