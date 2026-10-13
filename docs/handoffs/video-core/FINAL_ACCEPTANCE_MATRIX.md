# Video Core v1.0 — final acceptance matrix AC-01…AC-28

Branch `claude/video-core-v1-6gh97e`, draft PR #58, head **df7eaa9** (code, tests and CI E2E run 8 rest on it; later commits change only these documents) (2026-10-13). Round 2's matrix with its SHAs stays in
`acceptance-matrix.md`; this file is the release-candidate state after round 3 and the isolated CI E2E.

## Tiers (a row is only PROVEN at the tiers it actually ran at)

| Tier | What ran | Where |
| --- | --- | --- |
| T1 | unit / integration, providers mocked | sandbox + CI "verify" |
| T2 | real browser (desktop Chrome, iPhone 13 viewport), server routes mocked at the page | sandbox `next dev` (`evidence/t2-round3-final/`) |
| T3 | real ffmpeg, decoded frame counts | sandbox (`FFMPEG_EVIDENCE.md`) |
| DB | real Postgres + PostgREST + real ffmpeg, local and throwaway | sandbox and CI job "billing on real Postgres" |
| **CI-E2E** | real browser + `next start` of this branch + throwaway Supabase (Auth, Storage, PostgREST, Postgres 17) + real ffmpeg, synthetic users and media | GitHub Actions job "live E2E" (`SUPABASE_TEST_ENV.md`) |
| T4 | Vercel runtime (Preview) | **NOT RUN** — a new Preview needs GG's approval |
| T5 | paid provider (Veo / Vertex) | **NOT RUN** — needs GG's budget word (B1) |
| T6 | Production | **NOT RUN** — Production is never a test environment |

CI-E2E run: **38353387827 (run 8, head df7eaa9): 21 / 21 passed** on desktop + iPhone 13 (`evidence/ci-e2e/live-e2e-38353387827.md`). Runs 4–7 are kept in the same folder with their failures and root causes (defects 37–39).

## Matrix

