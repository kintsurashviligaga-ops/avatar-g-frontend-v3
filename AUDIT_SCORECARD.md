# MyAvatar.ge v180 — Audit Scorecard

**Branch:** `feat/prod-upgrade-v180` @ `0293f34` · **Date:** 2026-07-03 · **Scope:** branch-only, no deploy, no merge.

**Gates honored:** $0 paid API spend · DB DDL not applied (401) → all in-DB writes marked BLOCKED, not faked · no fabricated passes · no blanket memoization · no hard-deletes.

This is a **deeper code-level audit + honest readiness scorecard** layered on top of the already-done end-to-end QA sweep ([END_TO_END_QA.md](END_TO_END_QA.md)). It is **not** a rebuild and **not** a re-run that invents results. Where something cannot be measured under the gates, it is marked **INCOMPLETE** with the exact resources needed to measure it.

---

## STAGE 1 — Code-level audit (static + read)

**Method:** 13-agent workflow — 5 independent dimension finders (dead handlers / unreachable code, overflow risk, agent+pipeline error handling, telemetry wiring, type-safety) → each finding adversarially verified by a skeptic prompted to *refute*.

**Result: 1 real bug found and fixed · 7 findings correctly rejected as false positives.**

### The one real finding (fixed)

`lib/agent/optimizer/approveProposal.ts` — `rejectProposal()` filtered `.eq('status', 'pending')`, but the optimizer writes proposals with status `'proposed'` (the table default + partial-unique-index value). Reject therefore matched **0 rows and silently no-op'd** — a reviewer clicking "reject" would get a success-shaped response while the proposal stayed open.

- **Fix:** single-sourced `export const OPEN_PROPOSAL_STATUS: ProposalStatus = 'proposed'` in `lib/agent/optimizer/configVersioning.ts:19` and used it in all three filters (claim, revert, reject).
- **Regression guard:** `lib/agent/optimizer/configVersioning.test.ts` asserts the constant is `'proposed'` and that both transitions are legal.
- **Commit:** `0293f34` — tsc clean, 6/6 optimizer tests green. **Branch-only** (production `main` still carries the old code, by the gate).

### The 7 rejected false positives (why they were not real)

- "Gemini-retry inconsistency" (×3 variants) — premise wrong: the Atlas/DeepSeek path throws on the same condition, so behavior is consistent; no divergence.
- "Modal max-width overflow" — `width:100%` inside a 16px-padded overlay cannot overflow the viewport; no real risk.
- Compile-time-only `!` non-null assertions on env keys (×2) — guarded at runtime before use; the `!` is a type hint, not a runtime hazard.
- One "unreachable onClick" — reachable via the hash-router branch the finder didn't trace.

### Error handling — confirmed present (not a gap)

- **Provider APIs:** `withRetry` (bounded attempts + backoff) wraps the 4 provider calls; missing keys produce a **clean 502 with an explicit message**, never a crash.
- **Agent:** `MAX_GOAL_CHARS=2000`, `MAX_STEPS_CAP=8`, auth-gated (`401` unauthenticated), bounded ReAct loop.
- **Optimizer:** fail-soft — `approveProposal`/`rejectProposal` never throw; on promotion failure the claim is reverted (`approveProposal.ts:42,51`).

---

## STAGE 2 — Dry-run each surface to the paid boundary ($0 spent)

Each surface was driven with real input up to — and stopping at — the first paid API call. **No paid render fired.**

| Surface | Input validation (verified) | Boundary reached | Would call |
|---|---|---|---|
| `/api/ads/tts` | empty → `400`; 2001 chars → `413`; valid → passes | `502` "missing ELEVENLABS_API_KEY" | ElevenLabs TTS |
| `/api/agent/run` | unauth → `401`; goal capped 2000; steps capped 8 | auth wall (no session) | DeepSeek/Atlas LLM |
| Product-Ad remix | `checkAdBudget` → `402 topUpNeeded` at `remix/route.ts:185` **before** `klingI2v` at `:189` | budget guard (never spends) | Kling i2v |
| Image | zod-validated brief | provider dispatch | Replicate / FLUX |
| Video | orchestrate route zod-validated | provider dispatch | Kling |
| Music | brief accepted | provider dispatch | ElevenLabs Music → MusicGen |
| Avatar | brief accepted | provider dispatch | HeyGen |

- **Credits gate:** present in 11 route files; the budget check is ordered *before* the paid call in every path inspected.
- **Self-improving loop (code-verified):** the optimizer reads feedback, proposes to `prompt_optimization_proposals` with status `'proposed'`, **writes only proposals, never mutates a live config**; promotion requires an explicit admin approval RPC.
- **DB-write verification: BLOCKED** — `agent_execution_feedback` and `agent_configs` (+ additive proposal columns) are **not applied** (DDL channel returns 401). Their code paths are covered at fixture level only; real in-DB read/write is **unverified until `MIGRATIONS_TO_APPLY.sql` is run.**

---

## STAGE 3 — CWV / bundle (REAL measured numbers, no invented targets)

**Production build:** `next build` → **exit 0**, types valid, **376/376 static pages generated, 0 code warnings** (only the benign `PackFileCacheStrategy` serialization note). Full test suite: **791 tests / 81 suites pass** (1.6s).

### Real First Load JS (from the build's route table)

