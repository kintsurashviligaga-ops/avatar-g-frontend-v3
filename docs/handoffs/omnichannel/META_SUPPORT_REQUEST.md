# Meta Support request: §4.7 (AI Providers), messaging and Calling

**Status: SENT — TRANSFERRED TO EMAIL SUPPORT — AWAITING WRITTEN POLICY RESPONSE.** Last updated 2026-10-10 18:55Z.

Until Meta's support team answers in writing, WhatsApp AI and Calling compliance stays **BLOCKED_EXTERNAL**, never
PROVEN. WhatsApp AI creative execution (scenario B) and Calling stay off in Production (owner, 2026-10-10 18:44Z).

## Where the request stands

| Item | Value | Source |
|---|---|---|
| Sent | 2026-10-10, by GG, from the MyAvatar.ge business portfolio through Meta Business Support | GG, Master Task 18:44:57Z |
| Case | #28590089197308927, "Policy clarification for Generative AI business (MyAvatar.ge) under WA…" | the subject of Meta's case emails, 18:43Z |
| Meta's confirmation | "Your case has been switched to email support. The support team will follow up with you over email." | GG, 18:44:57Z |
| Wording sent | Not on file here. Its subject differs from the draft below. Meta's restatement shows both scenarios (A customer service, B creative execution) and five questions. | Meta's case email, 18:43:52Z |
| Official written answer | **none yet** | |

**Automated preliminary replies (not counted).** Before the case moved to email, two replies arrived on it (18:43:38Z
and 18:43:52Z). The first is signed "Meta AI Agent"; the second stops mid-sentence at question 5.
- They say scenario A is permitted, and scenario B is permitted with conditions:
  - only authenticated, linked customers;
  - Agent G limited to MyAvatar.ge;
  - a price and the customer's confirmation before paid work;
  - no training on WhatsApp Business Solution Data;
  - human support available;
  - opt-in before message templates;
  - clear disclosure of the business name and intent.
- They do not address §4.7's test: AI is prohibited where it is "the primary (rather than incidental or ancillary)
  functionality … as determined by Meta in its sole discretion".
- The owner's rule (18:44Z): an AI assistant's preliminary answer is **not** official consent. Nothing in the code,
  the docs or a status changes because of it.

## What waits on Meta's answer (BLOCKED_EXTERNAL)

- WhatsApp creative scope (`WHATSAPP_AGENT_SCOPE=creative`, scenario B): stays off.
- Compliance for Agent G answers on WhatsApp text (scenario A) in Production.
- Compliance for WhatsApp Calling, before any Production step in `WHATSAPP_CALLING_READINESS.md` §5.

Work that does **not** wait on Meta continues: code, mocked and local tests, free Preview checks, docs. The owner
steps (the migration, the price, the bridge VM, a funded call, merge and deploy) stay BLOCKED_OWNER as before.

## What was re-checked before writing

**Meta Terms for WhatsApp Business Platform** were re-read live on 2026-10-10 (Firecrawl, no cache), at https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform.

- **Date:** the page still shows "Last Modified: September 23, 2026".
- **§4.7 "AI Providers":** the wording is unchanged from `research/meta-verification-2026-10-10.md` §A1:
  - AI Providers are prohibited "when such technologies are the primary (rather than incidental or ancillary) functionality being made available for use, as determined by Meta in its sole discretion";
  - with a carve-out for "certain countries as set forth here" (Brazil ongoing; EU/EEA and Italy, windows that ended May 12, 2026; Georgia is not listed);
  - and "you may retain an AI Provider as your Solution Provider".
- **§1.1:** the Platform lets businesses "send or receive messages or calls". So §4.7 covers calls too.
- **Calling FAQ (2026-09-29):** AI voicebots on WhatsApp calls are allowed technically, "See WhatsApp Business Solution Terms for restrictions in AI use cases".

What MyAvatar.ge's code does on WhatsApp after this change (commit on `claude/launch-certification-wmvitt`):

- **Text** (`lib/agent-g/channels/whatsapp-text.ts` WHATSAPP_STYLE_NOTE, `handleInbound.ts`):
  - Agent G helps only with MyAvatar.ge: the customer's account, credits, prices, orders, tasks, results and what the studio can make.
  - It does not search the web. It declines general questions and gives support@myavatar.ge.
  - Nothing is generated or charged from WhatsApp text. A request to make something gets a studio link where the price and Confirm button are.
