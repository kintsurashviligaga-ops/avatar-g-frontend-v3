# Agent G phone, SMS, WhatsApp and Telegram feasibility for Georgia (+995)

- Prepared: 2026-10-10. Every source below was read on **2026-10-10** unless a row says otherwise.
- Scope: MyAvatar.ge "Agent G". The AI provider policy is Google (Gemini) plus ElevenLabs only. Carriers and aggregators are treated as transport.
- Method: I read public vendor docs and pricing pages only. I made no sign-ups, purchases, paid API calls or contact with anyone.
- Legend:
  - **CONFIRMED**: stated on the vendor's or regulator's own page on the date read.
  - **UNCONFIRMED**: not found on an official page. This covers secondary sources, inferences, or text the page did not contain.
- Prices are in USD unless marked GEL. "$" on Twilio pages is shown without a currency code; it is assumed to be USD (en-us site).

---

## TL;DR

1. **Twilio sells no Georgian numbers.** It has no Georgian voice numbers, no long or short codes for SMS, and two-way SMS is "No". Twilio can only **call out** to Georgia, at **$0.3662/min to landlines and $0.4727/min to mobiles**, and **send one-way SMS** at **$0.1684 per segment**. Both are expensive.
2. **ElevenLabs Agents** work with Twilio (import a number) or any SIP trunk:
   - Outbound calls: `POST /v1/convai/twilio/outbound-call` or `POST /v1/convai/sip-trunk/outbound-call`.
   - Price: **$0.08/min** on every plan, with Gemini LLM usage billed on top.
   - Webhook (server) tools can call our task API.
   - **ElevenLabs sells no numbers.** You import them from Twilio, Exotel or a SIP trunk.
   - Georgian (`kat`) is listed for the default agent TTS model `eleven_v4_turbo` and for Scribe STT. The agent language docs are inconsistent, so Georgian end-to-end in an agent still needs a live test (**UNCONFIRMED**).
3. **ElevenLabs has a native WhatsApp integration** covering text, voice notes, **inbound WhatsApp voice calls** and outbound calls once the user grants permission. In Meta's pricing, user-initiated WhatsApp calls are **free**. Business-initiated calls to Georgia cost **$0.0095/min** (Meta fee shown on Twilio's page). This is the cheapest voice path by far. It is gated by Meta's Calling API prerequisites: a messaging limit of at least 2,000 and permission requests capped at 1 per day / 2 per week per user.
4. **SMS notifications:** local Georgian aggregators cost about **0.003 to 0.03 GEL per SMS**, against Twilio's $0.1684. Examples: ubill.ge from 0.01 GEL, sender.ge 0.025 GEL incl. VAT, smsoffice.ge 0.03 GEL in a 5,000 pack. All three have HTTP APIs and alphanumeric sender names (11 characters or fewer). **None of them documents inbound or two-way SMS.**
5. **Inbound Georgian phone number:** DIDWW (an international DID carrier) lists **Tbilisi +995 32, national +995 706 and toll-free +995 800** numbers that take inbound calls. You need a "Georgia Registration Form", and SMS is not supported. These could reach ElevenLabs over SIP. Prices are not public (**UNCONFIRMED**). Magti and Silknet publish no SIP-trunk offer (**UNCONFIRMED**).
6. **WhatsApp pricing changed on 2026-10-01.** Service (free-form) messages are now billed after **1,000 free per business number per month**. Utility templates sent inside the 24-hour window are **now billed** too. The brief's premise that "service is free within 24h" is **out of date**. Georgia stays in the "Rest of Central & Eastern Europe" band.
7. **Telegram bots cannot place calls.** `phone.requestCall` says "Only users can use this method", and the Bot API has no call methods. Bot file limits:
   - Send up to **50 MB**; download up to **20 MB** via `getFile`.
   - A **local Bot API server** raises these to 2,000 MB upload and unlimited download.
   - Deep-link `start` payload: **at most 64 characters, `A-Z a-z 0-9 _ -`**.
8. **Gemini Live (Vertex):** audio input costs $3.00 per 1M tokens and audio output $12.00 per 1M tokens, at 25 tokens/s. That works out to about **$0.0045/min heard and $0.018/min spoken**. Bridging to the phone network through Twilio Media Streams ($0.0044/min) is feasible: Google lists Twilio as a Live API partner, and Georgian (`ka`) is in the Live API language list. The phone leg still pays Twilio's Georgian rates.

---

## 1. Twilio in Georgia (GE)

