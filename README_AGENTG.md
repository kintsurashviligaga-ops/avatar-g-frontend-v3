# Agent G Personality Engine v1.0 (Phase 1)

## Required Environment Variables

Set these on Vercel (Project Settings → Environment Variables):

- `OPENAI_API_KEY`
- `OPENAI_REALTIME_MODEL` (prepared for future realtime phase)
- `OPENAI_STT_MODEL` (default `gpt-4o-mini-transcribe`)
- `OPENAI_TTS_MODEL` (optional; currently unused when ElevenLabs is active)
- `AGENT_G_INTERNAL_SECRET`
- `AGENT_G_MEMORY_ENABLED` (Phase 2 flag, default `false`)
- `AGENT_G_VOICE_ENABLED` (Phase 3A flag, default `false`)
- `AGENT_G_VOICE_MAX_SECONDS` (Phase 3A, default `45`)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_NOTIFY_CHAT_ID` (or `TELEGRAM_CHAT_ID` for notification target)
- `ELEVENLABS_API_KEY` (required for voice replies)
- `ELEVENLABS_VOICE_ID` (required stable voice id)
- `TWILIO_ACCOUNT_SID` (OTP)
- `TWILIO_AUTH_TOKEN` (OTP)
- `TWILIO_VERIFY_SERVICE_SID` (OTP)
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_BACKEND_URL` (set to `https://avatarg-backend.vercel.app` for production)
- `ADMIN_KEY`
- `SITE_URL`
- `PUBLIC_APP_URL`
- `NEXT_PUBLIC_SITE_URL`

Security note: secrets must remain server-only. Never expose `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AGENT_G_INTERNAL_SECRET`, `TELEGRAM_BOT_TOKEN`, or `TELEGRAM_WEBHOOK_SECRET` to client-side code.

Feature-flag note: memory and voice are rollout-gated. Keep `AGENT_G_MEMORY_ENABLED=false` and `AGENT_G_VOICE_ENABLED=false` until explicit rollout confirmation.

## Web Test

1. Start app: `npm run dev`
2. Open `/services/agent-g`
3. Enter a message and press **Execute**
4. Expect response rendered from `POST /api/agent-g/chat` with tone badge (`calm`, `friendly`, `excited`, etc.)

## Telegram Webhook Test

1. Ensure webhook is set to:
   - `https://<your-domain>/api/agent-g/telegram`
2. Send a Telegram message to the bot.
3. Expect:
   - quick HTTP 200 webhook acknowledgement,
   - reply in 1–5 seconds,
   - fallback message on model timeout: `გაგ, ცოტა მომეცი და ახლავე დაგიბრუნდები პასუხით 🙌`

## OTP + Telegram Notification

- OTP send endpoint: `POST /api/auth/otp/send` with `{ "phone": "+995..." }`
- OTP check endpoint: `POST /api/auth/otp/check` with `{ "phone": "+995...", "code": "123456" }`
- On approved OTP, backend sends Telegram notification to configured chat id.
- Manual Telegram send endpoint (admin): `POST /api/telegram/send` + header `x-admin-key`.

## WhatsApp Cloud API Webhook (Meta)

- Callback URL: `https://avatarg-backend.vercel.app/api/webhooks/whatsapp`
- Verify token in Meta must match Vercel env `WHATSAPP_VERIFY_TOKEN` exactly.
- Verification behavior:
   - `GET` with matching `hub.verify_token` returns `200` plain text body = `hub.challenge`
   - mismatch returns `403` plain text `Forbidden`
- Quick check:
   - `curl -i "https://avatarg-backend.vercel.app/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=TEST&hub.challenge=123"`
   - expected: `200` and body `123` only when `WHATSAPP_VERIFY_TOKEN=TEST`

## Local Validation

- Unit + integration tests:
  - `npx jest __tests__/lib/agentg.personality.test.ts --runInBand`
  - `npx jest __tests__/api/agent-g-chat.test.ts --runInBand`
  - `npx jest __tests__/api/agent-g-telegram-webhook.test.ts --runInBand`
- Typecheck: `npm run typecheck`
- Production build: `npm run build`

## Phase 2/3 Preparation

- Phase 2 persistent memory is prepared with migration file:
   - `supabase/migrations/20260221_agent_g_memory.sql`
- Do not auto-run this migration in production without explicit confirmation.
- Runtime helper is ready at:
   - `lib/agentg/memory.ts`
- Current behavior when `AGENT_G_MEMORY_ENABLED=false`:
   - no DB reads/writes,
   - Phase 1 chat flow stays unchanged.
- Phase 3 architecture placeholders exist in:
  - `lib/agentg/voice/`
  - `lib/agentg/realtime/`

## Phase 3A Telegram Voice Notes

- Voice flow: Telegram voice note -> STT -> tone detect -> LLM reply -> ElevenLabs TTS -> Telegram audio reply.
- Privacy guardrails:
   - raw audio is never persisted,
   - event transcript payload is sanitized and truncated,
   - secrets are never logged.
- Reliability fallback:
   - if STT fails, user receives a helpful Georgian text fallback,
   - if TTS fails, user receives text reply only.
