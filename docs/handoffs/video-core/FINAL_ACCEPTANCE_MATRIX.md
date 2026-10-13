# Video Core v1.0 — final acceptance matrix AC-01…AC-28

Branch `claude/video-core-v1-6gh97e`, draft PR #58, head **⟨HEAD⟩** (2026-10-12). Round 2's matrix with its SHAs stays in
`acceptance-matrix.md`; this file is the release-candidate state after round 3 and the isolated CI E2E.

## Tiers (a row is only PASS at the tiers it actually ran at)

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

CI-E2E run: ⟨CIRUN⟩.

## Matrix

| ID | Scenario | Final status | Tiers run | Evidence | CI-E2E (real backend) | What is still not proven |
| --- | --- | --- | --- | --- | --- | --- |
| AC-01 | „24-წამიანი მუსიკალური კლიპი" in a new chat | **PASS** (routing, length, plan, music-video storyboard mode) | T1, T2 | `intent.videoCore.test` 30/30; T2 `agent-g-intents.spec` KA/EN/RU × desktop/phone | not in scope (the film needs Veo) | the generated film itself (T5, B1) |
| AC-02 | KA/EN/RU equivalents and paraphrases | **PASS** | T1, T2 | `durationWords.test`, `intentCorpus`, T2 intents ×3 languages | — | — |
| AC-03 | „ერთწუთიანი" / „60 წამი" → 60 s, 1800 frames | **PASS** | T1, T3 | T3 `film60s`: 8 × 8 s at 24 fps → **1800** decoded frames, 60.00 s, 30 fps, QA A (`evidence/t3-round3-film.json`) | — | with real Veo clips (T5) |
| AC-04 | „ოთხწუთიანი" / „240 წამი" | **PASS (closed path)** · open path **BLOCKED** | T1 | `longform_closed` before the board, 0 render, 0 charge, never 96 s | — | 240 s generation: `LONGFORM_ORDER_WIRED` + paid Veo (B4, B1) |
| AC-05 | „29.7 წამი" / „29,7 წამი" → 891 frames | **PASS** | T1, T2, T3 | T3: 891 frames (16:9 and 9:16), QA A; T2: the Video tool shows the 891-frame plan for „Make a 29.7-second video" | — | the bare sentence without a make-verb stays a chat answer (owner decision D9) |
| AC-06 | 5 clips + music 0:59 + 29.7 s + 9:16 + Georgian end text | **PASS** | T3 | `evidence/t3-ac06-one-chain.json`: 891 frames after montage and after edit, 0:59 marker on frame 1, end text drawn | — | — |
| AC-07 | music from 0:58, 70 s, 130 s track | **PASS** | T3 | 2100 frames, `sourceStartSec 58` | — | — |
| AC-08 | the same on a 120 s track | **PASS** | T3 | `music_too_short`, 0 renders | — | — |
| AC-09 | only the last 5 of 7 | **PASS** | T3 | excluded sources 0 frames | — | — |
| AC-10 | montage quote from Agent G text | **PASS** | T1, T2, T3, **CI-E2E** | T2 intents (montage lane ×3 languages) | ⟨AC10⟩ | Vercel runtime (T4) |
| AC-11 | edit of a delivered video | **PASS** | T1, T2, T3, **CI-E2E** | T3 `editLive` 9/9, speed/sync integrity (`round3-final/t3-speed-sync-integrity.json`); T2 9:16 edit | ⟨AC11⟩ | T4 |
| AC-12 | audio → montage → edit as one run | **PASS (DB tier)** | T1, DB | `runIsolation.pg.test` I: three real results, one start per plan, nothing charged; E/F/G/H crash, stop, approval, other user — 6/6 in CI ("billing on real Postgres", `evidence/ci-e2e/billing-pg-38298797641.md`) | the browser journey covers montage and edit separately, not chained | the chained run in a browser (T2/CI-E2E), T4 |
| AC-13 | storyboard failure / timeout / malformed | **PASS** | T1, T2 | error card with Retry, nothing rendered (`videoCoreWiring.test` §5; T2 cards) | — (the storyboard needs the image model) | T4/T5 |
| AC-14 | change / move / delete a scene; approval of the revision on screen | **PASS** (code + browser) · revision table **proposal** | T1, T2 | `revision.test` 36/36, `storyboardApproval.test`, director path; T2 `storyboard.spec` (approval sent, `revision_mismatch` refused, nothing runs) | ⟨B3⟩ | the table in Production (B3, GG) |
| AC-15 | switching projects / conversations | **PASS** | T1, T2 | T2 `navigation.spec`: a new session shows none of the first one's results, reopening shows them once, attachments stay with their conversation (defect 6 fixed) | — | observation: the open tool and the Video mode are not kept across a reload (recorded, by design) |
| AC-16 | double click / concurrent retry / duplicate event | **PASS** | T1, DB, **CI-E2E** | 8 workers race → 1 job; 8 concurrent twins → 1 debit (CI, after 20261002d) | ⟨AC16⟩ | T4 |
| AC-17 | cancel / late callback / worker crash / retry | **PASS** | T1, T3, DB, **CI-E2E** | lease takeover after a dead worker, refund once after two deaths, stop kills ffmpeg and pays back once (CI) | ⟨AC17⟩ | T4 (function timeouts on Vercel) |
| AC-18 | reload / language / reconnect / other session | **PARTIAL** | T1, T2 | T2: /en /ka /ru load; a running job is in the tray exactly once after a reload; History reopens a conversation | sign-in through the real sheet on both viewports | another device / session sees no server project record (none exists) |
| AC-19 | expired quote / signed URL / lost or bad source | **PARTIAL** | T1, **CI-E2E** | refusals by name (`VIDEO_REFUSALS`), `media_not_yours`, `final_duration_invalid` | ⟨AC19⟩ | a signed URL expiring mid-render, end to end |
| AC-20 | another user's file / job / quote / approval / artifact | **PASS** | T1, DB, **CI-E2E** | `runIsolation` H (CI); contracts: RLS on profiles/ledger/jobs, no client writes, RPCs refused to anon/users | ⟨AC20⟩ | T4 |
| AC-21 | Georgian text / CTA / logo / captions | **PASS** | T3 | `composition`, `effects`, `transitions` ffmpeg suites | — | — |
| AC-22 | remove our overlay; baked-in logo refused | **PASS** | T3 | TX-04; `remove_from_source` refused | — | — |
| AC-23 | add clips / replace music / silent / delayed music / source audio | **PARTIAL** — nothing silently applied as something else | T1, T2, T3 | silent and own sound built; delay, add-after-delivery, replace-in-place **unsupported and said** (T2 desktop + phone) | — | the contract fields (D10, GG) |
| AC-24 | 29+ assets | **BLOCKED** (capability) · no silent drop **PASS** | T1 | refused by count | — | segmented ingestion + longer worker (B5) |
| AC-25 | provider unavailable / flag closed / role gate | **PASS** | T1, T2, **CI-E2E** | `not_configured`, `access.test`; T2 edit lane closed → words, no quote | ⟨AC25⟩ | T4 |
| AC-26 | plan → approval → progress → error/result in one window | **PASS** | T1, T2, **CI-E2E** | T2: stage without fake %, Stop/Retry by touch and keyboard, the server's reason on the error card | ⟨AC26⟩ | T4 |
| AC-27 | capability inventory | **PASS** (document + `lib/video/contracts.ts`) | T1 | 44 pins | — | consolidation stages (D1, D2) |
| AC-28 | finished work: preview/play, download, library; owner + revision | **PARTIAL** | T1, T2, **CI-E2E** | T2 download + save to library | ⟨AC28⟩ | the revision number shown in the Library (needs the B3 table) |

## Totals

⟨TOTALS⟩

## The four layers GG asked to keep apart

| Layer | Status | Evidence / reason |
| --- | --- | --- |
| CI E2E (isolated local Supabase, real backend, real ffmpeg, desktop + phone) | ⟨CISTATUS⟩ | ⟨CIRUN⟩ |
| Vercel Runtime E2E | **NOT RUN** | a new Preview needs GG's approval (18:17Z); the existing Preview binds Production Supabase, so only read-only checks are allowed there |
| Vertex / Veo live | **NOT RUN** | no paid call authorized; 980/980 Veo/director unit tests and the config review (`VERTEX_LIVE_TEST_PLAN.md`) are mocked-provider evidence only |
| Production E2E | **NOT RUN** | Production is never a test environment; nothing merged or deployed |
