# Telegram Webhook (Agent G)

## Required Environment Variables

Set these in Vercel (Production and Preview):

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `OPENAI_API_KEY`
- `SITE_URL`
- `PUBLIC_APP_URL` (optional but recommended)
- `ADMIN_KEY` (if status endpoint is protected)

## Deploy Steps

1. Add/update env vars in Vercel.
2. Redeploy the project.
3. Re-register webhook URL with Telegram:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.myavatar.ge/api/agent-g/telegram","secret_token":"<TELEGRAM_WEBHOOK_SECRET>"}'
```

## Test the Bot

1. Send `hi` or `test` to the Telegram bot.
2. Confirm the bot replies with an OpenAI-generated answer.
3. Check Vercel logs for safe entries:
   - `Incoming Telegram update`
   - `Chat ID`
   - `Text`
   - `Reply sent`

## Local Smoke Test

Use the included script:

```bash
npm run test:telegram:webhook
```

Or test manually:

```bash
curl -i -X POST "http://localhost:3000/api/agent-g/telegram" \
  -H "Content-Type: application/json" \
  -H "x-telegram-bot-api-secret-token: <TELEGRAM_WEBHOOK_SECRET>" \
  -d '{"update_id":3,"message":{"text":"test","chat":{"id":"123","type":"private"},"from":{"id":"1","is_bot":false}}}'
```
