# Music Studio v1 — Phase 2 state (live file; updated after each phase)

Branch `claude/music-studio-v1-20261014` · PR #65 (Draft) · Phase 1 head was `18ac9c28`.
Worktree `/Users/giorgikintsurashvili/music-studio-wt` (the main checkout belongs to Video Core).

## DONE
- Phase 0 recovery: handoffs read; PR #65 open, Draft, CI green on 18ac9c28; nothing uncommitted; #60/#64 untouched.
- Phase 2 Live Voice: `music_studio` live tool (plan/edit/join/status/cancel/download/save), no start/confirm path;
  bridge + card registration; unit tests (liveTools 88, liveActions 72, bridge/card 13) — commit b59a2c82.
- Phase 1 Playwright suite + CI workflow + fail-closed stand-in provider — commit 199ee7e6 (pushed).
- Defects found and fixed: duplicate edit in the same tick (sync busy guard), cross-origin Download navigating away
  (`download=` on signed links), voice download picked the original, tracked `node_modules` symlink from Phase 1.
- Phase 5 docs check (Vertex + Gemini API, 2026-10-14); paid script refuses without approval (verified).
- Phase 6: merge-tree #65×#60, #65×#64, #60×#64 clean; 3-way integration tree tsc 0, 234 suites pass.

## PENDING
- Music Studio live E2E run on the pushed head (CI job music-live-e2e) → fix and re-run until green or
  record exact failures.
- Final docs set + CI on the exact final SHA.

## BLOCKED (owner)
- Paid Lyria E2E (no approval; $0 spent). Vocals stay off.
- Preview Library/credits: Vercel Preview of this repo uses the Production Supabase project, so any credit/Library
  test there mutates Production users → not run. Needs an isolated Preview project or explicit approval.
- Real microphone E2E: needs a human with a microphone in a browser (+ Gemini Live key on the target).

## NEXT ACTION
See PHASE2_CONTINUATION.md.
