# Agent G omnichannel: one brain, several doors

Last updated: 2026-10-10. Branch `claude/launch-certification-wmvitt` (draft PR #50). Production serves `6c7dff4` (main),
which has none of the branch-only parts named below.

This page is the map. The detail lives in:
- [`PHONE_PROVIDER_FEASIBILITY.md`](PHONE_PROVIDER_FEASIBILITY.md): why WhatsApp Calling (A) and not a phone number (B);
- [`WHATSAPP_CALLING_READINESS.md`](WHATSAPP_CALLING_READINESS.md): the call path, part by part;
- [`COMMUNICATION_UNIT_ECONOMICS.md`](COMMUNICATION_UNIT_ECONOMICS.md): what calls and messages cost;
- [`CONNECTIONS_UX_AUDIT.md`](CONNECTIONS_UX_AUDIT.md): what Settings → Connections shows;
- [`OMNICHANNEL_E2E_MATRIX.md`](OMNICHANNEL_E2E_MATRIX.md): every scenario and the evidence for it;
- [`../../WHATSAPP.md`](../../WHATSAPP.md): the owner's WhatsApp setup checklist.

## 1. The rule

There is one Agent G. A channel is a door into it, never a second brain (owner, 2026-10-10 15:38Z and 16:20Z).

Every door uses:
- the same model allowlist and Google-only text policy (`lib/ai/google/policy.ts`);
- the same platform prompt and the same user memory;
- the same task runtime and Task API (`lib/agent/run`, `/api/tasks`);
- the same credits ledger and quote/confirm rule.

A door may narrow what Agent G does (WhatsApp talks about MyAvatar.ge only). It never widens it.

## 2. The pieces

```
 web chat ─┐                                      ┌─ bell (in-app)
 Live Voice┤                                      ├─ browser push
 WhatsApp ─┼─► Agent G (one brain) ─► task runtime ─► delivery outbox ─┼─ WhatsApp notice
  text     │   lib/ai/channelBridge   lib/agent/run      lib/notifications ├─ Telegram   (not configured)
 WhatsApp ─┘   lib/agent-g/channels   /api/tasks          /outbox.ts      ├─ SMS        (not configured)
  call (off)   lib/calls/whatsapp     generation_jobs                     └─ phone call (not configured)
```

| Piece | Where | What it does |
|---|---|---|
| Web chat and Live Voice | `components/studio/OmniStudio.tsx`, `components/voice/live` | The app itself. Not rows in Connections. |
| WhatsApp text door | `app/api/webhooks/whatsapp` → `lib/agent-g/channels/whatsapp-processor.ts` → `handleInbound.ts` | Meta-signed webhook; an unlinked number gets only fixed text and never reaches a model; a linked number gets Agent G's answer in words, or a studio link for an order to make something. Nothing on this door spends a credit. |
| WhatsApp call door | `lib/calls/whatsapp`, `lib/calls/bridge`, `services/wa-call-bridge`, `app/api/calls/bridge/[op]` | Meta Calling → our media bridge → the existing Gemini Live. Off (§4). |
| Task runtime | `lib/agent/run` (runs in `generation_jobs.params._run`), `lib/orchestrator/jobLease.ts` (lease queue) | One run, many steps, each a job; compare-and-set writes, cancel, resume. |
| Task API | `app/api/tasks/route.ts` | One owner-scoped door to every task: read, cancel, plan, run, approve, resume. |
| Delivery outbox | `lib/notifications/outbox.ts` (pure), `outboxLive.ts`, `app/api/cron/deliveries` | A run or job that ends tells its owner once, on the places they chose (§3). |
| Notification preferences | `lib/notifications/preferences.ts`, `prefsStore.ts`, `/api/notifications/preferences` | Which news goes where; call window, call minutes. |
| Connections center | `lib/connections/model.ts`, `/api/agent-g/channels`, `components/settings/ConnectionsSection.tsx` | Four rows, four words, decided on the server from facts. |

## 3. How a result reaches its owner

1. A step's job or the whole run ends (`completeJob` / `failJob` in `lib/orchestrator/jobs.ts`, or a run's final write
   in `lib/agent/run/runExec.ts`).
2. That write hands the id to the outbox (`kickDelivery`) after the response. A per-minute cron
   (`/api/cron/deliveries`) is the net under it.
3. The outbox claims the row (`params._tell`, compare-and-set), reads the owner's preferences, and sends once per place:
   bell, push, WhatsApp. A run's steps are told by their run, not one by one.
