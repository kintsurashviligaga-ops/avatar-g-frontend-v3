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
  const outbound = await request.post('/api/voice/outbound', {
    data: {},
  });
  expect(outbound.status()).toBe(400);

  const webToken = await request.post('/api/voice/web-token', {
    data: {},
  });
  expect(webToken.status()).toBe(400);

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

test('voice call row is created and transcript is persisted via webhook flow', async ({ request }) => {
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

  await expect
    .poll(async () => {
      const history = await request.get(`/api/voice/history?userId=${encodeURIComponent(userId)}`);
      if (!history.ok()) {
        return { found: false };
      }

      const payload = (await history.json()) as {
        calls?: Array<{
          vapi_call_id?: string | null;
          transcript?: string | null;
          status?: string;
          credits_used?: number;
          summary?: string | null;
        }>;
      };

      const row = (payload.calls || []).find((item) => item.vapi_call_id === callId);
      if (!row) {
        return { found: false };
      }

      return {
        found: true,
        transcript: row.transcript,
        status: row.status,
        creditsUsed: row.credits_used,
        summary: row.summary,
      };
    })
    .toMatchObject({
      found: true,
      transcript: 'hello from webhook transcript',
      status: 'ended',
      creditsUsed: 3,
      summary: 'test summary',
    });
});
