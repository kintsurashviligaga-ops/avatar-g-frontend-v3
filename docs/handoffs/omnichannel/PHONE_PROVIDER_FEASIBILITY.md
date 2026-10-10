# Agent G voice on WhatsApp: feasibility report and the one recommended architecture

- **Asked by:** the owner, 2026-10-10 15:38Z (Master Task thread): WhatsApp-first voice on the existing Gemini Live Agent G.
  - Compare **A** (preferred): Meta WhatsApp Business Calling → SIP or media bridge → existing Gemini Live → Agent G task engine.
  - Against **B**: ElevenLabs WhatsApp calling → Gemini LLM / Agent G server tools.
  - Choose A if it is feasible and economical; otherwise argue for B.
- **Written:** 2026-10-10 on branch `claude/launch-certification-wmvitt` (draft PR #50).
- **Nothing was bought, created or changed outside the branch.** No number, no Meta, ElevenLabs, Twilio or Google resource, no paid call, no Production change.
- **Evidence:** every external fact was read on 2026-10-10 from the vendor's own page, with the page's own date where it shows one. The full research briefs, with every URL, are next to this file:
  - [`research/whatsapp-calling-research.md`](research/whatsapp-calling-research.md): Meta Calling, the AI Providers clause, Gemini Live, ElevenLabs, bridges, cost model.
  - [`research/phone-feasibility-research.md`](research/phone-feasibility-research.md): Twilio, ElevenLabs telephony, Georgian SIP and SMS, Telegram.
- **Labels:** CONFIRMED (stated on the vendor's or regulator's own page), UNCONFIRMED (inferred, secondary, or not found), plus the project labels (PROVEN / BUILT_NOT_PROVEN / BLOCKED_OWNER …).
- **Update, 2026-10-10 evening:** the owner approved A as the architecture (16:20Z), not paid infrastructure, Production changes or paid calls. Three newer documents supersede parts of this one:
  - [`COMMUNICATION_UNIT_ECONOMICS.md`](COMMUNICATION_UNIT_ECONOMICS.md) re-verifies the costs and replaces §5 (the proposed price is now **12 credits a minute**, one price for both directions);
  - [`META_SUPPORT_REQUEST.md`](META_SUPPORT_REQUEST.md) replaces Appendix A with a letter that describes both scenarios in full;
  - [`WHATSAPP_CALLING_READINESS.md`](WHATSAPP_CALLING_READINESS.md) gives what is built, the real statuses and the Production verdict (NO-GO).

---

## 1. Decision

**Recommended: A.** Agent G's own Gemini Live session, driven server-side through a thin media bridge, on the same WhatsApp Business number that already carries text.

- **Technically feasible:** every piece is documented and generally available.
  - Meta's Calling API serves Georgia for user-initiated calls and for business-initiated ones.
  - Gemini Live runs server-to-server with function calling.
  - Open-source bridges already join the two.
- **Economical:**
  - Cheaper than B for calls up to about 15 minutes.
  - About the same as B at 30 minutes, once the Live context window is capped (§5).
  - Cheaper at every length as volume grows, because the bridge is a fixed cost.
- **The only design that keeps one brain.**
  - Prompt, tools, approval judge, billing and task engine stay exactly where the browser's Live Voice already has them.
  - B would put a second conversational agent (ElevenLabs' own turn-taking, prompt and LLM loop) in front of ours.

**What can still stop it is policy, not technology.** It applies to B and to today's WhatsApp text channel just the same.

- Meta's Terms §4.7 (Last Modified 2026-09-23) bar "AI Providers" from offering AI on the WhatsApp Business Platform when the AI is the **primary** functionality on offer.
- The definition names "generative artificial intelligence platforms", and Georgia is not one of the legal carve-outs.
- So A is recommended **in the shape Meta allows** (§3): Agent G on WhatsApp is MyAvatar.ge's own account, order and support assistant, and it delivers what the user ordered.
- **It is not an open "ask or generate anything" bot.**
- Written confirmation from Meta comes before launch.

**When B would be chosen instead** (a separate owner decision, never a silent switch):

- Meta confirms the use case, **and**
- the A bridge spike fails Georgian quality or latency on real test calls.

Then B runs in ElevenLabs' "calls only" mode, with our app keeping the messages on the same number.

## 2. What the owner needs to do (BLOCKED_OWNER)

The order matters: nothing after step 1 is worth money until Meta has answered.

| # | Step | Why | Cost |
|---|---|---|---|
| 1 | **Ask Meta in writing**, through Meta Business Support from the portfolio that owns the WhatsApp Business Account (Business Help Center → Contact support → WhatsApp Business Platform → Policy). The ready-to-send text is in [`META_SUPPORT_REQUEST.md`](META_SUPPORT_REQUEST.md). | Meta's §4.7 is decided "in its sole discretion". A written answer is the only proof that the channel will not be cut off. | free |
| 2 | **Read three values in WhatsApp Manager** and paste them here: the business number's country code, its **messaging limit**, and the **business verification** status. | Calling needs a messaging limit of **at least 2,000** (new portfolios start at 250). Business verification is the fastest way up. | free |
| 3 | When the time comes, a word for **one small Google Compute Engine VM** for the bridge: an e2-small in Frankfurt or Warsaw plus a static IP. The $300 Google credit may cover it (UNCONFIRMED). | Paid infrastructure. Cloud Run cannot take the call's UDP media; Vercel cannot hold a 15-minute media stream. | about **$19.4 a month** |
| 4 | A word for **real test calls** on the business number: 5, 15 and 30 minutes, in Georgian. | They measure Georgian quality, latency and real Gemini token use (§5). A user-initiated WhatsApp call is free from Meta; the Gemini side is a few cents a call. | under $5 in total (estimate) |
| 5 | The Production migration `20261003c_agent_g_whatsapp.sql` (already prepared). | Production WhatsApp is configured (the public status reads "Webhook ready", checked 16:00Z), but the link tables do not exist yet, so no number can be linked. | free |

No number has to be bought for A: it uses the WhatsApp business number already configured in Production. Whether that number is +995 is item 2.

## 3. The owner's eight checks, answered

### 3.1 Live audio and functions through the bridge: FEASIBLE (CONFIRMED in the docs, not yet run)

- **The Gemini Live API is a server-side WebSocket.**
  - Native-audio in: 16 kHz PCM. Out: 24 kHz PCM.
  - Function calling: the bridge executes each call and answers it.
  - Server-side voice-activity detection with barge-in.
  - Transcription of both sides.
  - Session resumption: the handle is valid 2 hours after a connection ends.
  - Context-window compression.
- **The Meta Calling API delivers each call as:**
  - a `connect` webhook with an SDP offer, then
  - `pre_accept` and `accept` with our SDP answer, then
  - WebRTC media: Opus at 48 kHz, ICE-lite, DTLS-SRTP.
- **A bridge** decodes Opus to 16 kHz PCM for Gemini, and encodes Gemini's 24 kHz back to Opus.
- **Pipecat**, an open-source BSD-licensed library, ships both halves: a `WhatsAppTransport` for Meta's Graph-API calling and a Gemini Live service.
- Async (non-blocking) function calls are documented for `gemini-3.8-live` only.
  - On `gemini-2.5-flash-native-audio-latest`, today's verified model, a call blocks until we answer.
  - That is fine for us: `agent_task` already answers "started, plan N" at once and the work runs in the task engine.

### 3.2 Meta prerequisites: MOSTLY IN PLACE, two gaps (§2)

- **In place:** Production already has a configured Cloud API number, token, app secret and verified webhook ("Webhook ready", read from the public status 2026-10-10 16:00Z).
- **Calling also needs:**
  - the app subscribed to the `calls` webhook field;
  - calling switched on in the number's call settings;
  - a payment method on the WhatsApp Business Account;
  - a **messaging limit of at least 2,000**.
- **Georgia:** user-initiated calls work wherever the Cloud API works. Business-initiated calls are excluded only in the US, Canada, Egypt, Vietnam and Nigeria (CONFIRMED).
- **Meta's limits:** 1,000 concurrent calls per number, and "no call duration limit" (CONFIRMED).

### 3.3 Meta policy fit: AMBIGUOUS, HIGH RISK as an open bot. Confirmation needed (§2 step 1)

- Meta §4.7, verbatim: "Providers and developers of artificial intelligence … including … **generative artificial intelligence platforms**, general-purpose artificial intelligence assistants … are strictly prohibited from accessing or using the WhatsApp Business Platform … when such technologies are the **primary (rather than incidental or ancillary)** functionality being made available for use, as determined by Meta in its sole discretion".
- Meta's AI Providers page (2026-09-01) allows general-purpose assistants only "where Meta is legally required to permit this use case": Brazil, the EU/EEA and Italy. **Georgia is not on that list.**
- Meta told TechCrunch the change does not affect businesses "using AI to serve customers".
  - A BSP's guide counts bots "capable of … generating content" as prohibited.
  - Content generation is MyAvatar.ge's product.
- **Shape that fits the "incidental" reading** (and what A is built to):
  - **What Agent G does on WhatsApp:** it answers about the user's own account, jobs, prices, top-ups and help.
  - **Delivery:** it delivers results the user ordered.
  - **Ordering:** it takes an order for a named product. The generation is the fulfilment of that order, behind a price and an approval.
- **What it does not do on WhatsApp:** no open Q&A, no companion chat, no "generate anything".
- Meta's Business Messaging Policy also requires a human escalation path next to automation, for example "write to support@…".
- **Today's WhatsApp text channel answers any question** (docs/WHATSAPP.md: "any question or talk → Agent G answers"). That is the risky shape. It should be narrowed whichever voice option is chosen.
- **Data clause (both options):** WhatsApp data must not train AI.
  - Our Gemini use is the paid tier, which is fine.
  - ElevenLabs' data-use terms were not checked (UNCONFIRMED). They would matter for B.

### 3.4 One number for text, voice notes, files, inbound calls and permitted outbound calls

| | A | B |
|---|---|---|
| Same number for messages and calls | **Yes.** Our webhook gets both the `messages` and the `calls` fields. | A number can have **one** provider. Either ElevenLabs takes the whole number (our link codes, media pipeline and alerts stop), or its "calls only" mode is used with our app handling messages. How webhooks reach both apps in that mode is UNCONFIRMED. |
| Text, voice notes, photos, MP3, PDF | Our webhook downloads the media (Meta's URL lives 5 minutes) into the user's own storage, then Agent G | Supported |
| **Video messages** | Yes (up to 16 MB) | **No.** "Inbound videos are not passed to the agent" (CONFIRMED). |
| Inbound calls | Yes, free from Meta | Yes |
| Outbound calls | Yes, after the user's call permission | Yes, after the user's call permission |

### 3.5 Cost at 5, 15 and 30 minutes: see §5

A capped: $0.32 / $1.21 / $2.53. B: $0.41 / $1.24 / $2.49.

### 3.6 Latency, Georgian, barge-in, reconnect, concurrency

| | A | B |
|---|---|---|
| Time to first audio (estimate, UNCONFIRMED) | about 0.7–1.2 s. One native-audio hop; the bridge sits in Frankfurt or Warsaw, near Georgia. The browser call measured about 1.0 s with `thinkingBudget: 0` (2026-09-30). | about 0.8–1.5 s. Three cascaded hops (speech-to-text, LLM, text-to-speech), hosted in the US by default. |
| Georgian | **Verified** on `gemini-2.5-flash-native-audio-latest` (Gemini API, our own probe 2026-09-30); Georgian `ka` is in the Live API's 99 languages. Vertex's Live page lists 24 languages without Georgian, so A stays on the transport already verified (§4.4). Georgian on 3.8 Live is UNCONFIRMED. | Speech-to-text and the v4 / v3 voices list Georgian. Georgian as the **agent** language is UNCONFIRMED (its language page still points at a 31-language set). |
| Barge-in | Gemini's voice detection cancels the answer; the bridge drops its queued audio at once. | Built in. |
| Reconnect | Gemini resets about every 10 minutes. The bridge resumes with the handle, the way the browser already does. Meta cannot renegotiate a running call, so a bridge restart drops it. The user calls back and the call continues the same chat thread (`chatSessionId`, as in the browser). | Managed by ElevenLabs. |
| Concurrency | Meta allows 1,000 per number. An e2-small carries a few concurrent calls (1,000 minutes a month is 1–2 at peak); a bigger VM for more. Gemini's concurrent-session quota for our project is UNCONFIRMED. | 10 (Creator plan) or 20 (Pro) concurrent calls; burst minutes cost double. |

### 3.7 Verified link, opt-in, call permissions, spending limits, quote and confirm, real task status

These are the same rules as the browser's Live Voice; nothing new is trusted.

1. **Verified link.** A WhatsApp number belongs to an account only after a one-time code is sent **from** that number. This is already built: `lib/agent-g/channels/whatsapp-link.ts` (a browser can never name a number).
   - A call from an unlinked number gets one short spoken line saying how to link, then hangs up. No model work, no tools.
2. **Opt-in.**
   - Calls stay off until the user turns on "Agent G Calls" in Settings → Connections.
   - Outbound calls also need WhatsApp's own call permission, which the user grants in WhatsApp. Meta allows at most 1 request a day and 2 a week; the permission is permanent or lasts 7 days.
   - Calls also respect quiet hours and the user's time zone.
3. **Caller identity never authorizes money** (owner rule, 13:10Z).
   - **Free work** (status, help, a free montage or MP3) can start on the user's own spoken "yes". The server judges it from the transcription of the user's words with `lib/voice/spokenYes.ts`, never from the model's words. This is the same judge as Live Voice.
   - **Paid work needs a tap.** During the call, Agent G says the price, and a WhatsApp message with a "Confirm N credits" button arrives in the same chat. Only that tap, from the linked number, approves the quote fingerprint. The app's own confirm works too.
   - This adds approval channels next to `tap`, `panel-button` and `voice-transcript` (`lib/agent/contracts.ts`).
4. **Spending limits.**
   - Per-call minute cap: 15 minutes by default.
   - Per-day call-minute cap.
   - The existing daily ceilings and the credits ledger (`deduct_credits_once`).
   - A call that would cost more than the balance does not start.
5. **Real task status.** "What's my video doing?" calls the task engine (`/api/tasks`, the same TaskView the website shows). The model never invents a status.
6. **Results.**
   - A finished video (up to 16 MB), MP3 (up to 16 MB), image or PDF arrives in WhatsApp as media.
   - Anything larger arrives as a short-lived, signed link that opens only for the signed-in owner.
   - It is always in the Library too. A failed WhatsApp send never fails the job.

### 3.8 Everything sent on WhatsApp reaches the same Agent G

- Every message goes through the same intent router, capability registry, approval, task API, ledger and Library as the website: `lib/agent/intent.ts`, `lib/agent/capabilities.ts`, `/api/tasks`.
- This covers text, voice note, photo, video, MP3 and document.
- A call is the same conversation thread as the chat (`chatSessionId`).
- A job started on the phone shows in the website's task tray.

## 4. Architecture A, as it fits our code

```
WhatsApp user ──call──▶ Meta Calling API ──`calls` webhook (signed)──▶ our app: /api/webhooks/whatsapp (Vercel)
                                                                             │ 1. Meta signature (exists)
                                                                             │ 2. number linked? calls on? hours? balance? cap?
                                                                             │ 3. signed call ticket {userId, waId, callId, sdpOffer, ttl}
                                                                             ▼
                          ┌──────────── bridge VM (thin, no logic) ────────────┐
   Meta WebRTC media ◀───▶│ pre_accept / accept with our SDP answer             │
   (Opus 48 kHz)          │ Opus ↔ PCM 16k / 24k, barge-in flush, keepalive     │
                          │ Gemini Live WebSocket ◀── ephemeral token + locked  │◀── /api/voice/live (exists; a phone variant)
                          │ setup minted by OUR app, never a key on the VM      │
                          │ every tool call ──▶ our app ──▶ same executor       │──▶ /api/tasks, /api/agent/approvals, Library
                          │ transcripts ──▶ our app (spoken-yes judge, record)  │
                          └─────────────────────────────────────────────────────┘
```

### 4.1 What stays exactly as it is

- **The brain.** The session setup is built by `buildLiveSetup` in `/api/voice/live`: system instruction, voice, Georgian language hint, transcriptions, resumption, compression and the tool declarations. The bridge sends the setup frame it is given, as the browser does.
- **Approvals.** The spoken-yes judge, the quote fingerprint and the ledger.
- **The task engine** (`/api/tasks`, the run engine) and the Library.
- **The WhatsApp webhook's security:** the Meta signature check, the 256 KB cap, Redis idempotency and the per-IP limit.

### 4.2 What is new

1. **The `calls` webhook branch.**
   - Inbound handling: link, opt-in, quiet hours, balance and per-day cap checks.
   - A signed, short-lived call ticket handed to the bridge.
2. **A phone tool subset.** The browser's 24 Live tools include 19 that drive the screen (click, scroll, open a panel, show code …), and those mean nothing on a phone.
   - The phone session declares only: `agent_task` (plan, start, stop, status), `ask_agent_g`, `extract_audio`, `montage`, `read_webpage`, `stop` and `end_call`.
   - It adds three new tools: a task-status list, "send the result here", and "call me when it is ready".
3. **Approval channels** for the WhatsApp call's spoken yes and the WhatsApp Confirm button. The rules are in §3.7.
4. **The bridge.**
   - It is a long-lived process on a small VM: Pipecat's WhatsApp transport plus the Live client, about a few hundred lines of glue.
   - It holds no prompt, no key and no rules.
   - It authenticates to our app with a per-call ticket. Every tool call and transcript goes back to the app.
   - It drains calls before a restart.
5. **A cost cap in the Live setup for phone calls.**
   - Explicit compression thresholds: trigger at about 8,000 tokens, keep about 4,000.
   - Today's `{ slidingWindow: {} }` uses Google's default, 80 % of a 131k window. Over a long call that would re-bill most of the conversation every turn (§5).

### 4.3 Outbound "call me when the video is ready"

1. The user asks, in the app or on WhatsApp.
2. The server records a scheduled callback bound to the job: user, number, the permission state, quiet hours, a per-day limit, and a budget hold.
3. When the job finishes, the result goes to WhatsApp first, as a message.
4. The call is placed only if:
   - the user's WhatsApp call permission is valid,
   - it is outside quiet hours, and
   - the day's call limit and the balance allow it.
5. Meta revokes permission after 4 unanswered calls, so a call is retried at most once, and never in a loop.
6. "Call me now" and "call me when it's ready" are two different actions, as the owner asked.

### 4.4 Which Google endpoint

- **The bridge starts on the endpoint already verified in Georgian:** the Gemini API with our paid key, through an **ephemeral token our app mints**. The key never leaves Vercel.
- **Vertex would allow a keyless VM** (the VM's own service account).
  - But Vertex's Live language list does not show Georgian.
  - So moving the bridge to Vertex is a measured step after a Georgian test, never a silent fallback.
- This is the same open decision as the Production `GEMINI_TRANSPORT` choice.

## 5. Cost

> **Superseded** by [`COMMUNICATION_UNIT_ECONOMICS.md`](COMMUNICATION_UNIT_ECONOMICS.md), which re-verified every input (transcription, the measured instruction size, continuous input streaming, the VM at low volume) and proposes 12 credits a minute. The figures below are the first estimate and are kept for the record.

### 5.1 Assumptions

- **Speaking time:** the user 50 %, Agent G 40 %.
- **Gemini prices:** audio in $3 and out $12 per 1M tokens (Gemini 2.5 native audio and 3.8 Live, CONFIRMED). Audio counts 25 tokens a second.
- **Re-billing:** Google bills the whole session context again on every turn (Vertex pricing, CONFIRMED; the same on the Gemini API is UNCONFIRMED). The model uses 20-second turns and a 3,000-token instruction.
- **Bridge:** about $19.4 a month, so $0.0194 a minute at 1,000 call-minutes a month.
- **ElevenLabs (B):**
  - $0.08 a minute on every plan, plus Gemini 2.5 Flash as its LLM at about $0.0029 a minute.
  - The Creator plan is $22 a month with 275 minutes included.
- **Meta:**
  - A user-initiated call is free.
  - A business-initiated call to Georgia is **$0.0095 a minute** (6-second pulses, Oct 2026 rate card, CONFIRMED).
- **Calculator:** [`research/wa_cost.py`](research/wa_cost.py).

### 5.2 One call, user-initiated (USD)

| Call | A, Gemini only, no re-billing | A, default compression (full re-billing) | **A, capped at 8k / 4k, with the bridge share** | **B** |
|---|---|---|---|---|
| 5 min | 0.047 | 0.223 | **0.320** | **0.415** |
| 15 min | 0.142 | 1.579 | **1.211** | **1.244** |
| 30 min | 0.284 | 5.893 | **2.528** | **2.487** |

- A business-initiated call adds Meta's fee to either option: +$0.048 (5 min), +$0.143 (15 min), +$0.285 (30 min).

### 5.3 One month at 1,000 call-minutes (USD)

| | A capped | B (Creator) |
|---|---|---|
| All 5-minute calls | 63.96 | 82.90 |
| All 15-minute calls | 80.70 | 82.90 |
| All 30-minute calls | 84.26 | 82.90 |

- The bridge is a fixed cost, so A gets cheaper per minute as volume grows: at 5,000 minutes a month its share is $0.004 a minute.
- Without the cap, A's 30-minute calls would cost $215 a month. **The cap is not optional.**

### 5.4 What it would mean in credits

This is a proposal only. It goes into the one price model (`COMMUNICATION_UNIT_ECONOMICS.md`) for the owner's single approval. **No price changes now.**

- Same rule as the pricing audit: credits = ceil(cost ₾ ÷ (0.0822 ₾ net per credit × 0.35)), with FX 2.70 and a 5 % reserve.
- At the 65 % target margin with the cap:
  - a 5-minute call needs 32 credits, a 15-minute call 120 and a 30-minute call 250 (inbound);
  - outbound needs 37, 134 and 278.
- **A flat price** covers every length up to 30 minutes at 67.7 % or more:
  - inbound **9 credits a minute** (0.90 ₾);
  - outbound **10 credits a minute** (1.00 ₾).
- **No unlimited free calls.**
- **WhatsApp messages also cost money since 2026-10-01** (both options).
  - Replies are free for the first 1,000 a month per number, then $0.0212 each to Georgia.
  - Utility templates (for example "your video is ready" after 24 hours) are $0.0212 each.
  - B adds $0.003 per text on ElevenLabs.

## 6. Why not B as the main path

1. **A second brain.** An ElevenLabs agent runs its own conversation: its own prompt, turn-taking and LLM loop, with our tools behind webhooks. The owner asked for none; A keeps the brain in one place.
2. **The number.**
   - A number can belong to one provider at a time.
   - B in full takes it over: today's link codes, media handling and alerts stop working on it.
   - B in "calls only" mode depends on webhook behaviour that is not documented.
3. **No video messages.** Inbound videos never reach the agent.
4. **Georgian end to end is UNCONFIRMED.** A runs on the model already verified in Georgian.
5. **Not cheaper.** About the same as A at 30 minutes, dearer below, and a monthly plan on top.
6. **Data.**
   - Conversations are kept 2 years by default, hosted in the US (EU residency is Enterprise only).
   - Zero-retention mode ignores inbound WhatsApp messages.
   - The training-use terms were not checked.

**B's real advantage is build effort:** a dashboard import instead of a VM. That is why it stays the documented fallback (§1).

## 7. Georgia telephony outside WhatsApp (later priority, code kept)

The owner moved GSM, SMS and Telegram after WhatsApp. The findings, for the record (full detail in `research/phone-feasibility-research.md`):

- **Twilio has no Georgian numbers at all** (voice or SMS; two-way SMS "No").
  - It can only call **out** to Georgia, at $0.3662 a minute to landlines and $0.4727 to mobiles.
  - It can only **send** SMS to Georgia, at $0.1684 per segment. Both are expensive.
- **A real +995 number for inbound calls:** DIDWW lists Tbilisi +995 32, national +995 706 and toll-free +995 800 numbers over SIP.
  - A "Georgia Registration Form" is required.
  - Prices are not public. SIP interop with ElevenLabs is UNCONFIRMED.
  - Magti and Silknet publish no SIP-trunk offer.
- **SMS notifications:** local aggregators are 6 to 50 times cheaper than Twilio.
  - ubill.ge: 0.01 ₾ an SMS.
  - sender.ge: 0.025 ₾ including VAT.
  - smsoffice.ge: 0.03 ₾ in a 5,000 pack.
  - All three have an HTTP API and an alphanumeric sender name.
  - **None documents incoming SMS**, so two-way SMS stays BLOCKED_PROVIDER.
  - A Georgian-script SMS holds 70 characters.
- **Telegram bots cannot place or take calls** (`phone.requestCall`: "Only users can use this method"). Telegram stays text, voice notes and files; it will never be presented as calling.

## 8. Build plan

### 8.1 Now, on the branch, mocked

No number, no paid resource, no Production change. These are labelled BUILT_NOT_PROVEN at best.

1. The user flow **Connect WhatsApp → Verify → Enable Agent G Calls** in Settings → Connections, reading real server state. It never shows "Connected" because environment variables exist.
2. The `calls` webhook branch: signature, link, opt-in, hours and balance checks, and the call ticket. It is tested against a fake bridge.
3. The phone tool subset, the two new approval channels, and the capped compression in the phone setup.
4. Scheduled callbacks with permission, quiet hours, limits and budget holds, tested with a mocked Graph API.
5. WhatsApp media into the user's own storage, then the task engine, then delivery. A delivery failure never fails the job.
6. Narrowing the WhatsApp text channel to the account, order and support shape (§3.3).

### 8.2 After the owner's steps (§2)

1. The bridge VM and real Georgian test calls of 5, 15 and 30 minutes.
2. Measuring latency and real Gemini `usageMetadata`, then updating §5 with measured numbers.
3. Inbound calls first. Outbound calls only after the permission flow has run for real.

Nothing becomes PROVEN before a real call on the real number.

## 9. Open items (UNCONFIRMED)

1. Meta's answer on §4.7 for this exact use case. This is the gate.
2. The business number's country, messaging limit and verification status (owner, §2).
3. Context re-billing on the Gemini API, as opposed to Vertex where it is CONFIRMED. Real per-turn `usageMetadata` is needed.
4. Async function calling on `gemini-2.5-flash-native-audio-latest`.
5. Gemini Live's concurrent-session quota for our project.
6. Georgian quality on 3.8 Live and on Vertex Live.
7. Whether the $300 Google credit covers the VM.
8. ElevenLabs (only if B is ever used):
   - Georgian as the agent language;
   - data-use terms;
   - "calls only" webhook delivery.
9. All latency figures are estimates until the test calls.

---

## Appendix A: the question to send to Meta (ready to paste)

> **Superseded** by [`META_SUPPORT_REQUEST.md`](META_SUPPORT_REQUEST.md). The owner asked for both scenarios (customer service and creative execution) to be described in full. Send that letter, not this one.

> Subject: WhatsApp Business Platform: does Meta Terms §4.7 (AI Providers) apply to our use case?
>
> We are MyAvatar.ge, a Georgian online service where signed-in customers order AI-made videos, images, music and voice
> work on our website and pay for them with credits. Our WhatsApp Business number (Cloud API, our own WABA) would serve
> our existing customers only, after they link their WhatsApp number to their MyAvatar.ge account with a one-time code:
>
> 1. answering questions about their own account, orders, prices, balance and how to use our website;
> 2. telling them when an order is ready and delivering the finished file they ordered;
> 3. taking an order for a specific product of ours (for example "an 8-second video in the Fast tier, 137 credits"),
>    which the customer confirms with a button before anything is made or charged;
> 4. voice calls on the same number (WhatsApp Business Calling) for the same purposes, plus a human support address.
>
> We would not offer open-ended chat, general question answering or a companion bot on WhatsApp. WhatsApp data is not
> used to train any model.
>
> Question: under Meta Terms for WhatsApp Business Platform §4.7, is MyAvatar.ge an "AI Provider" for this use case, and
> is the AI here "incidental or ancillary" to our customer service? If parts of the list above are not allowed, which?
