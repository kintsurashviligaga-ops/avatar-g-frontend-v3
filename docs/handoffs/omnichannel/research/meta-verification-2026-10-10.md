# Meta / WhatsApp verification pass: 2026-10-10

This file verifies `docs/handoffs/omnichannel/research/whatsapp-calling-research.md` (the baseline) against Meta's official pages, read on 2026-10-10. It covers policy (A), the support channel (B), Graph API diagnostics (C) and Georgia pricing (D).

**Rules for this pass.** Only official Meta and WhatsApp pages were read: developers.facebook.com, www.facebook.com, www.whatsapp.com, and whatsappbusiness.com (business.whatsapp.com redirects there). No accounts were created, no sign-ins, no forms submitted, no contact made, and no money spent. No tokens or personal data appear here.

**Labels.**
- **CONFIRMED** means the fact was read today on an official page. The URL and the page's own date are given.
- **UNCONFIRMED** means the fact was not found on an official page, or exists only in secondary sources.

**Tooling caveats.**
- The fbcdn rate-card CSV and PDF files could not be fetched today. Firecrawl was blocked as antibot, the proxy rejected curl, and WebFetch rejected the URL as too long. The Georgia per-unit dollar values were therefore not re-read (see D).
- WebFetch sometimes served stale cached copies (an old changelog and a 2018 terms page). Any conflict was settled with a live Firecrawl scrape (`maxAge: 0`).

---

## A. Policy

### A1. Meta Terms: the AI Providers clause

**Source:** https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform, header "Last Modified: September 23, 2026".

**Clause number and text (CONFIRMED).**
- `https://www.whatsapp.com/legal/business-solution-terms/` redirects to the Meta Terms page above. The redirect was confirmed live with Firecrawl.
- The clause is still **§4.7 "AI Providers."** Its wording matches the baseline. Key verbatim pieces:
  - Definition: "Providers and developers of artificial intelligence or machine learning technologies, including but not limited to large language models, generative artificial intelligence platforms, general-purpose artificial intelligence assistants, or similar technologies as determined by Meta in its sole discretion ("AI Providers")"
  - Trigger: the prohibition applies "when such technologies are the primary (rather than incidental or ancillary) functionality being made available for use"
  - Carve-out: "provided, however, that such technologies may be made available to businesses in certain countries as set forth here". "Here" links to the pricing/ai-providers page (A2).
  - The rest of §4.7 is unchanged from the baseline:
    - an AI Provider may act as a Solution Provider;
    - Business Solution Data may not be used to train or improve AI;
    - fine-tuning is allowed only "for your exclusive use".

**Effective date of §4.7.**
- The Terms give no effective date for §4.7. UNCONFIRMED.
- The only date on the Terms page is Last Modified: September 23, 2026. CONFIRMED.
- The AI Providers page (A2) says the Terms were "updated on January 15, 2026". CONFIRMED that the page says this.

**History of changes.**
- The archive selector on the Terms page lists only two versions: "Current Version" and "October 15, 2025". CONFIRMED.
- The Oct 15, 2025 version was titled "Meta Terms for WhatsApp Business". It had the old structure and no AI Providers clause. CONFIRMED.
- That old version also said Meta "endeavors to provide you initial acknowledgment no more than 4 hours following receipt of your request". This commitment does not appear in the current Terms. CONFIRMED.
- The intermediate January 15, 2026 text could not be retrieved. Whether it was already numbered §4.7 is UNCONFIRMED.

**Other clauses that bear on the AI question (all CONFIRMED, same URL and date).**
- §1.1 defines the Platform as APIs that "allow businesses to send or receive messages or calls". Calls are therefore in scope of the Terms, including §4.7.
- §1.3: "different or additional terms may apply when you access and use other AI-related technologies".
- §2.2 now refers to the "Messaging Account". This is part of the new account model.
- §3.1: Rate Card changes "take effect the first day of the calendar month following such changes". Price decreases may take effect at any time.
  - This conflicts with the pricing page (Updated Sep 30, 2026), which says "Meta may update pricing only on the 1st day of each quarter".
  - Both documents are CONFIRMED as stating these things; they disagree with each other.

**Separate WhatsApp terms (CONFIRMED).**
- "WhatsApp Terms for WhatsApp Business Platform" is at https://www.whatsapp.com/legal/WhatsApp-Terms-for-WhatsApp-Business-Platform, effective September 23, 2026.
- It contains no AI clause.
- Its §1 describes the Platform as enabling businesses "to send and receive messages or calls".

