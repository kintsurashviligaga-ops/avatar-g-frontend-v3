# Google verification: Gemini Live + GCE bridge (2026-10-10)

Scope: verify and fill gaps in `docs/handoffs/omnichannel/research/whatsapp-calling-research.md` (sections 4, 5) and `wa_cost.py`.
Method: official pages only (ai.google.dev, cloud.google.com, docs.cloud.google.com), read 2026-10-10 via Firecrawl (maxAge 0) and WebFetch. Nothing created, no sign-in, no paid calls.

Labels:
- CONFIRMED means an official page was read today. The URL and the page's own "Last updated" date are given, or "no date" if the page shows none.
- UNCONFIRMED means no official source was found.

---

## Q1. Live native-audio prices (per 1M tokens, paid tier)

### Gemini Developer API
Source: https://ai.google.dev/gemini-api/docs/pricing (Last updated 2026-10-09). CONFIRMED.

| Model (API id) | Input | Output |
|---|---|---|
| Gemini 3.8 Live / 3.8 Live Extended Thinking / 3.1 Flash Live Preview (`gemini-3.8-live`, `gemini-3.8-live-extended-thinking`, `gemini-3.1-flash-live-preview`) | "$0.75 (text) / $3.00 or $0.005/min (audio) / $1.00 or $0.002/min (image/video)" | "$4.50 (text) / $12.00 or $0.018/min (audio)" |
| Gemini 2.5 Flash Native Audio (Live API) (`gemini-2.5-flash-native-audio-preview-12-2025`) | "$0.50 (text) / $3.00 (audio / video)" | "$2.00 (text) / $12.00 (audio)" |

- **Per-minute rounding.** "$0.005/min" input is $3.00/M × 25 tok/s × 60 = $0.0045, rounded. "$0.018/min" output is exact ($12/M × 1,500 tok).
- **No context-caching row** for any Live model.
- **Data use (CONFIRMED).** Free tier: "Content used to improve our products". Paid tier: "Content **not** used". Production must be on the paid tier.
- **Model page.** https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-native-audio-preview-12-2025 (Last updated 2026-08-18). CONFIRMED. Input token limit 131,072; output 8,192; "Caching Not supported".

### Vertex AI
The URL `https://cloud.google.com/vertex-ai/generative-ai/pricing` now redirects to `https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing` (no date shown). CONFIRMED.

| Model | Input text | Input audio | Input video/image | Output text | Output audio | Cached |
|---|---|---|---|---|---|---|
| Gemini 3.8 Live API (non-global) | $0.75 | $3.00 | $1.00 | $4.50 | $12.00 (video avatar out $1.00) | N/A |
| Gemini 2.5 Flash Live API | $0.50 | $3.00 | $3.00 | $2.00 | $12.00 | – |

Verbatim footnotes from the same page:
- "Audio: 25 tokens /second of audio."
- "Audio-to-Text Transcription: charged at the standard text output rate for all text tokens generated when transcription is enabled."
- "Proactive Audio Mode: When enabled, input tokens are charged while LiveAPI is listening."
- The Session Context Window / token accumulation wording is unchanged from the baseline.

**Verdict:** the Gemini API and Vertex list prices are identical for Live audio ($3 in / $12 out). The baseline's figures stand.

---

## Q2. Audio tokens per second

**Live, input and output: 25 tok/s. CONFIRMED.**
- https://ai.google.dev/gemini-api/docs/live-api/best-practices (Last updated 2026-09-15): "native audio tokens accumulate rapidly (approximately 25 tokens per sec of audio)".
- The Gemini pricing page (2026-10-09) is consistent: "$12.00 or $0.018/min (audio)" output equals 25 tok/s exactly. Its footnotes also state "25 tokens per second of audio".
- Vertex start-manage-session, https://docs.cloud.google.com/gemini-enterprise-agent-platform/generative-ai/live-api/start-manage-session (Last updated 2026-10-09): "25 tokens per second (TPS) for audio and 258 TPS for video".

