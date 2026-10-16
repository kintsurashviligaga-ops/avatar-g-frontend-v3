# 06 — Agent G & Voice integration

Voice Core is owned by Astra (`astra/agent-g-voice-experience-v2-20261014`, 01457c3c, **local only — not pushed**). Nothing of Astra's
was edited. No live microphone was exercised in this task → **no microphone claim**.

## Contract / integration tests run (integration candidate 31206e48 = main + #64 + #60 + #65 + uid-race + Astra)

| Area | Result |
|---|---|
| tsc on the full candidate | exit 0 |
| Jest `lib/voice lib/audio lib/agent lib/ai components` | 274 suites passed, 4 failed (= macOS ffmpeg baseline, see 11), 4 376 tests passed |
| Jest `lib/chat` (routing, focus gate, history keys, uid race) | 77 passed / 1 skipped; 1 494 tests |
| Astra's 12 files vs studio files | no overlap with OmniStudio / ChatChrome / historyKeys / studio code → no contested file today |
| Speech alone never spends | focus gate (`lib/chat/focusGate.ts`) + hard `confirmed:true` on Image/Music jobs + storyboard approval for film; `data-live-guard="spend"` on paid buttons — unit-tested; not re-verified with a live voice session |

Browser voice-dispatch specs (Music Studio: voice → card → confirm) passed desktop + phone in CI on 54532ff8 (run 38572860496).

## data-authed → data-uid History race

Proposal `claude/shared-chat-uid-race-proposal-20261014` (7fe06fb5): defers the archive write while signed-in-but-no-uid and re-runs on
`UID_READY_EVENT`. Verified here: merges cleanly onto the 3-PR candidate and onto Astra's branch; tsc 0; `lib/chat` 1 494 tests green
including the 2 new `archiveWriteDeferred` tests. **Not merged** — the owner of the shared chat (OmniStudio/ChatChrome) must accept it.
Since Astra's current branch does not touch those files, the coordination cost is low: recommend merging it right after #65.

## Open

- Live multi-turn KA/EN/RU voice → quote → confirm → job on a deployed app: BLOCKED with the rest (Preview = Production DB).
- Astra's branch is unpushed; its CI status is unknown.
