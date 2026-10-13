# Video Core v1.0 — Preview E2E on the Vercel runtime (T4), 2026-10-13

GG's word (06:34Z, 08:52Z, 09:48Z): a Preview of this branch in a separate Vercel project, on an isolated, temporary
Supabase only; no Production Supabase, key or data; no merge, Production deploy, Production migration or paid Veo call.
This file is the evidence for that layer. `PREVIEW_EVIDENCE.md` (round 3) is the older read-only check of the shared
Preview and stays as history.

Workflow: `.github/workflows/video-core-preview-e2e.yml` (label `preview-e2e` on PR #58). The tests are the same
`tests/video-core-live/` suite the CI E2E runs against `next start`; here `PLAYWRIGHT_BASE_URL` is the Vercel Preview.

## How the Preview was isolated (every run)

| Layer | What it is | What keeps Production out |
| --- | --- | --- |
| Database | the Supabase CLI stack on the GitHub runner, started with a JWT secret made for that run (`openssl rand`), so its anon and service keys are new and die with the runner; Test Schema Baseline, synthetic users and media only | `tests/video-core-live/guard.ts` refuses any database host but this machine's own; the job refuses keys signed with the CLI's documented default secret |
| Link | a Cloudflare quick tunnel (no account) to `e2e/video-core-live/scripts/key-gate.mjs`, which admits only that run's two keys and storage URLs the stack itself signed | anything else gets 403; the tunnel and the gate stop with the runner |
| App | a Vercel **Preview** of the PR head in a separate Vercel project, `avatar-g-video-core-e2e` (`prj_vqpOU2rCUkqNHyVQRIBALw6lUSf3`), aliased to `https://vcore-e2e-<nonce>.vercel.app` | its Preview environment holds nine values and nothing else: six set per run (the tunnel URL twice, the stack's anon and service keys, a quote secret and a cron secret made by the runner) and three fixed (`AGENT_G_MEDIA_EXEC=admin`, `VIDEO_DIRECTOR_RUNS=admin`, `NEXT_TELEMETRY_DISABLED=1`); Vercel shows 0 Production variables. No Production Supabase value, no AI, payment, Google or BOG credential: it cannot reach Production data and cannot make a paid call. The project has no domain and refuses production builds |
| Handshake | the runner encrypts {tunnel, keys, nonce} (AES-256 + RSA-OAEP to `e2e/video-core-live/preview/handshake.pub.pem`) and posts it as a check-run output; only the operator session holds the private key; the job replaces the text with `consumed` when it ends | no value is printed in a log, a commit or a chat |
| Proof before any write | `e2e/video-core-live/scripts/preview-check.mjs` (fail-closed): the alias is served by Vercel; its browser code names this run's tunnel and never the Production project ref; `/api/credits/balance` answers 401 without a token and 200 with a token only this run's stack could sign | if any check fails, no test runs |

Every deployment was created with target **preview** (`target: null` in the create response, checked before anything
else); the one production-target attempt of the setup day (07:31Z, no database, cancelled in 8 s before its build) is in
`FINAL_E2E_REPORT_KA.md`.

## Runs

| Run | Head | Result | What it showed |
| --- | --- | --- | --- |
| [38367198306](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38367198306) | 003b672 | setup failed, no Preview built | the key check's script broke on a quote (fixed in 9faec08) |
| [38369812054](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38369812054) | 9faec08 | **26 passed, 1 failed, 3 not run** (17.4 min) | desktop + iPhone 13: montage journey, Stop/Retry on both viewports, error recovery, Trim / Volume / Adjust / 2× / slow motion with exact frame counts, another user locked out; RLS / RPC / storage contracts. Failed: the first film stitch's HTTP connection (Playwright's client) was cut; the serial billing tests after it did not run |
| [38375578275](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38375578275) | e5db160 | **32 passed, 3 failed** (32.5 min) | the table below. Failed: job recovery (defect 40, fixed since), the transport check (a 37.9 s cut on the free-film call by Playwright's client; the server settled correctly), desktop Stop/Retry (no quote answer within 90 s; the phone's passed in the same run, the desktop's in run 2) |
| [38386454944](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38386454944) | 1c2012f | stopped at setup, no Preview built | the Supabase CLI install hit GitHub's anonymous API rate limit (defect 41, fixed in ec7f742) |
| [38388633377](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38388633377) | ec7f742 | **blocked at the alias step** | stack, guard, key gate, tunnel and handshake all up; the Preview was built (target preview); then the Vercel connector of the operator session lost its team (0 teams, 403), so the alias could not be assigned (the runner waits 45 min for it). Needs GG to reconnect the connector to the team |

## Run 3 (e5db160) on the Vercel runtime, test by test

Product code on e5db160 differs from the final head only in the cron routes' read mode (717231c, defect 40) and the
heartbeat hardening (329c50d); every row below except recovery runs through code that is unchanged since.

| Area | Desktop (Chrome) | Mobile (iPhone 13) | Evidence (redacted log line, abridged) |
| --- | --- | --- | --- |
| sign in through the real sheet | PASS | PASS | session in a cookie |
| upload → Agent G → quote → Start pressed twice → real ffmpeg → Download → Library | PASS (43.3 s) | PASS (36.7 s) | one job; quote 0 credits, 5 s, beat-synced; master 150 frames |
| another user | PASS | PASS | 0 job rows, task route 404, storage 400 / 400, foreign quote 403 `media_not_yours` |
| **Stop → Retry** | **FAIL**: no quote answer within 90 s (before Stop; nothing ran, nothing charged) | PASS (2.9 min) | phone: stopped `cancelled by the user`, retried **600 frames, 20.00 s**, balance 50 |
| error recovery | PASS | PASS | upload chip `failed`; quote `unreadable` |
| **Trim 1 → 4 s** | PASS | PASS (Georgian) | **90 frames**, 3.00 s, audio; delivered 8.7 s / 8.7 s |
| **Volume** („louder" / „ხმა აუწიე") | PASS | PASS | `volume +6 dB`, **150 frames**, 5.00 s, audio; delivered 10.7 s / 12.6 s |
| **Adjust** („brighter" / „გაანათე") | PASS | PASS | `adjust brightness 25`, **150 frames**; delivered 19.9 s / 17.7 s |
| 2× speed / slow motion | PASS / PASS | PASS / PASS | **75** / **300 frames** |
| music from the named second | PASS (Russian) | PASS (Georgian) | `musicStartSec 10`, 150 frames |

| Area (API, runs once) | Result | Evidence |
| --- | --- | --- |
| **Credits / billing** on the film stitch | 4 / 4 money checks PASS | free film first: server settled 1 master, ledger `[]`, `freeFilms 0` (the client's connection was cut, below); paid film: one `-25` row, 200 after 67.9 s (node client); failed stitch: 502, `-25` then `+25 assemble-rollback`, balance 25 → 25; two presses at once: 2 delivered, each paid once, 75 → 25 |
| starter grant, **RLS**, RPC, access, buckets | PASS | own rows only, client writes 403; money RPCs anon 401 / user 403, debit once, six concurrent twins one debit; ordinary user 404, anonymous 401, sweep without secret 403; buckets private |
| storyboard approval | PASS | edited shot 400 `scripts_differ`; stale revision 400 `board_changed` |
| **job recovery** | FAIL → defect 40 | attempt 2 never finished; root cause and fix in `DEFECT_REGISTER_FINAL.md` row 40; the fixed code passed live in CI E2E 38386271150 (47.3 s, 600 frames, nothing charged) |

## Findings from the Preview runs

1. **Defect 40** (job recovery) was found here first and is fixed (717231c); it is Production-relevant.
2. **Transport cuts belong to the test client, not the server.** In runs 2 and 3 a long synchronous call (the free film
   stitch, 37.9–38.1 s) sent through Playwright's request client was cut with `read ETIMEDOUT`; in run 3 the node
   client's calls of 67.9 s and 71.2 s on the same route, the same network path and the same server completed. The
   server finished and settled every cut call correctly (1 master, nothing charged, the free film spent once). In CI E2E
   (no tunnel) no call was cut. The film is delivered to the Library whether or not the caller's connection survives.
3. **Desktop Stop/Retry on the Preview: 1 of 2.** Run 3's desktop quote did not answer within the test's 90 s, after the
   three uploads were ready; nothing ran or was charged. The Preview's media calls go through the tunnel (the paid film
   took 67.9 s here, 16.3 s in CI), so the quote's file probes are slow; whether it was slowness or a lost request is not
   proven (the run's trace is in its artifact; 1c2012f now prints the page's state on any failure).
