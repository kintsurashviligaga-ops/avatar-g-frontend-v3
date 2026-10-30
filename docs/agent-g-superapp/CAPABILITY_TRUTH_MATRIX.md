# Agent G Super App — capability truth matrix

Phase 0 of Master Task v2.0, 2026-10-30, `main` = `cb01ec1`. Each row reads
`Feature → Existing code → Runtime route → Provider → Flag → Evidence → Gap → Proposed action`.

Status words come from v2.0 §2: MISSING, PARTIAL, BUILT_NOT_PROVEN, PROVEN_ISOLATION, PROVEN_PREVIEW,
PROVEN_PRODUCTION, BLOCKED_OWNER, BLOCKED_EXTERNAL, DISABLED. A unit test alone never earns PROVEN. This audit ran
nothing against Preview or Production. Where a PROVEN status appears, the evidence is an earlier, cited run. The
existing creative services (video, image, music, avatar, voice) keep their labels in `lib/agent/capabilities.ts`
and in `docs/ENGINEERING_REGISTRY.md`; this matrix covers what v2.0 adds.

## Phase 1 — documents (P0)

| # | Feature | Existing code | Runtime route | Provider | Flag | Evidence | Status | Gap | Proposed action |
|---|---|---|---|---|---|---|---|---|---|
| D1 | Create a PDF from chat | `lib/agent-g/orchestrator/formatter.renderPdf` (dead stack), invoice PDF writers | `/api/agent-g/output?format=pdf` (dead: reads `agent_g_tasks`, which nothing live writes) | none (pdfkit, local) | — | Code reading. The chat model declares no file tool | **MISSING** (in the live path) | No tool, no worker, no Georgian font, pdfkit not traced | `create_document` tool (effect `prepare`) + a document worker on pdf-lib with embedded FiraGO |
| D2 | Georgian text in PDFs | FiraGO bundled for resvg (`lib/pipeline/compositing/font-data-firago.ts`) | — | — | — | All 3 pdfkit writers use Helvetica | **MISSING** | Mkhedruli is dropped | Embed FiraGO through pdf-lib + fontkit; check every glyph in a test |
| D3 | DOCX / XLSX / PPTX / CSV / ZIP / MD create | `jszip` (dep), `deckPipeline` (PNG slides) | `/api/v2/presentation/build` (slides as PNG) | Gemini for the outline | — | `design.presentation` is BLOCKED_OWNER in capabilities.ts | **MISSING** (DOCX/XLSX/PPTX), PARTIAL (ZIP, MD) | No writers | One worker, one format at a time, after the PDF passes |
| D4 | Read PDF / DOCX / TXT | `/api/utils/extract-text` (`mammoth`, `pdf-parse`/`unpdf`), Gemini file read (`analyze_media`) | `/api/utils/extract-text`, chat attachments | Gemini | `AGENT_G_FILE_ANALYSIS` (Agent G read only) | Chat answers about attached PDFs (platform prompt) | **BUILT_NOT_PROVEN** | No recorded E2E evidence | Cover it in DOC-01's test set |
| D5 | File card in chat: Preview / Download / Library / survives refresh | Artifacts (code languages only), Library (`/api/studio/library`), saved result bubbles (#223) | chat artifacts, `chat_messages` rows | — | — | #223 keeps video results after reopen (in prod 2026-10-27) | **PARTIAL** | No document kind in the artifact allowlist or the result bubble | Add a `document` result bubble on the #223 pattern, with a signed link and a Library row |
| D6 | Regression: Agent G does not say "I can't make a PDF" | `platformPrompt` | — | — | — | — | **MISSING** | Nothing pins the claim | A prompt test + an E2E check on the DOC-01 reply |

## Phase 2 — execution workspace (P0)

| # | Feature | Existing code | Runtime | Provider | Flag | Evidence | Status | Gap | Proposed action |
|---|---|---|---|---|---|---|---|---|---|
| W1 | Code sandbox (`execute_python`, `execute_node`, `terminal_run`) | `lib/agent/sandbox/policy.ts` (rules + `disabledSandbox`) | none | — | — | policy.test.ts | **BLOCKED_OWNER** | Paid isolated host not chosen (2026-10-10 brief) | GG picks a host and a spend cap; then build a runner behind `checkSandboxJob` |
| W2 | Workspace manager (ids, versions, TTL, quota) | Storage + Library, `generation_jobs` | — | — | — | — | **MISSING** | No workspace model | Design on the existing storage; a table would need a migration (GG) |
| W3 | Workspace tools (`workspace_read/write/list/export/delete`) | — | — | — | — | — | **MISSING** | — | After W1/W2 |

## Phase 3 — browser and computer use (P0)

| # | Feature | Existing code | Runtime | Provider | Flag | Evidence | Status | Gap | Proposed action |
|---|---|---|---|---|---|---|---|---|---|
| B1 | Read a public page | `lib/agent/tools/scrapeWebpage.ts` (SSRF-safe, redirect re-check, hidden text dropped) | `scrape_webpage` in `/api/agent/run`, voice `read_webpage` | none (fetch) | — | Tests; voice row wording (#55 era) | **BUILT_NOT_PROVEN** | No browser runtime, no JS rendering | Keep as the read-only level |
| B2 | Web search | `web_search` (Gemini + Google grounding) | `/api/chat/gemini`, `/api/agent/run` | Gemini | — | In daily use in the chat | **BUILT_NOT_PROVEN** (no recorded E2E) | — | Record one E2E |
| B3 | Real browser (navigate, click, type, screenshot, tabs) | — | — | — | — | Prompt says `BROWSER: none` | **BLOCKED_OWNER** | Paid host (same decision as W1) | Playwright/Chromium in Vercel Sandbox after GG's yes |
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
