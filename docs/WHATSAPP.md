# Agent G on WhatsApp — setup and how it works

## What a user gets

1. **Settings → WhatsApp → "Get code"** (also in the Connectors hub). The card mints a one-time code (15 min) and an
   **Open WhatsApp** button that opens the chat with Agent G with `connect CODE` already typed.
2. Sending it links the number to the account ("✅ Number linked").
3. From then on:
   - any question or talk → Agent G answers in words (the same Gemini chain and Agent G prompt as the website, with
     the last 24 h of this conversation as context);
   - "make me a picture/video/song of …" → a studio link with the request already typed in. **Nothing is generated or
     charged from WhatsApp**: the studio's confirm card and the price on the Create button decide;
   - `help`, `stop` (alerts off), `alerts on`, `unlink`;
   - photos / voice / files → "for now I read text here".
4. When a video, image, music or Deep Research run finishes, the user gets a WhatsApp message (as well as the bell and
   Web Push), unless they sent `stop` or turned alerts off on the card.

An unlinked number never reaches a model: it gets a fixed "how to link" text, at most once every 10 minutes.

## Owner checklist

### 1. Vercel env (Production)

| Name | What | Required |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Cloud API token — a **System User permanent token** with `whatsapp_business_messaging` (a temporary 24 h token from the API Setup page stops working the next day). `WHATSAPP_TOKEN` / `META_WHATSAPP_TOKEN` are also accepted. | yes |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Manager → API Setup → *Phone number ID* (a long number, **not** the phone number itself) | yes |
| `WHATSAPP_APP_SECRET` | Meta app → App settings → Basic → *App secret*. Every webhook delivery is signature-checked with it; without it every delivery is refused (403). | yes |
| `WHATSAPP_VERIFY_TOKEN` | Any random string you choose; the same value goes into Meta's webhook form (step 3). | yes |
| `WHATSAPP_BUSINESS_NUMBER` | The business number in international digits (e.g. `99532…`) for the wa.me button. Optional: when unset it is read from Graph. | no |
| `WHATSAPP_ALERT_TEMPLATE` / `WHATSAPP_ALERT_TEMPLATE_LANG` | An approved **Utility** template (body: `{{1}}` = title, `{{2}}` = details/link) used for alerts when the user has not written in the last 24 h. Without it those alerts are skipped (bell + push still fire). | no |
| `WHATSAPP_GRAPH_VERSION` | Graph API version, default `v25.0` (the version in Meta's API Setup sample). | no |
| `CRON_SECRET` | Already used by the other crons; the worker tick that drains queued deliveries needs it. | yes (exists) |

Production's public status endpoint `/api/agent-g/channels` reports `whatsapp: { connected, ready, note }` — `note`
names the missing variable.

### 2. Database

Run `supabase/migrations/20261003c_agent_g_whatsapp.sql` in the Supabase SQL editor of the **production** project.
It is additive and idempotent (safe to run twice, safe over the older 20260220 tables). Until it runs, WhatsApp answers
"opening soon" and the card says the same.

### 3. Meta webhook

Meta app → WhatsApp → Configuration → Webhook:

- **Callback URL**: `https://myavatar.ge/api/webhooks/whatsapp`
- **Verify token**: the `WHATSAPP_VERIFY_TOKEN` value
- **Webhook fields**: subscribe to `messages`

**If "Verify and save" fails:**

- A change to Vercel env vars reaches production only with the NEXT deployment — redeploy after saving them.
- The token is compared after trimming spaces/newlines and surrounding quotes, so a paste artefact no longer breaks it;
  any other difference does. Vercel → Logs, search `verify_refused`: `token_configured: false` = the deployment has no
  `WHATSAPP_VERIFY_TOKEN`; otherwise `expected_length` vs `received_length` shows whether the two values differ (the
  tokens themselves are never logged).
- Verification needs only the verify token. Message deliveries additionally need `WHATSAPP_APP_SECRET`.

### 4. Check

1. `https://myavatar.ge/api/agent-g/channels` → whatsapp `ready: true`, note "Webhook ready".
2. Settings → WhatsApp → Get code → Open WhatsApp → send. The card turns to "Linked".
3. Write "აქ ხარ?" → Agent G answers.

### 5. Send a test template (Meta's `hello_world`)

- From any machine: `WHATSAPP_ACCESS_TOKEN=… WHATSAPP_PHONE_NUMBER_ID=… node scripts/whatsapp/send-template.mjs 995571333194`
- From production (admin): `curl -X POST https://myavatar.ge/api/agent-g/whatsapp/send -H "x-admin-key: $ADMIN_KEY" -H "content-type: application/json" -d '{"to":"995571333194","template":{"name":"hello_world","language":"en_US"}}'`

Both send exactly Meta's sample body to `graph.facebook.com/v25.0/{phone-number-id}/messages`. While the Meta app is in
development, the recipient must be on the API Setup page's recipients list.

## How it is built

| Piece | File |
|---|---|
| Webhook (signature, dedupe, answer after the 200 via `waitUntil`, queue fallback) | `app/api/webhooks/whatsapp/route.ts`, `lib/platform/afterResponse.ts` |
| Payload → messages → replies sent | `lib/agent-g/channels/whatsapp-processor.ts` |
| What Agent G answers | `lib/agent-g/channels/handleInbound.ts`, `lib/agent-g/channels/whatsapp-text.ts` |
| Number ↔ account, codes, history | `lib/agent-g/channels/whatsapp-link.ts` |
| Cloud API calls | `lib/agent-g/channels/whatsapp-client.ts` |
| The model | `lib/ai/channelBridge.ts` → `lib/ai/google/reply.ts` |
| Card + API | `components/agent-g/WhatsAppLinkCard.tsx`, `app/api/agent-g/whatsapp/link/route.ts` |
| Alerts | `lib/notifications/channels/whatsapp.ts`, `lib/notifications/dispatch.ts` |
| Queue drain (Vercel Cron, GET) | `app/api/app/worker/tick/route.ts` |

⚠️ A number is linked only by a message **from** that number. No route accepts a phone number from a browser
(`POST /api/agent-g/channels` refuses WhatsApp/Telegram rows), so nobody can attach someone else's number to their account.
