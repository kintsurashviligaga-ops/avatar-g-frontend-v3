# Music Studio v1 — 04 Test evidence (CI/E2E · audio QC · security/RLS · credit/refund · One Window)

Machine: macOS (Darwin 25.5), Node via repo `node_modules`, ffmpeg-static 6.0 (local), Postgres 16.15 (Homebrew), PostgREST (Homebrew).
**Mocked vs real:** every generation test in this branch uses a **faked Lyria provider**. No real provider execution took place (see 03).

## 1. Static checks (whole repo)
| Check | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** (exit 0) |
| `npx next lint --quiet` | **PASS** ("No ESLint warnings or errors") |
| `next build` | **PASS** (exit 0) with placeholder local Supabase env; all 8 `/api/music/studio/*` routes built. Without any env, page-data collection fails on the unrelated existing route `/api/editing/jobs/[id]` (`Missing SUPABASE_URL`), which is pre-existing |

## 2. Jest
New suites (all PASS):
| Suite | Tests | Kind |
|---|---|---|
| `lib/music/studio/engine.test.ts` | 21 | quote/confirm/reserve/work/settle, in-memory lease store with the live semantics |
| `lib/music/studio/audio.ffmpeg.test.ts` | 8 | **real ffmpeg** |
| `lib/music/studio/commands.test.ts` | 25 | Agent G words ka/en/ru |
| `components/studio/music/MusicStudioCard.test.tsx` | 6 | RTL/jsdom, faked API |
| `lib/music/studio/musicIsolation.pg.test.ts` | 6 | **real Postgres 16 + PostgREST** (skipped in plain Jest; run by the harness) |

Updated suites green: `app/api/ai/music/*` (71), `app/api/ai/music/engines` + `app/api/studio/catalogue` (15), `lib/studio/musicEngines`, `lib/chat/providerRouterMediaPolicy` (15), `app/api/ai/edit-audio` + `app/api/udio/generate` + `lib/providers/mediaPolicy` (45), `__tests__/provider-boundary`, `__tests__/api-lockdown`, `lib/orchestrator/produceBilling`, `lib/pipeline/statusAgent` (57 together), `lib/ai/lyriaMusic` (8), `lib/chat/*` (1471).

Full suite (`npx jest --ci`, before the last four fixes): 892 suites passed, 9 failed, 8 skipped; 13 854 tests passed, 24 failed, 73 skipped.
- 4 failing suites were policy-pinning tests touched by this branch (`provider-boundary`, `api-lockdown`, `produceBilling`, `statusAgent`). **Fixed and re-run green.**
- 5 failing suites (`lib/video/ffmpegExec`, `lib/agent/media/{composition,effects,montageExec,videoCoreAc06}.ffmpeg`), 20 tests: **fail identically on a clean `origin/main` worktree on this machine** (20 failed / 28 passed) — macOS ffmpeg-static 6.0, already recorded in the Video Core handoff. Linux CI is the reference. Not caused by this branch, and not counted as PASS.
- Skipped suites are DB/live suites that need their harness. They are counted as skipped, not as PASS.

## 3. GitHub CI on the PR head
PR #65, code head `8c3ec167` (the commit after it changes docs only):
| Check | Result |
|---|---|
| verify (Linux: tsc, lint, Jest incl. ffmpeg suites) | **pass** |
| billing on real Postgres | **pass** |
| preview-e2e | **pass** |
| Vercel Preview build | **pass** |
| live E2E (local Supabase, desktop + phone) | **pending** when this report was written — re-check with `gh pr checks 65` |

## 4. Audio QC (real ffmpeg, generated tones — not Lyria output)
| Case | Measured |
|---|---|
| 12 s MP3 | 11.8–12.3 s, `mp3`, 44 100 Hz, stereo, peak −21.5 dBFS (lavfi sine) → deliverable |
| Silence / 3 s clip / garbage bytes | refused: "silent" / "too short" / `quality_failed` |
| trim 2–12 + fade in 1 + fade out 2 + −6 dB → WAV | 10.0 s ±0.1, `pcm_s16le`, peak = source − 6 dB ±1; source bytes unchanged |
| mute → MP3 | same length, peak < −80 dB / −inf |
| WAV → M4A | `aac`, 8 s ±0.15 |
| join 6 s + 5 s (concat) / (2 s crossfade) | 11 s ±0.2 / 9 s ±0.2 |
| editMusic end-to-end (owned source → new Library row) | 10 s ±0.15, credits 0; a foreign id → `not_found` |
Production QC rule for Lyria output: an audio stream, length ≥ min(10, billed/2) and ≤ billed×2+30, peak > −60 dBFS. Edits: measured length within ±0.5 s of the planned length.

