# 02 — P0/P1 defect register (final integration)

Tree: integration branch (main e1dbf300 + #60 + #65 + #68 + #67 + voice adapter patch). Found by the Phase 0 PR audit
and the Phase 1 credit-equation audit (code reading, 2026-10-15 17:20–17:45Z). Status: FIXED-ON-BRANCH = fixed here,
not in Production until the release; OWNER-THREAD = belongs to another active thread; OPEN = not fixed.

| ID | Sev | Area | Defect (evidence) | Status |
|---|---|---|---|---|
| FR-1 | P0 | Video assemble | Client-supplied `filmTokenId` has no owner check (app/api/video/assemble/route.ts:348); `mergeMaster` lets a new caller replace `payerUid` (lib/chat/filmStatusStore.ts:193); `recordCompletedFilm` upserts on the client id (lib/orchestrator/jobs.ts:352/356). Fixed in #64 (defects 47/48), never ported | OWNER-THREAD (Video Core; asked 17:18Z) |
| FR-2 | P0 | Isolation | Vercel Preview uses the Production Supabase (same anon key entry for dev/preview/prod) | OPEN — BLOCKED_OWNER (isolated Supabase project) |
| FR-3 | P0 | Provider boundary | `MEDIA_GOOGLE_ONLY` opt-in on main → outside engines reachable in Production | FIXED-ON-BRANCH (#67: default ON, reopen only with OUTSIDE_ENGINES_APPROVED) |
| FR-4 | P0 | Provider boundary / spend | `/api/video/voice-narration` ran Replicate RVC with no charge and no boundary gate | FIXED-ON-BRANCH (refuseOutsideEngine; listed in GATED_ENTRIES) |
| FR-5 | P0 | Provider boundary / spend | `/api/avatar/live/session` started HeyGen LiveAvatar sessions with no charge and no boundary gate | FIXED-ON-BRANCH (same) |
| FR-6 | P0 | Trusted confirmation | Live Voice "yes" (a client transcript) started a PAID studio render (OmniStudio `liveRunRef` → `runTool(true,'voice')`) | FIXED-ON-BRANCH (refused with ui_confirmation_required; free Agent G montage/audio/edit keep the spoken yes) |
| FR-7 | P1 | Price = debit | Agent G card / Live price for "Full song" music showed 5 credits (30 s) while the route reserves 12 (90 s) | FIXED-ON-BRANCH (musicQuote, same as the panel) |
| FR-8 | P1 | Trusted confirmation | Chat deterministic intents (lib/chat/providerRouter.ts:1281) debit 2/20/25 credits on detected words with no quote/Confirm; a "30-second film" message can start a paid film without a signed quote (providerRouter.ts:396 → filmComposite.ts:1000) | OPEN (film part → Video Core thread; chat intents → this branch, next block) |
| FR-9 | P1 | Spend order | Multi-clip assemble calls ElevenLabs Music/TTS (assemble route :761/:791) before the saga debit (:878) | OWNER-THREAD (Video Core) |
| FR-10 | P1 | Video stitch | Defect 51: a function killed mid-stitch keeps the stitch debit (patch in #67 targets #64, not main) | OWNER-THREAD (Video Core) |
| FR-11 | P2 | Routing | `/ka/create`, `/ka/app` 404 | FIXED-ON-BRANCH (307 → /{lang}) |
| FR-12 | P2 | Ledger degrade | When the ledger RPC is missing ("skipped"), legacy chat/nanobanana/assemble render uncharged | OPEN (only on a misconfigured deployment) |
| FR-13 | P2 | Workers | `/api/avatar/generate`, `/api/music/generate`, `/api/video/generate` insert `jobs` rows consumed by external workers (Stability/Replicate/OpenAI); boundary in workers not traced | OPEN (INFERRED) |
