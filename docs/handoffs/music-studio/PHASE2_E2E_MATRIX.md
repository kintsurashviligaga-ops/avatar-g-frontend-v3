# Music Studio v1 — Phase 2 · E2E matrix

Harness: `.github/workflows/music-studio-e2e-local.yml` → `playwright.music-live.config.ts` → `tests/music-studio-live/*`.
Local Supabase stack on the runner, `next start` of the branch, real ffmpeg, Chromium desktop + iPhone-13 viewport.
**Provider = stand-in (synthetic ffmpeg tone). No Google Lyria call. Mocked generation is NOT a Google E2E.**

Run history (all on GitHub Actions, isolated stack):
| Run | SHA | Passed | Failed | Not run | Notes |
|---|---|---|---|---|---|
| 38549122722 | `6a033640` | 17 | 2 | 6 | reload |
| 38550746462 | `da292939` | 15 | 4 | 6 | vocal copy ×2, KA/RU voice ×2 (listener race) |
| 38554579460 | `309202af` | 23 | 2 | 0 | reload: thread not in History |
| 38557521565 | `9bdc400b` | 24 | 1 | 0 | reload phone: thread saved under the guest archive (shared uid race) |
| 38559451395 | `604673e7` | 25 | 0 | 0 | clean, desktop + phone + API |
| 38566483556 | `5b6e6c07` | 25 | 0 | 0 | replay spec added but not matched by the desktop/mobile projects (config fixed next) |
| **38569894358** | **`134c4f33`** | **27** | **0** | **0** | **+ real-Lyria replay desktop + phone** |

| Area | Desktop | Mobile | Class |
|---|---|---|---|
| Sign-in through the real sheet | PASS | PASS | PROVEN_ISOLATED |
| Music panel → plan card → quote (exact 5 credits, aria "5 credits will be charged", `data-live-guard=spend`) | PASS | PASS | PROVEN_ISOLATED |
| Quote never charges | PASS | PASS | PROVEN_ISOLATED |
| Explicit Create (click / tap) → named stages, no % | PASS | PASS | PROVEN_ISOLATED |
| Exactly one debit `music-studio-v1:<job>` −5 | PASS | PASS | PROVEN_ISOLATED |
| Library row (`generation_jobs`, music, completed) + private `renders/music-studio/<uid>/<job>.mp3`, digest matches | PASS | PASS | PROVEN_ISOLATED |
| Inline playback (duration 28–32 s, currentTime advances) | PASS | PASS | PROVEN_ISOLATED |
| Download (attachment, app stays, decodes as 30 s MP3) | PASS | PASS | PROVEN_ISOLATED |
| Trim 2–12 → 10 s · fade out · −6 dB · WAV (pcm_s16le, 10 s) · M4A | PASS | PASS | PROVEN_ISOLATED |
| Join 2 with 2 s crossfade → ≈18 s new version | PASS | PASS | PROVEN_ISOLATED |
| Original byte-identical after 6 edits; edits free | PASS | PASS | PROVEN_ISOLATED |
| Unsupported op ("remove the vocals") said plainly | PASS | PASS | PROVEN_ISOLATED |
| Cancel mid-render → `−5, +5` once; Try again → new quote | PASS | PASS | PROVEN_ISOLATED |
| Provider failure / QC failure (silence) → refund once; sweep ×2 idempotent | PASS | PASS | PROVEN_ISOLATED |
| Vocal song refused before any price (server 400 `unsupported` on /quote; card `songRefused`: not swapped, not charged; no Create) | PASS | PASS | PROVEN_ISOLATED |
| KA / RU card copy (journey + voice) | PASS | PASS | PROVEN_ISOLATED |
| Keyboard Create (focus + Enter) | PASS | PASS | PROVEN_ISOLATED |
| Keyboard/a11y spec (focus, 44 px, accessible name, aria-busy) | PASS | PASS | PROVEN_ISOLATED |
| Reload mid-render → fresh chat (product rule) → thread opened from History → SAME job completes; one debit; one job row; thread in the uid archive before/after | PASS | PASS | PROVEN_ISOLATED (spec waits for `data-uid`; the shared authed→uid race is an open chat-infra defect, PHASE2_STATE.md) |
| Voice tool-dispatch (plan/dedupe/status/edit/busy/join/download/save/cancel) | PASS | PASS | PROVEN_ISOLATED (no microphone) |
| API: anonymous, cross-user, Storage/RLS, signed expiry, tampering, concurrency, 402, SSRF, secrets | PASS (api project) | — | PROVEN_ISOLATED |
| Mobile: no horizontal scroll at quoted / versions | PASS | PASS | PROVEN_ISOLATED |
| Preview UI with Music Studio on | — | — | BLOCKED (Preview = Production Supabase) |
| **Real Lyria bytes** (live capture, SHA-256 `09eaddb7…`) → quote → Create → one debit (40→35) → QC → private Storage (digest equal) → Library → signed link (TTL 3600 s, object-scoped, public URL refused) → player 30.77 s → download (digest equal) → reload | PASS | PASS | PROVEN_ISOLATED (replay of real output) |
| Live Lyria generation (Vertex, 3×200) | — | — | PROVEN_PREVIEW (build step; FINAL_REAL_LYRIA_E2E.md) |
| Live Lyria from the studio worker on a real account | — | — | BLOCKED (Preview = Production Supabase) |

Other evidence: integration tree #65 `0ea8aadf` + #60 `be9edee3` + #64 `bcb724a1`: tsc 0; Jest 912 suites passed, 5 failed / 20 tests
(real-ffmpeg suites — the same 5 suites / 20 tests fail on clean `origin/main` `fef867a6` on this Mac), 10 skipped (harness-only).
Card unit tests 14/14; stand-in gate unit 3/3.

Final run: **38559451395 on `604673e7` — 25 passed, 0 failed, 0 skipped/not run (4.5 min of tests)**.
https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38559451395
Same SHA: CI 38559451486 success (verify ✓, billing on real Postgres ✓), Preview Contract 38559451339 success, Vercel Preview ✓,
Video Core E2E 38559451340 (see PR checks). Later commits on the branch are docs-only.

## FINAL (2026-10-14, after the live Lyria run)
Run **38569894358 on `134c4f33` — 27 passed, 0 failed, 0 not run (4.7 min)**.
https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38569894358
Same SHA: CI 38569893967 success · Video Core E2E 38569893885 success · Preview Contract 38569893762 success · Vercel Preview built
(`[lyria-check] skipped: no request file`). Replay job ids: desktop `e8c7b3a3-0f76-41bd-880d-77591e182015`, phone `3635e554-842e-4f43-aaf6-fbf853cf4ed0`.
Integration tree (#65 `1b13388f` + #60 `be9edee3` + #64 `bcb724a1`): tsc 0, ESLint 0, Jest 914 passed / 5 failed (20) = the main baseline.
Local unit: Music Jest 8 suites / 77 + new lyriaMusic/engine fault tests 38/38 + build-step 5/5.
Commits after `134c4f33` are documentation only.
