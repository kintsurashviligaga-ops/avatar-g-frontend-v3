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

Round 2 (2026-10-12, GG's seven items) closed 1 (as a plan), 2, 3 and 6; the rest stand, each with its reason.

1. Video Studio consolidation (§2.3): **planned** — `consolidation-plan.md` (stages 0–5, decisions D1–D6); stage 0 (the registry `lib/video/contracts.ts`, the QC gate, the server-side approval check) is in this PR; stages 1–5 are not started (stage 1 needs a Preview run, B2). Other studios untouched.
2. ~~Wire the revision module~~ **done at code level (2923fa0)**: snapshot per board change, approval at the tap, server re-fingerprint before dispatch (`400 revision_mismatch`). Open: the table (B3) and the director-run path (no approval carried yet).
3. ~~Enforce `frame_count_mismatch`~~ **done (4812b0a, 71a6ec7)**: `502 qc_rejected` on both the saga and the single-clip path, refund once, FAILED recorded, nothing hosted.
4. Remove the legacy 30 s brand pad for films rendered with no contract → **decision D6**: every in-tree caller sends the contract, so the pad is reached only by an unknown client; the proposed default (the stitched length, said as such) is a server-default change GG decides, not a silent one.
5. Montage gaps (AC-23): add clips to a delivered montage; replace music in place; music timeline start ≠ 0; source audio per clip from the chat — each is a new field in the signed montage quote / manifest (the Media Studio v2 contract PR #57 shipped), i.e. a shared-contract change: **not done**, GG's decision (consolidation stage 3/4). **Round 3 did what is safe without the contract change:** silent export was already BUILT (`sound: 'silent'`, 2026-10-11 17:38Z); a later music start asked in words is now **said** on the quote (`unsupported: ['music_delay']`, note on the card) and never read as a track offset; an add-clips / replace-music follow-up after a delivered montage is **answered as unsupported before any quote** (nothing sent, nothing charged). Nothing is applied as something else or dropped silently (defect-register row 22).
6. ~~A single fixture for AC-06~~ **done (round 2)**: `lib/agent/media/videoCoreAc06.ffmpeg.test.ts` — the chain the product runs (montage → edit) measured on the final file: 891 frames, 9:16, music from 0:59, five sources, Georgian end text (`evidence/t3-ac06-one-chain.json`).
7. The 60 s and 240 s encodes measured on decoded frames (AC-03, AC-04 open) once B1/B4 allow.
8. Run the opt-in film evidence test in CI on a schedule (it takes ~5 min).
9. **new** Conform a single clip whose final IS its native length to the 30 fps grid (today left at the provider's 24 fps, length exact): the conform is one more encode and would bill a clip that today goes out unbilled when nothing else was asked — **decision D7** (`consolidation-plan.md`), not done silently.
10. ~~Carry the storyboard approval on the director-run path (`app/api/video/director`) too.~~ **done at code level (round 3, P1)**: the tap approves BEFORE the film/director branch; `DirectorRunOverlay` posts `{ storyboard, storyboardApproval, locale }`; `POST /api/video/director/runs` checks the storyboard against the approval (`lib/video/director/fromStudio → checkStoryboardApproval`: fingerprint, scene count, every shot's text and length in the director's order) and answers `400 revision_mismatch` before `freeze`, so nothing is stored or charged. A run with no approval (a hand-written document, the planner's draft approved whole) is accepted as before — making the approval mandatory for every run is **decision D8** (the plan route would need its own approval shape).