### A2. AI Providers developer page

**Source:** https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers, "Updated: Sep 1, 2026".

**Main statements (CONFIRMED).**
- "Effective January 15, 2026, WhatsApp's Terms of Service update 'AI Providers' are only permitted to offer general-purpose AI assistants on the WhatsApp Business Platform where Meta is legally required to permit this use case."
- The page's definition is narrower in wording than the Terms: "such as large language models, generative artificial intelligence platforms, general-purpose artificial intelligence assistants, or similar technologies who provide certain services on WhatsApp Business Platform."

**Permitted markets and dates (CONFIRMED).**

| Market | Window on the page |
|---|---|
| Brazil (+55) | From March 11, 2026; no end date given (ongoing) |
| EU/EEA (29 countries) | March 11, 2026 to May 12, 2026 |
| Italy | February 16, 2026 to May 12, 2026 |

- The page also says: "Effective May 13, 2026 ... Meta will no longer charge 'AI Providers' for non-template messages delivered to users in certain markets".
- Whether permission (not just charging) ended in the EU and Italy is not stated explicitly. UNCONFIRMED.

**How AI Providers are charged (CONFIRMED).**
- Charges apply per non-template message, for example `"type":"text"` and `"type":"image"`. Media types are included.
- The rates CSV and PDF are "updated May 12, 2026".
- In analytics, the `pricing_category` value is `AI_BOT`.
- In webhooks, the pricing category is `general_purpose_ai`.

**Statements about other businesses (CONFIRMED).**
- The page says the change does "NOT change how or what Meta charges all other businesses". It adds that this includes "not being charged for non-template messages sent in an open customer service window".
- That second statement is now outdated: service messages have been charged since Oct 1, 2026 (see D).

**What the page does not contain.**
- There is no phrase like "businesses using AI to serve customers are not affected" on this page or the Terms. UNCONFIRMED on official Meta pages; it was seen only in secondary press (TechCrunch).

**Closest official support for "AI customer service is allowed" (CONFIRMED).**
- Source: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing, "Updated: Sep 30, 2026".
- Service is defined as "Any non-template message _not_ powered by the Meta Business Agent Platform. These can be powered by a 3rd-party AI solution or people".
- The page includes a cost comparison of "10,000 AI-powered messages in response to users ... via high-complexity AI models vs. Meta Business Agent".
- "Pricing updates for service messages launching October 1, 2026 do not apply to AI Providers".
- Meta Business Agent costs $2.00 per 1M tokens.

### A3. WhatsApp Business Messaging Policy

**Source:** https://whatsappbusiness.com/policy/ (redirected from https://www.whatsapp.com/legal/business-policy/), "Last updated: September 23, 2026".

All points CONFIRMED:
- **Human escalation:** "You may use automation when responding during the 24-hour window, but must also have available prompt, clear, and direct escalation paths."
  - Listed paths: In-Chat Human Agent transfer, Phone number, Email, Web support, In-store visits, Support form.
- **AI-specific clause:** none. The AI restriction lives only in Terms §4.7.
- **Calling opt-in:** best practices include "Obtaining a separate opt-in to initiate a call to a user."
- **§7 limits:** "Our systems may limit the amount of messages a business can send or calls a business can initiate, based on this user feedback."
- The policy links to the Meta Commerce Policy. That policy was not read in this pass.

### A4. Calling documentation on AI voicebots

**Source:** https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/faq, "Updated: Sep 29, 2026".

**Voicebots (CONFIRMED).**
- Q: "Is it possible for an AI (for example voicebot) to have a conversation with a customer directly via a WhatsApp call?"
- A: "Yes. Meta only provides the raw media stream and how it is processed is entirely flexible. Many businesses use automated voicebots including AI bots to answer calls from WhatsApp users."
- The FAQ continues: "See WhatsApp Business Solution Terms for restrictions in AI use cases". That link resolves to the Meta Terms §4.7 above.

