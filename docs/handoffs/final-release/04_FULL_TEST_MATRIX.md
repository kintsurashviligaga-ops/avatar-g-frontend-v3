# 04 — Full test matrix

CI runs are GitHub Actions on PR #74 (https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/pull/74), URL
`…/actions/runs/<id>`. "Isolated" = local Postgres/Supabase with synthetic data and fake providers (03). Classes:
PROVEN_PRODUCTION, PROVEN_ISOLATED, PROVEN_UNIT, NOT_RUN, UNAVAILABLE, PENDING.

| Test ID | Feature | Preconditions | Exact SHA | URL / CI evidence | Expected | Observed | Class | Blocker | Owner |
|---|---|---|---|---|---|---|---|---|---|
| T-01 | Film billing exactly once, refund on failure | local Postgres, real ledger RPCs | ba35a07e | run 38786256790 "billing on real Postgres" | one debit per film, one refund on failure | pass | PROVEN_ISOLATED | — | Video Core |
| T-02 | Film journey desktop + phone | local Supabase, fake Veo | ba35a07e | run 38786256790 "live E2E" | film in the caller's Library | pass | PROVEN_ISOLATED | — | Video Core |
| T-03 | Another account's film token (defects 47/48) | Jest, real route | merge of de15464d | `app/api/video/assemble/filmOwner.test.ts` | 403, no waiver/claim/debit/stamp/Library write | pass | PROVEN_UNIT (fix PROVEN_PRODUCTION code since de15464) | — | Video Core |
| T-04 | Image Studio jobs, charge, refund | local Postgres | ba35a07e | run 38786256819 "isolated-db" | quote = debit, refund on failure | pass | PROVEN_ISOLATED | real Imagen run needs GG's word | Integration |
| T-05 | Image Studio in the browser | local Supabase, fake image model | ba35a07e | run 38786256819 "image-browser" | create, Library, download | pass | PROVEN_ISOLATED | same | Integration |
| T-06 | Music Studio desktop + phone | local Supabase, fake Lyria | ba35a07e | run 38786257199 | quote, start by button, Library, refund | pass | PROVEN_ISOLATED | real Lyria run needs GG's word; studio OFF | Integration |
| T-07 | Voice Experience in the browser | simulated Live session | ba35a07e | run 38786256743 "simulated-browser" | read-aloud control, no auto-read, stop keeps jobs | pass | PROVEN_ISOLATED (simulated) | real Gemini Live not run | Integration |
| T-08 | Voice on a real phone | GG's phone, Production session | — | — | 08_VOICE_REAL_DEVICE_ACCEPTANCE.md | not run | NOT_RUN | needs GG in person | GG |
| T-09 | Spoken "კი" never debits | Jest | branch | `components/voice/live/liveVoiceGate.test.tsx`, `liveActions.test.tsx`, `lib/voice/liveTools.test.ts`, `components/studio/liveRunGate.test.ts` | every voice start answers `ui_confirmation_required` | pass | PROVEN_UNIT | — | Integration |
| T-10 | BOG checkout, callback, refund | local Postgres, fake BOG | ba35a07e | run 38786256978 "isolated" | paid once, refund once | pass | PROVEN_ISOLATED | — | BOG |
| T-11 | BOG sandbox | sandbox keys | ba35a07e | run 38786256978 "BOG sandbox" (3 s) | real sandbox order | job skips without keys | UNAVAILABLE | bank cannot create sandbox objects | BOG / GG |
| T-12 | Preview contract (money guard, no paid build hook) | CI | ba35a07e | run 38786256784 | no paid call from a Preview | pass | PROVEN_ISOLATED | — | Integration |
| T-13 | tsc, ESLint, Jest, next build | CI | ba35a07e | run 38786256700 "verify" | all green | pass | PROVEN_ISOLATED | — | Integration |
| T-14 | Provider boundary covers every outside engine | Jest | branch | `lib/providers/mediaPolicy.test.ts`, `lib/env/providerBoundary.test.ts`, `lib/chat/providerRouterMediaPolicy.test.ts` | every GATED_ENTRIES file calls the guard; default ON | pass | PROVEN_UNIT | — | Integration |
| T-15 | Full-song music quote = debit (12) | Jest | branch | `lib/studio/musicQuote.test.ts` | card, Live answer and route agree | pass | PROVEN_UNIT | — | Integration |
| T-16 | `/ka/create`, `/ka/app` → `/ka` | Jest | branch | `lib/routing/shellRedirects.test.ts` (fails on main) | 307 | pass | PROVEN_UNIT | — | Integration |
| T-17 | Dictation does not auto-read; stop keeps jobs | Jest | branch | `lib/voice/experience/readAloud.test.ts:44` | audio stops, job continues | pass | PROVEN_UNIT | — | Integration |
| T-18 | Production read-only probe before release | Vercel fetch | de15464d (dpl_8qNq6QVjjM4sHy6assiYjPTD2KPm) | `/api/version`, `/api/health`, `/api/health/public` at 19:11–19:12Z | 200, sha de15464 | 200, de15464, healthy; public: 5 ok, voice down (ElevenLabs probe, down since 2026-09). Re-probed 20:52Z after Video Core PR #77: `/api/version` 5517047 | PROVEN_PRODUCTION | — | Integration |
| T-19 | Same probe after release | after GG's deploy word | release head | 09 step 6 | 200, release sha | — | PENDING | GG's card | Integration |
| T-20 | Admin canary on Production (studios visible to admin only, an outside tool shows "paused, not charged") | GG signed in as admin | release head | 09 step 7 | as stated | — | PENDING | GG's sign-in | GG + Integration |
| T-21 | Paid real runs on the new studios (Imagen, Lyria, Veo) | GG's word naming each | — | — | real asset in Library, ledger delta = quote | not run | NOT_RUN | GG's word | GG |
| T-22 | Full Jest on the merged tree | local, 4 cores | f52f918e (main de15464d merged) | 01 row 8 | all pass | suites 939 passed / 0 failed / 12 skipped; tests 14,372 / 0 / 114 (+ 2 new suites, 20 tests) | PROVEN_ISOLATED | — | Integration |
| T-23 | Affected + wide Jest after merging main 55170471 (PR #77) | local, 4 cores | 6f52934f | 01 row 9 | all pass | 39 suites / 565 tests; wide 225 suites / 4,416 tests, 0 failed | PROVEN_UNIT | — | Integration |
