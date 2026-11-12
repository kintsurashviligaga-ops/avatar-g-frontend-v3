# 10 — Multi-tool readiness audit (v5.1 Phase 0)

Base `main` @ `4c502c7`. "Readiness" = what exists today; nothing should be duplicated in Phase 4.

| Tool / capability | State | Evidence | Note |
|---|---|---|---|
| Playwright / browser automation | backend-implemented, live for admins (`BROWSER_ENABLED=1`) | `lib/agent/browser/*`, `/api/agent/browser/run`, #278–#286 | snapshot `BROWSER_SNAPSHOT_ID` expires ~2026-11-13 (B-04); public-site deny-list policy |
| Google Computer Use | MISSING | no reference; tool GA 2026-10-30, Carbon supports it | needs separate approval (spec §6) |
| Python workspace | PROVEN_PRODUCTION (admins) | CODE-01 2026-11-01 | 1 vCPU, 60 s, deny-all network, 50 runs/day, $20 cap |
| Node.js workspace | IMPLEMENTED_UNVERIFIED | same runner | |
| Sandboxing | Vercel Sandbox, network deny-all for code, deny private/metadata for browser | `lib/agent/sandbox/policy.ts`, `lib/agent/browser/policy.ts` | pip/npm egress not allowed (policy) |
| Persistent workspace / files | IMPLEMENTED_UNVERIFIED | `lib/agent/workspace/store.ts` (versioned, 10 kept), `/{lang}/library/workspace` | |
| MCP client | PARTIAL (empty allowlist) | `lib/agent/mcp/client.ts` | |
| MyAvatar as MCP server | IMPLEMENTED_UNVERIFIED, not deployed | `apps/myavatar-mcp-server` | |
| Google Drive | PARTIAL (link + pick proven desktop) | #254/#255 | |
| Gmail / Calendar | MISSING ("soon" in connectors menu) | `components/studio/ConnectorsButton` | Gmail read = restricted scope → Google verification |
| Tool registry | IMPLEMENTED | `lib/agent/tools/registry.ts` | |
| DAG orchestration | PARTIAL — task graph without parallel execution | `lib/agent/taskGraph.ts` | |
| Checkpoints | PARTIAL | task JSON + durable runs | |
| Approval center | PARTIAL — per-card approvals (quote Start, Live „კი", Allow/No), no central approval history | — | |
| Live timeline | IMPLEMENTED (SSE) | `/api/tasks/stream` #272, step card #275 | owner check pending |
| App builder / code builder | MISSING (single-file HTML/SVG artifact preview only) | `components/chat/artifacts` | |
| Artifact service | PROVEN_PRODUCTION (Library) | DOC-01, CODE-01 | |
| Premiere Pro | XML export only (no web API exists) | `lib/video/premiereXml` | |
| Official Google Agent Platform MCP endpoints | not used | spec §4.5 | candidate for Phase 4 after review |
| Antigravity CLI / agy-bridge | not installed, not used | `which` not run beyond repo; no config in repo | optional; see `docs/execution/ANTIGRAVITY_SESSIONS.md` |