**Other facts on the same page (CONFIRMED).**
- **Concurrent calls:** the page contradicts itself. The Product FAQ says "Max concurrent calls is 5000". The Getting Started FAQ refers to "the 1000 concurrent calls limit".
- **Credit line:** "Yes, a credit line attached to the Messaging account is required in order to use the Calling API."
- **Business verification:** it "is not a requirement for calling, nor is it required for messaging."
- **Minimum Graph API version for calling:** v17.0.
- **Separate partners:** under the new account model, different partners can handle chat and calling on the same number.

### A5. Are messaging, media and calling treated differently under the AI clause?

- No official page distinguishes them under §4.7. UNCONFIRMED.
- What the official pages do say (all CONFIRMED):
  - The Terms' scope in §1.1 covers "messages or calls", so §4.7 applies to the whole Platform, calls included.
  - AI Provider charging applies to every non-template message type, media included.
  - The Calling FAQ points back to the Terms for AI restrictions.
- No calling-specific carve-out or extra restriction was found.

---

## B. Asking Meta a written policy question (direct developer, own WABA, Cloud API, no BSP)

**WhatsApp support page (CONFIRMED).**
- Source: https://developers.facebook.com/documentation/business-messaging/whatsapp/support, "Updated: Jun 17, 2026".
- Who can open a ticket: "If you are an enterprise developer, such as a partner or managed partner, you can open a Direct Support ticket using the link below. If you have multiple Meta business accounts, be sure to select the appropriate account."
- Link: https://business.facebook.com/direct-support/
- Response time: "We do our best to provide an initial response to your ticket within 24 hours on business days".
- Severity levels: Critical, Urgent, Standard, Mitigated.
- Channels open to every developer: developers.facebook.com/support/, the developer community forum, and bug reports.

**Eligibility of direct developers (CONFIRMED).**
- Source: https://whatsappbusiness.com/resources/faq/, modified Oct 8, 2026.
- "All businesses and developers directly accessing our platform have access to our Direct Support portal".

**Help Center articles (CONFIRMED).**
- Sources: https://www.facebook.com/business/help/182669425521252 and https://www.facebook.com/business/help/1755586078024776. No page date is shown.
- "Not all people will have access to Direct Support."
- Steps: "From the Direct Support homepage, click Ask a question. Select the relevant topic for your question. Fill in the description and remaining fields and click Confirm".
- Response time: "In general, most teams will respond within one business day on weekdays."
- Notifications come by email or Messenger. There is an "Auto-subscribe to questions" option.
- A "Meta AI business assistant" chat appears first on the page.

**Topics documented on developer pages (CONFIRMED that each page names it).**

| Topic or question type | Where it is documented |
|---|---|
| "New Account Model on WhatsApp Business Platform" | account-model-evolution page |
| "WABiz: Marketing Messages" | support page |
| "Dev: Billing, Credit & Pricing", request type "Credit Card Billing" | onboarded-clients page, which also says you must be "registered as a Meta developer" |

**Gaps.**
- No dedicated "Policy" or "AI Providers" topic or question type was found on any official page. UNCONFIRMED. The topic list is visible only after sign-in.
  - Practical path: Direct Support → Ask a question → pick the closest WhatsApp Business Platform topic. This is an inference.
- Whether a case or ticket ID is shown: no official page states it. UNCONFIRMED.
- Exact role required (business portfolio admin or app developer): UNCONFIRMED. Only "registered as a Meta developer" is documented, and only for the billing topic.

**Policy-enforcement appeals (CONFIRMED).** These are a separate path. Source: https://developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement.
- Steps: Business Support Home → select the WABA → choose the violation → Request Review.
- A decision usually takes 24–48h.

---

## C. Graph API read-only diagnostics (system-user token, `whatsapp_business_management` + `whatsapp_business_messaging`)

### Current Graph API version

- **v26.0**, released July 29, 2026. CONFIRMED. Source: https://developers.facebook.com/docs/graph-api/changelog/versions/ (live Firecrawl read).
- v25.0 was released Feb 18, 2026 and expires Jul 29, 2028. CONFIRMED.
- WhatsApp doc examples still use v25.0. CONFIRMED.
- Calling needs at least v17.0 (Calling FAQ, Sep 29, 2026). CONFIRMED.

### Phone number: `GET /{phone-number-id}?fields=...`

Sources: the phone-number-management guide and API reference (.md) pages under developers.facebook.com/documentation/business-messaging/whatsapp/. The classic `/docs/graph-api/reference/whats-app-business-phone-number/` page now returns 404.

**Fields (CONFIRMED unless marked).**