| ID | Scenario | Final status | Tiers run | Evidence | CI-E2E (real backend) | What is still not proven |
| --- | --- | --- | --- | --- | --- | --- |
| AC-01 | „24-წამიანი მუსიკალური კლიპი" in a new chat | **PARTIAL** — routing, length, plan and music-video storyboard mode PROVEN; the film itself NOT RUN (B1) | T1, T2 | `intent.videoCore.test` 30/30; T2 `agent-g-intents.spec` KA/EN/RU × desktop/phone | not in scope (the film needs Veo) | the generated film itself (T5, B1) |
| AC-02 | KA/EN/RU equivalents and paraphrases | **PROVEN** | T1, T2 | `durationWords.test`, `intentCorpus`, T2 intents ×3 languages | — | — |
| AC-03 | „ერთწუთიანი" / „60 წამი" → 60 s, 1800 frames | **PROVEN** | T1, T3 | T3 `film60s`: 8 × 8 s at 24 fps → **1800** decoded frames, 60.00 s, 30 fps, QA A (`evidence/t3-round3-film.json`) | — | with real Veo clips (T5) |
| AC-04 | „ოთხწუთიანი" / „240 წამი" | **PARTIAL** — the closed path PROVEN (refused by name, never 96 s); the open path **BLOCKED** (B4, B1) | T1 | `longform_closed` before the board, 0 render, 0 charge, never 96 s | — | 240 s generation: `LONGFORM_ORDER_WIRED` + paid Veo (B4, B1) |
| AC-05 | „29.7 წამი" / „29,7 წამი" → 891 frames | **PROVEN** | T1, T2, T3 | T3: 891 frames (16:9 and 9:16), QA A; T2: the Video tool shows the 891-frame plan for „Make a 29.7-second video" | — | the bare sentence without a make-verb stays a chat answer (owner decision D9) |
| AC-06 | 5 clips + music 0:59 + 29.7 s + 9:16 + Georgian end text | **PROVEN** | T3 | `evidence/t3-ac06-one-chain.json`: 891 frames after montage and after edit, 0:59 marker on frame 1, end text drawn | — | — |
| AC-07 | music from 0:58, 70 s, 130 s track | **PROVEN** | T3 | 2100 frames, `sourceStartSec 58` | — | — |
| AC-08 | the same on a 120 s track | **PROVEN** | T3 | `music_too_short`, 0 renders | — | — |
| AC-09 | only the last 5 of 7 | **PROVEN** | T3 | excluded sources 0 frames | — | — |
| AC-10 | montage quote from Agent G text | **PROVEN** | T1, T2, T3, **CI-E2E** | T2 intents (montage lane ×3 languages) | **PROVEN**, desktop + phone: real upload → Agent G reads „Cut these to the music, 5 seconds long" → quote probed by real ffmpeg (5 s, 0 credits, beat-synced) → Start → master decoded **150 frames** → Download → Library lists it (run 4 (38339223896), again in run 8 (38353387827)) | Vercel runtime (T4) |
| AC-11 | edit of a delivered video | **PROVEN** | T1, T2, T3, **CI-E2E** | T3 `editLive` 9/9, speed/sync integrity (`round3-final/t3-speed-sync-integrity.json`); T2 9:16 edit | **PROVEN**, desktop + phone (run 8, 38353387827): the montage Agent G delivered is edited from the chat, the phone in Georgian: trim 1→4 s → **90 frames**, 2× → **75 frames**, slow motion → **300 frames**, each with sound, nothing charged. Runs 5–7 found defects 38 and 39 on this path (fixed in 38a6167 and c130532) | T4 |
| AC-12 | audio → montage → edit as one run | **PARTIAL** — PROVEN at the DB tier; the chained run in a browser NOT RUN | T1, DB | `runIsolation.pg.test` I: three real results, one start per plan, nothing charged; E/F/G/H crash, stop, approval, other user — 6/6 in CI ("billing on real Postgres", `evidence/ci-e2e/billing-pg-38298797641.md`) | the browser journey covers montage and edit separately, not chained | the chained run in a browser (T2/CI-E2E), T4 |
| AC-13 | storyboard failure / timeout / malformed | **PROVEN** | T1, T2 | error card with Retry, nothing rendered (`videoCoreWiring.test` §5; T2 cards) | — (the storyboard needs the image model) | T4/T5 |
| AC-14 | change / move / delete a scene; approval of the revision on screen | **PARTIAL** — code + browser PROVEN; the revision table is a proposal (B3) | T1, T2 | `revision.test` 36/36, `storyboardApproval.test`, director path; T2 `storyboard.spec` (approval sent, `revision_mismatch` refused, nothing runs) | the `storyboard_revisions` table proposal applied and verified on the CI throwaway database only (RLS, owner-only reads) | the table in Production (B3, GG) |
| AC-15 | switching projects / conversations | **PROVEN** | T1, T2 | T2 `navigation.spec`: a new session shows none of the first one's results, reopening shows them once, attachments stay with their conversation (defect 6 fixed) | — | observation: the open tool and the Video mode are not kept across a reload (recorded, by design) |
| AC-16 | double click / concurrent retry / duplicate event | **PROVEN** | T1, DB, **CI-E2E** | 8 workers race → 1 job; 8 concurrent twins → 1 debit (CI, after 20261002d) | **PROVEN**: Start pressed twice (dblclick / two taps) → exactly one montage job, one run response; six concurrent `deduct_credits_once` twins → one debit (run 4 (38339223896) and run 8 (38353387827)) | T4 |
| AC-17 | cancel / late callback / worker crash / retry | **PROVEN** | T1, T3, DB, **CI-E2E** | lease takeover after a dead worker, refund once after two deaths, stop kills ffmpeg and pays back once (CI) | **PROVEN**, desktop + phone: Stop while it renders → `cancelled by the user`, 0 charged → Retry → fresh quote → **600 frames** (20 s) (run 4 (38339223896) and run 8 (38353387827)) | T4 (function timeouts on Vercel) |
| AC-18 | reload / language / reconnect / other session | **PARTIAL** | T1, T2 | T2: /en /ka /ru load; a running job is in the tray exactly once after a reload; History reopens a conversation | sign-in through the real sheet on both viewports | another device / session sees no server project record (none exists) |
| AC-19 | expired quote / signed URL / lost or bad source | **PARTIAL** | T1, **CI-E2E** | refusals by name (`VIDEO_REFUSALS`), `media_not_yours`, `final_duration_invalid` | bad source refused by name on the real server: a non-audio file never becomes an attachment (byte sniff), an undecodable clip → quote `unreadable`, a foreign file → 403 `media_not_yours`, nothing runs (run 4 (38339223896) and run 8 (38353387827)) | a signed URL expiring mid-render, end to end |
| AC-20 | another user's file / job / quote / approval / artifact | **PROVEN** | T1, DB, **CI-E2E** | `runIsolation` H (CI); contracts: RLS on profiles/ledger/jobs, no client writes, RPCs refused to anon/users | **PROVEN**, desktop + phone: another user sees 0 job rows, task route 404, storage 400 (signed in and public), foreign quote 403 `media_not_yours`; RLS, RPC and no-client-write contracts on the live stack (run 4 (38339223896) and run 8 (38353387827)) | T4 |
| AC-21 | Georgian text / CTA / logo / captions | **PROVEN** | T3 | `composition`, `effects`, `transitions` ffmpeg suites | — | — |
| AC-22 | remove our overlay; baked-in logo refused | **PROVEN** | T3 | TX-04; `remove_from_source` refused | — | — |
| AC-23 | add clips / replace music / silent / delayed music / source audio | **PARTIAL** — nothing silently applied as something else | T1, T2, T3 | silent and own sound built; delay, add-after-delivery, replace-in-place **unsupported and said** (T2 desktop + phone) | — | the contract fields (D10, GG) |
| AC-24 | 29+ assets | **BLOCKED** (capability, B5) · no silent drop PROVEN | T1 | refused by count | — | segmented ingestion + longer worker (B5) |
| AC-25 | provider unavailable / flag closed / role gate | **PROVEN** | T1, T2, **CI-E2E** | `not_configured`, `access.test`; T2 edit lane closed → words, no quote | **PROVEN**: `AGENT_G_MEDIA_EXEC=admin` — an ordinary user gets `enabled:false` and 404 on montage and edit quotes, an anonymous caller 401, the admin `enabled:true` (run 4 (38339223896) and run 8 (38353387827)) | T4 |
| AC-26 | plan → approval → progress → error/result in one window | **PROVEN** | T1, T2, **CI-E2E** | T2: stage without fake %, Stop/Retry by touch and keyboard, the server's reason on the error card | **PROVEN**, desktop + phone: quote card → Start → running → done / cancelled / refused cards driven by the real server's answers (run 4 (38339223896) and run 8 (38353387827)) | T4 |
| AC-27 | capability inventory | **PROVEN** (document + `lib/video/contracts.ts`) | T1 | 44 pins | — | consolidation stages (D1, D2) |
| AC-28 | finished work: preview/play, download, library; owner + revision | **PARTIAL** | T1, T2, **CI-E2E** | T2 download + save to library | the real master downloaded and decoded; the Library lists it (desktop + phone); edit results play from their signed URL (run 4 (38339223896), again in run 8 (38353387827)) | the revision number shown in the Library (needs the B3 table) |