| Route | Route size | First Load JS |
|---|---|---|
| **Shared by all** | — | **88.3 kB** (framework 53.7 + app-shared 31.9) |
| Middleware | — | 73.9 kB |
| `/[locale]/dashboard` (**the product** — ChatChrome + OmniStudio) | 6.23 kB | **223 kB** |
| `/[locale]/admin/agent-proposals` (**new** STEP 5 admin view) | 1.64 kB | 90 kB |
| `/[locale]/agent-terminal` (redirect stub → `/dashboard#agent`) | 196 B | 88.5 kB |
| `/[locale]/agent`, `/dashboard/agent-g` (redirect stubs → graveyard) | 198 B | 214 kB* |
| `/api/agent/*`, `/api/ads/tts`, feedback routes | 0 B | 0 B (server-only) |

\* the 214 kB is shared framework, not the stub's own code (its route is 198 B).

### Optimization decision — measurement justifies applying *nothing new*

- **Code-splitting already sits exactly where the weight is.** Every heavy v180 surface is `dynamic()` + `ssr:false`: `OmniStudio`, `LipsyncStudio`, `ConversationalFilmStudio`, `AgentTerminal` (`ServiceHub.tsx:46-51`) and `FilmDirectorConsole`, `RemixStudioConsole` (`OmniStudio.tsx:23-24`). The eager 223 kB on `/dashboard` is the shell + shared deps; mode-specific consoles load on demand. No further split is justified — the split is already at the boundary.
- **The v180 additions barely move the bundle:** the new admin view is baseline **+1.64 kB**; the agent one-window loads *inside* `/dashboard` via dynamic import (no new eager route); the retired routes are 196–198 B redirect stubs.
- **No blanket `useMemo`/`useCallback` added** — per the gate, and because no re-render hotspot was measured. Code-level review of the new components (AgentTerminal etc.) found them appropriately scoped (no inline-object props feeding a hot list, no obvious re-render amplifier).
- **Honest limitation:** a real React Profiler **re-render time (ms)** requires an interactive browser session; it cannot be produced headlessly, so no such number is claimed here. Field CWV (LCP/INP/CLS) likewise needs a live deploy with real traffic (see below). The numbers above are **lab bundle sizes**, which is what can be measured honestly under the gates.

**Hardening applied this stage:** the one real STAGE-1 bug (`0293f34`). Nothing else changed, because nothing else was measured to need changing.

---

## STAGE 4 — Honest readiness scorecard

### UI / UX + mobile — **8.5 / 10**

Verified interactively: onboarding → profile-once → dashboard is clean; all 6 services load and accept input in the main window; the agent runs one-window (live process, prompt handoff, IG gate) on **desktop and 375px**; mobile overflow hardened; the blue-ghost overlay fixed. **−1.5:** no full accessibility/contrast pass; not verified pixel-perfect across the full device matrix (walked, not exhaustively swept).

### Code integrity — **9 / 10**

`tsc` strict clean · 791 tests / 81 suites green · build 0 warnings · 376 pages generate · error handling present (retry/backoff, fail-soft, clean-fail on missing keys) · dead routes graveyarded, not left dangling · the one audit bug fixed with a regression guard. **−1:** two v180 tables are DDL-blocked, so their runtime DB behavior is fixture-tested only — proven in code, not yet in a live database.

### End-to-end pipeline success rate — **INCOMPLETE (cannot be scored)**

This number is **withheld, not estimated.** It cannot be measured under the audit gates, and inventing it would violate the no-fabrication rule. Three hard blockers stand between here and a real measurement:

1. **ElevenLabs is out of credits** (`quota_exceeded`, 1/14) → no real TTS/alignment → no real captioned lip-sync frame → the 2.6 close cannot complete.
2. **Two v180 tables are not applied** (`agent_execution_feedback`, `agent_configs` + proposal columns; DDL 401) → feedback telemetry, the optimizer, and the approve→promote flow cannot read/write in a real DB.
3. **No real paid render has been run** ($0 gate) → no real Kling clip, assemble, or master exists on this branch to score.

#### Exact resources needed for a TRUE end-to-end evaluation

1. **ElevenLabs credits** topped up (or an `ELEVENLABS_API_KEY` with live quota) — unblocks TTS, alignment, and the captioned lip-sync frame.
2. **Run `MIGRATIONS_TO_APPLY.sql`** in Supabase — either paste into the dashboard SQL editor, or restore the DDL channel (a valid `sbp_` PAT or the DB password for `supabase db push`). Additive + RLS-only; safe to apply.
3. **A small funded render budget** (a few dollars of provider credit) for one real pipeline: Kling i2v (~$0.25/clip) + ElevenLabs Music + assemble → master.
4. **One authenticated real user session** to drive the agent and the 6 services end-to-end and capture the actual asset, latency, and cost.
5. *(Optional, for field CWV)* a **live Vercel deploy of the branch** with the above env keys — to measure real LCP/INP/CLS instead of the lab bundle sizes reported in STAGE 3.

With items 1–4 in place, a single real run produces the first honest pipeline-success data point; a handful of runs produces a rate.

---

### Bottom line

The v180 code is **statically sound and ships clean** (types, tests, build all green; one real bug found by the audit and fixed). What remains genuinely unproven is **not code quality** — it is the **live end-to-end pipeline**, which is gated entirely on external resources (EL credits + the DB migration + a funded run), not on further code changes.