| Field | Values / notes |
|---|---|
| `id` | default field |
| `display_phone_number` | default field |
| `verified_name` | default field |
| `quality_rating` | GREEN, YELLOW, RED, NA; the list API also returns UNKNOWN |
| `code_verification_status` | VERIFIED, UNVERIFIED; the list API also returns EXPIRED, NOT_VERIFIED |
| `name_status` | APPROVED, AVAILABLE_WITHOUT_REVIEW, DECLINED, EXPIRED, PENDING_REVIEW, NONE; marked "beta" on the guide |
| `status` | BANNED, CONNECTED, DELETED, DISCONNECTED, FLAGGED, MIGRATED, PENDING, RATE_LIMITED, RESTRICTED |
| `throughput` | example request `?fields=throughput`; the response shape is not documented in what was read; default throughput is 80 mps |
| `whatsapp_business_manager_messaging_limit` | the current messaging-limit field, e.g. `TIER_250` |
| `messaging_limit_tier` | **deprecated**, replaced by the field above |
| `health_status` | see below |

**Additional fields from the list endpoint `GET /{waba-id}/phone_numbers` (CONFIRMED).**

| Field | Values / notes |
|---|---|
| `account_mode` | LIVE, SANDBOX |
| `host_platform` | CLOUD_API, ON_PREMISE, NOT_APPLICABLE |
| `is_official_business_account` | |
| `country_code` | ISO alpha-2 |
| `country_dial_code` | |
| `unified_cert_status` | |

- `platform_type` is UNCONFIRMED in official docs; it was seen only in community threads. Use `host_platform`.

### Messaging account / WABA: `GET /{waba-id}?fields=...`

The WABA ID did not change under the new account model; it is now called the Messaging account.

**Fields in the new reference (versions v23.0–v25.0), CONFIRMED.**
- `id`, `name`, `timezone_id`, `message_template_namespace`, `account_review_status`, `business_verification_status`, `country`, `ownership_type`, `primary_business_location`.
- Permissions listed: `whatsapp_business_management`, `whatsapp_business_messaging`, `public_profile`.

**Extra fields in the classic reference, CONFIRMED.**
- `currency`, `health_status`, `primary_funding_id`, `purchase_order_number`, `status`, `is_enabled_for_insights`, `is_shared_with_partners`, `on_behalf_of_business_info`, `marketing_messages_lite_api_status`.
- `whatsapp_business_manager_messaging_limit`, with values TIER_250, TIER_2K, TIER_10K, TIER_100K, TIER_UNLIMITED, UNTIERED.

**Field values and related calls.**
- `business_verification_status` values (CONFIRMED): expired, failed, ineligible, not_verified, pending, pending_need_more_info, pending_submission, rejected, revoked, verified.
- `primary_funding_id`: "If `primary_funding_id` is absent, the Messaging Account has no payment method attached and cannot send paid messages." CONFIRMED on the account-model-evolution/messaging page.
- Call analytics: `GET /{waba-id}?fields=call_analytics`. CONFIRMED (calling pricing page, Sep 11, 2026).

### Health Status: `GET /{node-id}?fields=health_status`

Works on a phone number, a WABA or a template node. All points CONFIRMED.
- `health_status.can_send_message` is AVAILABLE, LIMITED or BLOCKED.
- `health_status.entities[]` contains:
  - `entity_type`: PHONE_NUMBER, MESSAGE_TEMPLATE, WABA, BUSINESS or APP;
  - `id`, `can_send_message`, and `errors[]` / `additional_info[]`.
- `can_receive_call_sip` appears on the PHONE_NUMBER and APP entities.
- The page says: "Other calling-related fields are planned for the future."
- No required permission is named on that page, and the page shows no date.

### Settings: `GET /{phone-number-id}/settings`

Source: the call-settings page, Jul 6, 2026. Status: supported; CONFIRMED.

**Permission:** "`whatsapp_business_management`: Advanced access is required to use the API for end business clients".

**Response.**
- A `calling` object with these keys: `status`, `call_icon_visibility`, `callback_permission_status`, `call_hours`, `call_icons`, `sip`, `audio`, `voicemail`, `srtp_key_exchange_protocol`, `ip_addresses`, `video`, `restrictions`.
- `restrictions` holds `restrictions_list[]`. Each entry has:
  - `type`: RESTRICTED_BUSINESS_INITIATED_CALLING or RESTRICTED_USER_INITIATED_CALLING;
  - `reason`;
  - `expiration`.
