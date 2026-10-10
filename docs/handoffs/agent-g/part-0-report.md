# Agent G Autonomous Execution — PART 0: audit, baseline and gap analysis

Asked by the owner on 2026-10-10 at 05:49Z (Master Task thread), as the AGENT G AUTONOMOUS EXECUTION MASTER TASK. Work
continues from the repository as it stands: branch `claude/launch-certification-wmvitt`, draft PR #50, starting commit
`97acd163`. Nothing was merged, deployed, migrated or paid for. Production was only read.

The reports for this task live in `docs/handoffs/agent-g/part-N-report.md`, because `docs/handoffs/part-1-report.md` already
holds Part 1 of the 2026-10-08 plan, and that file is kept as it is.

## 1. Starting point

| Item | State (2026-10-10 ~06:15Z) |
|---|---|
| Branch | `claude/launch-certification-wmvitt` at `97acd163`, pushed, clean tree |
| PR #50 (this branch → main) | draft; CI `verify` and `preview-e2e` green on `97acd163`; Vercel Preview Ready 05:42Z |
| PR #51 | draft (Supabase auth); its four fixes are already in Production through PR #52 |
| PR #52 | merged, Production serves `6c7dff4` since 2026-10-09 16:01Z |
| PR #43 / #44 | drafts (GCP Part 0 / Astra's Vertex work), not touched here |
| Production | `6c7dff4`; `AGENT_G_MEDIA_EXEC` not set (Agent G media off); `MEDIA_GOOGLE_ONLY` not set (owner action 9) |

## 2. Baseline

| Check | Result | Where |
|---|---|---|
| `jest` (whole repo, `--maxWorkers=3`) | 747 suites passed, 2 skipped (the opt-in database suites); 11,391 tests passed, 12 skipped, **0 failed**; 62 s | this run, `97acd163` |
| `tsc --noEmit` | 0 errors | this run |
| `next lint` | 0 errors, 33 warnings | certification §Z (`6355ce63`; `97acd163` changes only docs) |
| `next build` | OK | certification §Z and CI `verify` on `97acd163` |
| Playwright, 31 specs on a production build | 259 passed, 7 failed, 7 skipped. The 7 are explained in service audit §7: 5 test hosts outside CSP `connect-src`, 1 dev-only expectation, 1 real bug fixed | certification §Z |
| Lease queue E / F / G on a real Postgres + PostgREST | 7 / 7 | `scripts/lease-isolation/run.sh`, certification §D |

The Playwright failures are not product bugs, but they stay red on a production build. PART 7 fixes them in the specs:
the test hosts go into a test-only CSP allowance, and the dev-only spec gets an explicit skip reason.

## 3. Environments, flags and providers

The Vercel connector answers 403 for environment variables, so the values below come from the code's defaults and from
the owner's own changes recorded in the certification. They were not read from Vercel.

| Flag | Production | Preview | Effect |
|---|---|---|---|
| `AGENT_G_MEDIA_EXEC` | unset = off | unset on a Preview = admins only (`lib/agent/media/access.ts`) | Agent G montage, MP3 extraction, Task API worker kicks |
| `MEDIA_GOOGLE_ONLY` | unset = off | unset = off | on: image on Google, tools without a Google engine refused before any charge (owner action 9) |
| `VIDEO_DIRECTOR_RUNS` | unset = off | `admin` | the V1–V6 film director |
| `GEMINI_TRANSPORT` | API key | `vertex` (INFERENCE VERIFIED) | switching Production is the owner's decision |
| `RENDER_DRAINER_ENABLED` | as set by the owner | as set by the owner | the drain-renders reap leg |
| `HAWK_API_KEY` | not set | not set | HawkScan cannot run (certification §P) |

