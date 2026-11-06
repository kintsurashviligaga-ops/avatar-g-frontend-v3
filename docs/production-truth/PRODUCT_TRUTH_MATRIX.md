# MyAvatar.ge — Production Truth Matrix (2026-11-06)

ACTION 1 (P0) of GG's 2026-11-06 external audit: what is really running in Production, per capability, with evidence.
Docs only. It supersedes nothing until GG accepts it; it does not replace `docs/master-v3.1/CAPABILITY_MATRIX.md`
(model certification) and it carries forward PR #237's matrix (base cb01ec1, still a draft) with Production evidence.

## 1. Production baseline (checked 2026-11-06 ~15:25Z)

| Item | Value | Evidence |
|---|---|---|
| main HEAD | `3f87866` (#275, 12:20Z) | `git log -1` on a fresh clone |
| Production deployment | `dpl_G65rTDaqf4tHjmNEjSMsjd6JQcWC`, READY, target production, ref main, sha `3f87866` | Vercel deployments API |
| Live health | `GET https://myavatar.ge/api/health` → `{"ok":true,"status":"healthy","commit":"3f87866"}` at 15:24:22Z | fetched via Vercel |
| Previous prod | `036c8b64` (#271, `dpl_2ntnF4UK`), `0d196703` (#272, `dpl_H2LonSLV`) | Vercel deployments API |
| CI on prod SHA | `CI` (jobs `verify`, `agent-g-gate`), `E2E - Preview Contract` (`preview-e2e`), `ADK pilot`: **all success** on `3f87866`, and also on `0d196703`, `036c8b64`, `e273bce2` | `gh run list --branch main`, check-runs on `3f87866` |

Correction to the audit: it used `0d196703` as the latest Production SHA and said full CI on it could not be confirmed.
Production has since moved to `3f87866`, and the full workflow set (not only the Vercel status) ran green on both SHAs.
The last *local full gate* with suite counts (1,131 Jest suites, 36 lint warnings) is still the d8420a5d run in
`docs/master-v3.1/VERIFICATION.md`; CI's `verify` job runs tsc + lint + Jest on every main SHA.

## 2. Which database is Production

**Production Supabase = `zwksnayknzggdcenqqxy`** (region ap-southeast-1). Evidence: `PROJECT_MASTER.md:678`,
`tests/video-core-live/guard.ts:21` (`PRODUCTION_SUPABASE_REF`), `lib/env/previewIsolation` (blocks paid generation on a
Preview whose database is this ref, because Previews share Production's DB and wallet).

`supabase-beige-river` (seen by the audit through the Supabase integration, five MCP-preview migrations) is a
**different project**. Its missing `connector_accounts / sandbox_spend / generation_jobs / profiles` says nothing about
Production. `profiles` and `generation_jobs` are core tables every Production page and render uses.

Claude cannot read the Production DB (Supabase MCP answers "You do not have permission", re-tried 2026-11-06).
Read-only proof = `docs/production-truth/prod_schema_readonly.sql`, run by GG in
https://supabase.com/dashboard/project/zwksnayknzggdcenqqxy/sql/new . Until its result is pasted back, the rows below
marked *DB unverified* stay as stated.

| Migration | Owner action recorded | Indirect runtime evidence | Status |
|---|---|---|---|
| 20261031a generation_jobs `document` kind | GG ran it 2026-10-31 06:31Z | DOC-01 PDFs saved in Library (GG 10-31), code-run PDFs in Library (GG 11-01) | Applied (runtime-proven) |
| 20261031b `sandbox_spend` + reserve/settle | GG ran it 2026-10-31 ~16:38Z | `reserve` fails closed: CODE-01 succeeded 11-01, so the reserve call worked | Applied (runtime-proven), DB unverified |
| 20261101a `connector_accounts` | Header still says "NOT YET APPLIED" (stale). GG approved prod for admins 11-01 07:26Z and ran the steps in `drive-setup-ka.md` | GG linked Drive and picked a PDF on myavatar.ge 2026-11-05; linking writes this table (`lib/connectors/google/store.ts`) | Very likely applied, DB unverified; fix the header after the SQL |
| 20261003b `research_context_files` | Not applied | Local-files row answered 503; hidden by #261 | Not applied (BLOCKED_OWNER) |

## 3. Production flags (names and plain values only; secrets not read)

Read from the Vercel project env list (the tool returns at most 100 variables, so absence proves nothing).

| Flag | Production | Meaning |
|---|---|---|
| `AGENT_G_SANDBOX` | `admin` | Code-run for admins only |
| `SANDBOX_ENABLED` | `1` | Vercel Sandbox runner on |
| `CONNECTORS_DRIVE` | `admin` | Google Drive connector for admins only |
| `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `CONNECTOR_TOKEN_KEY`, `GOOGLE_PICKER_API_KEY` | set (sensitive) | Drive OAuth + Picker |
| `GOOGLE_CLOUD_PROJECT_NUMBER` | `467145118875` | Picker app id |
| `BOG_CHECKOUT_MODE` | `admin` | BOG checkout admins only |
| `LIVE_AUDIENCE`, `LIVE_AVATAR_AUDIENCE`, `NEXT_PUBLIC_LIVE_AVATAR` | set (encrypted) | `everyone` since #247 (2026-10-31) per project record |
| `MUSIC_LYRIA_VOCALS_VERIFIED`, `MUSIC_LYRIA_PRO_VERIFIED`, `MUSIC_LYRIA_PRO_SECONDS` | set (encrypted) | Lyria vocals / Pro unlocked |
| `AGENT_G_MEDIA_EXEC`, `GEMINI_TRANSPORT`, `LIVE_RELAY_URL` | set | Agent G media steps, Vertex transport, EU Live relay |
| `OPENAI_API_KEY`, `REPLICATE_API_TOKEN`, `HEYGEN_API_KEY`, `UDIO_API_KEY`, `LTX_VIDEO_API_KEY` | **still set** | Legacy vendors; code refuses them, but the keys should go (GG action) |

## 4. Product Truth Matrix

Statuses: BUILT (code exists) · PROVEN_ISOLATION (tests / contract run) · PROVEN_PREVIEW · PROVEN_PRODUCTION (a real user
workflow on myavatar.ge with a recorded result) · BLOCKED_OWNER · BLOCKED_EXTERNAL · MISSING. Audience in brackets.

### Platform, chat, UX

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| P1 | Production deploy + health | PROVEN_PRODUCTION | §1 |
| P2 | Unified chat composer, every service from one chat | PROVEN_PRODUCTION | #209 in prod 10-26, GG E2E video/live from chat; one-row Gemini bar #273 is a draft (not in prod) |
| P3 | Live task timeline (SSE `/api/tasks/stream`, spinner, fold) for Agent G jobs | PROVEN_ISOLATION | #272 in prod 0d196703; tests only, GG has not yet run a montage on it |
| P4 | Same step card for chat image/music/video/avatar | PROVEN_ISOLATION | #275 in prod 3f87866 (the current SHA); GG to try |
| P5 | Chat results survive reopen (videos, „გააგრძელე") | PROVEN_PRODUCTION | #223, GG check; signed links still expire after 7 days |
| P6 | Chat ↔ Live ↔ Studio one project context | MISSING | audit PH-9 gap |

### Documents (PH-1)

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| D1 | Georgian PDF from chat (FiraGO), preview, download | PROVEN_PRODUCTION | DOC-01 by GG 2026-10-31, #240/#243 |
| D2 | PDF saved in Library, survives refresh | PROVEN_PRODUCTION | DOC-01; migration 20261031a |
| D3 | DOCX / XLSX / PPTX / ZIP generation | MISSING | slides only as PNG deck (`design.presentation` blocked) |
| D4 | Read uploaded PDF / DOCX / TXT | BUILT | `/api/utils/extract-text`; no recorded E2E |

### Execution workspace (PH-2)

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| W1 | Run a Python/JS chat code block (quote → Start → result) [admins] | PROVEN_PRODUCTION | CODE-01 GG iPhone 2026-11-01 (5050, exit 0); 1 vCPU, 60 s, deny-all, 50 runs/day |
| W2 | Each run filed as a PDF in Library [admins] | PROVEN_PRODUCTION | GG 2026-11-01 06:58Z (#252) |
| W3 | $20 lifetime sandbox cap shared across instances | PROVEN_PRODUCTION (fail-closed path), DB unverified | `sandbox_spend` reserve worked for CODE-01; confirm rows with the SQL |
| W4 | Code-run for every user | BLOCKED_OWNER | `AGENT_G_SANDBOX=all` needs GG's OK |
| W5 | Persistent workspace id, files, `workspace_read/write/list/export/delete` | MISSING | ACTION 2 |
| W6 | Terminal, dependency install, multi-file project, Stop/Resume/Retry | MISSING | ACTION 2 |

### Browser and computer use (PH-3)

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| B1 | Read a public page (SSRF-safe fetch) | BUILT | `scrape_webpage`; tests |
| B2 | Web search (Gemini grounding) | BUILT | daily use, no recorded E2E |
| B3 | Real browser: navigate, click, type, JS-rendered DOM, screenshot, session isolation | MISSING | ACTION 3; host chosen = Vercel Sandbox |
| B4 | Gemini Computer Use | MISSING | model access unverified |

### MCP and connectors (PH-4)

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| M1 | MyAvatar as an MCP server (outbound) | BUILT | `apps/myavatar-mcp-server`, not deployed |
| M2 | Agent G MCP client gateway | MISSING | #257 Gemini MCP prototype is a draft on `feature/gemini-mcp` (not in prod; itself lists unfinished OAuth/authz) |
| M3 | Google OAuth (PKCE, encrypted refresh token, revoke) [admins] | PROVEN_PRODUCTION (link step) | #254/#255 in prod; GG linked Drive 2026-11-05 |
| M4 | Google Picker, `drive.file` only [admins] | PROVEN_PRODUCTION (desktop / Chrome) | GG picked a PDF 11-05; iPhone Safari 2nd open fails (third-party cookies), draft #256 |
| M5 | Agent G answers from a picked Drive file (DRIVE-01) | BLOCKED_OWNER | tools `drive_list_files/drive_read_file` in prod; DRIVE-01 not yet run by GG |
| M6 | Drive questions routed to Agent G from chat and Live | BUILT (unmerged) | #264 open, not draft, updated 11-05; needs GG merge OK |
| M7 | Local files as research context | BLOCKED_OWNER | migration 20261003b not applied; row hidden (#261) |
| M8 | Other connectors (Gmail, Calendar, GitHub, Notion…) | MISSING | |

### Work Mode (PH-5)

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| R1 | Durable run: steps, leases, CAS, cancel, resume | PROVEN_ISOLATION | `runIsolation.pg.test.ts` (real Postgres in CI) |
| R2 | Confirmed-action boundary (quote → confirm → spend) | PROVEN_PRODUCTION | Live picture with one „კი", 5 credits (GG 10-26); code-run quote (CODE-01) |
| R3 | General Work Mode E2E (research → CSV → Python → chart → Georgian PDF → Library in one run, survives refresh) | MISSING | ACTION 3 acceptance |

### Builder and professional apps (PH-6, PH-7)

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| A1 | Single-file HTML/SVG artifact preview | BUILT | `components/chat/artifacts` |
| A2 | Multi-file app / game builder | MISSING | needs W5/W6 |
| A3 | Blender worker (.blend, render, QC) | MISSING | |
| A4 | Premiere / CapCut / DaVinci adapters | MISSING | |

### Creative production (PH-8)

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| C1 | Veo 3.1 Fast / Standard video | PROVEN_PRODUCTION | owner-verified + contract test #269 |
| C2 | Georgian speaking video (Gemini Omni Flash, own voice per character) | PROVEN_PRODUCTION | GG scenario 3, 2026-10-26 |
| C3 | Continue a chat clip („გააგრძელე", multi-turn extend) | PROVEN_PRODUCTION | GG 2026-10-26 20:10Z (#221) |
| C4 | Image, gemini-3.1-flash-image | PROVEN_ISOLATION | contract PASS (#269); in daily chat use, no recorded owner E2E after certification |
| C5 | Music, Lyria 3 with Georgian vocals | BUILT (flag on) | `MUSIC_LYRIA_VOCALS_VERIFIED` set; no recorded owner listening check |
| C6 | Music, Lyria 3 Pro | PROVEN_ISOLATION | contract PASS |
| C7 | Mic dictation, Chirp 3 (ka/ru/en) | PROVEN_PRODUCTION | GG 2026-11-01 07:36Z; the single listed-languages request [ka,ru,en] returns 400, the adapter uses the Georgian leg |
| C8 | Read-aloud (Gemini TTS) | BUILT, degraded | certification: default model 500 twice; #270/#271 in prod, GG's trial 11:08Z shows it slow; #274 (shorter server part) open |
| C9 | Live voice + talking avatar (Vertex, EU relay) [everyone, 1×5 min/day non-admin] | PROVEN_PRODUCTION | GG E2E 2026-10-26 14:08Z; #247 |
| C10 | Custom avatar from own photo | BLOCKED_EXTERNAL | Google allowlist |
| C11 | Lip-sync to own audio | BLOCKED_EXTERNAL | CAPABILITY_UNAVAILABLE on Vertex |
| C12 | Video assembly (intro+body+outro, A/V sync), montage with Pexels | BUILT | #258 in prod; no recorded owner E2E |
| C13 | Phone calls | MISSING (refused) | `phoneCallsReady()` false, calls TTS answers 503 (#268) |
| C14 | Product ad service | removed | #235 |

### Security, billing, observability (PH-10)

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| S1 | Vertex/Google-only generation, fail closed | PROVEN_ISOLATION | provider-boundary tests in CI; 60 routes still import a forbidden client (refused at run time, HANDOFF.md §4) |
| S2 | Credit reserve / refund on miss | PROVEN_PRODUCTION | video and Live E2Es |
| S3 | Preview cannot spend (shared DB/wallet) | PROVEN_ISOLATION | `lib/env/previewIsolation` tests |
| S4 | BOG checkout [admins] | BLOCKED_OWNER | real BOG sandbox never run (no creds in CI) |
| S5 | Legacy vendor keys out of Production | BLOCKED_OWNER | 5 keys still set (§3); CSP still lists replicate/heygen/ltx hosts |
| S6 | Chat first-token benchmark | BLOCKED_OWNER | Phase 3 decision 3 open |

### E2E and release (PH-11, PH-12)

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| E1 | Master Task v2.0 T01–T20 in real conditions | PARTIAL | proven: PDF, code-run, Live, video; missing: browser, MCP session, Drive action, Work Mode, builder, Blender, cross-user matrix, billing matrix |
| E2 | Release ladder OFF → … → PUBLIC for the Super App | NO-GO | individual services are public; Agent G Super App stays admin canary |

## 5. What changes the statuses next

1. GG runs `prod_schema_readonly.sql` (one read-only query) and pastes the result → W3, M3 rows lose "DB unverified";
   fix the stale header of `20261101a_connector_accounts.sql`.
2. GG tries one montage and one chat render → P3, P4 to PROVEN_PRODUCTION.
3. GG runs DRIVE-01 and decides on #264 → M5, M6.
4. GG removes the 5 legacy keys in Vercel Production → S5.
5. ACTION 2 (workspace) and ACTION 3 (browser + Work Mode) turn W5, W6, B3, R3 from MISSING.

Rule kept from the audit: nothing becomes PROVEN because code exists, tests pass or a deployment is READY; it needs a
real user action, a real result and a check someone else can repeat.
