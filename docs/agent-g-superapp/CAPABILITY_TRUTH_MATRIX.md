# Agent G Super App — capability truth matrix

Phase 0 of Master Task v2.0, 2026-10-30, `main` = `cb01ec1`. Each row reads
`Feature → Existing code → Runtime route → Provider → Flag → Evidence → Gap → Proposed action`.

Status words come from v2.0 §2: MISSING, PARTIAL, BUILT_NOT_PROVEN, PROVEN_ISOLATION, PROVEN_PREVIEW,
PROVEN_PRODUCTION, BLOCKED_OWNER, BLOCKED_EXTERNAL, DISABLED. A unit test alone never earns PROVEN. This audit ran
nothing against Preview or Production. Where a PROVEN status appears, the evidence is an earlier, cited run. The
existing creative services (video, image, music, avatar, voice) keep their labels in `lib/agent/capabilities.ts`
and in `docs/ENGINEERING_REGISTRY.md`; this matrix covers what v2.0 adds.

**Updated 2026-11-01** (`main` = `bff4388`) after Phases 1–3. Rows D1, D2, D5, D6, W1, B3 and the new W4 carry the
new status and evidence; each changed row says what proved it. The rest is still the 2026-10-30 audit.

## Phase 1 — documents (P0)

| # | Feature | Existing code | Runtime route | Provider | Flag | Evidence | Status | Gap | Proposed action |
|---|---|---|---|---|---|---|---|---|---|
| D1 | Create a PDF from chat | `lib/documents/{compose,pdf,spec,client}.ts`, `lib/chat/documentIntent.ts` (#240) | `/api/documents/create`, `/api/documents/file` | Gemini (content) + pdf-lib (local) | — | DOC-01 by GG on myavatar.ge 2026-10-31 11:23Z (PDF works); spinner #243 confirmed 16:08Z | **PROVEN_PRODUCTION** | — | Done (Phase 1 report: `phase1-report-ka.md`) |
| D2 | Georgian text in PDFs | FiraGO embedded through pdf-lib + fontkit (`lib/documents/pdf.ts`) | `/api/documents/create` | — | — | `pdf.test.ts` glyph checks; DOC-01 Georgian 5-page PDF in production | **PROVEN_PRODUCTION** | Old pdfkit invoice writers still use Helvetica (not on the Agent G path) | — |
| D3 | DOCX / XLSX / PPTX / CSV / ZIP / MD create | `jszip` (dep), `deckPipeline` (PNG slides) | `/api/v2/presentation/build` (slides as PNG) | Gemini for the outline | — | `design.presentation` is BLOCKED_OWNER in capabilities.ts | **MISSING** (DOCX/XLSX/PPTX), PARTIAL (ZIP, MD) | No writers | One worker, one format at a time, after the PDF passes |
| D4 | Read PDF / DOCX / TXT | `/api/utils/extract-text` (`mammoth`, `pdf-parse`/`unpdf`), Gemini file read (`analyze_media`) | `/api/utils/extract-text`, chat attachments | Gemini | `AGENT_G_FILE_ANALYSIS` (Agent G read only) | Chat answers about attached PDFs (platform prompt) | **BUILT_NOT_PROVEN** | No recorded E2E evidence | Cover it in DOC-01's test set |
| D5 | File card in chat: Preview / Download / Library / survives refresh | `components/studio/DocumentCard.tsx`, Library Docs tab (`LibraryGallery`), `generation_jobs` kind `document` (migration 20261031a, GG) | chat card, `/api/studio/library` | — | — | DOC-01 (2026-10-31): card in the chat, file in the Library | **PROVEN_PRODUCTION** | — | — |
| D6 | Regression: Agent G does not say "I can't make a PDF" | `platformPrompt` documents line (#240) | — | — | — | `platformPrompt.test.ts` pins it; DOC-01 reply made the PDF | **PROVEN_PRODUCTION** | — | — |

## Phase 2 — execution workspace (P0)

| # | Feature | Existing code | Runtime | Provider | Flag | Evidence | Status | Gap | Proposed action |
|---|---|---|---|---|---|---|---|---|---|
| W1 | Code sandbox (Python, Node) | `lib/agent/sandbox/{policy,runner,budget,dbSpend,vercelHost,index}.ts` (#248), ledger migration 20261031b (GG) | via W4 | Vercel Sandbox (GG 2026-10-30), $20 cap in code | `SANDBOX_ENABLED=1` (Production since 2026-11-01) | First run 2026-10-31 16:47Z (4, egress blocked); CODE-01 in production 2026-11-01 | **PROVEN_PRODUCTION** | No terminal, no files in/out | Files and workspace with W2/W3 |
| W4 | Run a chat code block (quote → Start → result) | `lib/agent/sandbox/codeQuote.ts`, `components/chat/CodeRun.tsx`, tool `quote_code_run` (#249, #251); Library PDF of each result `codeFiling.ts` (#252) | `/api/agent/sandbox/run` | Vercel Sandbox | `AGENT_G_SANDBOX=admin` | CODE-01 by GG on myavatar.ge 2026-11-01 ~05:50Z: 5050, exit 0, 0.5 s (iPhone); Library PDF confirmed by GG 06:58Z (bff4388) | **PROVEN_PRODUCTION** (admins), incl. Library filing | Open to everyone needs GG's OK | Phase 3 report: `phase3-report-ka.md` |
| W2 | Workspace manager (ids, versions, TTL, quota) | Storage + Library, `generation_jobs` | — | — | — | — | **MISSING** | No workspace model | Design on the existing storage; a table would need a migration (GG) |
| W3 | Workspace tools (`workspace_read/write/list/export/delete`) | — | — | — | — | — | **MISSING** | — | After W1/W2 |

## Phase 3 — browser and computer use (P0)

| # | Feature | Existing code | Runtime | Provider | Flag | Evidence | Status | Gap | Proposed action |
|---|---|---|---|---|---|---|---|---|---|
| B1 | Read a public page | `lib/agent/tools/scrapeWebpage.ts` (SSRF-safe, redirect re-check, hidden text dropped) | `scrape_webpage` in `/api/agent/run`, voice `read_webpage` | none (fetch) | — | Tests; voice row wording (#55 era) | **BUILT_NOT_PROVEN** | No browser runtime, no JS rendering | Keep as the read-only level |
| B2 | Web search | `web_search` (Gemini + Google grounding) | `/api/chat/gemini`, `/api/agent/run` | Gemini | — | In daily use in the chat | **BUILT_NOT_PROVEN** (no recorded E2E) | — | Record one E2E |
| B3 | Real browser (navigate, click, type, screenshot, tabs) | — | — | — | — | Prompt says `BROWSER: none` | **MISSING** (host now chosen: Vercel Sandbox, W1) | No browser runtime yet | Playwright/Chromium in Vercel Sandbox under the same $20 ledger, after GG's OK for the spend |
| B4 | Gemini Computer Use | — | — | Gemini Computer Use model | — | — | **MISSING** (and model availability unverified) | v2.0 §1: only with real model support | Check model access before any design |

## Phase 4 — MCP client and connectors (P0/P1)

| # | Feature | Existing code | Runtime | Provider | Flag | Evidence | Status | Gap | Proposed action |
|---|---|---|---|---|---|---|---|---|---|
| M1 | MyAvatar as an MCP server (outbound) | `apps/myavatar-mcp-server` (3 manifest-gated tools) | separate Node process | — | `.mcp/skills-manifest.json` | README | **BUILT_NOT_PROVEN** | Not deployed by this project | Out of v2.0 scope (it is the opposite direction) |
| M2 | MCP client gateway | — | — | — | — | — | **MISSING** | Everything (manager, discovery, allowlist, audit) | Design doc first. No open-ended `call_mcp_tool` (v2.0 §6.1) |
| M3 | OAuth (PKCE, encrypted tokens, revoke) | — | — | — | — | — | **MISSING** | Token storage is a migration | GG's OK for the table |
| M4 | Google Drive / Docs / Sheets / Gmail / Calendar | `lib/connectors/registry.ts` lists Drive as `soon` | — | Google | — | — | **MISSING** | — | First connector after M3 (Google-only fits) |
| M5 | GitHub, Dropbox, Notion, Slack, Canva/Figma | registry lists Dropbox, Notion, OneDrive as `soon` | — | — | — | — | **MISSING** | — | P1 |
| M6 | Local files as research text | `lib/connectors/localFiles.ts`, `/api/connectors/files` | `/api/connectors/files` | — | — | Answers 503 until its table is migrated | **BLOCKED_OWNER** (migration) | Table not migrated | GG's migration OK |

## Phase 5 — Work Mode (P0/P1)

| # | Feature | Existing code | Runtime | Provider | Flag | Evidence | Status | Gap | Proposed action |
|---|---|---|---|---|---|---|---|---|---|
| R1 | Durable multi-step run (leases, CAS, cancel, resume) | `lib/agent/run/*`, `lib/agent/contracts` | `/api/agent/run`, `generation_jobs.params._run` | — | `AGENT_G_MEDIA_EXEC` for media steps | `runIsolation.pg.test.ts` (real Postgres in CI, image-studio-acceptance workflow) | **PROVEN_ISOLATION** | Media-only steps today | Add document + research steps; reuse, no new queue (v2.0 §7.3) |
| R2 | Confirmed Action Boundary | `lib/agent/tools/registry.ts` `CONFIRMED_ACTIONS`, `app/api/agent/approvals` | approvals route | — | — | registry tests | **BUILT_NOT_PROVEN** | — | Keep; every new effect goes through it |
| R3 | Work UI (plan, step, logs, files, Stop/Retry/Resume, cost) | run card (`lib/agent/run/runCard.ts`) | chat | — | — | runCard tests | **PARTIAL** | No logs/files/cost view | Extend the run card |

## Phases 6–7 — builders and professional apps (P1/P2)

| # | Feature | Existing code | Status | Gap |
|---|---|---|---|---|
| A1 | Single-file HTML/SVG app preview, versions, download | `components/chat/artifacts` (sandboxed iframe, 200 KB UTF-8 cap) | **BUILT_NOT_PROVEN** | No multi-file project, build, terminal or ZIP |
| A2 | Multi-file app / game builder | — | **MISSING** | Needs W1 |
| A3 | Blender worker | — | **MISSING** (paid worker → BLOCKED_OWNER when designed) | — |
| A4 | Premiere / CapCut / After Effects / DaVinci adapters | — | **MISSING** | Feasibility only (v2.0 P2) |

## Phase 10 — security, billing, observability (cross-cutting)

| # | Feature | Existing code | Status | Note |
|---|---|---|---|---|
| S1 | Google-only providers in Production | `lib/ai/google/policy.ts`; `/api/chat/claude` and `/api/chat/openai` answer 410 | **BUILT_NOT_PROVEN** | ElevenLabs only where the policy allows |
| S2 | Quote → Confirm → Reserve → Execute → Settle/Refund | credits ledger, `refund-on-miss` per capability | **PROVEN_PRODUCTION** for video (GG's E2E on 2026-10-26, Live picture with one "კი", 5 credits) | Reuse for every new paid action |
| S3 | SSRF protection | `scrapeWebpage` address rules | **BUILT_NOT_PROVEN** | Reuse for the browser |
| S4 | Per-run ids, cost, latency (`agent_run_metrics`) | `lib/agent/react/bindLiveAgent.ts` | **PARTIAL** | Extend to tool calls |
