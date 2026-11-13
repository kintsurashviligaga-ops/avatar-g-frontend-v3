# 09 — Testing and quality audit (v5.1 Phase 0)

Base `main` @ `4c502c7`.

## Executed in this session

| Command | Result |
|---|---|
| `gh run list --branch main` (read-only) | `4c502c7`: ADK pilot **success**; CI and E2E Preview Contract **in progress** at 09:09Z. `970ca60`, `ca04c55`, `4ffc8b3`: CI, E2E Preview Contract, ADK pilot all **success**. |
| Vercel deployments API (read-only) | production READY = `970ca60`; `4c502c7` BUILDING at 09:10Z |
| Local `tsc` / lint / Jest / Playwright | **NOT RUN** — `node_modules` absent and installing dependencies is forbidden in Phase 0 |

No test was skipped, edited or quarantined.

## Test architecture

| Layer | Count / tool | Notes |
|---|---|---|
| Unit / contract | 1,168 Jest files (`jest.config.cjs`); last recorded full local gate 1,131 suites 0 failed, 119 env-skipped (d8420a5d, 2026-11-05) | `docs/master-v3.1/VERIFICATION.md` |
| Real-Postgres isolation | `runIsolation.pg.test.ts` in CI | durable runs |
| SQL | `tests/sql/bog/*` (scenarios, concurrency) | BOG fulfil |
| Browser | 80 Playwright specs; configs: default, smoke, perf, speech, image-studio, music-live, video-core, video-core-live, voice-experience | `test:e2e:preview` runs 17 specs incl. `phase6-matrix.spec.ts` |
| Paid contract | `scripts/` certification runner + fixtures (#269), one paid call per model, ledger refuses a second run | owner-run on Mac |
| CI workflows | `ci.yml` (verify: tsc + lint + Jest; agent-g-gate), `e2e.yml`, `adk-pilot.yml`, `bog-e2e.yml` (skips without creds), `bog-production-smoke.yml`, speech/voice/video/music/image acceptance | `.github/workflows` |

## Quality gaps

- No Georgian QC corpus (v5.1 asks ≥ 20 prompts).
- Agent G browser/site agent/Work Mode have unit tests with fake hosts; no recorded passing E2E on production.
- BOG real sandbox never run.
- Known flake: read-aloud (firefox) can hang in apt-get pulseaudio setup on the runner (infrastructure, not code).
- Read-aloud default model failed the paid contract (500 ×2) — the only red contract item.
- 36 lint warnings (last local gate).
