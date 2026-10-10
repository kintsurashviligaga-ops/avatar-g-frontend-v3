# Agent G on WhatsApp (messages + voice calls): feasibility brief

**For:** MyAvatar.ge (Georgia, +995). Agent G = Gemini Live (native audio + function calling), today running in the browser.
**Goal:** reach Agent G from WhatsApp (text, voice notes, photos, video, MP3, documents, and voice calls) at the lowest extra cost, reusing the Gemini Live agent. Tool calls run on our server (task engine, approval, billing).
**Provider policy:** Google + ElevenLabs only.
**Research date:** every source was read on **2026-10-10**. Each source's own "Updated" or "Last modified" date is given where the page shows one.
**Related:** `scratchpad/phone-feasibility-research.md` (sibling brief on Twilio, PSTN, SMS and Telegram). It was cited here but not edited. This brief upgrades that file's WhatsApp rate figures (its item 4.5, marked UNCONFIRMED) to CONFIRMED, using Meta's own Oct-2026 rate-card PDF.

The two options compared:
- **A (preferred).** Meta WhatsApp Business Calling API → a SIP or WebRTC media bridge we host → Gemini Live API → our task engine via function calls.
- **B (alternative).** ElevenLabs Agents' native WhatsApp integration → Gemini as the agent's LLM → our server tools (webhooks).

---

## 0. Bottom line

1. **Policy is the gating risk, not technology.** Meta Terms §4.7 bars "AI Providers" from using the WhatsApp Business Platform, directly or indirectly, when the AI technology is the **primary** functionality on offer. Its definition explicitly names "**generative artificial intelligence platforms**". Georgia is not one of the carve-out countries. MyAvatar.ge *is* a generative-AI studio.
   - An open-ended "chat with Agent G to generate images or videos" bot on WhatsApp is **high risk**.
   - A scoped customer-service and order channel is **lower risk but still Meta's discretion**: order status, delivering results the user ordered, billing and support, buying a specific named product.
   - **Get written confirmation from Meta before launch** (§3).
2. **Georgia is supported.** User-initiated WhatsApp calls work and are **free**. Business-initiated calls to +995 are also allowed: Georgia is not on the exclusion list (US, CA, EG, VN, NG). They cost **$0.0095/min** at list price (Rest of Central & Eastern Europe, 6-second pulses).
3. **Calling requires a messaging limit of at least 2,000.** New portfolios start at 250. **Business verification** is the fastest way to 2,000. Meta's FAQ says verification is "not a requirement for calling", but in practice you need it to reach the limit.
4. **Cost.** Gemini Live audio by itself is cheap: about $0.047 for a 5-minute call.
   - Google explicitly bills **context re-processing every turn** (Vertex pricing). That makes long calls expensive unless context compression is tuned:
     - a 30-minute call is about $5.9 of Gemini with no cap
     - about $1.9 with an 8k-token sliding window
   - Option B costs a flat **$0.08/min** plus about $0.003/min of LLM: about $0.41, $1.24 and $2.49 for 5, 15 and 30 minutes.
   - **A is cheaper for short calls. Long calls only stay cheaper with a tight compression window.** Measure `usageMetadata` before committing.
5. **Georgian language.**
   - Gemini API Live lists Georgian (`ka`) among 99 languages. Vertex's Live page lists only 24 languages, without Georgian. The app's own probe verified Georgian on `gemini-2.5-flash-native-audio-latest` on 2026-09-30.
   - ElevenLabs: Georgian (`kat`) is supported by Eleven v4, v4 Turbo, v3 and v3 Conversational TTS, and by Scribe v2 / v2 Realtime STT ("High Accuracy, >5% to ≤10% WER"). It is **not** supported by Multilingual v2 or Flash v2.5. Whether an Agent can be set to Georgian end to end is **UNCONFIRMED**.
6. **Bridge.** Use **Pipecat (self-hosted) on a Compute Engine VM.** Pipecat ships a `WhatsAppTransport` for the Graph-API + WebRTC path plus a Gemini Live service.
   - Cloud Run cannot accept inbound UDP or SIP.
   - The LiveKit WhatsApp Connector is LiveKit-Cloud-only, a third vendor.
   - Jambonz (SIP + SDES, with a native Gemini Live `llm` verb) is a solid but heavier self-hosted alternative.

---

## 1. Meta WhatsApp Business Calling API

Sources:
- Overview: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling ("Updated: Jun 26, 2026")
- FAQ: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/faq
- SIP: .../calling/sip
- Call settings: .../calling/call-settings
- User-initiated calls: .../calling/user-initiated-calls
- Permissions: .../calling/user-call-permissions ("Updated: Jun 26, 2026")
- Pricing: .../calling/pricing ("Updated: Sep 11, 2026")