## 5. Security / ownership / Storage
| Property | How enforced | Tested |
|---|---|---|
| Auth on every studio route | `musicUser()` = `authedClientFromRequest`. Anonymous → 401; unverifiable session → 503, never a guest | api-lockdown gate scan |
| Studio off by default | `MUSIC_STUDIO_ENABLED` → 503 `not_enabled` before auth work | engine.test |
| Job ownership | Every read/cancel checks `row.userId === caller` and `exec.kind`; another user's job → 404 | engine.test, **pg suite (real DB)** |
| Quote integrity | HMAC (user, job, plan fingerprint, credits, expiry). Changed plan / other user / expired → 409 before any charge | engine.test |
| Edit sources | Resolved by job id **with** `user_id = caller`, `service_type = music`, `status = completed`. URLs are never accepted | ffmpeg test (foreign id) |
| Private Storage | `renders` bucket (private since 20261009b), path `music-studio/<userId>/…`, service role only, 1 h signed URLs re-minted on each owner read | code review; **direct anon-RLS probe NOT TESTED** |
| Secrets | No key in client code, logs, responses or reports. Provider bodies go only to `reportGeminiFallback`. The capabilities route returns booleans / ids only | engines route test (no secret in body) |
| Provider boundary | Non-Google music engines refused before reserve, flag-independent | noFallback, providerRouterMediaPolicy, edit-audio, udio tests |

## 6. Credit and refund integrity
| Scenario | Unit (memory store) | Real Postgres + PostgREST |
|---|---|---|
| Button = quote = debit | ✓ | ✓ (balance 100 → 95, one ledger row `music-studio-v1:<id>`) |
| Double tap / concurrent starts of one quote | ✓ one debit, one render | ✓ 3 concurrent starts → one debit |
| Retry after a lost response | ✓ replay returns the same job | ✓ |
| Concurrent jobs per user | ✓ third live job refused, uncharged | — |
| Provider failure | ✓ refund once across settle + sweep ×2 | ✓ ledger `-5`, `+5 :refund`, debt cleared |
| QC failure | ✓ not delivered, refunded | — |
| Cancel queued / cancel mid-render | ✓ / ✓ (heartbeat aborts, refund once, nothing delivered) | ✓ queued |
| Worker killed after dispatch | ✓ sweep fails it, **no re-send**, refund once | ✓ |
| Worker killed after storing | ✓ retry delivers the stored track, no second render, no refund | — |
| Billing hold abandoned (request killed mid-charge) | ✓ sweep fails + refunds | — |
| Ledger error / ambiguous reservation | ✓ owes a refund paid only if a debit exists | — |
| Insufficient credits | ✓ 402, nothing owed | ✓ no ledger rows |
| Budget guard refuses / cannot read | ✓ refused before any debit (fail closed) | — |
| Settlement for actual duration | Billed tier = the model's fixed length (30 s → 5 credits, the floor tier). No up-charge; the legacy route's down-settlement is kept | — |

## 7. One Window / Agent G acceptance
| Criterion | Status |
|---|---|
| Describe a song → plan + quote in the thread | BUILT, RTL-tested (panel + Agent G words → draft) |
| Explicit confirm with the exact price | BUILT, tested (`Create · 5 credits`, aria "5 credits will be charged") |
| Real progress, no fake % | BUILT, tested (stage sentences; the test asserts no `%` in the card) |
| Cancel / retry / recovery after reload | BUILT, tested (job id remembered per draft) |
| Inline preview + download | BUILT, tested |
| Edits keep context; original kept | BUILT, tested (versions under the original) |
| Saved in Library | BUILT (generation_jobs row); live Library view NOT TESTED |
| KA / EN / RU | BUILT, tested (key parity + distinct stage text) |
| Accessibility | 44 px targets, labels, `aria-live`, `role=alert/status`. No axe run |
| Mobile + desktop | **Playwright NOT RUN** |
| Live Voice commands | **NOT WIRED** (typed Agent G words only) |
