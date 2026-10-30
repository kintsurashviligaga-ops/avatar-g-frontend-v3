# MyAvatar.ge engineering registry

One list of what is done, open and blocked across both work streams that touch this repository.
Snapshot: **2026-10-30 13:00Z**, main = `8766dea` (#233), production = `dpl_CyxgVqhmZ1H3kUiThp5MzcCUw8iq` READY.

Update this file in the same PR that changes a row's state. One file, one owner per row, so the two streams stay one product.

## 0. What this registry can and cannot see

| Source | Seen? |
|---|---|
| Claude project "Final master task." (threads, decisions, project memory) | Yes |
| GitHub main, all open PRs, last 20 closed PRs | Yes |
| Vercel production deployments (project `prj_k4LQeBUGIAfsXC3ijPTXplTWM5eH`) | Yes |
| Claude project "MyAvatar.ge — Agent G Super App" (its chats) | **No.** Not readable from this project |
| Agent G Super App **Master Task v2.0 PDF** | **No.** Not uploaded here. Its content is not assumed anywhere below |
| PRs #224–#233 (music player work, merged 2026-10-28…30) | Yes as code, but they were not made in this project. Their author/stream is to be confirmed by GG |

## 1. Streams

| Stream | Scope | Where it is driven |
|---|---|---|
| **A. Production product** (MASTER TASK v3.1 + P0 tasks) | One Window / chat composer, Live call + talking avatar, Video (Veo / Omni), Music (Lyria), Image, billing that fails closed, Vertex only | This project |
| **B. Agent G Super App** (Master Task v2.0) | Execution Engine, Browser Control, MCP Client, Code Sandbox, Work Mode | The other Claude project. Phase 0 = audit of current state vs v2.0 (PDF needed) |

Rule: B builds **on** the existing Agent G code (section 4). No second orchestrator, no second chat surface.

## 2. Stream A: done (in production)

| Area | What | PRs |
|---|---|---|
| Phase 1 (v3.1) | Strict Vertex, Google-only media, fail-closed budget, quote token v2, Cloud/Gemini TTS, Lyria, Veo Vertex rows, Imagen 3 lifecycle block, curated avatars, dead vendor code removed | #115–#154 |
| Phase 2 | One loader (percent + label), nine card states, one primary action, dead screens deleted | #155–#164 |
| Phase 3 | Library favourites per account and more | #166–#174 |
| Phase 4 speech | Mic dictation (Georgian long-form, Apple all languages, Russian not translated) | #175–#200 |
| Live call | Relay on Cloud Run (EU), personas, language fixes, spoken "yes" fixes, iPhone stall retry | #191, #194, #198, #203, #205–#219 |
| Talking avatar | Vertex Gemini 3.8 Live, prebuilt faces, GG + admins only, 5-min cap | #208 |
| Video | One clip like Veo, Omni for Georgian lines, upload edit/extend, „გააგრძელე" continues the clip | #209, #221 |
| Music | Sung vocals in the brief's language (`MUSIC_LYRIA_VOCALS_VERIFIED=1` in prod) | #222 |
| Chat history | Reopened chats show their results; continue works after reopen | #223 |
| Music player UI | Preview card, PCM beat-synced visualizer, smoke orb, seek rail | #224–#233 (outside this project) |

## 3. Stream A: open, blocked, not started

| # | Item | State | Blocked on | Next step |
|---|---|---|---|---|
| A1 | **Remove the product-ad service** (GG 2026-10-27) | Draft PR #235: hidden from every menu, search, Agent G and Live; `/api/video/remix productad` → 410 before any charge | GG merge card (from the "Remove product ad service" thread) | Merge on GG's OK, check prod health |
| A2 | #220 iPhone relay hello/ack/nudge | Draft, mergeable | GG's iPhone test result on the test link; relay tag `iphone` (0 % traffic, min-instances 1) still costs money until removed | GG tests → relay deploy first, then app merge, each on a card |
| A3 | #195 test branch (personas + relay) | Draft, **do not merge** | — | Close after A2 lands; remove relay tag `iphone` |
| A4 | Own-photo Live avatar (#190) | BLOCKED_EXTERNAL; PR conflicts with main | Google allowlist for `gen-lang-client-0671348730` (GG sent the request 2026-10-27) | Wait for Google; then rebase #190 |
| A5 | Mic #202 (no filler sounds) | Draft, **conflicts** with main | GG card (2026-10-25) unanswered | Rebase, then card |
| A6 | Mic #201 (owner trial of transcribe model) | Draft, mergeable | Same GG card | Card |
| A7 | #216 bind spoken yes to the prepared quote (codex) | Draft, mergeable | Review vs #213/#218/#219 (overlapping logic in `liveActions.ts`) | Review, decide keep/close |
| A8 | Phase 3 decisions 3 (live chat benchmark) and 4 (Preview test account) | Open decisions | GG | — |
| A9 | Omni clip links expire after 7 days in chat bubbles | Known limit | GG OK (new owner-checked re-sign route = security surface) | Offer as a PR |
| A10 | Video gaps: refine „უკეთესად" skips explicit send in Video tool; chips say "Veo 3.1 Fast" after an Omni clip | Not started | — | Small PRs |
| A11 | GCP $20 budget alert | Offered, unanswered | GG | — |
| A12 | #114 Phase 0 audit docs (v3.1) | Draft, docs only | — | Merge or close; it is history now |
| A13 | Old codex / claude drafts #43 #44 #51 #64 #66 #79 #103 #105–#110 #112 #116 | Stale (Oct 8–22) | GG | Triage: close the superseded ones, keep audit value in this file |

## 4. Stream B: existing Agent G architecture to build on

Code that already exists on main (read, not changed, for this registry):

| Area | Location | Note |
|---|---|---|
| Run engine (spec → exec → card, approvals, isolation) | `lib/agent/run/*`, `lib/agent/approval.ts` | Natural home for an **Execution Engine** |
| Tool registry + declarations | `lib/agent/tools/{registry,declarations}.ts` (googleSearch, scrapeWebpage, prepareInstagramPost) | Browser Control and MCP tools should register here |
| Sandbox policy | `lib/agent/sandbox/policy.ts` | Starting point for a **Code Sandbox** policy; no execution runtime yet |
| Intent / routing | `lib/agent/intent.ts`, `lib/catalog/agentRoute.ts`, `lib/agents/*`, `lib/agent-g/orchestrator/*` | Three generations of orchestrators coexist; Phase 0 must pick one |
| Live ↔ agent bridge | `lib/agent/react/*`, `components/voice/live/liveActions.ts` | Live call tasks go through here |
| MCP | `lib/mcp/skills-manifest.ts` (manifest only) | No MCP client yet |
| Browser control | none (scrapeWebpage is fetch-based) | New |
| Work Mode | none found | New |

Phase 0 for stream B = map the v2.0 requirements onto this table. That needs the v2.0 PDF in this project (`/mnt/project-files/`).

## 5. Conflict risks

| Risk | Files | Rule |
|---|---|---|
| Two streams editing the chat surface | `components/studio/OmniStudio.tsx` (~9k lines), `components/chat/composer/*`, `lib/catalog/services.ts` | One open PR at a time touches these; new UI in its own files |
| Live call logic | `components/voice/live/*`, `lib/voice/*`, `services/live-relay/*` | #220, #216 and any Work-Mode voice work queue behind each other |
| Agent routing | `lib/agent/*`, `lib/catalog/agentRoute.ts` | Stream B owns new modules; Stream A only bug-fixes here |
| Shared rollback log | `docs/master-v3.1/MIGRATION_ROLLBACK.md` | #201, #202, #220 all append rows → rebase conflicts; append-only, rebase before merge |
| Production deploys | `main` auto-deploys to production | Never two merges in flight; each merge waits for READY + health 6/6 |
| Shared prod DB / wallet | Previews share Production's Supabase | No migration and no paid test without GG's OK; Previews block paid generation |
| Music player PRs from outside this project | `components/studio/music/*`, `TrackPlayer.tsx`, `lib/security/csp.js` | Stream A treats these as owned by their author; coordinate before editing |

## 6. Recommended order

1. **A1** product-ad removal → draft PR (no paid calls, reversible).
2. **A2** #220 on GG's iPhone test → relay first, app second; then **A3** close #195 and drop the relay tag (stops its cost).
3. **A5/A6** rebase #202, one card for #201 + #202.
4. **A7** review #216 against the merged yes-logic.
5. **A13** triage stale drafts (close superseded, one card).
6. **A10**, **A9** small video fixes.
7. Stream **B Phase 0** once the v2.0 PDF is in the project: audit only, docs PR, no code.
8. Stream B builds on section 4, behind flags off by default, one PR at a time.

## 7. Hard rules (both streams)

- No paid infrastructure, production migration, merge or deployment without GG's explicit OK.
- One branch and one PR per item; draft until GG's card.
- Vertex only; billing fails closed.
- E2E: Playwright with provider routes intercepted; paid E2E only on a Production-env staged deploy inside a GG budget.