| Topic | Finding | Status |
|---|---|---|
| Status | Live, documented product. There is no beta label on the overview page. Changelog entries run through 2026, for example PCMA/PCMU codecs added Mar 23, 2026. | CONFIRMED |
| Georgia, user-initiated | "User-initiated calling is available in every location Cloud API is available." | CONFIRMED |
| Georgia, business-initiated | Available wherever Cloud API is, "except the following countries: United States, Canada, Egypt, Vietnam, Nigeria." "The business phone number's country code must be in this supported list. The consumer phone number can be from any country where Cloud API is available." So both a +995 business number and +995 users are fine. | CONFIRMED |
| Cloud API country restrictions | Only "Cuba, Iran, North Korea, Syria, and three sanctioned regions in Ukraine (Crimea, Donetsk, Luhansk)" are excluded. Georgia is not mentioned. Source: .../whatsapp/support (no date shown). | CONFIRMED |
| Prerequisites | Number on Cloud API (not the WhatsApp Business app); app subscribed to the `calls` webhook field; `whatsapp_business_messaging` permission; **messaging limit ≥ 2,000**; calling enabled through call settings; a payment method or credit line on the WABA. The FAQ says business verification is "not a requirement for calling, nor is it required for messaging". | CONFIRMED |
| Signaling options | 1) Graph API + webhooks (HTTPS), media over WebRTC (ICE + DTLS-SRTP). 2) SIP over TLS with WebRTC media. 3) SIP with SDES-SRTP. SDES can also be used with Graph API signaling. | CONFIRMED |
| SIP details | See the SIP list below this table. | CONFIRMED |
| Inbound flow (Graph) | 1) `connect` webhook arrives with an SDP offer. 2) `POST /<PHONE_NUMBER_ID>/calls` with `pre_accept` and the SDP answer (recommended). 3) `accept` with the same SDP; send media only after the 200 OK. Other actions are `reject` and `terminate`; the `terminate` webhook carries the duration. There are about 30–60 s to accept. DTMF follows RFC 4733 at 8000 Hz. Only iPhone and Android users can call; WhatsApp Web and Desktop cannot. | CONFIRMED |
| Codecs | OPUS (RTP clock 48000). PCMA/PCMU were added Mar 23, 2026 via `audio.additional_codecs`. FAQ: "WhatsApp mobile apps only support opus natively, so Meta media infra transcodes opus to other codecs if needed." Bandwidth is about 40 kbps plus 20 kbps overhead per call. | CONFIRMED |
| NAT/ICE | Meta provides no STUN/TURN. Meta is ICE-lite and the business side must take the CONTROLLING role. Media ports 40012, 3482, 3484, 3478 and 3480 (subject to change). Webhooks come from US servers; Meta advises placing media servers near the users' country. | CONFIRMED |
| Concurrency | 1,000 concurrent calls per business number (FAQ). | CONFIRMED |
| Duration | "There is no call duration limit." (FAQ) | CONFIRMED |
| Reconnect | "WhatsApp consumer apps will attempt a reconnect … For the business leg … no support to re-handshake or re-negotiate SDPs." | CONFIRMED |
| AI voicebots | FAQ: "Yes. Meta only provides the raw media stream … See WhatsApp Business Solution Terms for restrictions in AI use cases." | CONFIRMED |
| Permissions (business-initiated calls) | See the permission list below this table. | CONFIRMED |
| Abuse controls | 2 consecutive unanswered calls trigger a system message; 4 trigger automatic revocation. Negative feedback causes a 7-day pause. Low pickup rates hide the call button. Business-initiated calls bypass "Silence Unknown Callers". | CONFIRMED |
| Call settings | `POST /<PHONE_NUMBER_ID>/settings` → `calling{status, call_icon_visibility, call_icons.restrict_to_user_countries, call_hours, callback_permission_status, sip, audio.additional_codecs, voicemail}`. Voicemail: an OGG/Opus greeting under 60 s; voicemails arrive as inbound audio messages. | CONFIRMED |
| Pricing | See the pricing list below this table. | CONFIRMED (rate card PDF parsed) |
| Sandbox | Public test numbers have relaxed limits (25 permission requests per day, 100 per week). Sandbox accounts are for Tech Partners only. Pipecat notes that Meta's US test numbers are blocked from some countries (error 130497), so test with a production +995 number. | CONFIRMED |

SIP details:
- When SIP is enabled, the calling Graph API endpoints cannot be used; webhooks for SIP calls are optional.
- TLS is mandatory and mTLS is not supported. Meta's SIP domain is `wa.meta.vc` (port 5061).
- Digest auth uses a Meta-generated password from `GET /settings?include_sip_credentials=true`.
- The offer must support ICE + DTLS-SRTP + OPUS, or SDES via `srtp_key_exchange_protocol`.
- One SIP server per phone number. No REGISTER and no re-INVITE.
- The app must be in Live mode.
- Meta publishes an Asterisk guide (changelog Sep 29, 2025) and a FreeSWITCH `mod_sofia` sample.

Permissions for business-initiated calls:
- The user must grant permission. Permanent permissions exist since Nov 3, 2025; temporary ones last 7 days.
- Limits:
  - 100 connected calls per 24 h per business–user pair
  - permission requests at most 1 per 24 h and 2 per 7 days (reset after any connected call)
- Requests go out as an interactive `call_permission_request`:
  - free-form inside the customer service window
  - as a MARKETING or UTILITY template outside it
  - either way, the request is billed as a message
- Permission can also come from the callback setting or from the business profile.
- `GET /<PHONE_NUMBER_ID>/call_permissions?user_wa_id=` returns the status.

Pricing:
- "All user-initiated calls are free."
- Business-initiated calls are billed in **6-second pulses** by callee country, with monthly volume tiers.
- **Rest of Central & Eastern Europe (includes GE +995), effective Oct 1, 2026, USD per minute:**

| Minutes per month | USD per minute |
|---|---|
| 0–50,000 (list) | 0.0095 |
| 50,001–250,000 | 0.0076 |
| 250,001–1M | 0.0066 |
| 1M–2.5M | 0.0058 |
| 2.5M–5M | 0.0043 |
| over 5M | 0.0037 |

- Call recording and transcription are currently free.
- A user call (accepted or not), or a user accepting a business call, opens or refreshes the 24 h customer service window.

---

## 2. WhatsApp Business setup (Cloud API, direct, no BSP)

Sources:
- Phone numbers: .../business-phone-numbers/phone-numbers
- Messaging limits: .../messaging-limits
- Media: .../business-phone-numbers/media
- Pricing: .../whatsapp/pricing ("Updated: Sep 30, 2026")
- Rate card PDF (USD, effective Oct 1, 2026)
- Template categorization (via the sibling brief)

Steps:
1. **Meta Business portfolio.** Create it at business.facebook.com.
2. **Meta developer app** (Business type) with the WhatsApp product, owned by the same portfolio.
   - For our own WABA no Tech-Provider onboarding is needed.
   - Whether App Review / Advanced access is needed only when serving *other* businesses is **UNCONFIRMED**.
3. **WABA** under the portfolio.
4. **Phone number.** It must be owned by us, have a country and area code (no short codes), be able to receive SMS or a voice call for OTP, and not be registered with WhatsApp already (delete it from the consumer or Business app first).
   - Landlines and toll-free numbers are supported (voice OTP "Standard").
   - New portfolios are capped at **2 numbers**.
   - A number can be registered with only **one** provider at a time. This matters for option B; see §6.
5. **Display name.** It is reviewed (`name_status`: APPROVED, PENDING_REVIEW, DECLINED, …).
6. **Business verification.** It is the quickest of three ways to raise the messaging limit 250 → 2,000:
   - verify the business
   - partner-led verification
   - 2,000 delivered template messages to unique users in 30 days with high quality

   **Calling requires 2,000.** Above that, scaling (10k → 100k → unlimited) is automatic. The limit counts only messages sent *outside* a customer service window.
