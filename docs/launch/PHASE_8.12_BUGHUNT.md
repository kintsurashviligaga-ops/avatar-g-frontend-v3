# Phase 8.12 — pre-launch static bug hunt (2026-11-20)

Static, no DB, no paid calls, nothing merged, every flag still off.

## How it was tested
- A throwaway branch merged `main` + every open draft head (87 PRs) into one tree, so the drafts were type-checked and tested **together** for the first time.
- `tsc --noEmit` on the combined tree: **0 errors** after the fix below (2 errors before).
- Full Jest on the combined tree: 18,564 tests. All failures were ffmpeg suites; with the system ffmpeg, 18 tests in 3 suites still fail **identically on plain `main`** (frame-count rounding of the local ffmpeg build vs the pinned `ffmpeg-static`), so they are environment-only, not integration bugs. CI uses the pinned binary.
- #388 was merged on top with #334's deletions kept (the planned resolution), then type-checked and tested again.

## Bugs found and fixed (each on the PR that owns the code, pushed to its stack children by merge)
| # | Bug | Where fixed |
|---|-----|-------------|
| 1 | **Cross-PR type break.** #383 adds a `refund` effect; the engine bridge (#310) let any non-`stop` effect fall through to the `start` branch → TS2339 and, at runtime, a refund would have re-queued a step. | #310 `lib/agent/run/engineBridge.ts` (only `start` re-queues), merged into #311 |
| 2 | **Cross-PR test break.** #388's "no raw error" guard reads CommandCenter, UnifiedServiceLayout and OnboardingWizard, which #334 deletes → the guard fails once both land. | #388, guard skips deleted screens |
| 3 | **Flag value mismatch (Browser Agent).** Runbook says set flags to `admin`; `AGENT_BROWSER_AGENT` only accepted `admins`, so `admin` left it silently off. | #312 `lib/agent/phase4/flags.ts`, merged into #387 |
| 4 | **Flag value mismatch (Router v2).** 3D Studio / Smart Editor / Art Director read `admin`, but Router v2's flag reader only knew `admins` → with `NEXT_PUBLIC_STUDIO_3D_V2=admin` Agent G would tell an admin "3D Studio is closed" while the studio is open. | #381 `lib/agent/router/subAgents.ts`, merged into #382, #386 |
| 5 | English on Georgian screens: Enter / Tab / Backspace keys in the cloud-browser login sheet. | #346 |
| 6 | English screen-reader names `remove` / `lock` / `role` in the Art Director reference tray. | #357 → #358 |
| 7 | English heading `Lyrics` in the Music Producer lyrics pane. | #360 → #361 |
| 8 | English `Close` on the Music Producer "Use in Video" sheet. | #361 |
| 9 | English `seek` on the Surgical Editor audio bar (already on main). | this PR |
| 10 | `.env.example` lacked every Phase 8.4–8.11 flag, so a fresh setup had no list of what must stay off. | this PR |

## Checked, nothing to fix
- **Memory leaks:** 118 effects with timers/listeners/subscriptions across 423 UI files; every one returns a cleanup.
- **Unhandled promises:** every `.then` without `.catch` calls a helper that already catches. One minor: `MontageStudio` `runSmartOps(...).then` (#370) has no `.catch`; `runSmartOps` resolves on errors today, noted for the wiring step.
- **3D Studio, Smart Editor, Browser Agent UI:** no hard-coded English found. Browser Agent driver error strings are English but internal (never shown) until it is wired; wiring must map them through `userFacingMessage`.
- **Env fallbacks:** 3D engine returns "not configured" without project/job (region falls back to europe-west4, timeout 600 s clamped 120–1800, daily cap only when > 0); Smart Editor / 3D / Art Director / Music Producer fail closed; `AGENT_BROWSER_LOGIN` needs exactly `1` plus the vault key; Next.js browser flags are read as literal `process.env.NEXT_PUBLIC_*` so they inline correctly.
- `ChatChrome aria-label="Language"` stays English on purpose (E2E tests select it).

## Known merge-time notes (unchanged)
- #388 vs #334: drop #388's hunks in the three screens #334 deletes (tested above).
- Old PRs #190, #264, #273 conflict with the launch set; they are not in the runbook.
