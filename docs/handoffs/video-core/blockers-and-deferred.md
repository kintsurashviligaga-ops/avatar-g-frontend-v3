# Video Core v1.0 — blockers (owner) and deferred work (§15.8 · §15.9)

## Blockers: what GG's word or action is needed for, and which check could not run

| # | Needs | Why | Check that could not run |
| --- | --- | --- | --- |
| B1 | A per-test Veo/Vertex budget (T5) | the task authorizes no paid call; every provider path is mocked | real clip durations vs the contract (Native 64 for Requested 60), V1–V6 on a live model, long-form scenes |
| B2 | A Preview run by GG (T4) on an already existing Preview, or permission for a new one | the task forbids a new Preview; this branch builds none (`vercel.json`) | AC-01 card flow in a browser, AC-13 Retry card, AC-15 project switch, AC-18 reload, AC-26 one window |
| B3 | Applying `proposals/20261012a_storyboard_revisions.sql` as a migration | Preview shares the Production Supabase project; no migration in this task | AC-14 revision/approval binding, AC-28 artifact ↔ revision |
| B4 | Flipping `LONGFORM_ORDER_WIRED` (one switch) + B1 | long-form is closed by name | AC-04 open path (exact 240 s = 7200 frames) |
| B5 | Segmented ingestion + a worker host beyond one 600 s function (paid infra) | chat 8 / quote 13 files | AC-24 29+ assets |
| B6 | Provider policy for remix/avatar legs (`MEDIA_GOOGLE_ONLY`, Replicate/HeyGen) | not changed silently (§11) | Google-only certification of `video.remix` |
| B7 | HawkScan API key + a running app | `HAWK_API_KEY` unset in the sandbox | DAST scan of the changed routes (NOT RUN) |
| B8 | Merge / deploy decision for PR #58 | NO MERGE, NO DEPLOY | T6 |

## Deferred (next phase; nothing here is Live Voice or another studio)

1. Video Studio consolidation (§2.3): VFX / Remix / Swap / Motion / Editing under one Video Studio with the canonical IDs kept.
2. Wire `lib/video/storyboard/revision.ts` into the board mutations; send the approval fingerprint with the render; check it in the route (after B3 or with a signed approval token).
3. Enforce `masterQa.frame_count_mismatch` as a refusal in `app/api/video/assemble` (today it is reported in `qa`, not enforced).
4. Remove the legacy 30 s brand pad for films rendered with no contract (today PARTIAL: a contract turns it off).
5. Montage gaps (AC-23): add clips to a delivered montage; replace music in place; silent export; music timeline start ≠ 0; source audio per clip from the chat.
6. A single fixture for AC-06 (5 clips + 0:59 + 29.7 s + 9:16 + Georgian end text) measured as one render.
7. The 60 s and 240 s encodes measured on decoded frames (AC-03, AC-04 open) once B1/B4 allow.
8. Run the opt-in film evidence test in CI on a schedule (it takes ~4 min).