7. **Token.** Create a System User in Business Settings and generate a permanent token with `whatsapp_business_messaging` and `whatsapp_business_management`. Temporary tokens from API Setup expire in hours.
8. **Webhooks.** Subscribe the app to the `messages` and `calls` fields. Verify `X-Hub-Signature-256` with the app secret. Webhooks are sent from US servers.
9. **Payment method.** Add it in WhatsApp Manager. It is required for templates, service messages beyond the free tier, and business-initiated calls.
10. **Enable calling.** Use `POST /<PHONE_NUMBER_ID>/settings` (or WhatsApp Manager → Phone numbers → Call settings).
11. **Templates** (utility or marketing).
    - Utility templates: non-promotional, specific to the user's own order or account. For example: "Your video is ready", a payment receipt, or a call-permission request after the window has closed.
    - Approval statuses: APPROVED, PENDING or REJECTED. Meta can recategorise a template as marketing.

**Media the Cloud API accepts** (send and receive; "Media URLs expire after 5 minutes", media IDs from the API last 30 days and IDs in webhooks last 7 days):

| Type | Formats and max size |
|---|---|
| Audio | AAC, AMR, **MP3**, M4A, **OGG with Opus only (mono)**, 16 MB. Voice-note replies must be OGG/Opus mono. |
| Image | JPEG, PNG, 5 MB |
| Video | MP4, 3GPP, 16 MB. Generated videos larger than this need a link or re-encoding. |
| Document | PDF, DOC(X), XLS(X), PPT(X), TXT, 100 MB |
| Sticker | WebP, 100 KB static / 500 KB animated |

