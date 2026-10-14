# Round 3 — regression runs on the sandbox (PHASE 7)

Tree: `7078648` for the test fix, otherwise `58ae539`-era files (the runs below started on `fc1971b` + working tree; the
only product/test change after their start is the `DirectorRunOverlay.test.tsx` pin, re-run alone: 7/7).

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit -p tsconfig.json` | exit 0 (run after every code commit; last on 7078648) |
| Full Jest | `npx jest --silent --maxWorkers=2 --json --outputFile=<scratch>/jest-full.json` | **887 suites: 882 passed, 0 failed, 5 skipped · 13,667 tests: 13,623 passed, 0 failed, 44 skipped** · 712 s. Skipped suites need a PostgREST (`*.pg.test.ts` ×4) or a live key (`audioLive.e2e`); the three `*.ffmpeg.test.ts` film suites are opt-in (`VIDEO_CORE_FFMPEG_IT=1`) and were run by hand (`FFMPEG_EVIDENCE.md`) |
| Lint | `npx next lint` | exit 0 · **0 errors**, 34 warnings (pre-existing baseline: `no-img-element`, `exhaustive-deps`, `aria-unsupported-elements`; `OmniStudio.tsx` keeps its known `react-hooks` warnings, none new) |
| Billing / security suites | see `BILLING_SECURITY_REPORT.md` §1 | 69 suites · 890 passed · 8 skipped · 0 failed |
| CI "verify" (ci.yml) | GitHub Actions on each pushed head | green through dac6106; **red on fc1971b** (1 assertion: the overlay test expected the pre-round-3 POST body — defect register #23), fixed in 7078648; its run is recorded in `RELEASE_READINESS_CHECKLIST.md` |
| CI "E2E - Preview Contract" (e2e.yml) | `playwright test tests/preview-e2e.spec.ts` on a local `next dev` in Actions | green on every pushed head incl. fc1971b |
| Build | `npx next build` | run after the local Playwright pass (the dev server shares `.next`); result in `RELEASE_READINESS_CHECKLIST.md` |
| HawkScan DAST | — | NOT RUN: `HAWK_API_KEY` unset, no `stackhawk.yml`, no reachable deployed URL from the sandbox (B7) |

Lint warning lines by file (unchanged baseline, for the record): 15 files; full log kept out of the repo.
