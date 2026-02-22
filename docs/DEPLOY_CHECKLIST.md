# Deploy Checklist (WhatsApp + Telegram)

## 1) Required backend environment variables

### WhatsApp
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID` (optional but recommended)
- `WHATSAPP_APP_SECRET` (optional; enables signature validation)

### Telegram
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET` (optional, but recommended)
- `TELEGRAM_SETUP_SECRET` (for protected setup endpoint)

### Shared
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`
- `PUBLIC_APP_URL` (preferred public URL for webhook setup)
- `SITE_URL` (fallback)

## 2) Production health check

```bash
curl -i "https://avatarg-backend.vercel.app/api/health"
```

Expected:
- HTTP `200`
- JSON includes `{"ok":true,...}`

## 3) WhatsApp webhook verification checks

Correct token:

```bash
curl -i "https://avatarg-backend.vercel.app/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=REAL_TOKEN&hub.challenge=12345"
```

Expected:
- HTTP `200`
- Plain text body exactly `12345`

Wrong token:

```bash
curl -i "https://avatarg-backend.vercel.app/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=12345"
```

Expected:
- HTTP `403`
- Body `Forbidden`

POST sample:

```bash
curl -i -X POST "https://avatarg-backend.vercel.app/api/webhooks/whatsapp" \
  -H "Content-Type: application/json" \
  -d '{"object":"whatsapp_business_account","entry":[{"changes":[{"value":{"messages":[{"id":"wamid.test.001","from":"995555000001","type":"text","text":{"body":"hello"}}]}}]}]}'
```

Expected:
- HTTP `200`
- JSON contains `{"ok":true,...}`

## 4) Telegram webhook checks

Webhook POST:

```bash
curl -i -X POST "https://avatarg-backend.vercel.app/api/agent-g/telegram" \
  -H "Content-Type: application/json" \
  -H "x-telegram-bot-api-secret-token: REAL_TELEGRAM_WEBHOOK_SECRET" \
  -d '{"update_id":1001,"message":{"message_id":1,"date":1700000000,"text":"hello","chat":{"id":998877,"type":"private"},"from":{"id":998877,"is_bot":false}}}'
```

Expected:
- HTTP `200`
- JSON contains `{"ok":true,"queued":true,...}`

Set webhook (idempotent):

```bash
curl -i "https://avatarg-backend.vercel.app/api/agent-g/telegram/set-webhook?secret=REAL_TELEGRAM_SETUP_SECRET"
```

Expected:
- HTTP `200`
- JSON `status: success`
- `already_configured: true` when webhook is already correct

## 5) Local smoke test script

```bash
# Ensure local dev server is running on http://localhost:3000
# and env contains WHATSAPP_VERIFY_TOKEN (required) and TELEGRAM_WEBHOOK_SECRET (optional)
npm run test:webhooks
```

Expected:
- Script exits `0`
- Logs `all checks passed`