| # | Fact | Source (read 2026-10-10) | Status |
|---|---|---|---|
| 1.1 | **No Georgian voice numbers.** The page says: "Although we don't have voice enabled numbers in this locale, you can use numbers from over 90 other locales to make and receive calls." International numbers start at $1.15/mo. | https://www.twilio.com/en-us/voice/pricing/ge | CONFIRMED |
| 1.2 | **No Georgian SMS numbers.** Domestic long code, international long code and short code are all "Not Supported" (operator and Twilio). | https://www.twilio.com/en-us/guidelines/ge/sms | CONFIRMED |
| 1.3 | **Two-way SMS supported: "No".** Number portability: Yes. SMS to landlines is rejected with error 21614 and not charged. MMS is converted to SMS with a URL. | https://www.twilio.com/en-us/guidelines/ge/sms | CONFIRMED |
| 1.4 | **Alphanumeric sender ID:** dynamic sender ID is "Supported" by operators and Twilio. Pre-registration, sender ID preservation, provisioning time and use-case restrictions all show "---" (not stated). | https://www.twilio.com/en-us/guidelines/ge/sms | CONFIRMED (dynamic); pre-registration need UNCONFIRMED |
| 1.5 | **Regulatory/address requirements for GE numbers:** not applicable, because Twilio has none. Georgia is **absent** from Twilio's regulatory index and voice guidelines index, and `/guidelines/ge/voice` returns 404. | https://www.twilio.com/en-us/guidelines/regulatory ; https://www.twilio.com/en-us/guidelines/voice ; https://www.twilio.com/en-us/guidelines/ge/voice (404) | CONFIRMED (absence) |
| 1.6 | **Outbound voice to Georgia:** "Georgia" (landline) **$0.3662/min**, "Georgia - Abkhazia" $0.3662/min, "Georgia - Mobile" **$0.4727/min**. | https://www.twilio.com/en-us/voice/pricing/ge | CONFIRMED |
| 1.7 | **Inbound per-minute on a number:** there are no GE numbers, so the rate depends on the foreign number used. US local: $0.0085/min plus $1.15/mo; US toll-free: $0.0220/min plus $2.15/mo. UK local: $0.0100/min plus $3.50/mo; UK toll-free: $0.0798/min plus $2.70/mo. Georgian callers would also pay their own operator's international rate (not checked). | https://www.twilio.com/en-us/voice/pricing/us ; https://www.twilio.com/en-us/voice/pricing/gb | CONFIRMED (Twilio side); caller-side cost UNCONFIRMED |
| 1.8 | **SIP interface / BYOC trunking:** $0.0040/min each way. Media Streams $0.0044/min. ConversationRelay $0.07/min. Answering machine detection $0.0075/call. First 1 CPS is free; up to 30 CPS can be provisioned in the console. | https://www.twilio.com/en-us/voice/pricing/ge | CONFIRMED |
| 1.9 | **Caller ID on outbound calls:** `From` "must be a Twilio number or a Verified outgoing caller id for your account". So either a foreign Twilio number or our own **verified Georgian number** (for example a Magti mobile). Alphanumeric voice caller ID is not documented. With no GE voice guidelines page, CLI preservation on Georgian networks is unknown. | https://www.twilio.com/docs/voice/api/call-resource | CONFIRMED (rule); alphanumeric and CLI delivery in GE UNCONFIRMED |
| 1.10 | **SMS to Georgia:** **$0.1684 per segment** for both international numbers and alphanumeric sender IDs. Alphanumeric sender ID costs nothing to set up. Failed-message fee $0.001. "Additional carrier fees may apply". No per-operator split is shown. | https://www.twilio.com/en-us/sms/pricing/ge | CONFIRMED |
| 1.11 | **Two-way SMS on a Georgian number:** **not possible** with Twilio (see 1.2 and 1.3). Whether a Georgian user's reply can reach a Twilio US or UK long code is not documented. | as above | CONFIRMED (no GE number); cross-border reply UNCONFIRMED |

---

## 2. ElevenLabs Agents (ElevenAgents): telephony, Georgian, price, tools

