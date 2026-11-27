# E2E_ACCEPTANCE_MATRIX — the tests, the scenarios, and how to run them after GREEN

**As of:** 2026-11-27. Docs only.
**Runbook:** `docs/launch/LAUNCH_COMMANDS.md` (on #373; identical to the project copy). This file does not replace it. It says **what proves what**, and the runbook says **in what order to do it**.

---

## 1. The automated suites

### 1.1 Jest (unit, route and integration)

| Run | Suites | Tests | Result | Where |
|---|---|---|---|---|
| Combined stack: `main` `0ea1566` + all 96 launch PRs + Phase 8.20 fixes | 1,290 | **18,784 passed, 1 failed** | The one failure was a real bug (login browser outside the net guard), fixed by #408 | #409 (branch `claude/throwaway-820-combined`), local run 2026-11-27 |
| The same stack after the 8.20 fixes, affected areas | 218 | 2,112 passed, 0 failed | Green | #409 |
| `main` alone (CI `verify` on #396, 2026-11-27) | n/a | 17,231 passed, 1 failed, 123 skipped (17,355 total) | Only failure: `lib/capabilities/lifecycle.test.ts` (date guard, fixed by #292) | GitHub Actions `verify` |

**Skipped and environment-only suites.** About 120 tests skip unless their environment exists: real Postgres, the ffmpeg binary, the BOG sandbox, or a browser. They are not skipped in CI: the jobs in §1.2 run them. In a container without `ffmpeg-static`, the 14–20 `*.ffmpeg.test.ts` suites fail with `spawn ENOENT`. That is an environment failure, and the same suites pass in CI.

### 1.2 GitHub CI jobs (all 18 green on #409, head `314e824f`)

| Job | Workflow | What it proves |
|---|---|---|
| `verify` | `ci.yml` | `npm run typecheck`, full `npm test`, `npm run build` |
| `preview-e2e` | `e2e.yml` | 17 Playwright specs (`npm run test:e2e:preview`): chat, Live recovery, music settings, library states/favorites/films, delete-X, safe area, photo handoff and more |
| `agent-g-gate` | `e2e.yml` | `tests/agent-g-gate.spec.ts`: Agent G stays closed to non-admins |
| `live E2E (local Supabase, desktop + phone)` | `video-core-e2e-local.yml` | Video core on a real local Supabase, desktop and phone |
| `billing on real Postgres` | `video-core-e2e-local.yml` | The ledger RPCs on Postgres: charge once, refund once |
| `Music Studio live E2E (local Supabase, desktop + phone)` | `music-studio-e2e-local.yml` | Music Studio end to end on a local Supabase |
| `image-browser`, `isolated-db` | `image-studio-acceptance.yml` | Image studio in a real browser; DB isolation |
| `read-aloud (chromium / firefox / webkit)` | `speech-acceptance.yml` | Read-aloud in three engines |
| `isolated (local Postgres, fake BOG)` | `bog-e2e.yml` | BOG flow against a fake BOG and real Postgres |
| `BOG sandbox (real api-sandbox.bog.ge, test cards)` | `bog-e2e.yml` | S1–S7 against BOG's real sandbox with test cards |
| `adk-pilot` | `adk-pilot.yml` | The isolated Google ADK read-only pilot |
| `agent-execution`, `workspace-ui` | `phase9-mocked-e2e.yml` (added by #316) | Agent G execution matrix AG-01…AG-12 with invariants I-1…I-6, and Live Workspace UI-01…UI-08, both on mocks |
| `simulated-browser` | `voice-experience.yml` | Voice regression and browser acceptance with simulated audio, no live provider |
| `Vercel Preview Comments` | Vercel | The preview build |

**Stacked PRs.** CI runs only on PRs into `main`, so the 35 stacked drafts have only the Vercel check on their own. That is why #409 exists: it ran every stacked PR inside one PR into `main`. After each parent merges, its child is retargeted to `main` and must be green on its own before its card (runbook Step 8).

### 1.3 Playwright configurations

| Config | Use |
|---|---|
| `playwright.config.ts` | Default; the `test:e2e:*` scripts |
| `playwright.video-core-live.config.ts` | Video core against local Supabase or a Vercel Preview |
| `playwright.music-live.config.ts` | Music Studio live |
| `playwright.image-studio.config.ts` | Image studio |
| `playwright.speech.config.ts` | Read-aloud, per browser |
| `playwright.voice-experience.config.ts` | Voice, simulated |
| `playwright.smoke.config.ts` | Production smoke (`tests/smoke*.spec.ts`) |

---

## 2. Scenarios that only the live system can prove

None of these can pass before GREEN: they need the production database, a real network or real money. Each has an owner and a pass rule.

### 2.1 Free checks right after the database is back (runbook Step 1 and 1d)

| # | Scenario | Who | Pass |
|---|---|---|---|
| L1 | `curl -s https://myavatar.ge/api/health` | Claude | 6/6. **Not** `/api/health/public`, which never touches the DB |
| L2 | `curl -s -o /dev/null -w "%{http_code}\n" https://zwksnayknzggdcenqqxy.supabase.co/auth/v1/health` | Claude/GG | 200 |
| L3 | JWKS: `curl -s https://zwksnayknzggdcenqqxy.supabase.co/auth/v1/.well-known/jwks.json` | Claude | ES256/RS256 key decides whether #339 may go on |
| L4 | Sign in on phone and desktop | GG | Chat opens; no #294 page |
| L5 | Balance | GG | Same balance as before the pause |
| L6 | Library and workspace | GG | Old items list and play; signed links renew |
| L7 | Chat history | GG | Old images, clips and songs show after reopen |
| L8 | Cron sweeps, 30 min after GREEN | Claude | The `ENOTFOUND` errors stop in Vercel logs |
| L9 | Agent G free web search | GG | An answer with sources |
| L10 | Ledger RPCs exist, then reload the schema cache | GG (SQL Editor) | `deduct_credits`, `deduct_credits_once`, `refund_credits`, `bog_fulfill_order` listed, then `notify pgrst, 'reload schema';` |
| L11 | BOG redelivery after the first real payment | Claude reads logs | One `bog:<order>` credit per order |
| L12 | Live reconnect: Wi-Fi off and on mid-call | GG on a phone | „კავშირის აღდგენა…" then the call continues, or a clear error |

### 2.2 Checks tied to a merge (runbook Step 6)

| # | After merging | Scenario | Pass |
|---|---|---|---|
| M1 | each PR | `curl -s https://myavatar.ge/api/health` | 6/6 |
| M2 | #292 | Step 5: Live 3.8 relay switch, one call | Call connects; lifecycle guard green |
| M3 | #396 | Open `/api/admin/launch-flags` as an admin | Every switch reads as intended; no `[launch-flags]` warning in the logs |
| M4 | #399 | One admin browser task on example.com in the real Vercel Sandbox | Page loads with a screenshot. If it fails, revert #399 |
| M5 | #346 + #408 | One login run (~$0.05) before `AGENT_BROWSER_LOGIN=1` | Login completes; a private address is refused |
| M6 | #310 | `AGENT_ENGINE_MEDIA=admins`, one montage chain | The run completes; refunds count on a failed step |

### 2.3 Paid checks (runbook Steps 4 and 7; GG runs each one, on Production only)

| Phase | Check | Budget |
|---|---|---|
| v5.1 M-3 | Omni 1.2 checks (#307) | ~$1 |
| 8.4 Art Director | 1K/2K/4K grid, one mask edit, one re-render upscale | ~$1.00 |
| 8.5 Music Producer | 30 s, full song, "Add 30 s", Use in Video | ~$0.30 |
| 8.6 Virtual Studio | Live presenter renders, one Omni green-screen scene | ~$1.00 |
| 8.7 Smart Editor | Chirp captions on a short Georgian clip | ~$0.10 |
| 8.8 3D Studio | One 5-model probe on the deployed GPU job | ~$2.00, plus ~$3/month idle |
| 8.2 Director's Workflow | Lyria bed, ffmpeg cut, Library entry | **no budget set** |
| #346 browser login | One run in the real sandbox | ~$0.05 |

---

## 3. Exact steps after GREEN

1. GG pays the invoice and replies GREEN in the thread.
2. **Step 1** checks L1 to L3. Then **Step 1d** checks L4 to L12. Claude reports each one.
3. **Step 2**: read-only SQL (2a to 2d). GG runs them; nothing changes.
4. **Step 3 / 3c**: the four SQL files, in order, only when their PR is next. Each is additive and has its rollback at the top.
5. **Step 6**: merge one PR per card, in order, **#292 first**. Before each card, the PR's CI is green on current `main`. After each merge, M1 runs. Stacked children are retargeted to `main` and get their own CI first (Step 8).
6. Use the tested conflict resolutions from runbook item 27.
7. **Step 7**: paid checks, each after its PRs are merged and its flag is set to `admin` for GG's account only.
8. Flags go on one at a time, each as its own decision, and only with the exact values in `docs/launch/ENV_REGISTRY.md` (#396).

**To reproduce the automated proof locally:**

```sh
npm ci
npm run typecheck          # tsc --noEmit
npx next lint
npm test                   # full Jest; the ffmpeg suites need node_modules/ffmpeg-static
npm run test:e2e:preview   # needs: npx playwright install --with-deps chromium
npm run test:e2e:agent-g
```

To repeat the combined run: check out `claude/throwaway-820-combined` (or rebuild it from the runbook order) and run the same commands.

**If a merge goes wrong:** promote the previous production deployment in Vercel (instant), then revert the merge commit. No merge step runs SQL, so a rollback never needs a database change.
