# 02 — P0/P1 defect register (final integration)

Tree: integration branch (main e1dbf300 + #60 + #65 + #68 + #67 + voice adapter patch). Found by the Phase 0 PR audit
and the Phase 1 credit-equation audit (code reading, 2026-10-15 17:20–17:45Z). Status: FIXED-ON-BRANCH = fixed here,
not in Production until the release; OWNER-THREAD = belongs to another active thread; OPEN = not fixed.

| ID | Sev | Area | Defect (evidence) | Status |
|---|---|---|---|---|
| FR-1 | P0 | Video assemble | Client-supplied `filmTokenId` has no owner check (app/api/video/assemble/route.ts:348); `mergeMaster` lets a new caller replace `payerUid` (lib/chat/filmStatusStore.ts:193); `recordCompletedFilm` upserts on the client id (lib/orchestrator/jobs.ts:352/356). Fixed in #64 (defects 47/48), never ported | OWNER-THREAD: Video Core accepted 17:57Z, verified on main b21506b, porting #64 commit 5d9b71f2 (fixes + tests) on its branch for its next deploy. This branch must not touch those three files. Release blocker until that deploy is in main |
| FR-2 | P0 | Isolation | Vercel Preview uses the Production Supabase (same anon key entry for dev/preview/prod) | OPEN — BLOCKED_OWNER (isolated Supabase project) |
| FR-3 | P0 | Provider boundary | `MEDIA_GOOGLE_ONLY` opt-in on main → outside engines reachable in Production | FIXED-ON-BRANCH (#67: default ON, reopen only with OUTSIDE_ENGINES_APPROVED) |
| FR-4 | P0 | Provider boundary / spend | `/api/video/voice-narration` ran Replicate RVC with no charge and no boundary gate | FIXED-ON-BRANCH (refuseOutsideEngine; listed in GATED_ENTRIES) |
| FR-5 | P0 | Provider boundary / spend | `/api/avatar/live/session` started HeyGen LiveAvatar sessions with no charge and no boundary gate | FIXED-ON-BRANCH (same) |
| FR-6 | P0 | Trusted confirmation | Live Voice "yes" (a client transcript) started a PAID studio render (OmniStudio `liveRunRef` → `runTool(true,'voice')`) | FIXED-ON-BRANCH (refused with ui_confirmation_required; free Agent G montage/audio/edit keep the spoken yes) |
| FR-7 | P1 | Price = debit | Agent G card / Live price for "Full song" music showed 5 credits (30 s) while the route reserves 12 (90 s) | FIXED-ON-BRANCH (musicQuote, same as the panel) |
| FR-8 | P2 (was P1) | Trusted confirmation | Chat deterministic intents (lib/chat/providerRouter.ts handleDeterministicIntent) debit 2/20/25 credits on detected words with no quote/Confirm; a free-text "30-second film" message reaches handleFilmComposite. Traced 18:10Z: no mounted UI sends free text there. The only live client of /api/chat/orchestrate is the film panel (lib/chat/filmStudioClient, Video Core's quote path); ChatShell, UniversalChat, ServiceChatShell and UnifiedServiceLayout, the clients of the free-text shape, are imported nowhere. Reachable only by a signed-in user's own direct API call, priced from the SSoT (chatBilling), debit before render, refund on failure | OPEN, downgraded (film part → Video Core thread; retiring the free-text paid path is a product change, proposed in 06/GO_NO_GO) |
| FR-9 | P1 | Spend order | Multi-clip assemble calls ElevenLabs Music/TTS (assemble route :761/:791) before the saga debit (:878) | OWNER-THREAD (Video Core) |
| FR-10 | P1 | Video stitch | Defect 51: a function killed mid-stitch keeps the stitch debit (patch in #67 targets #64, not main) | OWNER-THREAD (Video Core) |
| FR-11 | P2 | Routing | `/ka/create`, `/ka/app` 404 | FIXED-ON-BRANCH (307 → /{lang}) |
| FR-12 | P2 | Ledger degrade | When the ledger RPC is missing ("skipped"), legacy chat/nanobanana/assemble render uncharged | OPEN (only on a misconfigured deployment) |
| FR-13 | P2 | Workers | `/api/avatar/generate`, `/api/music/generate`, `/api/video/generate` insert `jobs` rows consumed by external workers (Stability/Replicate/OpenAI); boundary in workers not traced | OPEN (INFERRED) |