**Non-Live audio (generateContent / Interactions): 32 tok/s. CONFIRMED.**
- https://ai.google.dev/gemini-api/docs/audio (Last updated 2026-09-23): "**Tokens**: 32 tokens per second of audio (1 minute = 1,920 tokens)".
- This is relevant for transcribing WhatsApp voice notes, not for Live calls.

---

## Q3. Context re-billing on the Gemini Developer API

**Status: CONFIRMED.** The baseline had this as Vertex-only; the Gemini API now says the same.

Source: https://ai.google.dev/gemini-api/docs/live-api/best-practices (Last updated 2026-09-15), section "Pricing and billing". Verbatim:
- "The Gemini Live API bills strictly by token usage. Because the Live API maintains a persistent WebSocket session, billing follows a compounding model based on the active context window."
- "The API charges you per turn for all tokens present in the session context window. A "turn" is defined as one user input and the model's corresponding response."
- "Accumulation: The context window includes new tokens from the current turn plus all accumulated tokens from previous turns."
- "Re-billing: Past tokens are re-processed and accounted for in each new turn, up to your configured context window size."
- "Audio billing: The API bills you for the accumulated native audio tokens at the standard audio input rate on every turn."
- "Transcription surcharge: When audio-to-text transcription is enabled (inputAudioTranscription or outputAudioTranscription), the API charges for all text tokens generated for transcription at the text token output rate in addition to the standard audio token costs."
- "By setting a compression trigger (e.g., 25,000 tokens) and a sliding window (e.g., 8,000 tokens), the API automatically evicts older tokens once the threshold is reached. The API then bills subsequent turns only for the retained history plus any new tokens."
- "When proactive audio is enabled, the API charges for input tokens the entire time the Live API is listening, and charges for output tokens only when the API responds."
- "Note for Gemini 3.8: Proactive audio is permanently enabled in gemini-3.8-live and gemini-3.8-live-extended-thinking."
- "Note for Gemini 3.1: Proactive audio is not supported in gemini-3.1-flash-live-preview. For this model, the API bills only for audio when you actively stream input."

The pricing page (ai.google.dev/gemini-api/docs/pricing) is itself silent on re-billing. The best-practices page is the authority.

**Cached or context rate: there is no discount.** Re-billed context is charged at the standard audio input rate ($3.00/M), and text context at the text input rate. CONFIRMED by:
- the best-practices wording "at the standard audio input rate";
- no caching row for Live models on the Gemini pricing page;
- "Cached: N/A" on Vertex Gemini 3.8 Live;
- "Caching Not supported" on the 2.5 native-audio model page.

`UsageMetadata.cachedContentTokenCount` exists in the API reference, but no Live discount is published.

**Open question: does silence accumulate?** It is UNCONFIRMED whether silence accumulates into context on 3.x.
- API reference TurnCoverage: "audio activity means speech and excludes silence".
- For 3.8, input billing nonetheless covers the full listening time (proactive audio).

---

## Q4. Context window compression and session limits

Source: API reference https://ai.google.dev/api/live (Last updated 2026-10-09). CONFIRMED.

Config, set in the setup message:
```
contextWindowCompression: { triggerTokens: <int64>, slidingWindow: { targetTokens: <int64> } }
```

- `triggerTokens`: "The number of tokens (before running a turn) required to trigger a context window compression... If not set, the default is 80% of the model's context window limit. This leaves 20% for the next user request/model response."
  - For a 131,072-token model, the default is about 104,858 tokens.
  - At 22.5 tok/s of conversation (50% user + 40% agent), that is reached only after about 78 minutes.
  - **The defaults therefore never cap cost on normal calls. Set them explicitly.**
- `slidingWindow.targetTokens`: "The target number of tokens to keep. The default value is trigger_tokens/2."
  - The default is about 52,429.
