# MyAvatar.ge and Agent G: master project summary

**As of:** 2026-11-19, 09:30 UTC
**Covers:** Master Task v3.1 Phases 0 to 6, v5.1 Phases 0 to 9, and Phases 7.5 to 8.9
**Status:** docs only. This file changes no code and turns on no flags.

**Update 2026-11-19, later the same day:** the runbook now covers Phases 8.2 to 8.9 and the stacked-PR plan (`docs/launch/LAUNCH_COMMANDS.md`, Steps 6 to 8). The 24 old PRs have a proposed list in `CLEANUP.md`, which waits for GG's approval. #274 has main merged in and its conflict fixed (f234ae4), and its CI is running. Sections 4 and 5 below are the state as it was at 09:20 UTC.

This summary states what was checked and how. Where the facts differ from the plan, it says so. Each fact was checked against one of these sources:

- `gh api` (open PRs, check runs, mergeable state), read on 2026-11-19
- Vercel (the production deployment and runtime errors from the last 6 hours), read on 2026-11-19
- The project's engineering memory
- `docs/v8.1-finance/*`
- `/mnt/project-files/launch/LAUNCH_COMMANDS.md`
- Public competitor pricing pages, read on the dates shown in Section 3

---

## 0. The short version

- **Production today** is commit `96c1df0` (#305), deployment `dpl_BimJe9eJ`. Nothing has merged to `main` since 2026-11-13. Everything built since then waits in draft PRs with flags off.
- **The production database is still unreachable.** Vercel logged `getaddrinfo ENOTFOUND zwksnayknzggdcenqqxy.supabase.co` and `fetch failed` from the crons as recently as 09:22 UTC today. Signed-in visitors see the #294 "temporarily unavailable" page.
- **95 PRs are open**, not 30. 93 are drafts. They fall into three groups (Section 4):
  - 51 are in the launch runbook.
  - 20 were built after the runbook was written and are not in it.
  - 24 are older or come from other agents and belong to no plan.
- **Not all of them are green or tested.**
  - 29 PRs are stacked on other branches. GitHub CI only runs on PRs into `main`, so those 29 have only the Vercel preview check (#316 has 3 checks). Their tests were run locally, not by CI.
  - #103 has a failing CI job, and #274 has a cancelled one.
  - #371 and #372 were still running CI at 09:20 UTC.
  - 15 PRs conflict with `main` (14 older ones plus #274).
- **Paying Supabase and running LAUNCH_COMMANDS.md are the main steps, but not the only ones.** Section 5 lists the other items:
  - paid checks that need the database
  - SQL that GG has to run
  - runbook gaps for Phases 8.4 to 8.9
  - Google approvals
  - one deadline that falls **today**: the Omni 1.1 check C3 expires at about 21:16 UTC

---

## 1. Current state of the platform

"In production" means it is on myavatar.ge now. "Draft" means it is built and tested with mocks, but not merged and its flag is off.

### 1.1 What runs in production (commit 96c1df0)

| Area | State in production | Evidence |
|---|---|---|
| **One-window studio (OmniStudio)** | Every service starts from one chat composer: image, music, video, avatar, interior, read-aloud, Live. | #204/#209 merged as 5dcf8c0, plus later fixes |
| **Video** | Works like Veo. One clip of 4 to 10 s; a photo can be the first frame. With a Georgian line it uses Gemini Omni 1.2 Flash at every length, and each character gets its own voice. Without one it uses Veo 3.1. „გააგრძელე“ continues a clip (multi-turn extend). Chats keep their videos when reopened. Intro + body + outro assembly. | #209, #221, #223, #258, #295 (Omni 1.2) |
| **Image** | gemini-3.1-flash-image. Imagen is retired on Vertex, so it is not used. | GG decision 2026-10-22, #305 |
| **Music** | Lyria 3 on Vertex, with Georgian vocals. | #222, Lyria memory |
| **Live voice + talking avatar** | Gemini Live through our Cloud Run relay. Open to every user. Non-admins get 1 avatar session of 5 minutes a day. **Prebuilt avatars only**, because a custom face is blocked on Google's allowlist. Georgian lip-sync works. | #191, #208, #247 |
| **Speech** | Chirp 3 microphone for ka/ru/en. GG verified it on 2026-11-01. Read-aloud uses Google TTS. | #250, #253, #270, #271 |
| **Agent G** | Georgian PDF/doc creation (PROVEN_PRODUCTION). Vercel Sandbox code-run with a $20 cap, **admins only**. Execution workspace. Task graph. Cloud browser with a live screenshot window and a numbered report. | #240, #248, #249, #252, #277, #279 to #286 |
| **Connectors** | Google Drive with the `drive.file` scope (only files the user picks), turned on for **admins** (`CONNECTORS_DRIVE=admin`). | #254, #255, #261 |
| **Live progress timeline** | One collapsible progress card (SSE) for chat image, music, video and avatar runs. | #272, #275 |
| **Vendors** | HeyGen, OpenAI, Replicate, RVC, WorldLabs, LTX, Udio and Runway code paths have been removed or refuse to run. Their keys were deleted from Vercel on 2026-11-13. The last OpenAI path, Agent G dictation, is removed only in draft #318 and #332. | #296, #305, mediaPolicy |
| **Billing** | BOG card payments in ₾, live with real payments. **Today's prices are the old price book. The 65 % margin engine is not live** (see Section 2.3). | live BOG code, untouched |
| **Outage handling** | The middleware gives up on the auth call after 2.5 s, and signed-in visitors get a 503 page instead of a 504. | #294 |

### 1.2 What is built but waits in drafts (flags off)

| Area | What it adds | PRs | What is left before turn-on |
|---|---|---|---|
| **Director's Workflow** (8.2) | Free storyboard, 1 to 10 scene cards, per-scene price, scene-by-scene render, refunds on failure, final cut, music bed for the whole film | #349 → #350 → #352 → #355 | Paid check after the DB is back. Not in the runbook's numbered list (step 13 only points to its thread). |
| **Art Director image** (8.4) | Grid of 1/2/4, mask edit, 14 references, 14 ratios, 1K/2K/4K at ✦8/12/17, re-render upscale | #356 → #357 → #358 | ~$1 paid check. **Not in the runbook.** |
| **Music Producer** (8.5) | Genre, mood, BPM by prompt, 30 s ✦6 or full song ✦11, "Add 30 s", "Restyle", Georgian Beta, Use in Video. **No stems.** | #359 → #360 → #361 | ~$0.30 paid check. **Not in the runbook.** |
| **Virtual Studio avatar** (8.6) | Script → ~30 s presenter scenes. Live presenter ✦27 per 30 s; Omni "Cinematic" ✦250/367. | #362 → #363 → #364 | ~$1 paid check. **Not in the runbook.** |
| **Smart Editor montage** (8.7) | One sentence → timeline edits, silence removal (free), Chirp captions at ✦2 per minute, multi-track, templates | #365 → #368 → #370 | ~$0.10 Chirp check. **Not in the runbook.** The "AI boring parts" pass is not built. |
| **3D Studio** (8.8) | Text/image to 3D (TRELLIS.2 on our own Cloud Run GPU job), GLB/OBJ/STL, in-chat viewer | #366 → #367 → #369 | GPU worker **not deployed**, migration `20261115a` **not applied**, ~$2 probe, TRELLIS call names unverified. **Not in the runbook.** |
| **Browser Agent loop + App Builder** (v5.1 Phase 4) | Browser agent loop, sandbox package allowlist, App Builder spec | #312 | **Not wired.** App previews need a separate registrable domain (`myavatar-apps.ge`, not bought yet). **Not in the runbook.** |
| **Browser login** | Agent G logs in to a site inside the cloud browser | #346 | Turn-on = merge + `AGENT_BROWSER_LOGIN=1` + redeploy. **Not in the runbook.** |
| **Agent G engine** (v5.1 Phase 3) | Planner, VALIDATE before every quote, parallel DAG, media runs on the engine, work-mode prep | #308 → #309 → #310 → #311 | 3.5c is prep only, **not finished.** |
| **Live Agent Workspace UI** (Phase 7) | Mocked UI plus mocked E2E | #314 → #316 | Mocked only |
| **65 % margin pricing** (8.1) | Price engine, plans, top-ups, Pro tier, BOG v8 checkout, founder Finance dashboard, launch SQL | #313 → #343 → #351 → #353 → #354, then #345, #344 | Pricing-thread checklist (Section 5) |
| **Phase 7.5 to 7.8 polish** | Video advanced/last frame, image ratios, read-aloud, VFX removal, readable errors, Music/Interior UX v2, media renew, dead-screen cleanup, Stripe page retired | #320 to #338 | Runbook steps 5, 6 and 10 |
| **Speed** (8.0) | Lazy chat chunks (328 → 285 kB), parallel checks, shared auth helper, local JWT check, relay ticket | #348, #342, #347, #339, #340 | #339 only helps with asymmetric JWT keys. #341 (fra1) stays draft until the DB and Redis move to the EU. |
| **Lifecycle** (8.9) | Hashed `safety_identifier` label on Gemini and Veo calls. Vertex Extensions audit: **not used, nothing to migrate**. Georgian lite-TTS backup plan. | #371, #372 | CI was still running at 09:20 UTC. The lite-TTS probe ran (5/5 HTTP 200, ~$0.03), but **its Georgian quality waits on GG listening to the clips.** |

### 1.3 Known gaps in what exists

- **Live Avatar uses prebuilt faces only.** A custom or own-photo avatar needs Google's allowlist, and GG's request is pending.
- **Gmail and Calendar connectors** need Google OAuth verification. Only Drive exists.
- **Agent G code-run, cloud browser and sandbox are admin-only** (decision D-08). Ordinary users don't have them yet.
- **Music has no stems,** because Lyria returns none and GG declined Demucs. Extend and Restyle are new takes in the same style, not true edits.
- **Image has no deterministic upscaler and no native mask.** Upscale is a re-render, and mask edit is a paste-back.
- **Signed media links still expire after 7 days.** The renew fix is draft #331.
- **Production read-aloud TTS** answered 500 twice during the 2026-11-06 certification. #288/#289 since moved to 3.8 TTS, but that has not been re-certified while the database is down.

---

## 2. The technical position

This section makes the argument from what the code and the price sheet support. It also states the limits, because a permanent record that overstates would be worse than none.

### 2.1 One cloud, one bill, one policy (Google Vertex AI only)

- **Every generation goes through Vertex AI** with Workload Identity Federation. There are no long-lived Google keys in Vercel, and only the preview and production OIDC identities can call Vertex.
  - The non-Google vendors have been removed in code and their keys deleted.
  - `lib/providers/mediaPolicy` and the `isAiGoogleOnly` checks refuse anything else.
- **Benefits we can show:**
  - One data-processing relationship.
  - One quota and billing surface.
  - One safety policy, now with a hashed per-user `safety_identifier` (#371).
  - Every model is registered in `config/google-lifecycle.json` with a 21-day CI guard before a retirement date (#293).
- **Billing fails closed.**
  - Credits are held before a run and charged only for a delivered result. Google-side failures cost the user 0, and failed scenes and grids are refunded.
  - Previews can never spend (`lib/env/previewIsolation`).
  - Paid tests ran only within GG-approved budgets.

**Limits, said plainly:**

- **One vendor is also one point of failure.** In this project alone, Google:
  - shut down all Imagen models (2026-08-17)
  - expired Omni 1.1 interactions after 7 days
  - is retiring Live 2.5 native audio on **2026-12-13**
  - offers no 3D model on Vertex, so 3D runs TRELLIS.2 on our own GPU job
  - offers no Lyria stems and no image mask parameter

  The lifecycle guard tells us early. It does not remove the dependency.
- Some features depend on Google approvals we don't control: the custom-face allowlist and Gmail/Calendar verification.

### 2.2 Built for Georgian first

The strongest difference we can show is not the model. It is that Georgian works end to end:

- the interface is Georgian (with en and ru)
- the Chirp 3 microphone handles long Georgian dictation (GG verified it)
- read-aloud speaks Georgian voices
- Georgian dialogue is spoken by Omni video, one voice per character
- Lyria sings Georgian vocals (Beta; Georgian is not on Lyria's official language list, but GG's tests passed)
- Live Avatar lip-syncs in Georgian
- PDFs are written in Georgian
- prices are in lari, paid with BOG cards

None of the three competitor groups in Section 3 offers that combination in one product, to our knowledge. This is a statement about the product as it works today, not about any rival's roadmap.

### 2.3 The 65 % margin engine: what it is, and what it is not yet

- **What it is** (draft #343, approved by GG on 2026-11-14):
  - Every price is computed from Google's **full** list price, read from the official Vertex pricing page, with no promo prices.
  - The formula is `cost ₾ = USD × 2.7 × 1.05 FX reserve`, against `0.08 ₾ × 0.97` after the BOG card fee, VAT 0.
  - That gives **104.38 credits per $1 of Google cost** and at least 65 % gross margin, even when a credit is sold at the cheapest package price.
  - A worst-case test spends a whole plan on its lowest-margin action and still keeps 65 % or more.
  - VAT or a weaker lari raises every price automatically. This was tested at 18 % VAT and 3.1 ₾/$.
- **What it is not yet:**
  - **It is not live.** Production still sells the old price book. For example, an 8 s 720p clip costs ✦38 today against ✦66 under v8. The 65 % margin starts only after the pricing checklist runs (`NEXT_PUBLIC_PRICING_V8=on` plus the launch SQL).
  - **It is gross margin on Google's cost per action only.** Fixed platform costs (Vercel, Supabase, the Live relay at about $9–10 a month, the 3D GPU idle cost of about $3 a month, Redis) are outside the rule.
  - **Free and admin credits pull the realised margin below 65 %.** The founder dashboard (#344) shows both numbers.
  - **The live-avatar minute (✦44) assumes about 40K context tokens per minute.** A real call trace has not confirmed it yet.

A pricing rule is a discipline, not a moat: any competitor can price at a margin. What it gives MyAvatar is that **no action is sold below cost**, and that a Google price change is reflected by rerunning a test, not by guesswork.

---

## 3. Competitive comparison

Our prices are the **v8 prices GG approved, which are not live yet** (Section 2.3). Credits are counted at the Start plan rate (25 ₾ = 280 credits, $1 = 2.7 ₾).

Competitor prices come from public pages:

- **HeyGen, Midjourney, Claude:** read 2026-11-19.
- **ChatGPT, Runway, Suno:** read 2026-11-14 (`docs/v8.1-finance/PACKAGES.md`). The ChatGPT page did not show amounts when it was rechecked on 2026-11-19.

| | **MyAvatar.ge (v8, proposed)** | **HeyGen** | **Midjourney** | **ChatGPT** | **Claude** |
|---|---|---|---|---|---|
| Monthly plans | Start 25 ₾ (≈$9.26), Creator 55 ₾ (≈$20.37), Pro 129 ₾ (≈$47.78), Business 299 ₾ (≈$110.74) | Creator $29, Pro $49, Business $149 + $20 per seat (heygen.com/pricing, 2026-11-19) | Basic $10, Standard $30, Pro $60, Mega $120 a month; 20 % less billed yearly (docs.midjourney.com/docs/plans, 2026-11-19) | Go $8, Plus $20, Pro from $100 (chatgpt.com/pricing, 2026-11-14) | Pro $20 monthly or $17 billed yearly, Max from $100 (claude.com/pricing, 2026-11-19) |
| Video | 4–10 s clips with spoken Georgian dialogue; 8 s 720p = ✦66 (≈$2.44) | Avatar video up to 30 min per video on paid plans | Short video from images | Video inside plan limits (Sora) | Pricing page lists no video generation |
| Talking avatar | Live, two-way, prebuilt faces only, Georgian lip-sync; ≈14 min a month on Creator | Its core product, **including custom avatars**, which we can't offer yet | No | No | No |
| Images | 1K ✦8, 2K ✦12, 4K ✦17 | Not the focus | Its core product; at volume, likely cheaper per image than us | Yes, inside limits | Pricing page lists no image generation |
| Music | 30 s ✦6, full song ✦11, Georgian Beta, no stems | No | No | No | No |
| Agent | Agent G: Georgian PDFs, cloud browser, code-run (**admins only today**), Drive (admins) | No | No | Yes, general agent and connectors | Yes, general agent and connectors |
| Language and payment | Georgian first; BOG in ₾ | English-first; USD card | English; USD card | Many languages; USD card | Many languages; USD card |

**What this supports:**

- MyAvatar is the only one of these that puts video, image, music, voice and a live avatar under **one credit balance, in Georgian, paid in lari**.
- Our 8 s video price (≈$2.44) is below Runway's listed cost for a comparable 8 s Veo 3.1 clip with audio ($4.98–$7.68, runwayml.com, 2026-11-14).

**What it does not support:**

- **HeyGen** is ahead on custom avatars and long avatar videos.
- **Midjourney** is ahead on image quality control and price per image at volume.
- **ChatGPT and Claude** are ahead on general reasoning and agents, and on reach to ordinary users. Our agent features are admin-only today.

We should not claim to be cheaper or better across the board.

---

## 4. Launch readiness: the real PR state

Checked with `gh api` on 2026-11-19 at 09:20 UTC. There are **95 open PRs**: 93 drafts and 2 non-drafts.

How to read the CI column:

- **green (n)** means all n GitHub check runs passed.
- **Vercel only** means the PR is stacked on another branch. `ci.yml`, `e2e.yml` and the other workflows only run for PRs into `main`, so these PRs have no GitHub test run. Their tests were run locally by the thread that built them, which is not the same as CI.
- **blocked** is GitHub's normal state for a draft that has no approved review. It is not a failure.

### 4.1 In the launch runbook (LAUNCH_COMMANDS.md, Step 6): 51 PRs

| Runbook step | PRs | CI on 2026-11-19 | Flag(s), all off | Still needs |
|---|---|---|---|---|
| 2. Chat memory | #306 → #318 → #332 | green (10) each | — | **GG runs the #306 SQL before the merge, then the re-embed run** |
| 3. Live 3.8, cleanup, security | #292, #317, #319 | green (11 / 10 / 10) | — | #292 is needed before **2026-12-13** (Live 2.5 retires); then the relay env switch + a paid call. #319 needs the 2b FK SQL output. |
| 4. Omni paid checks | #307 | green (9) | — | **The paid run (~$1) has to happen today, before ~21:16 UTC, or check C3 can only show the refund path** |
| 5. UI polish | #320, #323, #321, #322, #325, #326, #327, #328, #331, #329, #330 | #323 Vercel only; the rest green (9–14) | video advanced/last frame, image, `NEXT_PUBLIC_MUSIC_UX_V2`, `NEXT_PUBLIC_INTERIOR_UX_V2`, `CHAT_MEDIA_RENEW` | Known conflicts to resolve (clipOrder.ts, OmniStudio imports) |
| 7. Docs | #287 → #290, #324 | #287 green (9); **#290 Vercel only, and its Vercel status says failure**; #324 green (9) | — | — |
| 8. Agent G engine + workspace | #308 → #309 → #310 → #311, #314 → #316 | #308 and #314 green (10); **#309, #310, #311 Vercel only; #316 3 checks** | `AGENT_VALIDATE`, `AGENT_ENGINE_MEDIA` | #311 is prep only, not finished |
| 9. Read-aloud speed | #274 (not a draft) | **1 check cancelled (read-aloud firefox), and the PR conflicts with main** | — | Rebase, then rerun CI |
| 10. 7.8 cleanup | #333 → #334 → #338, then #335, #336, #337 | green (9–12) | — | — |
| 11. Speed | #348 → #342 → #347 → #339 → #340; #341 stays draft | green (9–13) | `AUTH_LOCAL_CLAIMS`, `TASK_RELAY_TICKET` | #339 only with an ES256/RS256 JWT key (Step 1c) |
| 12. Billing (pricing thread) | #313 → #343 → #351 → #353 → #354, then #345, #344 | #313 green (12); **#343, #344, #345, #351, #353, #354 Vercel only** | `NEXT_PUBLIC_PRICING_V8`, `ADMIN_FINANCE_DASHBOARD` | v8 SQL 00–02 (run by GG), a real 10 ₾ purchase, the day-30 SQL reminder |
| 13. Director's Workflow | #349 → #350 → #352 → #355 | #349 green (10); **#350, #352, #355 Vercel only** | `DIRECTORS_WORKFLOW` | Paid check, budget not set yet |

### 4.2 Built after the runbook was written, not in it yet: 20 PRs

| Phase | PRs | CI | Flag(s), all off | Still needs |
|---|---|---|---|---|
| 8.4 Art Director | #356 → #357 → #358 | #356 green (10); **#357, #358 Vercel only** | `IMAGE_ART_DIRECTOR`, `NEXT_PUBLIC_IMAGE_ART_DIRECTOR` | ~$1 paid check |
| 8.5 Music Producer | #359 → #360 → #361 | #359 green (10); **#360, #361 Vercel only** | `MUSIC_PRODUCER_V2`, `NEXT_PUBLIC_MUSIC_PRODUCER_V2` | ~$0.30 paid check; the `registerFilmTarget` line in #355 after the merges |
| 8.6 Virtual Studio | #362 → #363 → #364 | #362 green (10); **#363, #364 Vercel only** | `AVATAR_STUDIO_V2`, `NEXT_PUBLIC_AVATAR_STUDIO_V2` | ~$1 paid check |
| 8.7 Smart Editor | #365 → #368 → #370 | #365 green (10); **#368, #370 Vercel only** | `MONTAGE_SMART_EDITOR`, `NEXT_PUBLIC_MONTAGE_SMART_EDITOR` | ~$0.10 Chirp check |
| 8.8 3D Studio | #366 → #367 → #369 | #366 green (10); **#367, #369 Vercel only** | `STUDIO_3D_V2`, `NEXT_PUBLIC_STUDIO_3D_V2` | Deploy the GPU worker, apply migration 20261115a, ~$2 probe |
| 8.9 Lifecycle | #371, #372 | **still running at 09:20 UTC** (#371 8 of 10 done; #372 3 of 9) | `SAFETY_IDENTIFIER` (+ `SAFETY_IDENTIFIER_SALT`, at least 16 chars, never changed once on) | CI result; GG listens to the lite-TTS clips |
| v5.1 Phase 4 | #312 | green (10) | `AGENT_BROWSER_AGENT`, `AGENT_SANDBOX_PACKAGES`, `AGENT_APP_BUILDER` | Not wired; app-preview domain |
| v5.1 Phase 8 QA | #315 | green (10) | — | The Georgian QC corpus has not been run |
| Browser login | #346 | green (10) | `AGENT_BROWSER_LOGIN` | — |

### 4.3 Older or other-agent PRs, in no plan: 24 PRs

- #43, #44, #51, #64, #66, #79, #103, #105, #106, #107, #108, #109, #110, #112, #114, #116, #190, #216, #234, #237, #256, #257, #264, #273
- Of these:
  - **14 conflict with `main`.**
  - **#103 fails one CI job** (Music Studio live E2E).
  - **#66** (not a draft, `feat/phone-agent-connection`) has a failing Vercel status.
  - **#264** (not a draft, Drive questions → Agent G) is green but conflicts.
- Several come from other agents (the `codex/*` branches, #66, #256, #257).
- They need one decision each: close, or rebase into a plan. Until then they are noise in the queue.

### 4.4 The honest one-line answer

The launch-runbook PRs that target `main` are green with flags off. But **29 stacked PRs have never had a GitHub CI run**, several have a failing or cancelled check, the Phase 8.4 to 8.9 work has no runbook steps yet, and the paid checks wait for the database. **"All PRs are green, tested and behind flags" is not true today.**

---

## 5. What is really left before launch

### 5.1 The main steps (as GG planned)

1. **Pay the Supabase invoice and get project `zwksnayknzggdcenqqxy` running again.** It was still unreachable at 09:22 UTC today.
2. **Run LAUNCH_COMMANDS.md** step by step:
   - health and JWKS checks
   - read-only SQL
   - the #306 SQL
   - paid Omni checks
   - Live relay switch
   - merge order, one decision card per PR, health 6/6 after each

### 5.2 Other items that are also real

| # | Item | Who | When | Why it matters |
|---|---|---|---|---|
| 1 | **Omni paid checks (#307), ~$1** | GG on the Mac | **Today, before ~21:16 UTC** | Omni 1.1 interactions expire after 7 days. After that, check C3 can only show the refund path, unless GG allows a `VERTEX_OMNI_MODEL` rollback. It needs the database, so it only works if Supabase is back in time. |
| 2 | Ledger introspection `01_introspect.sql` (B-02) | GG, SQL Editor | Runbook step 2a | The legacy ledger stays untouched until its output is read |
| 3 | #319 FK cascade SQL (2b) | GG | Step 2b | Needed for `ACCOUNT_DELETE_V2` |
| 4 | Outage queries Q1–Q4 | GG | Step 2c | Jobs stuck by the pause, BOG orders paid but not credited, renewals due during the outage. **Refunds or extensions are GG's decision.** |
| 5 | **#306 chat-memory SQL, then the re-embed run** | GG | Before the #306 merge, then after it | Memory search filters on `embedding_model` |
| 6 | **Pricing checklist** (`docs/v8.1-finance/LAUNCH_CHECKLIST.md`): SQL 00 → 01 → merges → `NEXT_PUBLIC_PRICING_V8=on` + redeploy → SQL 02 (1.7× balances) → a real 10 ₾ purchase → reminder for the day-30 SQL | GG + Claude | After GREEN | This is when the 65 % margin actually starts. It is not part of LAUNCH_COMMANDS.md. |
| 7 | **Live 3.8 switch** (#292 + relay env + one paid Georgian call) | GG | **Before 2026-12-13** | Live 2.5 native audio retires then |
| 8 | **Runbook steps for Phases 8.4 to 8.9 and the other unlisted PRs** (20 PRs: merge order, paid checks ≈ $1 + $0.30 + $1 + $0.10 + $2, 3D worker deploy + migration 20261115a) | Claude writes, GG approves | Before those merges | They are not in LAUNCH_COMMANDS.md today |
| 9 | **CI on stacked PRs** | Claude | As each base merges | Retarget each to `main` and let CI run before its merge card |
| 10 | Rebase #274; decide on the 24 old PRs | Claude + GG | Any time | Conflicts, and one failing job |
| 11 | Lite-TTS listening check (#372 probe clips in `~/vertex-certify/out-lite-tts`) | GG | Any time | Decides whether lite is a valid Georgian backup |
| 12 | Read-aloud re-certification on production | GG | After DB | The default TTS answered 500 twice on 2026-11-06 |
| 13 | **Prices still unapproved:** deck pictures (#297, decks stay off) and Carbon/Argon (D-06, until versioned pricing). The Director's Workflow paid-check budget is not set. | GG | Before those features turn on | — |
| 14 | **Google approvals we don't control:** the custom-face Live Avatar allowlist, and OAuth verification for Gmail/Calendar | Google | Unknown | Neither blocks launch, but both are features we can't promise yet |
| 15 | Domain `myavatar-apps.ge` for App Builder previews | GG | Before App Builder | App previews stay disabled until then |
| 16 | BOG sandbox Actions secrets `BOG_SANDBOX_CLIENT_ID` / `SECRET_KEY` | GG | Optional | Until they are added, the BOG sandbox CI job is skipped instead of really tested |
| 17 | Supabase JWT signing keys asymmetric? (Step 1c) | GG | Before `AUTH_LOCAL_CLAIMS` | On the legacy HS256 key, #339 gives no speed-up |
| 18 | Region: functions in iad1, DB in ap-southeast-1 (~200–250 ms per auth call) | GG | Post-launch decision | The main cause of slowness for signed-in users. #341 only helps after the DB and Redis move to the EU. |

### 5.3 The honest one-line answer

**Paying Supabase and running LAUNCH_COMMANDS.md are necessary, but they are not the only steps.** The pricing checklist, GG's SQL runs, and the runbook steps and paid checks for Phases 8.2 to 8.9 (8.2 has only a pointer to its thread) also have to happen before everything in Section 1.2 is live. Today's Omni deadline and the 2026-12-13 Live retirement have fixed dates.

---

## 6. Rules that stay in force

- Every flag stays off until GG approves turning that flag on, one at a time, on GG's account first.
- One decision card per merge, CI green on current `main`, health 6/6 after each.
- **Live BOG code is never changed.** Billing steps run only through the pricing-thread checklist.
- GG runs every SQL file and every paid command. Claude never writes to the production wallet.
- Paid tests only within a budget GG has approved.

---

*This file is docs only. Update it in the PR that changes the facts it states.*