| # | Fact | Source (read 2026-10-10) | Status |
|---|---|---|---|
| 2.1 | **Native Twilio integration.** Import a Twilio number with Account SID and Auth Token, or an API key SID (`SK...`) and secret. ElevenLabs configures the number automatically. **Purchased Twilio numbers** handle inbound and outbound calls. **Verified caller IDs** handle **outbound only** and cannot be assigned to an agent for inbound. | https://elevenlabs.io/docs/agents-platform/phone-numbers/twilio-integration/native-integration | CONFIRMED |
| 2.2 | **Outbound call via Twilio:** `POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call`. Body requires `agent_id`, `agent_phone_number_id`, `to_number`. Optional: `conversation_initiation_client_data`, `call_recording_enabled`, `telephony_call_config`. Returns `success`, `message`, `conversation_id`, `callSid`. | https://elevenlabs.io/docs/api-reference/twilio/outbound-call | CONFIRMED |
| 2.3 | **SIP trunk:** trunk URI `sip.rtc.elevenlabs.io:5060;transport=tcp`, with TLS recommended (5061, TLS 1.2+). UDP is experimental. Codecs: G.711 8 kHz or G.722 16 kHz. Auth: digest or IP ACL. SRTP can be off, allowed or required. Static IPs (`sip-static.rtc.elevenlabs.io`) are **Enterprise only**. Inbound `X-` headers become dynamic variables. Concurrency is limited by plan. | https://elevenlabs.io/docs/agents-platform/phone-numbers/sip-trunking | CONFIRMED |
| 2.4 | **Outbound call via SIP trunk:** `POST https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call`, with the same required fields. Returns `conversation_id`, `sip_call_id`. Batch calling API: `/batch-calling/*`. | https://elevenlabs.io/docs/api-reference/sip-trunk/outbound-call ; https://elevenlabs.io/docs/eleven-agents/llms.txt | CONFIRMED |
| 2.5 | **ElevenLabs does not sell phone numbers.** The import API accepts providers `twilio`, `exotel`, `sip_trunk`. Pricing FAQ: "You connect your own provider, such as Twilio or a SIP trunk, and that provider bills you directly". Other documented connectors: Telnyx, Plivo, Vonage, Exotel, Genesys. | https://elevenlabs.io/docs/eleven-agents/api-reference/phone-numbers/create.md ; https://elevenlabs.io/pricing/agents | CONFIRMED (bring-your-own); "no ElevenLabs numbers at all" UNCONFIRMED (no page says so outright) |
| 2.6 | **Georgian, TTS:** the agent `model_id` enum includes `eleven_v4_turbo` (**default**), `eleven_v4` and `eleven_v3_conversational`. The models page lists **Georgian (kat)** for Eleven v4, v4 Turbo, v3 and v3 Conversational. Georgian is **not** listed for Flash/Turbo v2.5 or Multilingual v2. `eleven_v3_conversational` was added to agents on 2026-02-09. | https://elevenlabs.io/docs/eleven-agents/api-reference/agents/create.md ; https://elevenlabs.io/docs/overview/models ; https://elevenlabs.io/docs/changelog/2026/2/9 | CONFIRMED (model lists) |
| 2.7 | **Georgian, ASR:** the agent ASR provider enum is `elevenlabs`, `scribe_realtime` (default) and `scribe_v2_turbo`. The Scribe STT page lists **Georgian (kat) in "High Accuracy (>5% to ≤10% WER)"**. That tiering is tied to Scribe v2; whether Scribe v2 Realtime matches it is not stated. | https://elevenlabs.io/docs/overview/capabilities/speech-to-text ; agents/create (above) | CONFIRMED (Scribe v2); Realtime accuracy UNCONFIRMED |
| 2.8 | **Georgian as an agent language:** `agent.language` is a free string ("used for ASR and TTS"). The agent Language doc still says "All" = 31 languages and "v2.5 Multilingual", and does not name Georgian. A marketing page says agents support "70+ languages". **End-to-end Georgian in a phone agent needs a live test.** | https://elevenlabs.io/docs/eleven-agents/customization/voice/customization/language.md ; https://elevenlabs.io/insights/conversational-ai | UNCONFIRMED |
| 2.9 | **Agent pricing (monthly):** each plan includes call minutes and **additional minutes cost $0.08/min on all plans**. Burst calls above the concurrency limit cost $0.16/min. Text messages cost $0.003 each. **LLM usage is billed on top** (calculator shows Gemini 2.5 Flash at $0.0029/min). ElevenLabs adds **no telephony fee**; the carrier bills separately. Plans: see the table below. | https://elevenlabs.io/pricing/agents | CONFIRMED |
| 2.10 | **Server tools / webhooks:** webhook tools call external REST APIs mid-conversation. You set the method, a URL with `{path}` variables, query and body parameters (filled by the LLM or from dynamic variables), and custom headers and secrets. Auth options: OAuth2 client-credentials, OAuth2 JWT, Basic, Bearer (secret header) or custom headers. MCP tools, client tools, system tools (end call, transfer and others) and post-call webhooks also exist. **This means the agent can call our own task API.** Timeouts and limits are not stated. | https://elevenlabs.io/docs/agents-platform/customization/tools/server-tools ; llms.txt index (above) | CONFIRMED (feature); timeouts UNCONFIRMED |
| 2.11 | **SMS conversations:** users text a purchased, SMS-capable Twilio number and the agent replies. Only inbound SMS is documented. Verified caller IDs do not work for SMS. **This is not usable with Georgian numbers via Twilio (see 1.2 and 1.3).** | https://elevenlabs.io/docs/eleven-agents/phone-numbers/twilio-integration/sms-conversations.md | CONFIRMED |
| 2.12 | **WhatsApp integration:** connect a WhatsApp Business Account. The agent handles text, voice notes (transcribed) and interactive messages. It handles **inbound WhatsApp voice calls** to the business number. Outbound uses Meta-approved templates (`POST /v1/convai/whatsapp/outbound-message`). Outbound calls (`POST /v1/convai/whatsapp/outbound-call`) need the user's permission, requested through a template. Voice notes incur STT/TTS charges. Numbers already registered with another provider or active in the WhatsApp Business app cannot be imported. | https://elevenlabs.io/docs/eleven-agents/whatsapp.md ; https://elevenlabs.io/docs/eleven-agents/whatsapp/outbound.md | CONFIRMED |

ElevenAgents plans (monthly billing), from https://elevenlabs.io/pricing/agents (CONFIRMED):

| Plan | Price/mo | Included call minutes | Concurrent calls |
|---|---|---|---|
| Free | $0 | 15 | 4 |
| Starter | $6 (first month $1 promo "until Oct 18") | 75 | 6 |
| Creator | $22 (first month $11) | 275 | 10 |
| Pro | $99 | 1,238 | 20 |
| Scale | $299 | 3,738 | 30 |
| Business | $990 | 12,375 | 40 |

On all plans, additional minutes cost $0.08/min, burst minutes $0.16/min and text messages $0.003 each, with LLM usage billed separately.

---

## 3. Georgian local options (SIP / BYOC, SMS aggregators, GNCC)