- "The SlidingWindow method operates by discarding content at the beginning of the context window... System instructions and any BidiGenerateContentSetup.prefixTurns will always remain at the beginning of the result."
- `GoAway.timeLeft`: "This duration will never be less than a model-specific minimum, which will be specified together with the rate limits for the model."
- `SessionResumptionUpdate.resumable`: a session is not resumable "when the model is executing function calls or generating". This matters for function-calling mid-turn.
- TurnCoverage default: "for Gemini 2.5, the default is TURN_INCLUDES_ONLY_ACTIVITY, while for Gemini 3.1 and onwards, it's TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO".
- Endpoint: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`.
- Google's own example values are 25,000 trigger and 8,000 target (best-practices page, quoted above).

Source: session management, https://ai.google.dev/gemini-api/docs/live-api/session-management (Last updated 2026-09-15). CONFIRMED.
- "Without compression, audio-only sessions are limited to 15 minutes, and audio-video sessions are limited to 2 minutes... you can use context window compression to extend sessions to an unlimited amount of time."
- "The lifetime of a connection is limited as well, to around 10 minutes." The bridge must reconnect with a resumption handle at least every ~10 minutes.
- "Resumption tokens are valid for 2 hr after the last sessions termination."
- A GoAway message is sent before termination and carries `timeLeft`.

Vertex equivalents, from https://docs.cloud.google.com/gemini-enterprise-agent-platform/generative-ai/live-api/start-manage-session (Last updated 2026-10-09). CONFIRMED; Vertex-only.
- "All Gemini Live API models have a context window limit of 128k tokens."
- `trigger_tokens` ranges from 5,000 to 128,000; `target_tokens` from 0 to 128,000.
- "goAway notification... is sent to the client 60 seconds before the session ends."
- The resumption window wording is internally inconsistent on this page. It says both "You can resume a previous session within 24 hours" and "The resumption window is finite (typically around 10 minutes)". Treat it as UNCONFIRMED for Vertex.

---

## Q5. Concurrency

### Gemini Developer API
Source: https://ai.google.dev/gemini-api/docs/rate-limits (Last updated 2026-10-09). CONFIRMED.

No Live concurrent-session numbers are published. Verbatim:
- "Rate limits depend on a variety of factors... can be viewed in Google AI Studio"
- "Rate limits are applied per project, not per API key."

Spend-based limits per rolling 10 minutes:

| Tier | Limit per 10 min | Qualification | Billing cap |
|---|---|---|---|
| Free | N/A | – | – |
| Tier 1 | $10 | Active billing account | $250 |
| Tier 2 | $50 | "Paid $100 + 3 days" | $2,000 |
| Tier 3 | $200 | "Paid $1,000 + 30 days" | – |

- **Tier 1 headroom.** $10 per 10 minutes is about $1/min of spend. At about $0.07–0.20/min per 3.8 Live call (more for long uncompressed calls), that allows roughly 5–14 simultaneous calls before spend throttling. This is an estimate, not a published limit.
- **Per-tier Live concurrent sessions: UNCONFIRMED.** Unofficial forum posts cite 50 for Tier 1 and 1,000 for Tier 2. Not official; check AI Studio after billing is enabled.

### Vertex AI
- start-manage-session (2026-10-09): "You can have up to 1,000 concurrent sessions per project on a pay-as-you-go (PayGo) plan." CONFIRMED.
- Conflicting legacy page: https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/multimodal-live (Last updated 2026-10-10) says "5,000 concurrent sessions per project", "4M tokens per minute" and "default maximum length of a conversation session is 10 minutes". It sits under a heading on "limitations of Gemini Live API and Gemini 2.0", so it is likely legacy. Use 1,000.

---

## Q6. Ephemeral tokens

Sources, both CONFIRMED:
- https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens (Last updated 2026-09-15)
- https://ai.google.dev/api/live (Last updated 2026-10-09)

**Defaults**
- Docs: "By default, you'll have 1 minute to start new Live API sessions using the token from this request (newSessionExpireTime), and 30 minutes to send messages over that connection (expireTime)."
- Reference, `expireTime`: "defaults to 30 minutes in the future. If set, this value must be less than 20 hours in the future".
- Reference, `newSessionExpireTime`: "defaults to 60 seconds... must be less than 20 hours".

**Uses**
- `uses`: "If this value is zero then no limit is applied. Resuming a Live API session does not count as a use. If unspecified, the default is 1."
- Docs: "reconnect the call every 10 minutes (this can be done with the same token even if uses: 1)".

**Locking the setup**
- `liveConnectConstraints`: "It's also possible to lock an ephemeral token to a set of configurations... keep your system instructions on the server side".
- It locks model and config; `lock_additional_fields` / fieldMask control which fields are locked.

**Endpoint**
- The token is used with `BidiGenerateContentConstrained`, via the `access_token` query parameter or an `Authorization: Token` header.
- "only works for the live API, and only with the v1beta version".

**Server-to-server**
- It works technically: the token is accepted "as if it were an API key".
- But it is not recommended. Docs: "The use of ephemeral tokens only adds value when deploying applications that follow client-to-server implementation approach" and "Generally, avoid using ephemeral tokens for backend-to-Gemini connections, as this path is typically considered secure."
- **Verdict:** the VM bridge should use a normal API key held in Secret Manager or an env file. Ephemeral tokens are only needed if a browser or phone ever connects to Gemini directly.

---

## Q7. Compute Engine, IP, disk, egress

### VM prices
Source: official SKU explorer https://cloud.google.com/skus/ (no date; live prices). CONFIRMED.

E2 resource SKUs:
- Frankfurt (europe-west3):
  - "E2 Instance Core running in Frankfurt C921-088E-792A 0.0281037 USD per 1 hour"
  - "E2 Instance Ram running in Frankfurt 7D80-F9E4-6A44 0.00376602 USD per 1 gibibyte hour"
- Warsaw (europe-central2):
  - Core 955B-B00E-ED15 0.0263922/h
  - Ram 56D3-3D40-B0F6 0.00353742/GiB-h
- Americas cross-check:
  - Core 0.02181159, Ram 0.00292353.
  - These reproduce the official us-central1 table on https://cloud.google.com/products/compute/pricing/general-purpose exactly: e2-small $0.016752855/h, e2-medium $0.03350571/h, e2-standard-2 $0.06701142/h. This validates the formula.
  - Formulas: e2-small = 0.5 core + 2 GiB; e2-medium = 1 core + 4 GiB; e2-standard-2 = 2 cores + 8 GiB.

On-demand prices, 730 h/month:

| Machine | europe-west3 Frankfurt | europe-central2 Warsaw | us-central1 (check) |
|---|---|---|---|
| e2-small | $0.02158389/h = **$15.76/mo** | $0.02027094/h = **$14.80/mo** | $12.23 |
| e2-medium | $0.04316778/h = **$31.51/mo** | $0.04054188/h = **$29.60/mo** | $24.46 |
| e2-standard-2 | $0.08633556/h = **$63.02/mo** | $0.08108376/h = **$59.19/mo** | $48.92 |

**No sustained use discount for E2. CONFIRMED.** https://docs.cloud.google.com/compute/docs/sustained-use-discounts (Last updated 2026-10-08) lists N1, N2, N2D, C2, M1, M2 and sole-tenant; E2 is not listed. Only committed-use discounts would lower E2.

### Static external IPv4
Source: https://cloud.google.com/vpc/network-pricing (no date). CONFIRMED.
- "Static and ephemeral IP addresses in use on standard VM instances | $0.005 / 1 hour" = **$3.65/mo**.
- Free tier is "limited to one hour per month per account".
- A reserved but unused static IP costs $0.01/h.

### Persistent disk, 10 GB
Source: SKU explorer. CONFIRMED.
- Frankfurt: "Balanced PD Capacity in Frankfurt 0.12 USD per 1 gibibyte month" → **$1.20/mo**.
- Warsaw Balanced PD: $0.13/GiB-mo → **$1.30/mo**.
- Standard PD ("Storage PD Capacity"): $0.048/GiB-mo in both regions → $0.48/mo.

### Internet egress (Premium Tier, first TiB)
Source: SKU explorer. CONFIRMED.
- Verbatim: "Network Internet Data Transfer Out from Frankfurt to Western Europe B8D1-7028-A009 0.12 USD per 1 gibibyte, for 0 gibibyte to 1,024 gibibyte".
- The same $0.12/GiB applies to Eastern Europe, EMEA, APAC, "Apac (excl Korea, Indonesia)" and India.
- Middle East $0.15; Africa $0.15; Korea / Indonesia / Australia / South America $0.19.
- Warsaw source prices are identical.
- There is no free GiB from European regions; the free 1 GiB/month tier applies only from North America.
- Inbound (network pricing page): "No charge for inbound data transfer".

### VM → Google APIs (the Gemini leg)
Source: network pricing. CONFIRMED.
- "Data transfer to a different Google Cloud service within the same region using an external IP address or an internal IP address... No charge."
- "Data transfer to a Google Cloud service in a different region" is billed at inter-region rates: Europe→Europe $0.02/GiB, Europe→North America $0.05/GiB.

**UNCONFIRMED:** how traffic to the global `generativelanguage.googleapis.com` endpoint is classified (free, inter-region or internet). The worst case, $0.12/GiB, is used below.

### Egress estimate
GiB = 2^30 bytes, $0.12/GiB. Meta→VM and Google→VM are inbound and free.

**(a) Literal brief:** 60 kbps VM→Meta plus 60 kbps VM→Google. 0.000419 GiB per minute per direction.

| Call-min/mo | GiB out | $ |
|---|---|---|
| 100 | 0.084 | $0.01 |
| 500 | 0.42 | $0.05 |
| 1,000 | 0.84 | $0.10 |
| 5,000 | 4.19 | $0.50 |

**(b) Realistic:** VM→Meta is Opus at about 60 kbps including overhead. VM→Gemini sends 16 kHz PCM16 as base64 JSON, about 341 kbps; only while the user talks for 3.1/2.5, but continuously for 3.8.

| Call-min/mo | to Meta GiB / $ | to Google GiB / $ (if $0.12) | Total $ |
|---|---|---|---|
| 100 | 0.042 / $0.005 | 0.238 / $0.029 | **$0.03** |
| 500 | 0.21 / $0.025 | 1.19 / $0.143 | **$0.17** |
| 1,000 | 0.42 / $0.050 | 2.38 / $0.286 | **$0.34** |
| 5,000 | 2.10 / $0.25 | 11.92 / $1.43 | **$1.68** |

**Verdict:** egress is negligible, under $2/month even at 5,000 minutes.

### Fixed VM line for wa_cost.py

| Region | e2-small | + IP | + 10 GB balanced PD | Total/mo |
|---|---|---|---|---|
| Frankfurt | $15.76 | $3.65 | $1.20 | **$20.61** |
| Warsaw | $14.80 | $3.65 | $1.30 | **$19.75** |

With e2-medium, the totals are $36.36 (Frankfurt) and $34.55 (Warsaw).

---

## Q8. $300 Free Trial

Source: https://docs.cloud.google.com/free/docs/free-cloud-features (Last updated 2026-10-07). CONFIRMED.

**Eligibility**
- "You've never been a paying user of Google Cloud, Google Maps Platform, or Firebase."
- "You haven't previously signed up for the Free Trial."
- **An account that is already a paying (upgraded) Cloud Billing customer cannot start a new $300 trial.**

**If the trial was started and then upgraded**
- "Although upgrading to a Paid billing account ends your Free Trial, you keep any unused credit until it expires 90 days from the Free Trial signup."
- "Your remaining credit is available for use on products and services covered by the Free Trial, but they must be consumed within the original 90 days period from your sign-up date."
- In that case, leftover credit within 90 days does cover Compute Engine.

**Gemini API is excluded:** "The $300 credit can't pay for Gemini API in AI Studio costs."

**External IPs**
- The listed Free Trial restrictions are: no GPUs, no Marketplace, no quota increases, no Windows Server images, and no VMware Engine. External IP addresses are not on the list, so trial VMs can have external IPs. CONFIRMED by omission; no explicit sentence exists.
- The network pricing page says: "During the Free Trial period, these prices are charged against the Free Trial credit amount."
- The default `IN_USE_ADDRESSES` quota on trial accounts is UNCONFIRMED.

**Always Free e2-micro** is US regions only (us-west1, us-central1, us-east1), not Frankfurt or Warsaw. CONFIRMED.

---

## Q9. Cloud Run

**No inbound UDP. CONFIRMED.**
- https://docs.cloud.google.com/run/docs/securing/security (page date not captured): "Egress traffic that exits from Cloud Run is treated as transport layer 4 (TCP and UDP)." and "In contrast to egress, Cloud Run's ingress traffic is at application layer 7 (HTTP)."
- Container contract, https://docs.cloud.google.com/run/docs/container-contract (Last updated 2026-10-07): "TLS is terminated by Cloud Run for HTTPS and gRPC, and then requests are proxied as HTTP/1 or gRPC to the container" and "PORT | The port your HTTP server should listen on."
- No explicit "UDP not supported" sentence was found. The layer-7-only ingress statement is the authority.

**WebSockets**
Source: https://docs.cloud.google.com/run/docs/triggering/websockets (Last updated 2026-10-07). CONFIRMED.
- "WebSockets requests are treated as long-running HTTP requests... subject to request timeouts (currently up to 60 minutes and defaults to 5 minutes)".
- "A Cloud Run instance that has any open WebSocket connection is considered active... billed as instance-based billing."
- Up to 1,000 concurrent connections per container instance.

**Verdict: Cloud Run could host only the Gemini half.**
- It could act as the WebSocket client to Gemini, fed by the VM over WS or gRPC.
- That would add a network hop (latency), instance-based billing for the whole call, and a 60-minute per-connection cap.
- WebRTC/ICE media from Meta needs inbound UDP, so the WebRTC leg must stay on the VM.
- **Recommendation:** run both halves on the one VM.

---

## Revised cost model

### Inputs for wa_cost.py

| Parameter | Value | Note |
|---|---|---|
| `TOK_S` | 25 | Live only |
| `IN_AUDIO` | 3.00/1e6 | |
| `OUT_AUDIO` | 12.00/1e6 | |
| `IN_TEXT` | 0.75/1e6 (3.x) or 0.50/1e6 (2.5) | |
| `OUT_TEXT` | 4.50/1e6 (3.x) or 2.00/1e6 (2.5) | New: transcription surcharge |
| Input billed share | 1.0 for `gemini-3.8-live` | Proactive audio, billed while listening |
| | 0.5 for `gemini-3.1-flash-live-preview` and 2.5 | Billed only while streaming |
| Re-billing | On, both platforms | No cached discount |
| `cap` | Set explicitly: 25,000/8,000 (Google example) or 8,000/4,000 | Default 80% of 131k (~104,858) never fires before ~78 min |
| `VM_MONTH` | 15.76 + 3.65 + 1.20 = **20.61** (Frankfurt) or 19.75 (Warsaw) | |
| Egress | ~$0.34 per 1,000 call-min | Optional line item |

### Per-call Gemini cost, USD
Same turn model as baseline: 20 s turns, user 50%, agent 40%, 3,000-token system prompt re-billed each turn.

| Call | 3.1/2.5 base | 3.1/2.5 full default | 3.1/2.5 cap 25k/8k | 3.1/2.5 cap 8k/4k | 3.8 base | 3.8 full default | 3.8 cap 25k/8k | 3.8 cap 8k/4k |
|---|---|---|---|---|---|---|---|---|
| 5 min | 0.047 | 0.223 | 0.223 | 0.223 | 0.059 | 0.234 | 0.234 | 0.234 |
| 15 min | 0.142 | 1.580 | 1.580 | 0.919 | 0.175 | 1.613 | 1.613 | 0.953 |
| 30 min | 0.283 | 5.893 | 4.138 | 1.945 | 0.351 | 5.960 | 4.206 | 2.013 |

**Transcription surcharge**, if enabled: about $0.0007 per minute of speech (~175 text tok/min × $4.50/M). That is about $0.004, $0.011 and $0.021 per 5, 15 and 30-minute call. Token counts for Georgian text are UNCONFIRMED.

### Monthly at 1,000 call-min, 3.8 Live, including $20.61 VM
Meta charges are excluded.

| Call length | Default compression | 25k/8k | 8k/4k |
|---|---|---|---|
| 5-min calls | $67.41 | $67.41 | $67.41 |
| 15-min calls | $128.16 | $128.16 | $84.15 |
| 30-min calls | $219.28 | $160.81 | $87.71 |

**Caveat:** this assumes re-billed context grows only by speech (450 tok/turn). Whether 3.8's continuous listening adds silence tokens to context is UNCONFIRMED. If it does, uncapped figures rise further, which makes an explicit low trigger more important.

---

## Changes vs baseline (whatsapp-calling-research.md, wa_cost.py)

1. **Re-billing:** Gemini Developer API context re-billing was Vertex-only and is now CONFIRMED on ai.google.dev too (best-practices, 2026-09-15). It is billed at the full audio input rate, with no cached discount on either platform.
2. **Proactive audio on 3.8 Live:** `gemini-3.8-live` has proactive audio permanently on. Input is billed for the full listening time (+$0.00225/min base vs the baseline's 50% assumption). 3.1 Flash Live bills input only while streaming.
3. **New cost line:** a transcription surcharge at the text output rate ($4.50/M on 3.x), if input/output transcription is enabled.
4. **Pricing page per-minute display:** the page now shows "$0.005/min" audio in, which is rounded; the token-exact figure is $0.0045. The rates themselves are unchanged.
5. **VM cost:**
   - VM prices are now official SKU-explorer figures, not third-party; the e2-small figures are unchanged at $15.76 Frankfurt and $14.80 Warsaw.
   - The static IP at $3.65 is now CONFIRMED.
   - A 10 GB balanced PD (+$1.20) was added, so `VM_MONTH` goes from 19.41 to **20.61**.
   - E2 has no SUD.
6. **Egress quantified:** about $0.34 per 1,000 min, under $2 at 5,000 min. The Gemini-endpoint classification is still UNCONFIRMED.
7. **Compression defaults:** trigger 80% of the context window, target trigger/2; these never fire on calls under ~78 min. Set an explicit cap. Google's example is 25k/8k.
8. **Session limits confirmed (Gemini API):**
   - 15-min audio session limit without compression;
   - ~10-min connection lifetime;
   - 2-hour resumption-handle validity;
   - no resumption during function calls or generation.
   On Vertex: 128k context, trigger minimum 5,000, GoAway 60 s before the end.
9. **Concurrency:**
   - Gemini API Live concurrency is not published (AI Studio only).
   - Spend caps: Tier 1 $10 per 10 minutes, Tier 2 $50, Tier 3 $200.
   - Vertex allows 1,000 concurrent sessions per project on PayGo; a legacy page says 5,000.
10. **Free Trial:** the $300 trial is unavailable to an already-paying account, and its credit cannot pay for AI Studio Gemini API usage in any case.
11. **Ephemeral tokens:** not needed for the server-side bridge; Google advises against them for backend connections.