4. A passing failure (`failed`, `rate_limited`) is retried after 1 and 5 minutes, at most 3 tries. Anything else, and a
   send whose outcome is unknown, is never sent again. So a retried WhatsApp notice is never a second Meta charge.
5. A WhatsApp notice outside the 24-hour window needs an approved Utility template (`WHATSAPP_ALERT_TEMPLATE`). Unset
   today, so such a notice is skipped and the bell and push still carry it.
6. Telegram, SMS and phone call have no sender. A person who chose one gets `skipped: not_configured` in the record,
   and nothing is pretended.

The old notify path (`dispatch.ts`, `dedupeKey: job:<id>`) and the outbox share one dedupe key, so whichever comes first
tells and the other stays quiet.

## 4. The switches

Every switch is off in Production. Turning any of them on there is GG's separate word.

| Switch | Where | Production | Preview | Effect |
|---|---|---|---|---|
| `phoneCallsReady()` | `lib/calls/availability.ts` | `false` (code) | `false` | Every old phone-call start answers `phone_calls_unavailable` (503) and stores no row. It turns true only with a real provider and a recorded real call. |
| `WHATSAPP_CALLING_ENABLED` | `lib/calls/whatsapp/gates.ts` | unset (off) | unset (off) | The bridge route answers 404; no call is answered or placed. |
| `APPROVED_CALL_CREDITS_PER_MINUTE` | `lib/calls/whatsapp/liveDeps.ts` | `null` | `null` | No call starts without an approved price. |
| `WHATSAPP_AGENT_SCOPE` | `lib/calls/whatsapp/phoneTools.ts` | unset (support scope) | unset | `creative` lets a call plan orders; held until Meta answers on §4.7. |
| `DELIVERY_OUTBOX` | `lib/notifications/outboxLive.ts` | not in Production code; unset means off | unset means on | The outbox and its cron. Off: jobs notify exactly as before. |
| `TELEGRAM_BINDING_LIVE` | `lib/agent-g/channels/telegram.ts` | `false` | `false` | Telegram shows "Temporarily unavailable". |
| `WHATSAPP_ALERT_TEMPLATE` | `lib/notifications/channels/whatsapp.ts` | unset | unset | Notices outside the 24 h window are skipped. |
| `AI_GOOGLE_ONLY` / `MEDIA_GOOGLE_ONLY` | `lib/ai/google/policy.ts`, `lib/providers/mediaPolicy.ts` | as today | as today | Unchanged by this work. No silent fallback to another AI provider. |

Migration `20261003c_agent_g_whatsapp.sql` (the WhatsApp link tables) is not applied in Production. Until it is, no
number can link there, whatever the switches say.

## 5. Status per channel

Labels: PROVEN (real evidence on the named environment), BUILT_NOT_PROVEN (code and tests, no real run), PARTIAL,
MISSING, DISABLED (built and switched off on purpose), BLOCKED_OWNER.

| Channel | Production today | On the branch | Label | What it waits on |
|---|---|---|---|---|
| Web chat, Live Voice | live | live | not changed by this work; status in [`../AGENT_G_FINAL_E2E_CERTIFICATION.md`](../AGENT_G_FINAL_E2E_CERTIFICATION.md) | nothing here |
| Bell | live (old path, `dispatch.ts`) | the outbox also writes it | outbox BUILT_NOT_PROVEN | a Preview run |
| Browser push | code on main; no subscriptions table in Production | the outbox sends it | BUILT_NOT_PROVEN | migration 20261003c and a Preview run |
| WhatsApp text | webhook configured; no number can link | answers, studio link, MyAvatar.ge scope | BUILT_NOT_PROVEN | migration 20261003c (GG) |
| WhatsApp notices | none | outbox, 24 h window, template | BUILT_NOT_PROVEN | the migration, an approved template (GG) |
| WhatsApp calls | off | built, mocked; bridge media proven locally | DISABLED, BUILT_NOT_PROVEN | Meta's written answer, the VM, the price, a funded call (GG) |
| Telegram | unavailable | code kept | DISABLED | owner: later (15:38Z) |
| SMS | none | code kept; the delivery engine records SMS as failed, not sent | DISABLED | owner: later; a Georgian aggregator |
| Phone number calls (B) | unavailable, no fake calls | `phoneCallsReady() = false` | DISABLED | owner: later |

Production verdict: **NO-GO** for anything new on these channels until the items in the right-hand column are done.
