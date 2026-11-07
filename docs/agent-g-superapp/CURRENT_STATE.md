# Agent G Super App — current state (Phase 0 of Master Task v2.0)

Written 2026-10-30 against `main` = `cb01ec1` (#201). Master Task v2.0 (2026-10-27) was read in full. This is a
code-reading audit. **Nothing was run against Production or a Preview for it, and no flag value was read**, so nothing
below is marked PROVEN on the strength of this document. Earlier evidence is cited where it exists. The per-capability
table is [CAPABILITY_TRUTH_MATRIX.md](CAPABILITY_TRUTH_MATRIX.md).

## 1. The live Agent G request path

There is ONE live way in. Everything else is a dead stack pinned by `lib/agent/deadStacks.test.ts`.

| Layer | Live code | What it does |
|---|---|---|
| Text chat | `app/api/chat/gemini/route.ts` (881 lines) | Gemini answers with the platform prompt (`lib/chat/platformPrompt.ts`). Its only tools are Google Search grounding and URL context. **No function tools are declared on the text chat.** |
| Router | `app/api/ai/agent-g` → `lib/ai/agentG.classifyIntent` | A free, deterministic classifier that picks which Studio workspace opens. It runs nothing. |
| Chat intent | `lib/agent/intent.ts` → `lib/agent/chatTurn.ts` | Turns a chat message into a Studio action, a quote card, or a plain answer |
| Typed tools | `lib/agent/tools/registry.ts` + `lib/agent/react/bindLiveAgent.ts` | 7 tools: `web_search`, `scrape_webpage`, `prepare_instagram_post`, `quote_montage_to_music`, `quote_audio_from_link`, `quote_media_edit`, `analyze_media` (+ `imageQuoteTool`). Effects are `read / prepare / quote / inspect`. **Model tools cannot `execute`, `write`, `publish` or `spend`**: those are the `CONFIRMED_ACTIONS` the user presses |
| Run API | `app/api/agent/run` → `lib/agent/react/coordinator` → `bindLiveAgent` | A ReAct loop over those tools. Callers: Live voice (`components/voice/live/liveActions.ts`) and `components/agent/AgentTerminal.tsx` |
| Durable runs | `lib/agent/run/*` (runEngine, runExec, runSpec) in `generation_jobs.params._run` | Multi-step runs with leases, compare-and-set, cancel, resume as a new run, `RUN_TRANSITIONS` in `lib/agent/contracts` |
| Approvals | `app/api/agent/approvals`, `lib/agent/approval.ts` | The Confirmed Action Boundary (signed scope, user presses Confirm) |
| Capability registry | `lib/agent/capabilities.ts` | 26 capabilities with route, provider, price, approval, QC and a proof label. It is the code twin of the matrix and should stay in sync with it |
| Execution gates | `AGENT_G_MEDIA_EXEC`, `AGENT_G_FILE_ANALYSIS` (`lib/agent/media/access.ts`) | Media execution and whole-file reading. Production values were not read for this audit |

**Dead stacks (do not extend; v2.0 §2):** `lib/agent-g/orchestrator` (with `app/api/agent-g/{execute,plan,output}`),
`lib/agentg`, `lib/agents/agentGRouter`, `lib/agents/orchestrator`, `lib/decision-engine`, `lib/automation`,
`lib/agent/videoQueue`. 19 importers are pinned. The list may only shrink.

## 2. Why Agent G says it cannot make a PDF (Phase 1 root cause)

GG's screenshot: Agent G says it cannot create a PDF and suggests exporting to Google Docs. The repo does have PDF
code, but none of it is reachable from the live chat and none of it can write Georgian:

1. **The text chat has no document tool.** `/api/chat/gemini` declares no function tools, and no tool in
   `lib/agent/tools` creates a file. The model has no way to make a file, so the honest answer is "I can't".
2. **The only Agent G PDF route is in a dead stack.** `app/api/agent-g/output?format=pdf` renders
   `lib/agent-g/orchestrator/formatter.renderPdf` from the `agent_g_tasks` table. Nothing live writes that table.
3. **Every server PDF writer drops Georgian.** `formatter.ts`, `lib/invoices/pdfGenerator.ts` and `lib/invoice/pdf.ts`
   use pdfkit's built-in Helvetica, which has no Mkhedruli glyphs.
4. **pdfkit is not packaged for the lambda.** It is missing from `serverComponentsExternalPackages` and
   `outputFileTracingIncludes` (`next.config`), and it reads `.afm` files off disk. `deckPipeline.ts` records this as
   the reason slides are rendered as PNG and PDFs are left to the browser's print.
5. **Chat artifacts are code only.** `components/chat/artifacts` opens an allowlist of code languages (html, svg,
   css …) with a download in that language's own type. No PDF, DOCX, XLSX or PPTX kind exists.

What can be reused: `pdf-lib`, `pdfkit`, `jszip`, `mammoth` and `pdf-parse` are already dependencies. The FiraGO fonts
are bundled for resvg (`lib/pipeline/compositing/font-data-firago.ts`). `@resvg/resvg-js` is already traced.
Text extraction (`/api/utils/extract-text`) and Library storage (`uploadBufferAndSign`) already exist. Phase 1 can be
built from these pieces without new infrastructure. (Proposal: a `create_document` tool of effect `prepare`, a
document worker using pdf-lib with embedded FiraGO, and a chat file card with Preview, Download and Library.)

## 3. What does not exist yet (v2.0 phases 2–7)

| v2.0 area | Today | Evidence |
|---|---|---|
| Code sandbox (§4) | Rules exist (`lib/agent/sandbox/policy.ts`: Python/Node, ≤2 vCPU / 2 GB / 300 s, no network, no secrets). The only runner is `disabledSandbox`, which refuses every job | policy.ts, `policy.test.ts` |
| Host choice | Vercel Sandbox recommended (≈ $0.007 per 2-minute task), Cloud Run jobs as fallback. **BLOCKED_OWNER since 2026-10-10** | `docs/handoffs/agent-g/browser-sandbox-decision.md` |
| Browser (§5) | Read-only public pages only: SSRF-safe `scrape_webpage`, Google grounding. The prompt says `BROWSER: none` | `lib/agent/tools/scrapeWebpage.ts`, platformPrompt |
| Gemini Computer Use | Nothing | — |
| MCP client (§6.1) | Nothing. `apps/myavatar-mcp-server` is an outbound MCP **server** with 3 manifest-gated tools for outside clients | apps/myavatar-mcp-server/README.md |
| OAuth connectors (§6.2–6.3) | No OAuth. `lib/connectors/registry.ts` lists Google Drive, OneDrive, Notion and Dropbox as `soon`. Only `local_files` (text the user uploads) is real, and it answers 503 until its table is migrated | `lib/connectors/*`, `app/api/connectors/files` |
| Work Mode (§7) | The durable run engine exists (above). There is no planner that turns one request into a document + research + chart graph | lib/agent/run |
| App/game builder (§8) | Chat artifacts give an HTML/SVG preview in a sandboxed iframe, versions and a download. No multi-file project, terminal, build or ZIP | components/chat/artifacts |
| Pro apps (§9) | Nothing (Blender, Premiere, CapCut) | — |

## 4. Policy checks against v2.0 §1

- **Google-only providers.** `/api/chat/claude` and `/api/chat/openai` already answer 410 and call no provider
  (`lib/ai/google/policy.ts`). ElevenLabs is still used for TTS and dubbing where the policy allows it.
- **UI.** The Rocket/Orbit visual was removed in the P0 correction. The Unified Composer of 2026-10-25 is the chat
  surface. Neither may regress.
- **Confirmed Action Boundary.** This is already in code: a model tool cannot execute. v2.0 §7.2 asks to keep it.

## 5. Repo state at audit time

- main `cb01ec1` (2026-10-30 13:59Z, #201). The last verified Production deploy was #202's `a3a4572`
  (dpl_47fxjd6b, health 6/6 at 13:42Z). #201's deploy was not checked by this audit.
- Open PRs touching Agent G: #216 (voice quote-bound approval), #110 (run approval lease), #109 (audit candidate).
  Old codex drafts are listed in `docs/ENGINEERING_REGISTRY.md` (#234).
- Supabase schema, applied migrations and live flag values were **not read** (no prod DB access in this session).
  They are the first thing Phase 1 must confirm before it relies on a table.

## 6. Order (v2.0 §15, adjusted to this state)

1. **Phase 1, documents.** No owner decision is needed: there is no new provider and no paid infrastructure. Build on
   pdf-lib + FiraGO + the existing storage. It reaches PASS only with the DOC-01 acceptance in Production after GG's
   merge OK.
2. **Phase 2 sandbox and Phase 3 browser** need GG's host decision (the 2026-10-10 brief still stands: Vercel Sandbox
   + a spend limit). Until then they stay BLOCKED_OWNER.
3. **Phase 4 MCP client + OAuth.** It starts with Google Drive (Google-only fits). A token table is a migration, so it
   needs GG's OK.