| Provider | API | Two-way SMS | Alphanumeric sender | SIP trunk | Published price | How to get an account | Source (read 2026-10-10) | Status |
|---|---|---|---|---|---|---|---|---|
| **ubill.ge** (uBill) | Yes. REST/JSON/XML at `https://api.ubill.dev/v1/sms/send`, with `brandID`, `numbers`, `text`, `otp=true` priority, `sendTime` scheduling, and delivery callbacks `sms.delivery.updated`. | Not documented | Yes. Brand names are created via `brandNameCreate`; a callback fires when the brand is activated. | No | **0.01 GEL/SMS** from 1 SMS; 0.008 at 50k; 0.006 at 100k; 0.004 at 500k; 0.003 at 1M. VAT not stated. | Self sign-up at https://my.ubill.ge/signup | https://ubill.ge/sms-tariffs ; https://ubill.ge/api-docs | CONFIRMED (API, prices); two-way UNCONFIRMED |
| **sender.ge** | Yes. `https://sender.ge/api/send.php?apikey&smsno&destination&content`. `smsno=1` means advertising (with SmsNo), `2` means informational. `priority=1` skips the subscription check. Delivery reports via `callback.php`. Georgian mobile numbers only (9 digits). | Not documented | Yes. Standard names are PROMO, REKLAMA and others; a custom brand name can be ordered. | No | **0.025 GEL/SMS incl. VAT** (1 to 1,999); 0.02 (2k+); 0.015 (5k+); 0.01 (10k+); down to 0.004 (1M+). | Self registration at https://www.sender.ge/index.php?controller=user&action=register | https://sender.ge/docs/api.php ; https://sender.ge/?controller=tariff&action=getTariff | CONFIRMED; two-way UNCONFIRMED |
| **smsoffice.ge** | Yes. `https://smsoffice.ge/api/v2/send/?key&destination&sender&content&urgent`. Status callbacks go to a pre-agreed URL; `getMessageStatus` is also available. | Not documented | Yes. Up to 11 characters `[A-Za-z0-9-.]`, with "unlimited titles free". The sender must be listed and active. | No | Packs incl. VAT: 5,000 = 150 GEL (**0.03**); 10k = 250 (0.025); 50k = 800 (0.016); 150k = 1,300; 500k = 3,000 (0.006); 1M = 5,000 (0.005); 3M = 12,000 (0.004). SMS never expire. Foreign numbers 0.5 GEL (80% delivery) or 1.2 GEL premium. | Self registration at https://smsoffice.ge/register; packs bought by invoice | https://smsoffice.ge/prices ; https://smsoffice.ge/integration | CONFIRMED; two-way UNCONFIRMED |
| **Trust Connect / msg.ge** | Yes. HTTP GET `http://trustconnect.ge/sendsms.php` (`service_id` = sender ID), status via `track.php`. Only `http://` URLs are shown. | Not documented | Sender ID via `service_id`; alphanumeric not stated | Not documented | Not published ("minimum rates") | Contact info@msg.ge, +995 32 214 70 00 (not contacted) | https://trustconnect.ge/en/services/sms-api-service ; https://trustconnect.ge/en/info/http-api-v1-documentation | CONFIRMED (API); rest UNCONFIRMED |
| **MagtiCom** (operator) | A2P SMS ("Bulk SMS and VPN SMS"). API/SMPP is not described on the page. | Not documented | Sender name up to 11 characters. 1 SMS = 160 Latin or **70 Georgian** characters. | No public SIP-trunk offer found | Domestic A2P tariff "by agreement"; international SMS 90 tetri | office@magticom.ge, 11 00 11 (not contacted) | https://www.magticom.ge/ka/A2PSMS | CONFIRMED (page text); API, SIP and two-way UNCONFIRMED |
| **Silknet** (operator) | Business telephony page lists PSTN, Silk Phone OTT and an international line | Not documented | Not documented | **SIP trunk not mentioned** | None published | Contact page (not contacted) | https://silknet.com/ge/business/telephone | UNCONFIRMED (no SIP offer found) |
| **Cellfie** (ex-Beeline/VEON) | Business "SMS portal": group SMS "under the desired name", campaign status, invoice per SMS. API not mentioned. | Not documented | Yes (portal) | Not documented | Not published | Not described | https://cellfie.ge/en/about-us/media/03-07-20 (2020 announcement) | CONFIRMED (portal exists); rest UNCONFIRMED |
| **DIDWW** (international DID carrier, BYOC) | Yes (portal and API) | **SMS not supported** on GE numbers | n/a | **Yes.** Tbilisi **+995 32** and national **+995 706**: inbound calls plus outbound via local SIP trunking. Toll-free **+995 800**: inbound, with outbound only via A-Z trunking. Mobile numbers are not available. | Not public (price list sits behind a contact form; not filled) | Online purchase plus a **"Georgia Registration Form"** for Local, National and Toll-free | https://www.didww.com/phone-numbers/all-phone-numbers/Georgia/Local/Tbilisi/995-32 ; …/National/995-706 ; …/Toll_Free/995-800 ; https://www.didww.com/resources/regulatory-requirements/Georgia | CONFIRMED (capabilities, registration); prices and ElevenLabs interop UNCONFIRMED |

Notes:
- **GNCC numbering.** The regulation "On Approval of Regulation on National Numbering System of Electronic Communications Networks of Georgia" is published at https://comcom.ge/en/regulation/sixshiruli-da-numeraciis-resursi/numbering-resources/the-national-plan-for-numbering-resources. The full text is a `.doc` (https://comcom.ge/uploads/other/1/1170.doc) that my tools could not parse, so its details are **UNCONFIRMED**.
  - Wikipedia, a non-official source, describes a closed 9-digit plan: 32 = Tbilisi, 5XX = mobile, 8XX = toll-free/shared-cost. **UNCONFIRMED.**
  - Who may hold Georgian numbers (licensed operators only, or end users through them) is **UNCONFIRMED**. In practice we would get a number from a Georgian operator or a carrier such as DIDWW.
