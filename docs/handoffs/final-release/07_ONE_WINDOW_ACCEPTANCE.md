# 07 — One Window acceptance (Phase 3)

Tree: integration branch (main b21506bb + #60 + #65 + #68 + #67 + voice adapter + Phase 1 fixes). Evidence is code
reading plus the branch's unit and wiring tests; browser proof comes from the CI acceptance workflows (03_ISOLATED_E2E_EVIDENCE.md).

## Canonical runtime

| Entry | Renders | Status |
|---|---|---|
| `/{ka,en,ru}` and `/{lang}/dashboard` | FilmStudioHome → ServiceHub → ChatChrome + OmniStudio | One runtime (unchanged by the merges) |
| `/{lang}/studio` | redirect to the one window | unchanged |
| `/{lang}/create`, `/{lang}/app` (and sub-paths) | 307 → `/{lang}` | FIXED on the branch (was 404) |
| CommandCenter, ChatShell, UniversalChat, ServiceChatShell, UnifiedServiceLayout | imported nowhere | dead code, left in place (removal is not in scope) |

The merges add no page and no layout. Every new surface mounts inside OmniStudio:

| Surface | Where | Who sees it in Production |
|---|---|---|
| Image Studio (#60) | `ImageWorkspace` in OmniStudio's image mode | Only when `/api/image/models` answers: `agentMediaOpenTo` (admin while AGENT_G_MEDIA_EXEC is admin) |
| Music Studio (#65) | `MusicStudioCard` in the chat thread | Only with `NEXT_PUBLIC_MUSIC_STUDIO_V1=1` (unset) and server `MUSIC_STUDIO_ENABLED` (unset) |
| Voice Experience (#68) | `ReadAloudControls` on each reply | Only with `NEXT_PUBLIC_VOICE_EXPERIENCE_V2=1` (unset); the old read button stays otherwise |
| Live Voice safety (#68 patch) | `liveActions.ts` dispatcher, OmniStudio live run | Always on: no voice start, dictation does not auto-read |

## Shared contracts (one per concern)

- Price: `lib/credits/quote.ts` / `musicQuote` / `creditCostFor` → same number on the card, in the Live answer, and in the route's debit (FR-7 closed the last mismatch).
- Start: a signed quote and the user's own tap (Image, Music, Video saga); Live Voice answers `ui_confirmation_required`.
- Charge: `deductCreditsOnce` with a per-job ref; refund under `<ref>:refund`.
- Providers: `refuseOutsideEngine` + `GATED_ENTRIES` (pinned by `lib/providers/mediaPolicy.test.ts`); #67 makes the boundary default ON.
- Database: the new studios use only tables Production already has (`generation_jobs`, `credit_ledger`, `profiles`, `analytics_events`, per `__tests__/schema-drift.snapshot.json`). No migration needed.

## UX rules checked

| Rule (master task) | Result |
|---|---|
| Dictation must not auto-read the reply | `autoPlayReplyRef.current = false` at all 5 sites |
| Read-aloud is an explicit control | Old read button (flag off) or ReadAloudControls (flag on) |
| Interrupting playback never cancels a job | Read-aloud stop touches audio only (`lib/voice/experience/readAloud.test.ts:44` "microphone activation stops read without canceling durable jobs") |
| Spoken "კი" never debits | FR-6 fixed; 872 voice/policy tests on the new contract |
| One window, no new page | No page/layout added by any merge |
