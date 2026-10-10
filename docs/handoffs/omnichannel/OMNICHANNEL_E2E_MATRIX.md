# Omnichannel: scenarios and evidence

Last updated: 2026-10-10. Branch `claude/launch-certification-wmvitt` (draft PR #50, head after this commit).

Evidence is kept apart by where it ran, as the owner asked (13:10Z: "Test Evidence-ში არ აურიო mocked, simulated,
Preview და Production შედეგები"):

| Level | Meaning |
|---|---|
| **M** mocked | Jest, every outside service faked (Meta, Google, Supabase, the bridge peer) |
| **L** local real | real software on this sandbox, nothing outside it: Postgres 16 + PostgREST v12 (`scripts/lease-isolation/run.sh`), real WebRTC + Opus peers (`services/wa-call-bridge`, `npm run loopback`), real Chromium with the server mocked (`tests/*.spec.ts`) |
| **P** Preview | the cert branch's Vercel Preview, shared Production database |
| **Prod** | myavatar.ge |

A cell names the evidence. "none" means no run at that level. No scenario below has a real Meta call, a real WhatsApp
message to a customer or a real Telegram/SMS send behind it.

## 1. The eight checks the owner named (16:20Z, item 4)

| Scenario | M | L | P | Prod |
|---|---|---|---|---|
| **Webhook signature**: unsigned, wrongly signed, or no app secret configured → 403, nothing runs; calls payloads too | `app/api/webhooks/whatsapp/route.test.ts` (13) | none | none | none |
| **Replay protection**: the same Meta delivery twice is handled once; a stale connect is ignored | `callService.test.ts` (22), `events.test.ts` (9) | none | none | none |
| **User isolation**: phone tools read only the ticket's user; another user cannot steer a run, use its token, uploads or results; the outbox tells only the job's owner | `phoneTools.test.ts` (10), `app/api/tasks/route.test.ts` (12) | `lib/agent/run/runIsolation.pg.test.ts` test H; `outboxIsolation.pg.test.ts` (4) | none | none |
| **Call authorization**: caller ID only finds the link and authorizes nothing; calls off by default; no price → no call; balance, daily cap, quiet hours, WhatsApp call permission; the bridge needs a ticket our app signed | `gates.test.ts` (7), `callService.test.ts`, `ticket.test.ts` (6), `app/api/calls/bridge/[op]/route.test.ts` (3), `lib/calls/bridge/server.test.ts` (6) | none | none | none |
| **Quote/confirm**: a paid step needs the caller's own spoken yes, heard after the price, within 60 s; a paid plan never starts from a call (a Confirm button is sent); the model's word never counts | `phoneTools.test.ts`, `callBridge.test.ts` (12) | none | none | none |
| **Cancel**: stop_task needs the caller's yes; a stop kills the encoder and refunds once | `phoneTools.test.ts`, `lib/agent/run/runExec.test.ts` (27) | `runIsolation.pg.test.ts` test F (real FFmpeg) | none | none |
| **Task recovery**: a worker dies mid-render, the lease lapses, attempt 2 finishes; a failed priced step is paid back; resume reuses delivered steps | `lib/orchestrator/jobLease.test.ts` (20), `runExec.test.ts` | `runIsolation.pg.test.ts` tests E and G | none | none |
| **Delivery**: a finished run or job tells its owner once per place; a passing failure retried at most 3 times; an unknown outcome never re-sent; two deliverers at once still send once; Telegram/SMS/call recorded as not configured | `lib/notifications/outbox.test.ts` (23), `outboxLive.test.ts` (7), `app/api/cron/deliveries/route.test.ts` (3), `runExec.test.ts` (3 outbox tests), `lib/calls/whatsapp/delivery.test.ts` (4) | `outboxIsolation.pg.test.ts` (4: once per outlet, three deliverers, lease interplay, due list) | none | none |

## 2. WhatsApp text and links

| Scenario | M | L | P | Prod |
|---|---|---|---|---|
| An unlinked number gets fixed text only, never a model call; "opening soon" when the link tables are missing | `handleInbound.test.ts` (14) | none | none | Prod has no link tables (migration `20261003c` not applied), so by the code on main every number gets "opening soon". Not tested with a real message. |
| Link by one-time code, 5 tries an hour, wrong or expired code | `handleInbound.test.ts`, `whatsapp-link.test.ts` (8), `app/api/agent-g/whatsapp/link/route.test.ts` (10) | none | none | none |
| Talk answered by Agent G about MyAvatar.ge only, no web search; an order to make something gets a studio link, never a render; 20 answers per 10 min brake | `handleInbound.test.ts`, `whatsapp-text.test.ts` (14) | none | none | none |
| Every message stamps the 24 h window; a notice outside it needs the approved template, else skipped | `handleInbound.test.ts`, `lib/notifications/channels/whatsapp.test.ts` (7) | none | none | none |
| The webhook verify handshake | `route.test.ts` | none | none | public status read 17:29Z: "Webhook ready" (keys present). Not a delivery test. |
| Read-only Meta account check (admin) | `whatsappMetaCheck.test.ts` (12) | none | none | never run against our account (needs GG) |

## 3. WhatsApp calls (option A, off)

| Scenario | M | L | P | Prod |
|---|---|---|---|---|
| Lifecycle requested → ringing → answered → active → ended / failed; charged once at the opening price, a failed call never | `lifecycle.test.ts` (5), `callService.test.ts` | none | none | none |
| Opus ↔ PCM, 48 ↔ 16/24 kHz, WebRTC (ICE, DTLS-SRTP, RTP) | `lib/calls/bridge/pcm.test.ts` (9), `playout.test.ts` (7) | loopback: 100/100 frames each way, tones kept, 286 ms connect ([evidence](evidence/wa-bridge-loopback-2026-10-10.txt)) | none | none |
| Gemini Live link, barge-in, goAway resume, dropped socket, wrap-up before the cap, media timeouts | `callBridge.test.ts`, `liveLink.test.ts` (4), `phoneSetup.test.ts` (6) | none (no real Google session) | none | none |
| Georgian speech, real latency, real Meta SDP | none | none | none | none: needs a funded call (GG) |

## 4. Old phone routes and the Connections page

| Scenario | M | L | P | Prod |
|---|---|---|---|---|
| Every old phone-call start answers `phone_calls_unavailable`, stores no row, calls no provider | `__tests__/phone-calls-unavailable.test.ts` (11), `lib/calls/providers/index.test.ts` (3) | none | none | not deployed: Production still runs the old routes |
| Connections: four rows, four words from the server, nothing technical, masked number | `lib/connections/model.test.ts` (5), `app/api/agent-g/channels/route.test.ts` (5), `ConnectionsSection.test.tsx` (9) | `tests/connections.spec.ts` (6): phone 390/360, tablet, desktop; light/dark; KA/EN/RU; 56 px rows, 44 px buttons, no overlap, no sideways spill ([audit](CONNECTIONS_UX_AUDIT.md)) | none | not deployed |
| Notification preferences: site always, WhatsApp per kind, saved at once, put back on a failed save; calls only for completed / report / reminder | `preferences.test.ts` (9), `prefsStore.test.ts` (3), `app/api/notifications/preferences/route.test.ts` (5), `NotificationPrefsPanel.test.tsx` (6), `dispatch.test.ts` (9), `push.test.ts` (20) | `tests/connections.spec.ts` | none | not deployed |

## 5. What the next levels need

| Level | Needs | Whose word |
|---|---|---|
| P for WhatsApp text, links, notices | migration `20261003c` in the shared database, then one linked test number | GG |
| P for the outbox | nothing: `DELIVERY_OUTBOX` is on by default on a Preview. A finished Agent G run on Preview should ring the bell once; a signed-in person runs it | GG's hands (Preview admin runs are GG's) |
| L/P for a call | a real Google Live session on the phone setup (paid inference) and Meta's sandbox | GG |
| Prod for anything here | merge + deploy, and each switch in [`AGENT_G_OMNICHANNEL_ARCHITECTURE.md`](AGENT_G_OMNICHANNEL_ARCHITECTURE.md) §4 | GG |

Until then every row above is **BUILT_NOT_PROVEN** at the Preview and Production levels, whatever its mocked and local
evidence says.
