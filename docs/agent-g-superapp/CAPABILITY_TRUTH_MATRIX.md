# CAPABILITY_TRUTH_MATRIX — what is proven, what is built, what is blocked

**As of:** 2026-11-27. Docs only.
**Source:** `MASTER_PROJECT_SUMMARY.md` (draft #373) Sections 1.1 to 1.3, brought up to date with the PRs opened after 2026-11-19 (Phases 8.10 to 8.20) and re-checked against `gh api` today.

> **A note on the source.** The master summary has no single table with these labels. It has three tables: "runs in production", "built but waits in drafts" and "known gaps". This matrix merges them into one and gives each row one state from the list below. Where a row was not in the summary (everything from #381 on), the evidence column names the PR.

## States

| State | Meaning | Evidence it needs |
|---|---|---|
| **PROVEN_PRODUCTION** | On myavatar.ge and exercised there by GG or by a recorded run | A merge commit plus a production check |
| **IN_PRODUCTION_GATED** | Merged and live, but only for admins or behind a switch | Merge commit plus the gate in code |
| **BUILT_IN_DRAFT** | Code and tests exist in a draft PR. It is not in `main`, and its flag is off | The PR plus its tests (see `EVIDENCE_LEDGER.md`) |
| **PREP_NOT_WIRED** | A draft whose own description says nothing calls it yet | The PR's own words |
| **BLOCKED** | Cannot move without something outside the code: an invoice, a Google approval, a domain, a certificate, a budget | The named blocker |
| **NOT_BUILT** | No meaningful code | None |

Every BUILT_IN_DRAFT row is also blocked by the Supabase invoice for its **merge** (see `CURRENT_STATE.md` §3). BLOCKED below means blocked by something **else**, or by something on top of that.

---

## 1. Production (`main` = `0ea1566`)

| Capability | State | Evidence |
|---|---|---|
| One-window studio (OmniStudio): every service from one chat composer | PROVEN_PRODUCTION | #204/#209 merged as `5dcf8c0`, later fixes |
| Video like Veo: one 4–10 s clip, photo as first frame, Georgian line on Omni 1.2 Flash with one voice per character, Veo 3.1 otherwise, „გააგრძელე" extend, intro + body + outro assembly | PROVEN_PRODUCTION | #209, #221, #223, #258, #295. GG verified extend on myavatar.ge 2026-10-26 |
| Image: gemini-3.1-flash-image (Imagen retired on Vertex) | PROVEN_PRODUCTION | GG decision 2026-10-22, #305 |
| Music: Lyria 3 on Vertex with Georgian vocals | PROVEN_PRODUCTION | #222 |
| Live voice + talking avatar through our Cloud Run relay, for every user (non-admins: 1 avatar session of 5 min a day) | PROVEN_PRODUCTION | #191, #208, #247. GG's E2E passed 2026-10-26 |
| Live avatar with a **custom or own-photo face** | BLOCKED | Google's allowlist; GG's request is pending. Prebuilt faces only |
| Microphone: Chirp 3 for ka/ru/en | PROVEN_PRODUCTION | #250, #253. GG verified 2026-11-01 |
| Read-aloud TTS (Google) | IN_PRODUCTION_GATED, needs re-certification | Answered 500 twice in the 2026-11-06 certification. Moved to 3.8 TTS (#288/#289) but not re-certified while the DB is down |
| Agent G: Georgian PDF/doc creation | PROVEN_PRODUCTION | #240, #252 |
| Agent G: Vercel Sandbox code-run, $20 cap | IN_PRODUCTION_GATED (admins, D-08) | #248, #249, #251. CODE-01 passed |
| Agent G: execution workspace, task graph | IN_PRODUCTION_GATED (admins) | #277, #279 |
| Agent G: cloud browser with a live screenshot window and a numbered report | IN_PRODUCTION_GATED (admins) | #280–#286. IPv4 private ranges are denied by the sandbox policy; **IPv6 is not covered on `main`** (see §3) |
| Drive connector, `drive.file` scope | IN_PRODUCTION_GATED (`CONNECTORS_DRIVE=admin`) | #254, #255, #261 |
| Live progress timeline (SSE) for image, music, video, avatar | PROVEN_PRODUCTION | #272, #275 |
| Vendor removal (HeyGen, OpenAI, Replicate, RVC, WorldLabs, LTX, Udio, Runway) | PROVEN_PRODUCTION, except one path | #296, #305. Keys deleted 2026-11-13. The last OpenAI path (Agent G dictation) goes in #318 + #332 |
| BOG card payments in ₾ | PROVEN_PRODUCTION | Live BOG code, untouched. Old price book |
| Outage handling: auth call capped at 2.5 s, 503 page | PROVEN_PRODUCTION | #294. GG confirmed the 504 was gone |
| Gmail and Calendar connectors | BLOCKED | Google OAuth verification |

## 2. Built in drafts (flags off)

| Capability | State | PRs | What else it waits for |
|---|---|---|---|
| Agent G execution engine: planner, VALIDATE, parallel DAG | BUILT_IN_DRAFT | #308 → #309 | Merge order only |
| Media runs on the engine (pause/resume, refunds counted) | BUILT_IN_DRAFT | #310, #383 | `AGENT_ENGINE_MEDIA=admins` montage test after merge |
| Work-mode steps as lease jobs | PREP_NOT_WIRED | #311 | 3.5c not finished. Needs #310 working in production first |
| Reel Task (one sentence → Georgian Reel) | BUILT_IN_DRAFT | #393 | A budget from GG for the paid E2E |
| Agent G Router v2, commands, injection shield, goal pin, Live planner | BUILT_IN_DRAFT | #381, #382, #384, #385, #386 | Merge order only |
| Agent G plugins (10-plugin catalog, Notion/GitHub/Calendar) | BUILT_IN_DRAFT | #390 → #392 | Migrations `20261120a/b`. Calendar also needs Google verification |
| Browser network guard: IPv6 + DNS rebinding | BUILT_IN_DRAFT | #399 (main browser), #400 (v2), #408 (login browser) | One admin run on example.com in the real Vercel Sandbox after merge (see §3) |
| Browser login inside the cloud browser | BUILT_IN_DRAFT | #346 + #408 | `AGENT_BROWSER_LOGIN=1` only after #399 and #408. One ~$0.05 sandbox run |
| Browser Agent v2 (persistent browser, cursor, forms, Computer Use mapping) | PREP_NOT_WIRED | #312 → #387 → #400 | No route, tool or UI calls it |
| App Builder | PREP_NOT_WIRED + BLOCKED | #312 | A separate domain (`myavatar-apps.ge`, not bought) |
| Live Agent Workspace UI | BUILT_IN_DRAFT (mocked) | #314 → #316 | Mocked only |
| Launch flag registry, `/api/admin/launch-flags`, `[feature-error]` log | BUILT_IN_DRAFT | #396 | Merge early on GREEN day. It does **not** change any flag's vocabulary (see §3) |
| Director's Workflow (storyboard, per-scene render, final cut) | BUILT_IN_DRAFT + BLOCKED | #349 → #350 → #352 → #355 | GG has set no paid-check budget |
| Art Director image (grid, mask edit, 14 refs, 1K/2K/4K) | BUILT_IN_DRAFT | #356 → #357 → #358 | ~$1 paid check |
| Music Producer (30 s / full song, extend, restyle) | BUILT_IN_DRAFT | #359 → #360 → #361 | ~$0.30 paid check. No stems: Lyria returns none |
| Virtual Studio avatar presenter | BUILT_IN_DRAFT | #362 → #363 → #364 | ~$1 paid check |
| Smart Editor montage (captions, silence removal, multi-track) | BUILT_IN_DRAFT | #365 → #368 → #370 | ~$0.10 Chirp check. The "AI boring parts" pass is NOT_BUILT |
| 3D Studio (TRELLIS.2 on our own GPU job) | BUILT_IN_DRAFT + BLOCKED | #366 → #367 → #369 → #397 | GPU worker not deployed, migration `20261115a` not applied, ~$2 probe, TRELLIS call names unverified |
| 65 % margin pricing, Pro tier, BOG v8 checkout, Finance dashboard | BUILT_IN_DRAFT | #313, #343, #344, #345, #351, #353, #354 | The pricing thread's checklist; billing-only cards |
| Ledger fail-closed on a stale schema cache | BUILT_IN_DRAFT | #407 | Its own GG card (billing-adjacent) |
| Chat memory on Google only | BUILT_IN_DRAFT | #306 → #318 → #332 | SQL `20261113a` and a re-embed |
| Live 3.8 model (the 2.5 model retires 2026-12-13) | BUILT_IN_DRAFT, **deadline** | #292 | First merge on GREEN day. Hard date: 2026-12-13 |
| Phase 7.5–7.8 UX polish, VFX removal, Stripe page retired | BUILT_IN_DRAFT | #320–#338 | Merge order only |
| Speed work (lazy chunks, parallel checks, shared auth, local JWT, relay ticket) | BUILT_IN_DRAFT | #348, #342, #347, #339, #340 | #339 only if Step 1c shows an ES256/RS256 key |
| Functions in Frankfurt (fra1) | BLOCKED | #341 | The DB and Redis must move to the EU first |
| EU AI Act Art. 50 provenance metadata (IPTC/XMP) | BUILT_IN_DRAFT | #402, #403 | `AI_PROVENANCE_META=1` later, by card |
| Visible AI / deepfake labels | BUILT_IN_DRAFT, enterprise opt-in only | #404, #405 | Stays off on myavatar.ge (GG 2026-11-27) |
| C2PA signing | BLOCKED | none | Needs a signing certificate GG does not have |
| Georgian error safety, final polish, E2E fixes | BUILT_IN_DRAFT | #388, #389, #395, #398, #406 | Merge order only |

## 3. Audit items, checked against the code today

| Audit item | State on `main` | State after the named merges | Remaining caveat |
|---|---|---|---|
| **IPv6 SSRF gap in the cloud browser** | **OPEN.** `BROWSER_DENY_SUBNETS` lists IPv4 only, because Vercel refuses IPv6 CIDRs. `policy.ts` refuses an IPv6 literal in the task's own `goto`, but a page's redirect, sub-request or AAAA answer was not checked | **Closed in code** by #399: an in-sandbox proxy is the browser's only route out. It resolves each name itself, refuses any non-public IPv4 or IPv6 address, connects to the checked address, allows ports 80/443 only, and Chromium's resolver, QUIC and non-proxied WebRTC UDP are off. If the guard can't start, the task fails closed. 137 tests | **Not yet proven in a real Vercel Sandbox** (this container has no IPv6 at all). Runbook item 25: one admin example.com run right after the merge, or revert. #346 must never merge without #408, and #387 never without #400, or the gap reopens for those browsers |
| Server-side URL fetchers (`scrape_webpage`, `open_url`, `readPage`, `publicFetch`) | Already IPv6-aware on `main`: every redirect hop is re-checked, the connection is pinned to a public address, and IPv6 private/link-local/ULA/mapped forms are refused (`lib/web/publicFetch.ts`) | No change needed | None found |
| Code-run sandbox | `deny-all` network unless the plan names hosts (`lib/agent/sandbox/vercelHost.ts`) | No change needed | Named hosts are allowed by name, which is the intended rule |
| **Flag vocabulary (`admin` vs `admins`)** | **No registry on `main`.** The vocabularies differ per feature | **Documented, not unified**, by #396: a registry of every launch switch with its exact accepted values, a generated `docs/launch/ENV_REGISTRY.md`, a cold-start `[launch-flags]` warning for a value the reader ignores, a misspelt name, or a server/client twin mismatch, and `/api/admin/launch-flags` showing how the code reads each switch | #396 is read-only by design: it never changes what a reader decides. `AGENT_REEL_TASK` still accepts only `admins`, the studio flags only `admin`, `CONNECTORS_DRIVE` `admin` but not `admins`. Unifying them would be a separate code change to the readers (the registry names 39 reader locations) |
| Workspace cross-instance write race | Present (in-instance queue only) | Unchanged | Plan in `CURRENT_STATE.md` §7 |