**Messaging pricing for Georgia** (Rest of Central & Eastern Europe, USD per delivered message, effective **Oct 1, 2026**, from Meta's rate-card PDF):

| Category | Rate | Notes |
|---|---|---|
| Marketing | 0.0860 | |
| Utility | 0.0212 | Tiers from 0.0201 at 100k, down to 0.0159 above 80M. Utility templates inside the service window are **now charged**; they were free 2025-07-01 to 2026-09-30. |
| Authentication | 0.0212 | Authentication-international: n/a. |
| **Service** (free-form replies) | 0.0212 | **after 1,000 free service messages per business number per month.** The free tier does not roll over and resets monthly. |
| Free entry point (Click-to-WhatsApp ad or Page CTA) | 0 | All categories free while the FEP window is open ("may remain open for up to 7 days"). |
| Meta Business Agent (Meta's own AI) | $2.00 per 1M tokens | Not relevant to us. |

**Correction to the brief's premise:** "service messages are free" stopped being true on **Oct 1, 2026**. Every Agent G reply counts as a service message, whether text, image, voice note, video or document. Meta Terms and prices may change only at quarter starts. AI Providers are excluded from the Oct-1 service pricing and are billed under the AI Providers policy.

---

## 3. AI Providers policy: exact text, interpretation, verdict

### 3.1 Exact quotes (primary)

**Meta Terms for WhatsApp Business Platform**: https://www.whatsapp.com/legal/business-solution-terms/, which redirects to https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform ("Last Modified: September 23, 2026"). §4.7, verbatim:

> "**4.7** _AI Providers._ Providers and developers of artificial intelligence or machine learning technologies, including but not limited to large language models, generative artificial intelligence platforms, general-purpose artificial intelligence assistants, or similar technologies as determined by Meta in its sole discretion ("AI Providers"), are strictly prohibited from accessing or using the WhatsApp Business Platform, whether directly or indirectly, for the purposes of providing, delivering, offering, selling, or otherwise making available such technologies when such technologies are the primary (rather than incidental or ancillary) functionality being made available for use, as determined by Meta in its sole discretion; provided, however, that such technologies may be made available to businesses in certain countries as set forth here [AI Providers pricing page]. Notwithstanding the foregoing, you may retain an AI Provider as your Solution Provider. In such cases, you may not directly or indirectly allow WhatsApp Business Platform Data ... to be used to create, develop, train, or improve any machine learning or artificial intelligence systems ... provided that you may use WhatsApp Business Platform Data to fine-tune an AI Model that is for your exclusive use..."

§1.3 also notes that "different or additional terms may apply when you access and use other AI-related technologies".

**AI Providers pricing policy**: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers ("Updated: Sep 1, 2026"):

> "Effective January 15, 2026, WhatsApp's Terms of Service update 'AI Providers' are only permitted to offer general-purpose AI assistants on the WhatsApp Business Platform where Meta is legally required to permit this use case."

- The carve-outs are Brazil (from Mar 11, 2026), the EU/EEA (Mar 11 to May 12, 2026) and Italy (Feb 16 to May 12, 2026).
- The webhook pricing category is `general_purpose_ai`.
- **Georgia is not a carve-out country.**

**WhatsApp Business Messaging Policy**: https://www.whatsapp.com/legal/business-policy/, which redirects to whatsappbusiness.com/policy/ ("Last updated: September 23, 2026").
- It has no AI-specific clause.
- It requires human escalation when automation is used:
  > "You may use automation when responding during the 24-hour window, but must also have available prompt, clear, and direct escalation paths" (human agent, phone, email, web support, etc.).
- It also requires opt-in (a separate opt-in for calls is recommended) and bans sexually explicit or offensive content.
- The Commerce section defers to the Meta Commerce Policy, which was **not read** (UNCONFIRMED).

### 3.2 Secondary and BSP interpretations

- **TechCrunch** (2025-10-18, updated 2026-01-15): Meta said businesses using AI to serve customers, such as a travel company's support bot, are not affected.
  - Spokesperson: "The purpose of the WhatsApp Business API is to help businesses provide customer support and send relevant updates."
  - The EU, Italy and Brazil opened antitrust probes. OpenAI, Perplexity and Microsoft exited.
- **respond.io** (BSP), https://respond.io/blog/whatsapp-general-purpose-chatbots-ban: prohibited bots include those "capable of answering arbitrary questions, **generating content**, or serving as general conversation companions", while "business-focused chatbots remain welcome". **"Generating content" is exactly MyAvatar's product.**
- **Alibaba Cloud ChatApp** guide (BSP, "Last updated: May 27, 2026"):
  - New API users from Oct 15, 2025 are covered immediately; existing users from Jan 15, 2026.
  - Open-domain bots are prohibited; "structured, task-oriented AI use cases" are allowed.
- **Serviceform** (vendor blog): "a business using AI as a tool" is allowed, but "a company distributing a general-purpose 'ask me anything' assistant through WhatsApp is offering AI as the product."
- No specific written guidance was found from Infobip, 360dialog, Bird or Vonage (UNCONFIRMED).

### 3.3 Verdict

**Ambiguous, and high risk for the use case as stated.**

**Why it is risky:** MyAvatar.ge is itself a developer of a "generative artificial intelligence platform". If WhatsApp becomes a front-end where users chat to get images, videos or audio generated, the generation is the **primary** functionality on offer, which is what §4.7 prohibits. Meta decides "in its sole discretion", and Georgia has no legal carve-out.

**Lower-risk shape** (AI is "incidental or ancillary" to customer service for our own business):
- Agent G on WhatsApp handles **account, order and support** for MyAvatar.ge:
  - status of the user's jobs
  - delivering finished results the user ordered
  - pricing, billing and top-ups
  - help using the site
  - ordering a *specific, named, paid* product, with generation as fulfilment of that order
- Generation is a narrow tool behind approval and billing, not an open "ask/generate anything" chat.
- Human escalation is offered.
- No general Q&A or companion behaviour is allowed; enforce this in the system prompt and tools.

**Data clause (applies to A and B):**
- WhatsApp data must not be used to train or improve AI systems.
  - Gemini: use the **paid** Gemini API or Vertex tier. Free-tier Gemini API data may be used to improve Google products.
  - ElevenLabs: confirm in its terms that it does not train on our data. **UNCONFIRMED.** Zero-Retention Mode is not usable with WhatsApp; see §6.

**How to get confirmation, in writing, before building:**
1. Meta Business Support / Direct Support from the Business portfolio that owns the WABA (Business Help Center → contact support → WhatsApp Business Platform → Policy).
2. Include a one-page use-case description with sample conversations and the explicit question: "Is MyAvatar.ge an 'AI Provider' under Meta Terms §4.7 for this use case, and is this use 'incidental or ancillary'?"
3. Optionally, ask through a Meta Business Partner (BSP or Tech Provider) whose partner manager can escalate to Meta policy. For option B, ElevenLabs is the Tech Provider; ask them too.
4. Keep the written answer on file.
5. Launch in stages: start with text support and result delivery. Add calling after confirmation.

---

## 4. Media bridge options (option A)

| Option | WhatsApp path | Gemini Live | Hosting | License | Fit |
|---|---|---|---|---|---|
| **Pipecat** (Daily, open source, Python) | `WhatsAppTransport` / `WhatsAppClient`: handles Meta webhooks, SDP pre_accept/accept and WebRTC via `SmallWebRTCTransport` (aiortc). Docs: https://docs.pipecat.ai/pipecat/features/whatsapp and .../services/transport/whatsapp | Built-in Gemini Live service with tool use (https://docs.pipecat.ai/pipecat/features/gemini-live) | Self-host on GCE. Pipecat Cloud (Daily) is a third vendor, so avoid it under the provider policy. | BSD-2-Clause (from prior knowledge; GitHub API blocked this session) | **Best.** Least code, Graph-API path, no SIP stack. |
| **LiveKit** | WhatsApp **Connector**: "Connectors are available in LiveKit Cloud only. Self-hosted LiveKit servers are not supported." Inbound uses Meta webhooks + `AcceptWhatsAppCall`; outbound uses `DialWhatsAppCall` (https://docs.livekit.io/telephony/connectors/whatsapp/) | Google plugin for Gemini Live; Google lists LiveKit as a Live API partner | LiveKit Cloud: WhatsApp connector **$0.004/min (Ship, from $50/mo)** or $0.003/min (Scale, from $500/mo) (https://livekit.com/pricing). Self-hosted LiveKit SIP ↔ Meta SIP (TLS + digest + SDES/DTLS) is **UNCONFIRMED**. | Apache-2.0 (prior knowledge) | Good tech, but adds a paid third vendor. |
| **Jambonz** | SIP: "We use the SIP integration from WhatsApp (not the graph API) and we recommend using SDES". It has a predefined WhatsApp carrier (TLS/SRTP to `wa.meta.vc:5061`). Self-hosted needs v10.0.4+ and `JAMBONES_ACCEPT_AND_TRANSCODE: 'opus/16000'` (https://docs.jambonz.org/tutorials/telephony-integrations/whats-app) | `llm` verb with `vendor: 'google'` drives Gemini Live natively | Self-host means several components (SBC, feature server, DB, Redis). jambonz.cloud is a third vendor. | MIT (prior knowledge) | Solid if you want SIP; heavier operations. |
| **Asterisk / FreeSWITCH** | Meta SIP guide plus Asterisk example; FreeSWITCH `mod_sofia` sample | No native Gemini Live; needs a media fork (Asterisk AudioSocket / External Media, FreeSWITCH audio-stream module) plus a custom WebSocket bridge | Self-host | GPLv2 / MPL-1.1 (prior knowledge) | Most work; only if you already run one. |
| Custom (Go Pion / Node) | Implement Graph-API signalling + WebRTC yourself | Direct WebSocket to Live API | Self-host | n/a | Maximum control, most effort. |

**Hosting (Google Cloud):**
- **Cloud Run.** Inbound is HTTP(S), gRPC or WebSocket on one port only. There is **no inbound UDP and no SIP/TLS listener**, so SIP is impossible there.
  - Cloud Run egress is "transport layer 4 (TCP and UDP)" (https://docs.cloud.google.com/run/docs/securing/security). Meta is ICE-lite and we are the controlling side, so an outbound-initiated WebRTC leg *might* work.
  - Against that: request-scoped instances, CPU throttling, no stable IP and calls up to 30+ minutes. **Not recommended; UNCONFIRMED.**
  - Keep the HTTPS webhook and messaging handler wherever the app runs today.
- **Compute Engine (recommended).** One small VM with a static IP and UDP firewall rules for the media ports.
  - **e2-small (2 shared vCPU, 2 GB):**

    | Region | USD per month (on demand) |
    |---|---|
    | us-central1 | 12.23 |
    | europe-west3 (Frankfurt) | 15.76 |
    | europe-central2 (Warsaw) | 14.80 |
    | me-west1 (Tel Aviv) | 13.45 |

    Source: gcloud-compute.com, third-party, read 2026-10-10.
  - e2-medium is about 2× those prices (derived).
  - A static IPv4 adds about $3.65/month (UNCONFIRMED).
  - Plenty for 1–5 concurrent calls (1,000 min/month is about 1–2 concurrent at peak).
  - Pick an EU or Middle East region near Georgia.
- **GKE.** Overkill at this volume. UDP media needs hostNetwork or dedicated node IPs.

**Audio formats in the bridge:**
- WhatsApp side: Opus (RTP clock 48 kHz, mono). PCMA/PCMU are possible but Meta then transcodes and quality drops to narrowband.
- Gemini input: "raw 16-bit PCM audio, 16kHz, little-endian".
- Gemini output: "Audio output always uses a sample rate of 24kHz".
- Pipeline: Opus decode → resample 48k→16k → Live. Live 24k → resample to 48k → Opus encode.
- Bandwidth: about 60 kbps per call to Meta.
- To Google over WebSocket: about 256 kbps up and 384 kbps down raw PCM (more with base64). Even at internet-egress rates that is well under $1 per 1,000 minutes (UNCONFIRMED whether egress to Google APIs is billed at all).

**Messages (non-call) in A.** The webhook handler on our server:
- downloads the media (URL valid 5 min)
- sends text, voice notes, MP3, photos, video and PDFs to Gemini `generateContent` (multimodal)
- calls our task engine with the same tools as Live
- replies via `POST /messages`

Voice-note replies use Gemini TTS, then OGG/Opus mono. No ElevenLabs is needed.

---

## 5. Gemini Live API

Sources:
- ai.google.dev live-guide ("2026-09-18"), live-session ("2026-09-15"), live-tools ("2026-09-15"), live-api/capabilities ("2026-09-18")
- models/gemini-3.8-live ("2026-09-15"); models page ("2026-10-09")
- Gemini API pricing page
- Vertex: https://cloud.google.com/vertex-ai/generative-ai/pricing (no date)
- Vertex: docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api and .../configure-language-voice ("2026-10-07")
- Repo: `lib/ai/google/models.ts`, `app/api/voice/live/route.ts`, `lib/voice/geminiLive.ts`

| Topic | Finding | Status |
|---|---|---|
| Models | Gemini API: `gemini-3.8-live` and `gemini-3.8-live-extended-thinking` (native audio). `gemini-3.1-flash-live-preview` is legacy. `gemini-2.5-flash-native-audio-preview-12-2025` is still served to prior users. The app uses `gemini-2.5-flash-native-audio-latest` by default (allowlist includes `gemini-3.8-live`). Vertex: `gemini-3.8-live` (GA, recommended), `gemini-live-2.5-flash-native-audio` (GA). | CONFIRMED |
| Georgian | Gemini API: "Live API supports the following 99 languages", and Georgian `ka` is listed. Native-audio models pick the language automatically (no explicit code). **Vertex** configure-language-voice lists **24 languages without Georgian** (ru-RU, uk-UA and tr-TR are included). The Cloud blog (2026-09-24) says 3.8 Live "understands and speaks 97 languages". The repo's probe **verified Georgian** on `gemini-2.5-flash-native-audio-latest` via the Gemini API on 2026-09-30. | CONFIRMED on Gemini API 2.5 native audio. 3.8 Live Georgian quality UNCONFIRMED. Vertex Georgian UNCONFIRMED. |
| Session limits | "Without compression, audio-only sessions are limited to 15 minutes" (audio+video: 2 min). Connection lifetime is about 10 min, with GoAway(`timeLeft`) before reset. Resumption tokens are "valid for 2 hr after the last sessions termination". `contextWindowCompression` uses a sliding window; the default trigger is 80% of the window. Context window: 3.8 Live has 131,072 input tokens. | CONFIRMED |
| Function calling | No automatic tool responses: our bridge executes and replies. 3.8 Live: async function calling "Supported (default)", BLOCKING also available; scheduling INTERRUPT / WHEN_IDLE / SILENT. 3.8 Extended Thinking: async only. 3.1 Flash Live: sequential only. Async support on 2.5 native audio is **UNCONFIRMED**. | CONFIRMED |
| Barge-in | "When VAD detects an interruption, the ongoing generation is canceled and discarded." Vertex: VAD barge-in also discards pending function calls. The bridge must flush queued outbound audio on `interrupted`. | CONFIRMED |
| Pricing (paid, per 1M tokens) | 3.8 Live / 3.1 Flash Live: input text $0.75, **audio $3.00** (about $0.0045/min), image/video $1.00; output text $4.50, **audio $12.00** (about $0.018/min). 2.5 native audio: text $0.50 in / $2.00 out, audio $3 / $12. The free tier is free of charge, but its data may be used by Google, so it is not allowed for WhatsApp data (§3.3). | CONFIRMED |
| 25 tokens/s | Vertex: "Audio: 25 tokens /second of audio." | CONFIRMED |
| Context re-billing | See the Vertex quotes below this table. Vertex also says: "Proactive Audio Mode: When enabled, input tokens are charged while LiveAPI is listening." | CONFIRMED on Vertex. Same mechanism on the Gemini API is likely but **UNCONFIRMED**; measure `usageMetadata.promptTokenCount` per turn. |
| Latency | Google claims "ultra-low latency audio-to-audio interactions" and gives no number. | No figure published |

Vertex pricing on context re-billing, verbatim:

> "**Session Context Window:** tokens consumption is calculated per turn (defined as one user input and the model's corresponding response). Users are charged for all tokens present in the Session Context Window during that turn."

> "**Tokens accumulation:** The context window includes new tokens for the current turn plus all accumulated tokens from previous turns. Tokens from past turns are re-processed and billed in every new turn, up to the configured context window size limit."

**Cost per call, Gemini Live only.**

Assumptions:
- User speaks 50%, agent 40%, silence 10%.
- 25 tokens per second.
- Audio in $3/M, audio out $12/M.
- Re-billing: 20-second turns (10 s user + 8 s agent, so 450 audio tokens added to context per turn), with prior context re-billed at the audio-input rate.
- A 3,000-token system prompt plus tools, re-billed each turn at $0.75/M.

| Call | Base (no re-billing) | + Re-billing, no cap (default trigger 80% of window, never reached) | + Re-billing, sliding window trigger 8k / target 4k |
|---|---|---|---|
| 5 min (15 turns) | **$0.047** | $0.047 + $0.142 + $0.034 = **$0.223** | $0.223 (context stays under 8k) |
| 15 min (45 turns) | **$0.142** | $0.142 + $1.337 + $0.101 = **$1.579** | $0.142 + $0.676 + $0.101 = **$0.920** |
| 30 min (90 turns) | **$0.284** | $0.284 + $5.407 + $0.203 = **$5.893** | $0.284 + $1.459 + $0.203 = **$1.946** |

Re-billed tokens grow roughly as 11.25 × T² / L, where T is the call length in seconds and L the turn length. Shorter turns cost more. The app's current `contextWindowCompression: {slidingWindow: {}}` uses default thresholds, so it **does not cap cost** for calls under about 1.5 hours.

**Action:** set explicit `triggerTokens` / `targetTokens` for the phone bridge, for example 8k / 4k. Then measure real `usageMetadata` on 5, 15 and 30-minute test calls.

---

## 6. ElevenLabs Agents (option B)

Sources:
- https://elevenlabs.io/docs/eleven-agents/whatsapp (+ /troubleshooting)
- https://elevenlabs.io/pricing/agents
- https://help.elevenlabs.io/hc/en-us/articles/29298065878929
- .../customization/llm
- /docs/overview/models
- /docs/overview/capabilities/speech-to-text
- .../voice/expressive-mode
- .../voice/customization/language
- .../privacy/retention (search excerpt)

No page dates are shown.

| Topic | Finding | Status |
|---|---|---|
| WhatsApp integration | Import the WABA through Meta authorization; "ElevenLabs acts as the **Tech Provider**". The agent handles "Message conversations — text, voice notes, media, and interactive messages" and "Calls — inbound and outbound". Inbound types: text, audio (transcribed; replies by voice note by default), image, document, sticker, location, contact. During a call, texts are folded into the conversation. Outbound uses templates and permission-requested calls. | CONFIRMED |
| Gaps vs the brief | "**Video messages** — inbound videos are not passed to the agent". No WhatsApp Flows. No message batching. Human handoff is "coming soon". "Numbers managed by another provider" cannot be imported. "WABAs created under a developer app" cannot be imported through the standard flow. | CONFIRMED |
| Hybrid option | "If you run your own WhatsApp app on the same account … you can already configure ElevenLabs to handle calls only: turn off the Enable messaging switch". So our server could handle messages while ElevenLabs takes calls. Webhook co-delivery details are **UNCONFIRMED**. | CONFIRMED (feature); details UNCONFIRMED |
| Georgian TTS | `eleven_v4`, `eleven_v4_turbo` (90+ languages, "Georgian (kat)"), `eleven_v3`, `eleven_v3_conversational` (70+, "Georgian (kat)"). **Not** `eleven_multilingual_v2` (29) or `eleven_flash_v2_5` (32). | CONFIRMED |
| Georgian STT | Scribe v2 / v2 Realtime list Georgian (kat) under "**High Accuracy (>5% to ≤10% WER)**". | CONFIRMED |
| Georgian as an agent language | The agent language doc says "Additional languages switch the agent to use the v2.5 Multilingual model" and "All" means 31 languages, which suggests the Flash set without Georgian. Expressive mode / v3 Conversational and `eleven_v4_turbo` are selectable as the agent TTS model. | **UNCONFIRMED.** Live test needed. |
| Gemini as LLM | Natively selectable: Gemini 3.8, 3.7, 3.6, 3.5 Flash, 3.5 Flash-Lite, 3.1 Pro Preview, 3.1 Flash Lite, 3 Flash Preview, 2.5 Flash, 2.5 Flash Lite. Billing: "ElevenLabs passes through third-party LLM costs at the provider's published rate, with no markup. Select Gemini and Claude models are aligned with Vertex AI regional (non-global) pricing … a 10% increase". The pricing calculator shows Gemini 2.5 Flash at **$0.0029/min**. A "Custom LLM" endpoint is also possible: our server proxies Gemini on our own key and Google bills us directly. | CONFIRMED |
| Billing | Call minutes **$0.08/min** on every plan, with "a 95% discount for periods of silence longer than 10 seconds". Text messages **$0.003 each**. LLM on top. Voice notes add STT + TTS "Pricing is the same as in the STT and TTS APIs". Burst pricing is 2× ($0.16) above concurrency, up to 3× concurrency (max 300). Meta bills its own fees separately. | CONFIRMED |
| Plans (monthly) | See the plan table below this table. Starter does not list "Additional Minutes". | CONFIRMED |
| Server tools | Webhook (server) tools call our HTTPS endpoints with configured auth headers and secrets. `{{system__caller_id}}` is the WhatsApp user ID and `{{system__called_number}}` is the phone-number ID. A conversation-initiation webhook can fetch user context from our server. Timeout and async specifics were **not captured**. | CONFIRMED (mechanism) |
| Latency | ElevenLabs: "End-to-end time to first audio below 700 ms is a good target". Model latencies "excluding application & network latency": v4 Turbo about 100 ms, Flash about 75 ms, v3 Conversational about 280 ms, Scribe v2 Realtime about 150 ms. | Claims only |
| Concurrency | Per plan: 4, 6, 10, 20, 30, 40 concurrent calls; Enterprise elevated. | CONFIRMED |
| Retention | "By default, ElevenLabs retains conversation data for 2 years", configurable in days. **Zero-Retention Mode**: "inbound messages are ignored and outbound calls are disallowed" on WhatsApp. EU data residency is Enterprise-only. Hosting is US by default. | CONFIRMED |
| Training on data | Whether ElevenLabs uses customer conversation data to improve models (relevant to §4.7) was not checked. | UNCONFIRMED |

Plans (monthly):

| Plan | USD per month | Included call minutes | Concurrent calls |
|---|---|---|---|
| Free | 0 | 15 | 4 |
| Starter | 6 | 75 | 6 |
| Creator | 22 | 275 | 10 |
| Pro | 99 | 1,238 | 20 |
| Scale | 299 | 3,738 | 30 |
| Business | 990 | 12,375 | 40 |
| Enterprise | custom | custom | elevated |

---

## 7. Latency, quality and reconnect behaviour

**Engineering estimates. UNCONFIRMED; measure before launch.**

| Segment | A: Meta → our VM → Gemini Live | B: Meta → ElevenLabs |
|---|---|---|
| Network | Phone ↔ Meta edge ↔ VM in Frankfurt, Warsaw or Tel Aviv: about 30–80 ms one way from Georgia. VM ↔ Gemini endpoint: Gemini API region not selectable; Vertex is regional. | Phone ↔ Meta ↔ ElevenLabs (US by default; EU only on Enterprise): likely more RTT. |
| Codec / resample | Opus 20 ms frames plus jitter buffer (about 40–60 ms); resampling under 5 ms. | Handled inside ElevenLabs. |
| AI turn | Native audio-to-audio: one model, no separate STT/TTS hops. End-of-speech VAD wait plus time-to-first-audio is typically sub-second (no Google figure). | Cascaded: VAD/turn-taking + Scribe Realtime (about 150 ms) + Gemini Flash time-to-first-token + TTS (about 100–280 ms). ElevenLabs target is under 700 ms. |
| Estimate to first audio | About 0.7–1.2 s | About 0.8–1.5 s |

**Quality:**
- WhatsApp Opus is wideband, much better than 8 kHz PSTN.
- Gemini output at 24 kHz is resampled to 48 kHz Opus.
- Avoid PCMU/PCMA: Meta would transcode to narrowband.
- Georgian quality depends on the model. 2.5 native audio is verified in-app; test 3.8 Live and ElevenLabs v4 Turbo / v3 Conversational.

**Reconnects and interruptions:**
- **Meta leg.** No re-INVITE and no SDP re-negotiation on the business side. A bridge restart drops the call. The consumer app retries on network changes, and ICE must keep working.
  - Run the bridge as a long-lived process.
  - Drain it before deploys.
- **Gemini leg.**
  - The connection resets about every 10 minutes (GoAway). Reconnect with the resumption handle, valid 2 h.
  - Buffer and pause outbound audio during the swap (expect a gap of a few hundred ms).
  - Enable compression, or audio sessions die at 15 minutes.
- **Barge-in.** On Gemini `interrupted`, flush the bridge's outbound audio queue immediately. Pending function calls may be discarded, so tools must be idempotent and confirmed by our task engine (approval and billing).
- **Long tasks** such as video generation:
  - Use async (non-blocking) function calls on 3.8 Live: the agent says "I've started it" and the result is delivered later as a WhatsApp message.
  - Inside 24 h it is a service message. After that it is a utility template.

---

## 8. Cost table

Assumptions:
- User speaks 50% and the agent 40%.
- Meta user-initiated calls cost $0; business-initiated calls to GE cost $0.0095/min (list tier).
- A's bridge is an e2-small in europe-west3 plus a static IP, about **$19.41/month**, or **$0.0194/min at 1,000 min/month**.
- B uses the Creator plan: $22 + $0.08/min beyond 275 min.
- B's LLM is Gemini 2.5 Flash at $0.0029/min, the ElevenLabs estimate.

### 8.1 Per call (USD)

| Call length | A: Gemini, no re-billing | A: Gemini, full re-billing (default compression) | A: Gemini, re-billing capped 8k/4k | A: bridge share at 1,000 min/mo | **A total (capped)** | **B: ElevenLabs $0.08/min + LLM** | Meta fee if business-initiated (A or B) |
|---|---|---|---|---|---|---|---|
| 5 min | 0.047 | 0.223 | 0.223 | 0.097 | **0.320** | **0.415** | +0.048 |
| 15 min | 0.142 | 1.579 | 0.920 | 0.291 | **1.211** | **1.244** | +0.143 |
| 30 min | 0.284 | 5.893 | 1.946 | 0.582 | **2.528** | **2.487** | +0.285 |

### 8.2 Per month at 1,000 call-minutes (USD)

All calls in a scenario have the same length.

| Scenario | A, no re-billing (lower bound) | A, full re-billing | A, capped 8k/4k | B (Creator) | + Meta if all business-initiated |
|---|---|---|---|---|---|
| 200 × 5-min | 28.86 | 63.96 | 63.96 | 82.90 | +9.50 |
| 67 × 15-min | 28.86 | 124.71 | 80.70 | 82.90 | +9.50 |
| 33 × 30-min | 28.86 | 215.83 | 84.26 | 82.90 | +9.50 |

Costs outside the call:
- **Messages** (both options): Meta service messages are free for the first 1,000 per number per month, then $0.0212 each. Utility templates (for example "your video is ready" after 24 h) cost $0.0212 each.
- **B adds** $0.003 per text message and voice-note STT/TTS at ElevenLabs API prices.
- **A adds** Gemini `generateContent` and TTS token costs per message, which are small.

Reading the table:
- A wins clearly for short calls.
- For long calls, A only stays at or below B if the compression window is tight. Turn length and the system-prompt size move the result.
- The bridge VM is a fixed cost. At 5,000 min/month its share drops to $0.004/min.

Calculator: `scratchpad/wa_cost.py`.

---

## A vs B comparison

| Criterion | A: Calling API → own bridge → Gemini Live | B: ElevenLabs Agents WhatsApp |
|---|---|---|
| Reuses the existing Gemini Live agent (prompt, tools, voice) | **Yes**, same model and setup as the browser | No. Rebuild as an ElevenLabs agent (cascaded STT → Gemini text → TTS); a different voice and stack |
| Provider policy (Google + ElevenLabs only) | Yes (Pipecat self-hosted is our code) | Yes |
| Georgian | Verified on 2.5 native audio (Gemini API); 3.8 Live and Vertex UNCONFIRMED | STT and TTS support Georgian; agent-level Georgian UNCONFIRMED |
| Text, voice notes, photos, MP3, documents | Our webhook handler + Gemini multimodal (all types) | Supported, except **video** (not passed to the agent) |
| Video messages | Yes (Gemini video input; WhatsApp video up to 16 MB) | **No** |
| Calls in / out | Yes / yes (permission flow) | Yes / yes |
| Tool calls to our task engine | Function calls handled in our bridge, direct to the task engine | Webhook server tools, from ElevenLabs servers to our API |
| Build effort | Medium: bridge VM, WebRTC, resampling, resumption, barge-in flush, ops | Low: dashboard import, prompt and tools |
| Ops risk | We own media, ICE and uptime; no SDP renegotiation | Managed; but a number can have only one provider; no ZRM on WhatsApp |
| Cost: 5 / 15 / 30 min call | $0.32 / $1.21 / $2.53 (capped; less at higher volume) | $0.41 / $1.24 / $2.49 |
| Data and training clause (§4.7) | Paid Gemini tier only | Check ElevenLabs data-use terms (UNCONFIRMED) |
| Latency (estimate) | About 0.7–1.2 s, single native-audio hop, EU VM | About 0.8–1.5 s, cascaded, US-hosted by default |
| Recommendation | **Preferred** if calls are short or compression is tuned, and video and own-stack reuse matter | Fast pilot or fallback; consider the **hybrid**: our app for messages, ElevenLabs for calls only |

---

## UNCONFIRMED items (verify before committing)

1. **Policy.** Whether Meta treats MyAvatar.ge's Agent G on WhatsApp as an "AI Provider" under §4.7. Needs written confirmation from Meta (§3.3).
2. The Meta Commerce Policy (referenced by the Business Messaging Policy) was not read.
3. Gemini **3.8 Live** Georgian quality. Vertex Live lists 24 languages without Georgian. Only `gemini-2.5-flash-native-audio-latest` on the Gemini API is verified, from the repo probe on 2026-09-30.
4. Whether the Vertex-documented **context re-billing** applies identically on the Gemini API. Real per-turn `usageMetadata`, real turn lengths and system-prompt size are needed (the 3,000-token prompt and 20-second turns are assumptions).
5. Async (non-blocking) function calling on `gemini-2.5-flash-native-audio-latest`. It is confirmed for 3.8 Live only.
6. Gemini Live concurrent-session limits for our project tier (rate-limit page not checked).
7. Cloud Run viability for an outbound-initiated WebRTC leg. Not recommended and untested.
8. Static IPv4 price (about $3.65/month) and whether egress to Google APIs is billed.
9. Bridge licences (Pipecat BSD-2-Clause, LiveKit Apache-2.0, Jambonz MIT, Asterisk GPLv2, FreeSWITCH MPL-1.1) are from prior knowledge; the GitHub API was blocked this session.
10. Whether self-hosted LiveKit SIP interoperates with Meta SIP (TLS, digest, SDES or DTLS).
11. ElevenLabs:
    - Georgian selectable as the **agent** language end to end (v4 Turbo / v3 Conversational + Scribe)
    - data-use / training terms
    - per-minute LLM cost for Gemini 3.x Flash
    - server-tool timeout and async behaviour
    - webhook co-delivery in the "calls only" hybrid
12. Whether App Review or Advanced access is needed for a direct (non-BSP) own-WABA setup.
13. Specific written AI-policy guidance from Infobip, 360dialog, Bird or Vonage (none found).
14. All latency figures in §7 are estimates.
15. Meta media-edge locations relevant to Georgia.

---

## Sources (all read 2026-10-10)

**Meta**
- Calling overview: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling (Updated Jun 26, 2026)
- Calling FAQ, SIP, call settings, user-initiated calls: .../calling/faq, .../calling/sip, .../calling/call-settings, .../calling/user-initiated-calls (dates not shown or captured)
- User call permissions: .../calling/user-call-permissions (Updated Jun 26, 2026)
- Calling pricing: .../calling/pricing (Updated Sep 11, 2026), with the USD calling rate-card PDF effective Oct 1, 2026
- Messaging pricing: .../whatsapp/pricing (Updated Sep 30, 2026), with the USD message rate-card PDF effective Oct 1, 2026
- AI Providers: .../whatsapp/pricing/ai-providers (Updated Sep 1, 2026)
- Messaging limits: .../whatsapp/messaging-limits (no date shown)
- Support and country restrictions: .../whatsapp/support (no date shown)
- Media: .../business-phone-numbers/media (no date shown)
- Phone numbers: .../business-phone-numbers/phone-numbers (no date shown)
- Meta Terms for WhatsApp Business Platform: https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform (Last Modified Sep 23, 2026)
- WhatsApp Business Messaging Policy: https://whatsappbusiness.com/policy/ (Last updated Sep 23, 2026)

**Secondary and BSP**
- TechCrunch: https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform/ (updated 2026-01-15)
- respond.io: https://respond.io/blog/whatsapp-general-purpose-chatbots-ban
- Serviceform: https://www.serviceform.com/blog/whatsapp-ai-chatbots-in-2026/
- Alibaba Cloud ChatApp guide (Last updated May 27, 2026)

**Google**
- ai.google.dev Live docs:
  - https://ai.google.dev/gemini-api/docs/live-guide (2026-09-18)
  - live-session (2026-09-15)
  - live-tools (2026-09-15)
  - live-api/capabilities (2026-09-18)
  - models/gemini-3.8-live (2026-09-15)
  - models (2026-10-09)
  - pricing
- Vertex pricing: https://cloud.google.com/vertex-ai/generative-ai/pricing
- Vertex Live docs: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api and .../live-api/configure-language-voice (2026-10-07)
- Google Cloud blog on 3.8 Live (2026-09-24)
- Cloud Run security: https://docs.cloud.google.com/run/docs/securing/security
- GCE prices via https://gcloud-compute.com/e2-small.html (third-party)

**ElevenLabs** (no page dates shown)
- https://elevenlabs.io/docs/eleven-agents/whatsapp
- .../whatsapp/troubleshooting
- https://elevenlabs.io/pricing/agents
- https://help.elevenlabs.io/hc/en-us/articles/29298065878929-How-much-does-ElevenAgents-cost
- https://elevenlabs.io/docs/eleven-agents/customization/llm
- https://elevenlabs.io/docs/overview/models
- https://elevenlabs.io/docs/overview/capabilities/speech-to-text
- .../customization/voice/expressive-mode
- .../customization/voice/customization/language
- .../customization/privacy/retention
- https://elevenlabs.io/blog/enhancing-conversational-ai-latency-with-efficient-tts-pipelines

**Bridges**
- Pipecat: https://docs.pipecat.ai/pipecat/features/whatsapp, https://docs.pipecat.ai/api-reference/server/services/transport/whatsapp, https://docs.pipecat.ai/pipecat/features/gemini-live
- LiveKit: https://docs.livekit.io/telephony/connectors/whatsapp/, https://livekit.com/pricing
- Jambonz: https://docs.jambonz.org/tutorials/telephony-integrations/whats-app, https://docs.jambonz.org/verbs/verbs/llm

**Repo** (read only, not modified)
- `lib/ai/google/models.ts` (DEFAULT_LIVE_MODEL = `gemini-2.5-flash-native-audio-latest`)
- `app/api/voice/live/route.ts` (Georgian verification note, 2026-09-30)
- `lib/voice/geminiLive.ts` (compression defaults: "trigger at 80% of the window")