- **Calls** (`lib/calls/whatsapp/phoneTools.ts` phoneCallRule):
  - The same scope as text.
  - `WHATSAPP_AGENT_SCOPE=service` is the default, and is scenario A. `creative` is scenario B, where Agent G may plan an order and say its price.
  - Paid work starts only from the Confirm button, or on a call from the caller's own spoken "yes" after the price, checked on the server.
  - Calling is off (`WHATSAPP_CALLING_ENABLED`) and no price is approved.

The letter therefore describes the product as it will run, with both scenarios in full.

---

## The draft (as prepared before sending)

### Subject

Policy question: Meta Terms §4.7 (AI Providers) for a Georgia-based generative-AI business using Cloud API messaging and WhatsApp Business Calling

### Body

Hello,

We are MyAvatar.ge, a business based in Georgia (+995). We run a paid online studio where our registered customers create AI-generated videos, images, avatars, music and other content. We use the WhatsApp Business Platform (Cloud API) directly with our own WhatsApp Business Account. We have no Business Solution Provider.

Before we enable any of the uses below in production, we ask for Meta's written guidance under the Meta Terms for WhatsApp Business Platform (Last Modified September 23, 2026), §4.7 "AI Providers", and the WhatsApp Business Messaging Policy. We describe both intended uses in full. We are not asking about a narrower version only.

Scenario A. Customer service and order management:
Existing MyAvatar.ge customers link their WhatsApp number, request information about their accounts, projects, orders, prices and credits, approve specific paid orders, receive reports and completed files, and use WhatsApp Business Calling for these activities.

Scenario B. Creative execution via WhatsApp:
The same customers may instruct Agent G through WhatsApp text, voice messages or calls to create or edit AI-generated videos, images, avatars, music and other content. The actual processing takes place in MyAvatar.ge using Google AI, ElevenLabs and internal workers, with explicit quotation and approval.

How both scenarios work:
- Only existing MyAvatar.ge customers can use it, and only on their own account. A customer links their WhatsApp number to their signed-in account with a one-time code. An unlinked number receives only fixed instructions and never reaches an AI model.
- Our assistant, Agent G, runs on our own servers. It is the same assistant as on our website.
  - Understanding text and speech uses Google's Gemini models, through the paid API tier.
  - Creative outputs use Google AI, ElevenLabs and our own media processing.
- On WhatsApp, Agent G helps only with MyAvatar.ge. It does not search the web or act as a general-purpose assistant. It politely declines unrelated questions.
- No paid work starts without an explicit price and the customer's approval. Approval is a Confirm button in the chat. On a call, it is the customer's own spoken "yes" after the price was stated, verified on our server.
- Calls: customers call our business number.
  - We call a customer back only with their WhatsApp call permission, outside quiet hours and within daily limits.
  - The caller ID alone never authorizes a payment.
- A person is always reachable at support@myavatar.ge and through our website.
- We do not use WhatsApp Business Solution Data to train or improve AI models.

Our questions. Please answer each in writing:
1. Is Scenario A permitted for a Georgia-based business under §4.7? Is Scenario B permitted?
2. Does Meta treat business messaging, media delivery (sending the finished files to the customer in the chat) and WhatsApp Business Calling differently for these uses?
3. Do any limits apply to specific markets, phone-number countries (our number and most of our customers are +995) or business account types?
4. Is a narrower customer-service-only scope (Scenario A without Scenario B) required?
5. What conditions must we meet before enabling this in production? For example: registration as an AI Provider, a specific pricing category, a review, or a disclosure to users.

This request is filed from the business portfolio that owns our WhatsApp Business Account. Please treat that account as the subject of this request.

Thank you,
MyAvatar.ge
support@myavatar.ge

---

## After Meta answers

Record here, without personal data: the date and full text of the support team's written reply on case
#28590089197308927.

What each answer means for the code:

| Meta's answer | What changes |
|---|---|
| A and B permitted | `WHATSAPP_AGENT_SCOPE=creative` becomes possible. Production still needs GG's separate word. |
| A only | Scope stays `service`. Creative orders stay studio links. |
| Neither | WhatsApp AI answers and Calling stay off. Fixed texts and alerts only. |
| Conditions (registration, pricing category, disclosure) | Each one becomes a tracked item in `WHATSAPP_CALLING_READINESS.md` before any Production step. |

Compliance becomes PROVEN only with Meta's written answer on file.
