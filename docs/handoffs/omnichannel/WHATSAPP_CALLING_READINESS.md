# WhatsApp Calling (option A): readiness

Last updated: 2026-10-10 18:55Z. Branch `claude/launch-certification-wmvitt` (draft PR #50).

**The path:** Meta WhatsApp Business Calling → our media bridge → the existing Gemini Live → Agent G.

GG approved A as the architecture (2026-10-10 16:20Z). GG did **not** approve:
- paid infrastructure;
- Production changes;
- real paid calls.

## Verdict: Production NO-GO

Calls stay off, enforced in code, until every row of §5 is done:
- `WHATSAPP_CALLING_ENABLED` is off by default;
- `APPROVED_CALL_CREDITS_PER_MINUTE` is null, so no call starts;
- the bridge route answers 404 while the flag is off, and 401 without a ticket our app signed.

## 1. What is built, with honest labels

Simulated evidence (mocked Meta, fake media peer, scripted Gemini) is kept separate from local evidence and from real-call evidence.

| Part | Where | Label | Evidence |
|---|---|---|---|
| Meta `calls` webhook: signature (fail-closed), parsing, replay protection, one record per call | `lib/calls/whatsapp/events.ts`, `callService.ts`, the existing webhook route | BUILT_NOT_PROVEN (simulated) | `events.test.ts`, `callService.test.ts` |
| Call lifecycle: requested → ringing → answered → active → ended / failed, guarded transitions | `lifecycle.ts` | BUILT_NOT_PROVEN (simulated) | `lifecycle.test.ts` |
| Gates (see note below) | `gates.ts` | BUILT_NOT_PROVEN (simulated) | `gates.test.ts` |
| Signed per-call ticket; HMAC-signed app → bridge offer (±60 s) | `ticket.ts` | BUILT_NOT_PROVEN (simulated) | `ticket.test.ts`, `server.test.ts` |
| Bridge → app API (answer, Live session, heard words, tool, event); door check on the ticket | `bridgeApi.ts`, `app/api/calls/bridge/[op]` | BUILT_NOT_PROVEN (simulated) | `bridgeApi.test.ts`, the route test |
| Locked Gemini Live session for the phone (see note below) | `liveSession.ts`, `phoneSetup.ts` | BUILT_NOT_PROVEN (simulated) | `phoneSetup.test.ts` |
| Server-side function calls: account summary, tasks, stop a task, plan an order (creative scope only), deliver results | `phoneTools.ts` | BUILT_NOT_PROVEN (simulated) | `phoneTools.test.ts` |
| Voice consent: a paid step needs the caller's own spoken "yes" in the server's heard log, after the price was told, within 60 s; the model's word never counts | `phoneTools.ts` + `lib/voice/spokenYes` | BUILT_NOT_PROVEN (simulated) | `phoneTools.test.ts`, `callBridge.test.ts` ("კი" before stop_task) |
| Files, status and reports back into WhatsApp | `delivery.ts` | BUILT_NOT_PROVEN (simulated) | `delivery.test.ts` |
| Bridge call logic (see note below) | `lib/calls/bridge/` | BUILT_NOT_PROVEN (simulated) | 39 tests; `callBridge.test.ts` runs the real call service, bridge API and phone tools end to end |
| Opus ↔ PCM (48 ↔ 16/24 kHz), WebRTC (ICE, DTLS-SRTP, RTP) | `services/wa-call-bridge` | **PROVEN locally only** | `npm run loopback`: 100/100 frames each way, tones kept, ~280 ms connect; [`evidence/wa-bridge-loopback-2026-10-10.txt`](evidence/wa-bridge-loopback-2026-10-10.txt) |
| Read-only Meta readiness check (admin) | `app/api/admin/whatsapp/meta-check` | BUILT_NOT_PROVEN (never run against our account) | `whatsappMetaCheck.test.ts`, the route test |
| Proposed price, 12 credits a minute | `lib/credits/unitEconomics.ts` | proposal only | `unitEconomics.test.ts`, [`COMMUNICATION_UNIT_ECONOMICS.md`](COMMUNICATION_UNIT_ECONOMICS.md) |

Notes on three rows:
- **Gates** cover: calling on, a linked number, calls opted in, the price approved, a daily cap, a funded minimum, the bridge ready. A call Agent G places also needs WhatsApp call permission, falls outside quiet hours, and has a per-day limit with a stop after two unanswered calls.
- **The phone Live session** uses the same model allowlist, platform prompt and memory as the website. On top of that: phone tools, transcription on, an explicit 8k → 4k compression, resumption, and an ephemeral token. The bridge never holds a key or a prompt.
- **The bridge call logic** covers: words before tools, barge-in, resume after Google's goAway or a drop (bounded per call), wrap-up 30 s before the cap, media timeouts, latency, and token metrics.

**Not built, or partly built:**

| Part | Label | Why |
|---|---|---|
| Charging a finished call | MISSING by design | The hook exists (`callService` charges an ended call once, at the price it opened with). The charger is wired only after GG approves the price. |
| "Call me when it's ready" (Agent G calls back) | PARTIAL | Built: the outbound gates, Meta's call-permission read and the place-call request, and the delivery outbox that tells a finished task's owner (Omnichannel G, `lib/notifications/outbox.ts`). Missing: a `call` sender on that outbox; today a person who chose a call gets `skipped: not_configured` there. |
| Creative scope on WhatsApp (scenario B) | DISABLED, BLOCKED_EXTERNAL | `WHATSAPP_AGENT_SCOPE=creative` exists. It stays off until Meta's support team answers case #28590089197308927 in writing. |
| WhatsApp voice notes and incoming files to Agent G | MISSING | Text only today. A voice note gets "for now I read text here". |
| Interop with Meta's real SDP and media servers | BUILT_NOT_PROVEN | Needs a real call. |
| Real Gemini Live on the phone setup, Georgian speech, barge-in and latency on a real network | BUILT_NOT_PROVEN | Needs a funded call. |

## 2. WhatsApp today: real statuses

Production was read on 2026-10-10 17:29Z from the public status at `myavatar.ge/api/agent-g/channels`.

| Channel | Production | Preview (cert branch) |
|---|---|---|
| WhatsApp webhook | **configured**: "Webhook ready" (token, number id, app secret, verify token present) | Connections shows "unavailable": the link tables do not exist in the shared database, so no number can be linked |
| WhatsApp text (Agent G answers) | **not usable**: migration `20261003c_agent_g_whatsapp.sql` is not applied, so no number can be linked; unlinked numbers get only the fixed how-to text | same |
| WhatsApp media to the customer (finished files, alerts) | **not usable** (no linked numbers) | same |
| WhatsApp calls | **off** (code not in Production; flag off; no price; no bridge) | off |

**Changed on this branch:** WhatsApp text answers are narrowed to MyAvatar.ge and run without web search. The same rule applies on a call (`WHATSAPP_STYLE_NOTE`, `phoneCallRule`).

## 3. Meta account facts: what is verified and what is missing

Nothing here could be read from this session:
- there is no Meta connector or browser session;
- the Vercel env API answers 403;
- the WhatsApp token exists only in Vercel env.

The admin endpoint below reads the facts with documented Graph GETs only. It never shows a token, secret, payment id or full number.

| Fact | Graph source | Status |
|---|---|---|
| WABA ID, Phone Number ID | token scopes / env; `phone_numbers` | MISSING (not read) |
| Number country (+995?) and display name | `display_phone_number`, `verified_name` | MISSING |
| Messaging limit (Calling needs ≥ 2,000) | `whatsapp_business_manager_messaging_limit` | MISSING |
| Quality rating | `quality_rating` | MISSING |
| Business verification | WABA `business_verification_status` (not required for Calling) | MISSING |
| Cloud API active, can send | `platform_type` / `health_status.can_send_message` | MISSING |
| Webhook subscribed to `messages` and `calls` | `{waba}/subscribed_apps`, `{app}/subscriptions` | MISSING (`messages` works in Production; `calls` unknown) |
| Calling enabled, call icons, restrictions | `{phone}/settings` → `calling` | MISSING |
| Payment method on the Messaging account (Calling needs it) | WABA `primary_funding_id` (shown as present / absent only) | MISSING |

**Webhook ready ≠ Calling ready.** The check reports two separate verdicts, `webhookReady` and `callingReady`. Calling ready needs all of: a messaging limit of at least 2,000, a payment method, calling enabled, able to send, Cloud API, the WABA subscription, and the `calls` webhook field.

**How the facts get read, which is GG's step:**
- Open `/api/admin/whatsapp/meta-check` on a deployment that has the WhatsApp env, signed in as the admin account (kintsurashviligaga@gmail.com).
- The cert-branch Preview has the endpoint: https://avatar-g-frontend-v3-git-ef1fad-kintsurashviligaga-ops-projects.vercel.app/api/admin/whatsapp/meta-check
  - If it answers `whatsapp_not_configured`, the Preview lacks the env.
  - Then the same values can be read in WhatsApp Manager instead: Account tools → Phone numbers (number, quality, messaging limit, the Calling tab), Business settings → Payment methods, and the app's Webhooks page (`messages`, `calls`).
- Optional, non-secret, makes more checks readable: `WHATSAPP_APP_ID` and `WHATSAPP_BUSINESS_ACCOUNT_ID` in Vercel env. Setting env is GG's step.

## 4. Policy

- **Meta Terms §4.7 "AI Providers"** was re-read live on 2026-10-10. The wording is unchanged and Georgia is not in the carve-out.
- **The written request to Meta:** [`META_SUPPORT_REQUEST.md`](META_SUPPORT_REQUEST.md), scenarios A and B in full, five questions.
- **Status: SENT — TRANSFERRED TO EMAIL SUPPORT — AWAITING WRITTEN POLICY RESPONSE.**
  - Sent by GG on 2026-10-10 from the MyAvatar.ge business portfolio; case #28590089197308927.
  - Meta: "Your case has been switched to email support. The support team will follow up with you over email."
- Two automated replies signed "Meta AI Agent" arrived first and said A and B are permitted with conditions. By the
  owner's rule (18:44Z) they are **not** official consent and change nothing here.
- Compliance stays **BLOCKED_EXTERNAL** until the support team answers in writing. Calling and creative execution stay
  off in Production.

## 5. Before Production

Each step needs GG's separate word unless marked "code".

1. **Meta's written answer** on §4.7, for A and for B (case #28590089197308927). **BLOCKED_EXTERNAL**: the request is
   sent and waits on Meta's email support. Scope follows the answer (`META_SUPPORT_REQUEST.md` "After Meta answers").
2. **Meta facts all green** in the admin check:
   - messaging limit ≥ 2,000;
   - payment method on the Messaging account;
   - the `calls` webhook field;
   - Calling enabled on the number.
3. **Production migration `20261003c_agent_g_whatsapp.sql`.** Without it nothing on WhatsApp can be linked. This is a DB migration and needs GG's word.
4. **The price approved** in the one pricing approval. Then the code sets `APPROVED_CALL_CREDITS_PER_MINUTE` and wires the charger (code, tested).
5. **The bridge VM** (e2-small, $20.61 a month), plus:
   - `CALL_BRIDGE_SECRET` in Vercel and on the VM;
   - `CALL_BRIDGE_URL`.
   This is paid infrastructure and a secrets change.
6. **The first funded test calls**, on the Preview first, with GG's own number. See §6.
7. Production deploy of PR #50's calling code (merge and deploy word), then `WHATSAPP_CALLING_ENABLED=1`.

## 6. The first funded call test plan

The calls use GG's own linked number, inbound only. The cost is a few cents of Google usage per call; Meta is free for user-initiated calls. It runs only after steps 1–5 and GG's word.

| # | Check | Pass when |
|---|---|---|
| 1 | Meta interop | The bridge's SDP answer is accepted, audio flows both ways, the call reaches `active` |
| 2 | Georgian speech, both ways | Agent G understands and answers in Georgian; the transcript (heard log) matches what was said |
| 3 | Latency | `replyLatencyP50Ms` under ~1.5 s and P95 under ~3 s, from the call record's metrics |
| 4 | Barge-in | Talking over Agent G stops it within one frame burst; `bargeIns` counted |
| 5 | Spoken consent | "Stop my task" asks, the price or effect is told, "კი" is heard, then the tool runs. Without the yes it refuses. |
| 6 | Resume | A call longer than ~10 minutes survives Google's goAway; `reconnects` ≥ 1 and the conversation continues |
| 7 | Memory under the cap | After 3+ minutes, Agent G still knows what was asked a minute ago. If not, switch to the 12k → 6k fallback; the price already covers it. |
| 8 | Real cost | The record's `promptTokens` / `responseTokens` give the real cost per minute; it replaces the estimates in COMMUNICATION_UNIT_ECONOMICS |
| 9 | Delivery | The report and result arrive in the WhatsApp chat after the call |
| 10 | Limits | The per-call cap ends the call with a wrap-up; quiet hours and the daily cap refuse; an unlinked number is refused |

Each result is recorded as PROVEN only with the call record and a screenshot or audio note. The results stay separate from the simulated evidence above.
