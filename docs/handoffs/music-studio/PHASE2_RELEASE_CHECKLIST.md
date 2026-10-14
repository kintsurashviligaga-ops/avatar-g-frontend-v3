# Music Studio v1 — Phase 2 · Release checklist (nothing here is done without the owner)

## Before merge
- [ ] Required CI green on the exact final SHA (verify, billing on real Postgres, preview-e2e, Video Core live E2E, **Music Studio live E2E**, Vercel).
- [ ] Owner decides: ship the provider boundary with Music Studio, or split it (see below).
- [ ] Owner sign-off on rate-limit change: every Music Studio route is now limited **per user** (start 5/min, edit 20/min, quote/commands/cancel 20/min, status 100/min).
- [ ] PR #65 Draft → Ready → merge by the owner (never force, never by an agent).

## ⚠️ Changes on merge even with every flag OFF
- Provider boundary: Udio / ElevenLabs Music / MusicGen picks, covers, sampled/trained voice, chat music, `/api/udio/generate`, `/api/orchestrator/music/produce`, Demucs stems → `400 unsupported`, nothing charged. Lyria on `/api/ai/music` keeps working.
- New Live Voice tool `music_studio` is declared to every Gemini Live session; with `NEXT_PUBLIC_MUSIC_STUDIO_V1` off the studio answers `not_enabled` and the model is told to use `prepare_generation`.
- New cron `/api/music/studio/sweep` (every minute; settles debts only while the studio is off).
- New workflow `music-studio-e2e-local.yml` (CI only).

## Preview (needs an ISOLATED Supabase project, or explicit approval to use Production data)
- [ ] `MUSIC_STUDIO_ENABLED=1`, `NEXT_PUBLIC_MUSIC_STUDIO_V1=1`, `GEMINI_TRANSPORT=vertex` on Preview only.
- [ ] Owner-approved paid run (`scripts/music-studio/paid-e2e.ts`, cap $5, planned ≈ $0.16).
- [ ] Library row, ledger `music-studio-v1:<id>` −5, refund once on a forced failure.
- [ ] Real microphone check: "make a calm piano track" → card with price; Create by tap; "fade out 3 seconds" → version.

## Production
- [ ] Same variables (owner), redeploy, `vercel ls --prod`, one instrumental on the owner account, watch `ops_marker music_studio_unsettled`.
- [ ] Vocals only after a heard Phase 8 vocal (`MUSIC_LYRIA_VOCALS_VERIFIED=1`).

## Rollback
- Fast: `MUSIC_STUDIO_ENABLED=0` (no deploy); sweep keeps paying owed refunds. Client flag off needs a rebuild.
- Full: revert the merge commit. No migration. Leave the sweep cron until `unsettled: 0`.
