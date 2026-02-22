const baseUrl = (process.env.WEBHOOK_TEST_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const whatsappToken = String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
const telegramSecret = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchText(url, init) {
  const response = await fetch(url, init);
  const body = await response.text();
  return { response, body };
}

async function run() {
  console.log(`[webhooks] base URL: ${baseUrl}`);

  const health = await fetch(`${baseUrl}/api/health`, { method: 'GET', cache: 'no-store' });
  const healthBody = await health.json().catch(() => null);
  assert(health.status === 200, `health expected 200, got ${health.status}`);
  assert(healthBody && healthBody.ok === true, 'health expected ok:true');
  console.log('[webhooks] health OK');

  assert(whatsappToken, 'WHATSAPP_VERIFY_TOKEN is required for webhook verify test');

  const verifyGood = await fetchText(
    `${baseUrl}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(whatsappToken)}&hub.challenge=12345`,
    { method: 'GET', cache: 'no-store' }
  );
  assert(verifyGood.response.status === 200, `whatsapp verify expected 200, got ${verifyGood.response.status}`);
  assert(verifyGood.body === '12345', `whatsapp verify expected challenge body, got: ${verifyGood.body}`);
  console.log('[webhooks] whatsapp verify (correct token) OK');

  const verifyBad = await fetchText(
    `${baseUrl}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=12345`,
    { method: 'GET', cache: 'no-store' }
  );
  assert(verifyBad.response.status === 403, `whatsapp wrong token expected 403, got ${verifyBad.response.status}`);
  console.log('[webhooks] whatsapp verify (wrong token) OK');

  const whatsappPost = await fetch(`${baseUrl}/api/webhooks/whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.test.local.001',
                    from: '995555000001',
                    type: 'text',
                    text: { body: 'hello' },
                  },
                ],
              },
            },
          ],
        },
      ],
    }),
    cache: 'no-store',
  });
  const whatsappPostBody = await whatsappPost.json().catch(() => null);
  assert(whatsappPost.status === 200, `whatsapp POST expected 200, got ${whatsappPost.status}`);
  assert(whatsappPostBody && whatsappPostBody.ok === true, 'whatsapp POST expected ok:true');
  console.log('[webhooks] whatsapp POST OK');

  const telegramHeaders = { 'Content-Type': 'application/json' };
  if (telegramSecret) {
    telegramHeaders['x-telegram-bot-api-secret-token'] = telegramSecret;
  }

  const telegramPost = await fetch(`${baseUrl}/api/agent-g/telegram`, {
    method: 'POST',
    headers: telegramHeaders,
    body: JSON.stringify({
      update_id: 1001,
      message: {
        message_id: 33,
        date: Math.floor(Date.now() / 1000),
        text: 'hello from webhook test',
        chat: { id: 998877, type: 'private' },
        from: { id: 998877, is_bot: false, username: 'test_user' },
      },
    }),
    cache: 'no-store',
  });

  const telegramBody = await telegramPost.json().catch(() => null);
  assert(telegramPost.status === 200, `telegram POST expected 200, got ${telegramPost.status}`);
  assert(telegramBody && telegramBody.ok === true, 'telegram POST expected ok:true');
  console.log('[webhooks] telegram POST OK');

  console.log('[webhooks] all checks passed');
}

run().catch((error) => {
  console.error('[webhooks] FAILED:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
