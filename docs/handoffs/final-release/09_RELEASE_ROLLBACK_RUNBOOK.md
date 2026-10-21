# 09 — Release and rollback runbook

Release = merge PR #74 into main; Vercel's Git integration builds main and assigns the Production domains (that is how
#70, #71, #73, #75, #76, #77 and #78 went live). There is no migration and no env change in this release, so a rollback touches
code only. "Staged" means every new studio stays off or admin-only after the deploy; nothing widens for customers.

## Preconditions (all must hold; the integration thread checks them)

1. GG tapped the merge + deploy card (one-time, for PR #74 only).
2. CI on the exact PR head is 10/10 green (verify, Video Core billing + live E2E, Image isolated-db + browser, Music
   live E2E, Voice simulated-browser, BOG isolated + sandbox job, preview-e2e).
3. No other thread's Production build is in flight (`list_deployments` target=production, state BUILDING/QUEUED is
   empty) and no paid Production run is in progress (Video Core thread's latest status).
4. Rollback target recorded: the deployment serving Production just before the merge. On 2026-10-16 06:11Z that was
   dpl_9Ux1s4yZLBiE1nC5GK7wi7SjHspp (main 369acfc, Video Core PR #78, READY 05:58Z); before it
   dpl_vKQqsez4BP8vRpi33HM8E3GGmBsR (5517047). Re-read it at release time.

## Release

| Step | Action | Evidence to record |
|---|---|---|
| 1 | Mark PR #74 ready, merge with a merge commit (no squash of other PRs' history, no force push) | merge SHA, time |
| 2 | Wait for the Production deployment of that SHA to be READY | dpl id, READY time |
| 3 | `/api/version` and `/api/health` answer the merge SHA; `/api/health/public` categories as before (voice "down" is the known ElevenLabs probe) | JSON + time |
| 4 | `/ka`, `/en`, `/ru` 200; `/ka/create` → 307 `/ka` | status codes |
| 5 | Runtime errors for 30 min (`get_runtime_errors`): no new 5xx class; the new per-minute cron `/api/music/studio/sweep` answers 200 (it only settles while Music Studio is off) | error counts before/after |
| 6 | "BOG Production smoke (read-only)" workflow green | run id |
| 7 | Admin canary (GG signed in as admin, nothing paid): Image Studio opens for admin; an outside tool (e.g. upscale) shows "paused, not charged"; a Live call says the price and starts nothing on "კი"; Video Core film panel quotes as before | screenshots without private content |
| 8 | Ordinary account (no credits): Image Studio and Music Studio are not visible; the Image tool quotes the same price | screenshots |

## Release record (2026-10-16)

| Step | Result |
|---|---|
| 0 | Preconditions held: GG tapped "Merge + deploy" 06:37:59Z (verified with fetch_thread); CI 10/10 on 8acfefcf (06:35Z); no Production build in flight; Video Core's paid run finished 05:20Z and it handed over the deploy slot; rollback target dpl_9Ux1s4yZLBiE1nC5GK7wi7SjHspp (369acfc) |
| 1 | PR #74 merged 06:38:38Z with a merge commit: main ffde345c16980fe519045a89ba6ad4399e36b1b9 |
| 2 | dpl_Jn9ucwhB5ND6STFgo1CPPVeswtLD READY 06:43Z (build time 06:42:57Z), assigned to Production |
| 3 | `/api/version` and `/api/health` answer ffde345; `/api/health/public` 5 ok + voice down, unchanged |
| 4 | `/ka`, `/en`, `/ru` 200; `/ka/create` ends on `/ka` (re-probed 07:15Z) |
| 5 | Runtime errors 06:42–07:15Z: one group, the old `service_jobs` scan (first seen 2026-10-02, table pinned by the schema-drift ratchet); no new class. The sweep cron logged no error |
| 6 | "BOG Production smoke (read-only)" run 38862914733 green |
| 7 | (1) Image Studio opens for admin, 2 credits/image (GG's photos 06:49Z). (2) Outside engine refused live: `GET /api/video/lipsync?health=heygen` → `{"ok":false,"reason":"google_only"}` 07:14Z. (3) Spoken "კი" starts nothing: unit-proven, not yet seen in the Production UI. (4) Film price: `lib/credits/videoPricing.ts` identical to 369acfc |
| 8 | Not run: this thread never signs in to Production; the gates are flags that stay unset (AGENT_G_MEDIA_EXEC admin, Music flags unset) |

No P0, so no rollback. Video Core was told the slot is free again (07:15Z); its next deploy builds on ffde345c.

## Watch (first hours)

Error rate, `generation_jobs` rows stuck in running, unsettled refunds and sweep failures (ops markers `music_studio_unsettled`,
`image_studio_sweep_failure`, `studio_sweep_failure`, `render_drainer_failure`), Upstash errors, Veo/Lyria errors, the daily Veo guard (VEO_DAILY_LIMIT_USD=10).

## Rollback (a P0 regression)

1. Vercel → Deployments → the recorded target → "Instant Rollback"
   (https://vercel.com/kintsurashviligaga-ops-projects/avatar-g-frontend-v3/deployments), or the MCP `request_rollback`.
2. Confirm `/api/version` answers the old SHA.
3. After an Instant Rollback Vercel stops assigning new main builds to Production until the rollback is undone; the
   next release must "Undo Rollback" or promote explicitly. Tell the other threads before their next deploy.
4. The database needs nothing: this release has no migration and writes no new table. Do not revert completed assets
   or ledger rows; refunds owed by a failed job are settled by the sweeps that exist on both versions.
5. Never roll back over another thread's newer release without that thread: if Production has moved on since this
   release, roll back only with the owning thread.

## Flags this release does not change (each needs GG's own word)

`AGENT_G_MEDIA_EXEC` (admin), `NEXT_PUBLIC_MUSIC_STUDIO_V1` / `MUSIC_STUDIO_ENABLED` (unset), `MUSIC_LYRIA_VOCALS_VERIFIED`
(unset), `NEXT_PUBLIC_VOICE_EXPERIENCE_V2` (unset), `OWNER_APPROVED_PRICING` (unset), `MEDIA_GOOGLE_ONLY` /
`OUTSIDE_ENGINES_APPROVED` (unset = boundary ON), `BOG_CHECKOUT_MODE` (admin). Phone (#66), standalone voice-to-voice and
uncertified vocals stay out.
