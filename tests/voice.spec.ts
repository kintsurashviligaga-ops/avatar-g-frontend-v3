import { expect, test } from '@playwright/test';

import { calculateVoiceCredits } from '@/lib/voice/credits';
import { buildVapiWebhookSignature, verifyVapiWebhookSignature } from '@/lib/voice/webhook-signature';

test('web call button renders', async ({ page }) => {
  await page.goto('/ka/dashboard');
  await expect(page.getByRole('button', { name: /ბრაუზერიდან ზარი/i }).first()).toBeVisible();
});

test('phone input validates georgian numbers', async ({ page }) => {
  await page.goto('/ka/dashboard');

  await page.getByRole('button', { name: /Agent G-სთან დარეკვა/i }).first().click();
  await expect(page.getByText(/შეიყვანეთ ნომერი/i).first()).toBeVisible();

  const startButton = page.getByRole('button', { name: /დარეკვა/i }).last();
  const phoneInput = page.getByPlaceholder('5XX XXX XXX').first();

  await expect(startButton).toBeDisabled();

  await phoneInput.fill('555 12');
  await expect(startButton).toBeDisabled();

  await phoneInput.fill('555 123 456');
  await expect(startButton).toBeEnabled();
});

test('voice API routes return expected status codes', async ({ request }) => {
  // outbound + web-token authenticate the caller via requireUser() BEFORE parsing the body, so an
  // anonymous request is rejected with 401 (not a 400 payload error). This is the IDOR fix: the routes
  // no longer trust a body userId, so there is nothing an unauthenticated caller can drive.
  const outbound = await request.post('/api/voice/outbound', {
    data: {},
  });
  expect(outbound.status()).toBe(401);

  const webToken = await request.post('/api/voice/web-token', {
    data: {},
  });
  expect(webToken.status()).toBe(401);

  // inbound is a Vapi-origin webhook; with no VAPI_WEBHOOK_SECRET configured (test env) signature
  // verification is skipped and the callback is accepted.
  const inbound = await request.post('/api/voice/inbound', {
    data: {
      call: {
        id: `inbound_${Date.now()}`,
      },
    },
  });
  expect(inbound.status()).toBe(200);
});

test('webhook signature verification helper works', async () => {
  const rawBody = JSON.stringify({ type: 'call.started', call: { id: 'call_sig' } });
  const secret = 'test-secret';

  const signature = buildVapiWebhookSignature(rawBody, secret);
  expect(signature).not.toHaveLength(0);
  expect(verifyVapiWebhookSignature(rawBody, signature, secret)).toBe(true);
  expect(verifyVapiWebhookSignature(rawBody, 'sha256=invalid', secret)).toBe(false);
});

test('credit deduction logic is correct', async () => {
  expect(calculateVoiceCredits(0)).toBe(0);
  expect(calculateVoiceCredits(1)).toBe(1);
  expect(calculateVoiceCredits(30)).toBe(1);
  expect(calculateVoiceCredits(31)).toBe(2);
  expect(calculateVoiceCredits(61)).toBe(3);
});

test('the Vapi status webhook accepts the call lifecycle events', async ({ request }) => {
  const userId = `voice-user-${Date.now()}`;
  const callId = `voice-call-${Date.now()}`;

  const started = await request.post('/api/voice/webhook', {
    data: {
      type: 'call.started',
      call: {
        id: callId,
        type: 'webCall',
        metadata: { userId },
      },
    },
  });

  expect(started.status()).toBe(200);

  const transcript = await request.post('/api/voice/webhook', {
    data: {
      type: 'transcript.completed',
      call: { id: callId },
      transcript: 'hello from webhook transcript',
    },
  });

  expect(transcript.status()).toBe(200);

  const ended = await request.post('/api/voice/webhook', {
    data: {
      type: 'call.ended',
      call: {
        id: callId,
        durationSeconds: 61,
      },
      analysis: {
        summary: 'test summary',
      },
    },
  });

  expect(ended.status()).toBe(200);
});

test('call history rejects unauthenticated reads (IDOR closed)', async ({ request }) => {
  // /api/voice/history no longer honours a `userId` query param — the persisted rows (phone numbers,
  // transcripts, summaries) are only readable by the authenticated owner. An anonymous request that
  // guesses an id must be rejected. (Read-back of webhook-persisted rows now requires an authenticated
  // session fixture — a follow-up for the e2e harness.)
  const history = await request.get(`/api/voice/history?userId=voice-user-${Date.now()}`);
  expect(history.status()).toBe(401);
});