## Totals

**28 criteria: 19 PROVEN · 8 PARTIAL · 1 BLOCKED** (AC-24, capability B5; its no-silent-drop half is PROVEN). CI-E2E ran
on 9 of them: AC-10, 11, 16, 17, 20, 25, 26 (PROVEN) and AC-19, 28 (PARTIAL). No row is proven at T4, T5 or T6: those tiers
were not run.

## The four layers GG asked to keep apart

| Layer | Status | Evidence / reason |
| --- | --- | --- |
| CI E2E (isolated local Supabase, real backend, real ffmpeg, desktop + phone) | **PROVEN**: 21 / 21 on head df7eaa9 | run 38353387827 (run 8): desktop + iPhone 13 journeys and the stack contracts; job "billing on real Postgres" 40 passed, 2 skipped by design; `evidence/ci-e2e/` |
| Vercel Runtime E2E | **NOT RUN** | a new Preview needs GG's approval (18:17Z); the existing Preview binds Production Supabase, so only read-only checks are allowed there |
| Vertex / Veo live | **NOT RUN** | no paid call authorized; 980/980 Veo/director unit tests and the config review (`VERTEX_LIVE_TEST_PLAN.md`) are mocked-provider evidence only |
| Production E2E | **NOT RUN** | Production is never a test environment; nothing merged or deployed |