**Providers.** Google (Gemini, Imagen on the API key, Veo on Vertex, Lyria) and ElevenLabs are the allowed engines.
Nine of the 22 services still run a forbidden provider as their primary engine (service audit §7: character swap,
motion, remix, image, photoshoot, interior, avatar, music, 3D) until `MEDIA_GOOGLE_ONLY` is turned on. No path falls
back from one outside engine to another (fixed on PR #50).

## 4. Database (Production, read only)

- **Migrations applied:** 15. The newest are `20261009b_renders_private`, `20261009a_function_hardening` and
  `20261008c/d`. `supabase/migrations/20261002d_ledger_ref_race_hardening.sql` was prepared on 2026-10-02 and **never
  applied**.
- **Ledger functions:** `deduct_credits`, `refund_credits`, `add_credits`, `credit_wallet_gel`,
  `handle_auth_user_starter_balance`, `update_credits_balance` (trigger). None is executable by anon or authenticated.
- **`deduct_credits` same-ref race: confirmed in the live definition.** The idempotency `EXISTS` check runs before the
  `FOR UPDATE` lock, and the lock is on `profiles`, not on the ref. Two concurrent calls with one ref can both pass the
  check and both insert. Only refunds have a unique index on the ref (`credit_ledger_user_ref_positive_uniq`); debits
  have none. The data has 0 duplicate debit refs and 0 debits without a ref today, so the fix's unique index builds
  cleanly.
- **Refunds:** 29 refund rows have no debit with the same ref. All 29 were traced to their debit by the older ref
  conventions (`<debit ref>:refund`; one `audit:…:refund1` for `…:debit1`; two music partial refunds of 3 credits
  against an 8-credit debit). No refund minted credits.
- **Jobs:** 373 `generation_jobs` rows, 0 active, 2 on the lease queue (`params._exec`). The status values in use are
  `completed` and `failed`.

## 5. How a request becomes work today

Four surfaces route a user's words to work, and each routes them by its own rules:

1. **Typed chat** (`components/studio/OmniStudio.tsx` `send()`, line 5702): a 19-step chain of keyword detectors. The
   steps are guest gate → MP3 extraction → sticky-mode release → focus gate (`lib/chat/focusGate.ts`) → photo editor →
   image / music jobs → montage → studio intent → catalog route → video remix → storyboard → avatar → plain Gemini
   chat. The chain never calls Agent G's ReAct loop.
2. **Composer Run with Product, Swap or Remix active** (`runTool`, line 7117): starts the paid job directly. No question
   check runs.
3. **Live Voice** (`lib/voice/liveTools.ts`, `components/voice/live/liveActions.ts`): 25 functions. `start_generation`
   and `extract_audio start` accept the model's `confirmed: "yes"` as the user's approval.
4. **Agent terminal and voice `ask_agent_g`** (`/api/agent/run`, `lib/agent/react`): the ReAct loop with the typed tool
   registry (read / prepare / quote only).

Long-running work lands in `generation_jobs`, which the Task API (`/api/tasks`) reads. It is written either by studio
renders (read-only through the API, never cancellable there) or by Agent G's lease queue (montage, MP3). `studio_jobs`
(Higgsfield studio runtime and VFX motion) is a second store outside the Task API.

**Dead stacks.** 14 older orchestration stacks have no live caller. Among them:
- `lib/agent-g/orchestrator`, `/api/agent-g/{execute,plan,orchestrate,run-task,status,delegate,chat,…}`
- `lib/agentg`, and `lib/agents/{agentGRouter,orchestrator,…}` with `/api/agents/*`
- `/api/orchestrate`, `/api/router`, `lib/decision-engine`, `lib/automation`
- `/api/executive/*`, `lib/agent/videoQueue`, `/api/jobs/*`
- the old `/api/tasks/<id>/status|cancel` on `agent_g_tasks`

Most of them read tables that do not exist in Production. The full list with proofs is the orchestrator inventory in
this report's working notes, summarized in §6 A7.

Status vocabularies conflict:
- cancelled: `cancelled` / `canceled`, or cancel stored as `failed` + a `cancel…` error
- finished: `completed` / `done` / `succeeded`
- waiting: `pending` / `queued`
- working: `processing` / `running` / `rendering`

## 6. Gap analysis against the Master Task

Severity: **P0** = launch-critical or a money / security / integrity defect. **P1** = a promised capability is broken or
missing. **P2** = quality or debt. "Part" is where it is fixed. **BLOCKED_OWNER** means it needs the owner's word.

### Architecture and language understanding (§2)

| ID | Gap | Sev. | Part |
|---|---|---|---|
| A1 | No shared intent / plan / approval contract: chat, voice, terminal and panel buttons each decide on their own | P0 | 1 |
| A2 | Product / Swap / Remix: every Enter is a paid job, even a question; in Image mode a declarative ("i don't like it", 4 words) becomes a priced confirm card | P0 | 1 |
| A3 | Typed control intents missing: "stop" / „შეწყვიტე", "where are you" / „სადამდე მიხვედი?", "continue" / „გააგრძელე" | P1 | 1 |
| A4 | No reuse of the previous result: "change the colours of the previous result" renders a new image without a reference; "next scene, same character" starts a fresh storyboard | P1 | 1 + 3 |
| A5 | Montage words ignored: "music from 5 s", "20-second ad" (aspect is already read) | P1 | 1 + 3 |
| A6 | Typed chat never reaches the ReAct agent. Plain chat keeps Gemini's own `google_search` / `url_context`; ReAct stays for voice and the terminal; both read one tool registry | P2 | 1 |
| A7 | 14 dead orchestration stacks (§5) | P2 | 1: pinned by a ratchet; removal on the owner's word |

### Tool registry (§3)

| ID | Gap | Sev. | Part |
|---|---|---|---|
| R1 | The registry covers only Agent G's model tools and two confirmed actions. The 22 services' executors have no typed record of capability status, price, confirmation, timeout, retry, idempotency, error codes, QC and artifact | P0 | 1 |
| R2 | music.remix and code.terminal have no executor (MISSING). They stay DISABLED with a stated reason; code.terminal waits for the sandbox host | P1 | 1 / BLOCKED_OWNER |

### Media (§4)

| ID | Gap | Sev. | Part |
|---|---|---|---|
| M1 | Slice 2 is missing as Agent G actions: trim, split, join, mix, music offset, volume, fade, captions, aspect, speed, thumbnail, export. The FFmpeg ops already exist (`lib/video/remixOps.ts`, `lib/video/surgicalOps.ts`) but only the editor and the chat remix call them | P1 | 3 |
| M2 | Montage: no user music offset or target length from words; unused clips are already named in the quote | P1 | 3 |
| M3 | Voice cannot start Agent G's montage (`ask_agent_g` sends no files) | P1 | 4 |
| M4 | The free montage editor (`/api/v2/montage/render`) is rate-limited per IP only | P2 | 5 |

### Persistent runs (§5)

| ID | Gap | Sev. | Part |
|---|---|---|---|
| T1 | No multi-step run: no parent task, steps, dependencies, checkpoints, resume or `partially_completed` | P0 | 2 |
| T2 | Status vocabularies conflict (§5); `generation_jobs` has no `cancelled` | P1 | 2 |
| T3 | Studio renders cannot be stopped through the Task API (409); `studio_jobs` is outside it | P1 | 2 |
| T4 | Voice `stop{generation}` stops only the browser's queue and never calls `POST /api/tasks` | P1 | 4 |

### Live Voice (§6)

| ID | Gap | Sev. | Part |
|---|---|---|---|
| V1 | Approval is the model's argument only (`liveTools.ts:988`, `:1204`). The user's own yes is checked nowhere | P0 | 4 |
| V2 | Voice paid generations send `explicit: true`, which skips Agent G's price card (`focusGate.ts:221`); studio routes keep no approval record | P0 | 4 + 5 |
| V3 | `extract_audio start` presses the newest quoted card, not the one discussed; it has no countdown | P1 | 4 |
| V4 | `ask_agent_g` → `quote_audio_from_link`: `/api/agent/run` returns `audioQuote` but `fetchAgentRun` drops it (`liveActions.ts:206`), so the model describes a plan that has no card. **Bug** | P1 | 4 |
| V5 | The countdown runs whatever prompt is on screen when it ends, not the prompt that was quoted | P1 | 4 |
| V6 | Voice ReAct answers and their sources never reach the chat; a call that ends mid-answer throws it away | P1 | 4 |
| V7 | No task-status tool: `get_screen_state` lists only the browser's queue, so Agent G and server jobs are invisible to the model | P1 | 4 |

### Browser, research, sandbox (§7)

| ID | Gap | Sev. | Part |
|---|---|---|---|
| B1 | No browser control (navigate, click, type in an isolated browser). Needs a paid isolated host | P1 | BLOCKED_OWNER (decision brief in 5) |
| B2 | Sandbox: contract only (`lib/agent/sandbox/policy.ts`), runner refuses everything | P1 | BLOCKED_OWNER (paid host) |
| B3 | Research tools exist (`web_search`, `scrape_webpage`, voice `read_webpage`); their SSRF, redirect and injection handling is re-checked in PART 5 | P2 | 5 |

### Billing (§8)

| ID | Gap | Sev. | Part |
|---|---|---|---|
| C1 | `deduct_credits` same-ref double debit (§4). The fix is `20261002d`, prepared and not applied | P0 | 5: prove in isolation; apply = BLOCKED_OWNER |
| C2 | Films and music videos charge 20 credits per lip-sync pass on top of the quoted film price (`/api/video/lipsync`, `OmniStudio.tsx:565`, `:663`); the quote never shows it | P0 | 5 (show it) + BLOCKED_OWNER (keep, fold or drop) |
| C3 | Dubbing, presentation, upscale and audio isolation call paid engines and charge nothing; free FFmpeg routes have no daily per-user quota | P1 | 5 (quotas) + BLOCKED_OWNER (prices) |
| C4 | Several price tables: `lib/monetization/credits.ts` still feeds the client display in `hooks/useCredits.ts`; the credit packs disagree (25/75/149 GEL vs 9/29/89 GEL) | P1 | 5 + BLOCKED_OWNER (owner action 7) |
| C5 | A replayed ref answers success with no debit; only image and music check `debitExistsForRef` first, so a byte-identical produce replay renders free | P1 | 5 |
| C6 | Charges taken after the provider call on some live paths (`/api/chat/orchestrate`, providerRouter poll charges) | P1 | 5 |

### Provider boundary (§9), one window (§10), security (§11), observability (§13)

| ID | Gap | Sev. | Part |
|---|---|---|---|
| P1 | Nine services on forbidden primary engines until `MEDIA_GOOGLE_ONLY` is on | P0 | BLOCKED_OWNER (action 9); PART 5 re-checks every path |
| U1 | Agent G task cards show steps and results, but not credits reserved or spent, retry, or a resumable multi-step run | P1 | 6 |
| S1 | Legacy Vapi tool `get_job_status` reads any `service_jobs` id without an owner check. The table is missing in Production and the Vapi webhooks fail closed on PR #50 | P2 | 5 |
| O1 | Audit rows (`audit.agent_g.media`) lack `run_id`, `tool_id` and the approval channel; no alert for stuck jobs, expired leases or refund debts beyond the sweep. Sentry DSN unset (owner action 12) | P1 | 2 + 5 |

### Gemini native intelligence (the owner's supplement, 06:00Z)

The supplement extends this Master Task; it adds no second architecture. What exists today, read from the code and from
Production (read only):

| Area | What exists | Evidence |
|---|---|---|
| Video in chat | The browser makes a digest: 8 frames (JPEG, ≤ 768 px) and the first 60 s of speech (8 kHz WAV), sent inline. The clip itself never reaches Gemini, because the request body is capped near 4.5 MB | `lib/chat/videoDigest.ts` |
| Images, PDF, audio in chat | Sent inline as image or file parts | `app/api/chat/gemini/route.ts:310-313` |
| Function calling | Text chat: Google's own `google_search` and `url_context` only. ReAct: a JSON prompt protocol, not native function calling. Live Voice: native function declarations (25 functions), written by hand, not generated from the typed registry | `lib/ai/google/chatStream.ts:565`, `lib/agent/react/coordinator.ts`, `lib/voice/liveTools.ts` |
| Context caching | None. Only Deep Research reads `cachedTokens` from usage | `lib/research/parse.ts` |
| Memory | `memories` table in Production: RLS `auth.uid() = user_id`, 1 row. `match_memories` filters by `auth.uid()` and is not SECURITY DEFINER. `/api/memory` lists, adds, edits and deletes one fact; the `/memory` page shows them. The chat fetches the top 5 before each turn and fails open. Nothing writes memories automatically | Production SQL, `app/api/memory/route.ts`, `app/api/chat/gemini/route.ts:380-391` |
| Live | Session resumption, sliding-window compression, reconnect on `goAway`, barge-in stop. Default model `gemini-2.5-flash-native-audio-latest`; `gemini-3.8-live` is listed but not verified at runtime. Live always uses the API key through an ephemeral token, also on a Preview set to Vertex | `components/voice/live/useGeminiLiveSession.ts:21-25`, `lib/ai/google/models.ts`, `app/api/voice/live/route.ts:164` |
| Grounding | Chat answers carry `{url, title}` sources (filtered by a safe-URL check, capped) and billed search counts. No dates or page metadata. Deep Research needs `research_jobs`, which Production does not have, so it shows as "opening soon" | `lib/ai/google/chatStream.ts:493-651`, `lib/research/capabilities.ts` |
| Transport and models | `GEMINI_TRANSPORT` fails closed with no fallback to the API key; Vertex on the Preview, the API key in Production. Retired 1.0 / 1.5 / 2.0 models are refused by the catalog | `lib/ai/google/transport.ts:48-51`, `lib/models/catalog.ts` |
| Cost metrics | Token usage per chat turn is booked against the platform budget. There is no cached-token count, no latency and no cost per task | `lib/services/billing/chatBudget.ts` |

| ID | Gap | Sev. | Part |
|---|---|---|---|
| G0 | No capability matrix of Gemini features by model, transport and environment | P1 | 1 (written), 7 (proven columns) |
| G1 | No native understanding of a whole video, audio or PDF the user owns: the chat sees 8 frames and one minute of speech. Needed: an Agent G "analyze my file" action that hands Gemini the stored file by reference (scenes, objects, timestamps, transcript, speakers), with FFmpeg still deciding every cut. A public YouTube URL is accepted for analysis only; it is never downloaded or turned into MP3 | P1 | 3; real runs need the owner's word on the test spend |
| G2 | No native function calling from the typed registry. Fix: declarations generated from the registry (zod → JSON schema), validated by the existing `bindTools`, tool-call ids kept, unknown or unauthorized tools refused, read / prepare / quote unchanged, a model's "yes" never counted as approval. Compared with the current routing on recorded cases first, then on the Preview | P1 | 1 (adapter + offline comparison), 4 (Live), 7 (live comparison) |
| G3 | No context caching and no cache metrics. Implicit cache hits are read from `usage` and recorded first; an explicit cache (a stored, billed resource with a TTL) is created only if the measured repeated prefix justifies it, and only on the owner's word | P2 | 5 (metrics); explicit cache = BLOCKED_OWNER |
| G4 | Memory is per-fact and manual only: no automatic, consented memory from conversations; no "delete all"; voice and ReAct never read it; nothing caps what is injected | P1 | 2 |
| G5 | Live: no task-status tool, no background handoff of long work, no spoken progress (V6, V7); `gemini-3.8-live` not verified; Live is not on Vertex because the browser token is an API-key feature, and a server relay would need a host that holds WebSockets | P1 | 4; real-device proof and any Live relay host = BLOCKED_OWNER |
| G6 | Grounding: sources lack dates and page metadata; no regression test for instructions hidden in fetched pages; Deep Research is off in Production until its migration (`20261003b`) is applied | P1 | 5; migration = BLOCKED_OWNER |
| G7 | No latency, cached-token or per-task cost baseline. Production bills Gemini on the API key until the owner switches `GEMINI_TRANSPORT` | P1 | 5 (baseline), 7 (after); transport switch = BLOCKED_OWNER |
| G8 | Streaming agent UX: chat streams text and sources, task cards poll the Task API. There is no single event stream for Thinking → Tool → Awaiting approval → Running → QC → Delivered | P1 | 2 (run events), 6 (UI) |

## 7. What each part delivers, and what stays with the owner

- **PART 1:** one contract set (`lib/agent/contracts.ts`); one intent classifier for KA / EN / RU built on the
  existing detectors (`lib/agent/intent.ts`); one capability registry for all 22 services and Agent G's actions,
  pinned to the catalog; the chat fixes A2, A3, A5; regression tests for the owner's 13 example sentences; the
  Gemini capability matrix (G0); function declarations generated from the registry, with an offline comparison
  against today's routing (G2).
- **PART 2:** one status model across stores; multi-step `agent-run` jobs on the lease queue (parent with child steps,
  checkpoints, resume, cancel, `partially_completed`), with no migration. A dedicated-table migration is drafted only
  if a need is proven. Run events for the streaming UX (G8); memory read by every surface, with a cap and "delete
  all" (G4).
- **PART 3:** typed media-edit actions over the existing FFmpeg ops (M1, M2), editing a previous result; the
  "analyze my file" action (G1).
- **PART 4:** server-recorded approvals; voice uses the same quote → approve → task contract as text (V1–V7, M3, T4);
  Live tools from the registry, task status and background handoff (G5).
- **PART 5:** the ledger race proven in isolation and its migration put to the owner; quotas for free operations; the
  lip-sync charge shown; price-table and provider checks; browser / sandbox decision brief; cache, latency and cost
  metrics (G3, G7); grounding dates and the hidden-instruction regression (G6).
- **PART 6:** task cards with credits, retry, steps and resume; mobile and KA / EN / RU checks.
- **PART 7:** full regression, chaos runs, the Preview runs (they need the owner's admin session) and
  `docs/handoffs/AGENT_G_FINAL_E2E_CERTIFICATION.md`.

**Owner decisions known now (BLOCKED_OWNER):**
- apply `20261002d`
- the lip-sync charge
- prices for dubbing, presentation and upscale
- the credit-pack table
- `MEDIA_GOOGLE_ONLY`
- browser and sandbox hosts (paid)
- PR #50 merge and the Production deploy
- the A–D Preview run as admin
- paid Gemini test calls beyond today's chat use (file analysis, the function-calling comparison, Live model checks)
- an explicit context cache, the Deep Research migration `20261003b`, Production `GEMINI_TRANSPORT`
- real-device Live checks (the owner's phone) and any host for a Live relay

## 8. Self-check: what can still fail for a real user even when these tests pass

- Every Agent G path on PR #50 is off in Production. The flag's admin-only default on a Preview means the montage and MP3
  paths have run only on the owner's own admin session.
- The 22 services have no recent live run on the current code (service audit §7: none PROVEN end to end).
- A voice "yes" is the model's word; until PART 4 a misheard yes can start a paid render.
- Two concurrent requests with one ref can be charged twice until `20261002d` is applied.
- Gemini sees 8 frames of a long video, so "find the best moments" can miss a scene until G1 lands.
- Only one person has a stored memory in Production; the memory path has almost no real traffic behind it.