- Also returned: `payload_encryption` and `storage_configuration`.

**Do not use `include_sip_credentials=true` for diagnostics.** It "requires additional permissions" and returns a SIP password.

### Subscribed apps: `GET /{waba-id}/subscribed_apps`

- Returns `data[]`, each with `whatsapp_business_api_data` {`id`, `name`, `link`} and `override_callback_uri` when set. CONFIRMED.
- It does **not** list which webhook fields are subscribed. CONFIRMED by the documented response shape.

### App subscriptions: `GET /{app-id}/subscriptions`

- "An app access token is required to return subscriptions for that app" (v25.0 example). CONFIRMED.
  - A system-user token is not enough; this call needs the app token (`app_id|app_secret`, kept server-side).
- Response fields: `object`, `callback_url`, `fields`, `active`. CONFIRMED.
  - Check that the `whatsapp_business_account` object lists the `calls` and `messages` fields.

### Debug token: `GET /debug_token?input_token={token}`

Source: the v26.0 page.
- Requires "An app access token or an app developer's user access token" for the same app. CONFIRMED.
- Response fields (CONFIRMED): `app_id`, `application`, `expires_at`, `data_access_expires_at`, `is_valid`, `issued_at`, `scopes`, `granular_scopes` [{`scope`, `target_ids`}], `user_id`, `profile_id`, `metadata`, `error`.
  - `granular_scopes[].target_ids` shows which WABA IDs the token can reach.
- A `type` field (e.g. SYSTEM_USER) is not listed in the current reference. UNCONFIRMED.

### Calling eligibility

There is **no single eligibility field**. CONFIRMED: no such field appears on any reference page read.

**Prerequisites (CONFIRMED).** Source: the calling overview, Jun 26, 2026.
- A Cloud API number.
- The app is subscribed to the `calls` webhook field (not needed for SIP).
- "The same app should also be subscribed to the Messaging account".
- The `whatsapp_business_messaging` permission.
- A "daily messaging limit of at least 2,000 unique recipients".
- Calling enabled in Settings.

**Further requirements (CONFIRMED).**
- A credit line attached to the Messaging account (Calling FAQ, Sep 29, 2026).
- "A valid payment method is required to place calls" (calling pricing, Sep 11, 2026).
- Business verification is not required (Calling FAQ).
- SIP only: "Your app mode is "Live", not "Development"." (SIP page).
- Messaging limits are set at the business-portfolio level, and new portfolios start at 250 (messaging-limits .md page).
  - Ways to scale up: verify the business, partner verification, or send 2,000 template messages in 30 days.

**Proxy checks to run instead.**
1. `whatsapp_business_manager_messaging_limit` is not `TIER_250`.
2. `primary_funding_id` is present on the Messaging account.
3. `settings.calling.status` is ENABLED and `restrictions.restrictions_list` is empty.
4. `health_status.can_send_message` is AVAILABLE.
5. `GET /{app-id}/subscriptions` includes `calls`.
6. `GET /{waba-id}/subscribed_apps` includes the app.

**Error codes that signal eligibility problems (CONFIRMED).**

| Code | Meaning |
|---|---|
| 138015 | "Calling APIs cannot be enabled"; remedy: "Check and make sure messaging limit on your phone number is 2000 or more" |
| 138000 | Calling not enabled |
| 138018 | Technical prerequisites not met |
| 138013 | Business-initiated calling not available |
| 138014 | Temporarily disabled for low quality |
| 131044 | No valid payment method (user-initiated calls) |
| 131055 | Graph calls not allowed on SIP-enabled numbers |

---

## D. Georgia (+995) pricing

### Calling

**Source:** https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/pricing, "Updated: Sep 11, 2026".

All points CONFIRMED:
- **User-initiated calls:** "All user-initiated calls are free."
- **Billing basis:** six-second pulses ("fractional pulses as one pulse"), by the callee's country code, with volume tiers based on "minutes called within the calendar month".
- **Calls that cross a tier:** "the entire call is priced at the lower rate (that is, the rate of the higher volume tier)".
- **Rate card dates:** the "current" rate cards are "effective April 1, 2026, based on Messaging account timezone". A rate card effective October 1, 2026 is also published.
- **No price change on Oct 1:** "Calling rates do not change on October 1, 2026". Nine markets become standalone (Bangladesh, Iraq, Kazakhstan, Kuwait, Morocco, Nepal, Oman, Sri Lanka, Ukraine). Georgia is not among them.
- **Call permission requests** are billed as messages.
- **Recording and transcription** are "currently free".
- **Tier webhook:** `account_update` with `event` `VOLUME_BASED_PRICING_TIER_UPDATE` and `pricing_category` `CALLING`.

