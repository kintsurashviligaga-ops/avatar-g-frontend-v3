# CONTINUE FROM HERE — Final Integration & Production Release

Last update: 2026-10-16 07:20Z. RELEASED. PR #74 was merged to main as ffde345c (06:38:38Z) after GG's tap on the
"Merge + deploy" card at 06:37:59Z. Production has served dpl_Jn9ucwhB5ND6STFgo1CPPVeswtLD since 06:43Z. The rollback target is
dpl_9Ux1s4yZLBiE1nC5GK7wi7SjHspp (369acfc), and no rollback was needed. Nothing paid, no database touched, no env or flag
changed. Branch `claude/final-integration-release-wt2y8s` was restarted from main ffde345c for the post-release docs (a new
draft PR; #74 is merged and must not be reused).

- DONE: Phases 0–8. Release steps 1–7 are in 09 "Release record". 04 T-19 is PROVEN_PRODUCTION. T-20 is PARTIAL:
  - Canary 1 (Image Studio for admin): GG's photos.
  - Canary 2 (outside engine paused): live probe.
  - Canary 4 (film price): code identity.
  - Canary 3 (spoken "კი" starts nothing): unit-proven only.
  - The 30-minute error watch found only the old `service_jobs` group.
  - Video Core was told at 07:15Z that the Production slot is free; its next deploy builds on ffde345c.
- VERDICT: the staged release is done. Customer-wide opening is still NO-GO (GO_NO_GO_KA.md).
- NEXT: nothing is owed by this thread. When GG next uses Live voice, record canary 3 (a spoken "კი" quotes the price and
  starts nothing). If a P0 shows up and Production still serves ffde345c, roll back to dpl_9Ux1s4… (09). If another thread
  has deployed since, roll back only with that thread.
- OPEN, not blocking: FR-2 (BLOCKED_OWNER), FR-8, FR-12, FR-13; Video Core's FR-9, FR-10; runbook step 8 (ordinary
  account) not run because this thread never signs in to Production.
- Owner-gated, not asked yet: isolated Preview Supabase, paid acceptance runs (Imagen, Lyria), real-device voice (08),
  dubbing/presentation prices, public flags.
- Never: push to the branches of #60/#64/#65/#66/#67/#68; deploy over or roll back another thread's release; a new
  Vercel Preview without GG's word.