- **SMS advertising rules.** The Law of Georgia on Advertising (https://matsne.gov.ge/ka/document/view/31840, version of 25/06/2026) has no SMS-specific opt-out article in the text I read. Article 5(8) requires subscriber consent for ads delivered through paid information services. Article 5(9) bans telex and fax ads without prior consent. sender.ge separates "advertising (with SmsNo)" from "informational" traffic, which suggests an operator-level opt-out mechanism. Its legal basis is **UNCONFIRMED**.
  - "Your video is ready" is transactional or informational, so it should go out as informational traffic.
- **Georgian-script SMS** uses 70 characters per segment (Magti page), so long Georgian messages cost 2 or more SMS.

---

## 4. WhatsApp Business Platform (Meta Cloud API)

| # | Fact | Source (read 2026-10-10) | Status |
|---|---|---|---|
| 4.1 | **Per-message pricing since 2025-07-01:** charged per **delivered template message**, by category (marketing, utility, authentication, plus authentication-international in some markets) and by the recipient's calling code. Rates can change only on Jan 1, Apr 1, Jul 1 and Oct 1. | https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing (page "Updated: Sep 30, 2026") | CONFIRMED |
| 4.2 | **Change effective 2026-10-01 (updates the brief's premise):** **service (non-template) messages are now charged**, after a **free tier of 1,000 service messages per business phone number per month**. The tier resets monthly and does not roll over. **Utility templates sent inside an open customer-service window are now charged** (they were free from 2025-07-01 to 2026-09-30). A payment method is required, or Meta stops delivering service messages. | Meta page above; Twilio notice https://help.twilio.com/articles/53100480177819 | CONFIRMED |
| 4.3 | **24-hour customer-service window:** a user message or call opens or refreshes a 24-hour window, and non-template messages can be sent only inside it. **Free-entry-point window:** 72 hours, all messages free, opened from a Click-to-WhatsApp ad or Facebook Page CTA (unchanged). | Meta page above; Twilio notice | CONFIRMED |
| 4.4 | **Georgia's rate band:** +995 maps to **"Rest of Central & Eastern Europe"**. The 2026-10-01 rate-card changes moved Ukraine *out* of that band; Georgia was **not** moved. | Meta page above; https://developers.facebook.com/docs/whatsapp/pricing/ (country table) | CONFIRMED |
| 4.5 | **Rate for "Rest of CEE" (USD per message):** marketing **about $0.0860**; utility, authentication and (since Oct 2026) service **about $0.0212**. These figures come from secondary sites (formbeep.com, flowcall.co, wapikon.com, zernio.com). BSP pages show marked-up figures, for example SleekFlow $0.09890 / $0.02438. Meta's official CSV/PDF rate card links are on the Meta page but sit behind anti-bot protection and could not be read. | Meta page (links only); secondary sources | **UNCONFIRMED** (verify in Meta CSV or WhatsApp Manager) |
| 4.6 | **Utility template approval:** a template must be **non-promotional** and either **specific to or requested by the user** (their order, account or service) or essential. Mixed or unclear content is treated as marketing. Status after validation is APPROVED, PENDING or REJECTED (no SLA stated). Meta can re-categorise to marketing with 1 day's notice, or instantly after a misuse warning. "Your video {{1}} is ready, open {{2}}" fits the order/account-update examples. | https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization | CONFIRMED (rules); approval time UNCONFIRMED |
| 4.7 | **WhatsApp Business Calling API exists.** User-initiated calls are available wherever Cloud API is available. Business-initiated calls are **not available in the US, Canada, Egypt, Vietnam and Nigeria**; Georgia is not excluded. Signaling is Graph API plus webhooks, or **SIP** (needs enablement). | https://developers.facebook.com/documentation/business-messaging/whatsapp/calling | CONFIRMED |
| 4.8 | **Calling API prerequisites and limits:** Cloud API number (not the Business app); **daily messaging limit of at least 2,000 unique recipients**; calling enabled on the number. Production call-permission requests: **1 per day / 2 per week per user**. Up to 100 business-initiated calls per user per day. | same | CONFIRMED |
| 4.9 | **Calling price:** "**All user-initiated calls are free.**" Business-initiated calls are billed in **6-second pulses** by the callee's country and volume tier. Call-permission request messages are billed as messages. For **Georgia** the Meta connectivity fee is **inbound $0.00000/min and outbound $0.00950/min** (Twilio WhatsApp pricing page, "current as of September 2026"). Twilio's own WhatsApp handling fee is $0.005/message if Twilio is used as the BSP. | https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/pricing ; https://www.twilio.com/en-us/whatsapp/pricing | CONFIRMED |
| 4.10 | **AI-provider policy risk:** "AI Providers" (general-purpose AI assistants, LLM providers and similar) may offer **general-purpose AI assistants only where Meta is legally required to permit it**, and they have their own pricing for service messages. Agent G must be positioned as **MyAvatar.ge's own service assistant** (orders, video status, support), not a general chatbot. | https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers | CONFIRMED (policy text); how it applies to Agent G is UNCONFIRMED (needs legal/Meta review) |

---

## 5. Telegram Bot API

| # | Fact | Source (read 2026-10-10) | Status |
|---|---|---|---|
| 5.1 | **Bots cannot place native Telegram voice calls.** MTProto `phone.requestCall` says "**Only users can use this method.**" The Bot API (latest is 10.3, 2026-08-24) has no call methods in the parts I could read. Bots *receiving* calls is not documented anywhere. A user-account "userbot" would be a ToS and policy risk and is not recommended. | https://core.telegram.org/method/phone.requestCall ; https://core.telegram.org/bots/api | CONFIRMED (cannot place); receive UNCONFIRMED (no method exists) |
| 5.2 | **File limits (cloud Bot API):** "Bots can currently send files of any type of up to **50 MB**". `getFile` works "only with files of up to **20 MB**". | https://core.telegram.org/bots/faq | CONFIRMED |
| 5.3 | **Local Bot API server:** "Download files without a size limit", "Upload files up to **2000 MB**", `max_webhook_connections` up to 100,000. | https://core.telegram.org/bots/api (section "Using a Local Bot API Server") | CONFIRMED |
| 5.4 | **sendVoice:** the audio must be ".OGG file encoded with OPUS, or in .MP3 format, or in .M4A format". Voice messages up to 50 MB. **sendAudio:** ".MP3 or .M4A", up to 50 MB. My fetch tool could not reach the method section of the official page, so this text was read on a verbatim mirror (gramio.dev). | https://core.telegram.org/bots/api#sendvoice (official, not fully rendered) ; mirror https://gramio.dev/telegram/methods/sendvoice , https://gramio.dev/telegram/methods/sendaudio | 50 MB CONFIRMED (FAQ); formats UNCONFIRMED on official page |
| 5.5 | **Deep linking:** `https://t.me/<bot>?start=<payload>` delivers `/start <payload>`. "A-Z, a-z, 0-9, _ and - are allowed." "The parameter can be up to **64 characters** long." base64url is recommended for binary data. | https://core.telegram.org/bots/features ; https://core.telegram.org/api/links | CONFIRMED |
| 5.6 | **Rate limits:** avoid more than 1 message per second per chat; broadcasts are capped at "about 30 messages per second" (paid broadcasts can go higher). | https://core.telegram.org/bots/faq | CONFIRMED |

---

## 6. Google option: Gemini Live API (native audio)

| # | Fact | Source (read 2026-10-10) | Status |
|---|---|---|---|
| 6.1 | **Vertex AI (now "Gemini Enterprise Agent Platform") pricing per 1M tokens.** **Gemini 3.8 Live API:** text in $0.75, image/video in $1.00, **audio in $3.00**, text out $4.50, **audio out $12.00**. **Gemini 2.5 Flash Live API:** text in $0.50, image/video in $3.00, **audio in $3.00**, text out $2.00, **audio out $12.00**. Audio is counted at **25 tokens per second**. | https://cloud.google.com/vertex-ai/generative-ai/pricing (redirects to /gemini-enterprise-agent-platform/generative-ai/pricing) | CONFIRMED |
| 6.2 | **Per-minute equivalent:** 25 tok/s × 60 = 1,500 tokens/min. That gives **about $0.0045 per minute of audio in** and **about $0.018 per minute of audio out**. Whether Live bills accumulated session context on every turn was not checked. | derived from 6.1 | Calculation (context billing UNCONFIRMED) |
| 6.3 | **Models:** on Vertex, `gemini-3.8-live` and `gemini-live-2.5-flash-native-audio` are GA. On the Gemini API, `gemini-3.8-live` is the default and `gemini-3.1-flash-live-preview` is legacy. **Languages:** "Live API supports the following 99 languages", including **Georgian (`ka`)**. **Audio:** input is raw 16-bit PCM at 16 kHz; output is 24 kHz. | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api ; https://ai.google.dev/gemini-api/docs/live-api/capabilities | CONFIRMED (Gemini API language list); Vertex language list UNCONFIRMED |
| 6.4 | **Phone bridge feasibility:** Google's Live API page lists **Twilio** (with Daily, LiveKit and Voximplant) as partner integrations. Twilio Media Streams support **bidirectional** audio via `<Connect><Stream>`, with one bidirectional stream per call, at $0.0044/min. A WebSocket bridge converts Twilio μ-law 8 kHz to and from PCM 16 kHz (in) and 24 kHz (out). A Google-authored tutorial covers inbound and outbound calls. **Feasible.** The PSTN leg to Georgia still uses Twilio rates (1.6) and a foreign or verified caller ID (1.9). | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api ; https://www.twilio.com/docs/voice/media-streams ; tutorial https://dev.to/googleai/add-telephony-to-a-gemini-live-agent-with-twilio-1elc (non-official) | CONFIRMED (partner listing, Media Streams); audio-format details UNCONFIRMED (tutorial only) |
| 6.5 | Google STT/TTS alternatives with Georgian: Cloud Speech-to-Text v2 `ka-GE` (chirp, chirp_2, chirp_3); Gemini-TTS `ka-GE` (**Preview**); Gemini 3.8 Flash TTS (130+ languages including Georgian). | https://docs.cloud.google.com/speech-to-text/docs/speech-to-text-supported-languages ; https://docs.cloud.google.com/text-to-speech/docs/gemini-tts ; https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts | CONFIRMED (seen in official search excerpts) |

---

## Comparison table

Assumptions for the per-minute rows: 1 minute of conversation, agent speaking about 50% of the time. GEL is not converted to USD here (no official FX rate was checked).

| Option | Inbound | Outbound | SMS two-way | Georgian speech | Price per minute or message | Account requirements | Status |
|---|---|---|---|---|---|---|---|
| Twilio PSTN plus ElevenLabs native | **No GE number.** Users would have to call a foreign (US/UK) number. | Yes, to GE landline and mobile. Caller ID is a Twilio number or verified caller ID. | **No** (Twilio GE two-way = No) | ElevenLabs v4 Turbo TTS + Scribe (agent-level test needed) | Out to GE mobile: $0.4727 + $0.08 + LLM about $0.003 = **about $0.556/min**. Landline: **about $0.449/min**. | Twilio account; ElevenLabs plan | CONFIRMED (prices); Georgian in agent UNCONFIRMED |
| Twilio Media Streams plus Gemini Live (no ElevenLabs) | Same as above (no GE number) | Yes | No | Gemini Live `ka` | Mobile: $0.4727 + $0.0044 + about $0.0135 (Gemini) = **about $0.49/min** | Twilio, GCP/Vertex, our own bridge service | CONFIRMED (prices); integration effort |
| DIDWW +995 32/706 SIP trunk plus ElevenLabs SIP | **Yes, real Georgian number** | Yes, via DIDWW local SIP trunking | No (SMS not supported) | as ElevenLabs | ElevenLabs $0.08/min + DIDWW (not public) | DIDWW account + Georgia Registration Form; ElevenLabs | Capabilities CONFIRMED; price and interop UNCONFIRMED |
| Magti / Silknet / Cellfie SIP trunk | Possibly | Possibly | Possibly via operator | as ElevenLabs | Not published | Georgian legal entity + contract (assumed) | UNCONFIRMED |
| **WhatsApp via ElevenLabs integration** | **Yes:** users call the WhatsApp business number; Meta inbound $0.00 | Yes, with user permission | Two-way chat yes (not SMS) | as ElevenLabs | Inbound: **$0.08/min** (ElevenLabs only). Outbound: $0.0095 + $0.08 = **about $0.09/min** plus a permission-request message (about $0.0212 utility, UNCONFIRMED). Messages: service is free for the first 1,000 per number per month, then about $0.0212 (UNCONFIRMED). Utility template about $0.0212 (UNCONFIRMED). | Meta Business, WABA, Cloud API number not used in the Business app, payment method in WhatsApp Manager, messaging limit of at least 2,000 for calling, AI-provider policy compliance | CONFIRMED (structure, calling fees); message rates UNCONFIRMED |
| Telegram bot (+ ElevenLabs TTS / Scribe on voice notes) | No calls (bots cannot) | No calls | Two-way chat yes | Voice notes via ElevenLabs STT/TTS | Telegram fees $0; ElevenLabs STT/TTS per usage | BotFather token | CONFIRMED |
| ubill.ge SMS | n/a | One-way SMS | Not documented | n/a | **0.01 GEL** (≤50k), down to 0.003 GEL at 1M | Self sign-up; brand registration via API | CONFIRMED (two-way UNCONFIRMED) |
| sender.ge SMS | n/a | One-way SMS (GE mobiles only) | Not documented | n/a | **0.025 GEL incl. VAT** (<2k), 0.01 at 10k+ | Self registration; custom brand on request | CONFIRMED (two-way UNCONFIRMED) |
| smsoffice.ge SMS | n/a | One-way SMS | Not documented | n/a | **0.03 GEL incl. VAT** (5k pack, 150 GEL), 0.016 at 50k | Self registration; invoice purchase | CONFIRMED (two-way UNCONFIRMED) |
| Twilio SMS | n/a | One-way SMS (alphanumeric dynamic) | **No** | n/a | **$0.1684/segment** + $0.001 per failed message | Twilio account | CONFIRMED |

---

## Recommendation: cheapest compliant path

**(a) Outbound "call me when my video is ready"**

1. Send the "ready" notice through the cheapest message channel the user has opted into:
   - Telegram bot (free).
   - WhatsApp utility template (about $0.0212, UNCONFIRMED).
   - Local SMS (about 0.01 to 0.03 GEL).
2. Place a voice call only when the user asked for one.
3. Cheapest voice path: **ElevenLabs WhatsApp outbound call**, at about **$0.09/min**. It needs WhatsApp opt-in, a call-permission template (limited to 1 per day / 2 per week per user), a messaging limit of at least 2,000, and positioning as a business-specific assistant.
4. PSTN fallback: **ElevenLabs + Twilio native** (`/v1/convai/twilio/outbound-call`), at about **$0.56/min to Georgian mobiles**. Use a **verified caller ID** (our own Georgian number) so users see a familiar number; whether it displays correctly in Georgia is UNCONFIRMED.
5. Ask DIDWW or a Georgian operator for a quote for local SIP termination, which is likely far cheaper than Twilio's $0.47. Not verified.

**(b) Inbound number users can call**

- Cheapest: **inbound WhatsApp calls** to the business number, handled by the ElevenLabs agent. Meta charges $0.00; ElevenLabs charges $0.08/min.
- A **real +995 number** requires a non-Twilio carrier. The best documented option is **DIDWW Tbilisi +995 32 (or +995 706)** with the Georgia Registration Form, routed over **SIP to `sip.rtc.elevenlabs.io`** (TLS, G.711). Cost is ElevenLabs $0.08/min plus DIDWW (UNCONFIRMED).
- Twilio cannot provide a Georgian inbound number.

**(c) SMS notifications**

- Use a **local aggregator API**, not Twilio. That is about 6 to 50 times cheaper per message (GEL vs USD; FX not checked).
  - **ubill.ge**: 0.01 GEL; REST API; brand-name API; OTP priority; delivery callbacks. Best fit for low volume.
  - **sender.ge**: 0.025 GEL incl. VAT; informational mode `smsno=2`.
  - **smsoffice.ge**: 0.03 GEL in a 5k pack.
- Send as **informational/transactional** traffic with an alphanumeric sender such as "MyAvatar" (11 characters or fewer).
- Keep Georgian-script texts under 70 characters, or budget for 2 segments.

**(d) Two-way SMS**

- **No confirmed two-way SMS option in Georgia.** Twilio's GE two-way is "No", and none of the local aggregators documents inbound or MO SMS.
- Use **WhatsApp or Telegram for two-way text** with Agent G, both handled natively by the ElevenLabs agent or our bot.
- If SMS replies are mandatory, ask Magti or ubill/smsoffice about an inbound short code or long number with an MO webhook. UNCONFIRMED; nobody has been contacted.

---

## Open items to verify (no contact made)

1. Run a live ElevenLabs agent test with `language="ka"` and `eleven_v4_turbo` or `eleven_v3_conversational` plus `scribe_realtime` on an 8 kHz phone call, to check Georgian quality and accuracy.
2. Download Meta's USD rate-card CSV in WhatsApp Manager to confirm the Rest of CEE rates. Then confirm that Agent G is not an "AI Provider" under Meta's policy.
3. Get DIDWW pricing for Georgia numbers and outbound termination to Georgian mobiles, and check SIP interop with ElevenLabs (TLS, digest).
4. Ask Magti, Silknet and Cellfie whether they offer SIP trunk and A2P API/SMPP and MO SMS, and what a foreign or Georgian entity needs to sign up.
5. Check whether a Twilio verified Georgian caller ID is shown unchanged on Magti, Silknet and Cellfie handsets (CLI preservation).
6. Read the GNCC numbering regulation (.doc) and the GNCC or electronic-communications rules for SMS advertising and opt-out.

## Sources (all read 2026-10-10)

- Twilio: https://www.twilio.com/en-us/guidelines/ge/sms · https://www.twilio.com/en-us/voice/pricing/ge · https://www.twilio.com/en-us/sms/pricing/ge · https://www.twilio.com/en-us/guidelines/regulatory · https://www.twilio.com/en-us/guidelines/voice · https://www.twilio.com/docs/voice/api/call-resource · https://www.twilio.com/en-us/voice/pricing/us · https://www.twilio.com/en-us/voice/pricing/gb · https://www.twilio.com/docs/voice/media-streams · https://www.twilio.com/en-us/whatsapp/pricing · https://help.twilio.com/articles/53100480177819
- ElevenLabs: https://elevenlabs.io/pricing/agents · https://elevenlabs.io/docs/agents-platform/phone-numbers/twilio-integration/native-integration · https://elevenlabs.io/docs/api-reference/twilio/outbound-call · https://elevenlabs.io/docs/agents-platform/phone-numbers/sip-trunking · https://elevenlabs.io/docs/api-reference/sip-trunk/outbound-call · https://elevenlabs.io/docs/eleven-agents/api-reference/phone-numbers/create.md · https://elevenlabs.io/docs/eleven-agents/api-reference/agents/create.md · https://elevenlabs.io/docs/overview/models · https://elevenlabs.io/docs/overview/capabilities/speech-to-text · https://elevenlabs.io/docs/eleven-agents/customization/voice/customization/language.md · https://elevenlabs.io/docs/agents-platform/customization/tools/server-tools · https://elevenlabs.io/docs/eleven-agents/phone-numbers/twilio-integration/sms-conversations.md · https://elevenlabs.io/docs/eleven-agents/whatsapp.md · https://elevenlabs.io/docs/eleven-agents/whatsapp/outbound.md · https://elevenlabs.io/docs/changelog/2026/2/9 · https://elevenlabs.io/docs/eleven-agents/llms.txt
- Meta/WhatsApp: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing · https://developers.facebook.com/docs/whatsapp/pricing/ (older page, country mapping) · https://developers.facebook.com/documentation/business-messaging/whatsapp/calling · https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/pricing · https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization · https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers
- Telegram: https://core.telegram.org/bots/api · https://core.telegram.org/bots/faq · https://core.telegram.org/bots/features · https://core.telegram.org/api/links · https://core.telegram.org/method/phone.requestCall
- Google: https://cloud.google.com/vertex-ai/generative-ai/pricing · https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api · https://ai.google.dev/gemini-api/docs/live-api/capabilities
- Georgia: https://ubill.ge/sms-tariffs · https://ubill.ge/api-docs · https://sender.ge/docs/api.php · https://sender.ge/?controller=tariff&action=getTariff · https://smsoffice.ge/prices · https://smsoffice.ge/integration · https://trustconnect.ge/en/services/sms-api-service · https://www.magticom.ge/ka/A2PSMS · https://silknet.com/ge/business/telephone · https://cellfie.ge/en/about-us/media/03-07-20 · https://www.didww.com/resources/regulatory-requirements/Georgia · https://comcom.ge/en/regulation/sixshiruli-da-numeraciis-resursi/numbering-resources/the-national-plan-for-numbering-resources · https://matsne.gov.ge/ka/document/view/31840
- Secondary, UNCONFIRMED only: formbeep.com, flowcall.co, wapikon.com, zernio.com, help.sleekflow.io (WhatsApp rates); en.wikipedia.org (GE numbering); gramio.dev (Telegram method text mirror); dev.to/googleai (Gemini and Twilio tutorial).