**Georgia per-minute values: UNCONFIRMED today.** The fbcdn rate-card files could not be fetched. The baseline values below came from a parse of the rate-card PDF. They are consistent with the page's "no change on Oct 1" statement, but were not re-read.

| Minutes per month | USD per minute (baseline) |
|---|---|
| 0–50k | 0.0095 |
| 50,001–250k | 0.0076 |
| 250,001–1M | 0.0066 |
| 1M–2.5M | 0.0058 |
| 2.5M–5M | 0.0043 |
| over 5M | 0.0037 |

### Messaging

**Source:** https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing, "Updated: Sep 30, 2026".

**Georgia's region and rate cards (CONFIRMED).**
- Georgia is in "Rest of Central & Eastern Europe – 16 markets", listed as "Georgia (GE) - 995".
- In the Oct '26 change table, only Ukraine leaves Rest of CEE. No rate change for that region is listed.
- The rate cards are "effective October 1, 2026".

**Service messages (CONFIRMED).**
- Service messages have been charged since Oct 1, 2026, with "1,000 free service messages per month" per phone number and no roll-over.
- Without a payment method, Meta stops delivering service messages once the free tier is used up.

**Other rules (CONFIRMED).**
- Utility templates sent inside an open customer service window are now charged.
- Volume tiers apply to utility and authentication only. They are aggregated at the business-portfolio level, per market and category.
- The free entry point (FEP) window "may remain open for up to 7 days".
- Pricing calendar: quarter starts only, per this page. This conflicts with Terms §3.1 (monthly, see A1).

**Georgia per-message values: UNCONFIRMED today** (rate-card files blocked). Baseline values:

| Category | USD per message (baseline) |
|---|---|
| Marketing | 0.0860 |
| Utility | 0.0212; tiers from 0.0201 (at 100k) down to 0.0159 (above 80M) |
| Authentication | 0.0212 |
| Service (after the free 1,000) | 0.0212 |

**Interactive calculator.** https://whatsappbusiness.com/products/platform-pricing (modified 2026-05-05) showed only $0.0000 placeholders without interaction. It was not usable.

---

## Changes versus the baseline

1. **New account model** (Sep 23 to mid-Oct 2026). The WhatsApp account (WAAC) holds the phone number. The Messaging account keeps the WABA ID and holds templates, billing, payment methods and webhook subscriptions. Terms §2.2 now says "Messaging Account".
2. **Calling payment requirement now names the Messaging account.** The FAQ says "credit line attached to the Messaging account".
3. **Concurrent-call limit is contradictory.** The Calling FAQ says 5000 in one place and 1000 in another. The baseline had 1,000.
4. **Latest Graph API is v26.0** (Jul 29, 2026). WhatsApp docs still show v25.0.
5. **`messaging_limit_tier` is deprecated.** Use `whatsapp_business_manager_messaging_limit`.
6. **Payment-method check exists.** A missing `primary_funding_id` means no payment method.
7. **No direct calling-eligibility field.** `health_status` has only `can_receive_call_sip`.
8. **Price-change timing conflicts.** Terms §3.1 says the first day of the next month; the pricing page says quarter starts only. The baseline said quarters only.
9. **No official "AI for customer service is fine" sentence on the AI Providers page.** The best official support is the pricing page's Service definition ("can be powered by a 3rd-party AI solution or people").
10. **AI Provider charging ended in the EU/EEA and Italy on May 12, 2026.** Brazil continues.
11. **Direct Support topics.** Documented topics exist, but no Policy topic was found. A case ID and the required roles are UNCONFIRMED. The old 4-hour acknowledgement commitment is gone.
12. **Georgia dollar values not re-read.** The rate-card files were blocked. The calling page says rates do not change on Oct 1, and no Rest of CEE change is listed.
13. **`platform_type` is not in official docs.** `host_platform` is the documented field.
